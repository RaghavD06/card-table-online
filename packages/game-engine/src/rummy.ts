import type { EngineResult, GameCommand, GameEngine, PrivatePlayerState, PublicGameState } from "./index";
import { cardRank, cardSuit, createDeck, isCard, rankValue, type Card } from "./cards";

export type RummyPhase = "WAITING" | "PLAYING" | "ROUND_COMPLETE";

export interface RummyPlayerView {
  playerId: string;
  handSize: number;
}

export interface RummyState extends PublicGameState {
  gameType: "RUMMY";
  phase: RummyPhase;
  playerIds: string[];
  players: RummyPlayerView[];
  currentPlayerId?: string;
  deck: Card[];
  discard: Card[];
  hands: Record<string, Card[]>;
  drawnThisTurn: boolean;
  winnerId?: string;
}

type RummyPayload = {
  source?: "deck" | "discard";
  card?: Card;
};

const errorEvent = (state: RummyState, command: GameCommand, code: string, message: string): EngineResult => ({
  publicState: state,
  privateStates: projectPrivateStates(state),
  events: [{ type: "game.error", payload: { requestId: command.requestId, code, message } }],
});

export class RummyGameEngine implements GameEngine {
  readonly gameType = "RUMMY" as const;

  createInitialState(playerIds: string[]): RummyState {
    const uniquePlayerIds = [...new Set(playerIds)];
    const hands = Object.fromEntries(uniquePlayerIds.map((playerId) => [playerId, [] as Card[]]));
    return {
      gameType: "RUMMY",
      phase: "WAITING",
      version: 0,
      playerIds: uniquePlayerIds,
      players: uniquePlayerIds.map((playerId) => ({ playerId, handSize: 0 })),
      deck: [],
      discard: [],
      hands,
      drawnThisTurn: false,
    };
  }

  applyCommand(state: PublicGameState, command: GameCommand): EngineResult {
    const current = state as RummyState;
    if (current.gameType !== "RUMMY") {
      return errorEvent(current, command, "WRONG_GAME", "Command does not target a Rummy state");
    }

    switch (command.type) {
      case "start":
        return this.start(current, command);
      case "draw":
        return this.draw(current, command);
      case "discard":
        return this.discardCard(current, command);
      case "declare":
        return this.declare(current, command);
      default:
        return errorEvent(current, command, "UNKNOWN_COMMAND", `Unknown Rummy command: ${command.type}`);
    }
  }

  private start(state: RummyState, command: GameCommand): EngineResult {
    if (state.phase !== "WAITING") return errorEvent(state, command, "INVALID_PHASE", "Rummy has already started");
    if (state.playerIds.length < 2 || state.playerIds.length > 6) {
      return errorEvent(state, command, "INVALID_PLAYER_COUNT", "Rummy requires between 2 and 6 players");
    }
    if (!state.playerIds.includes(command.actorId)) {
      return errorEvent(state, command, "NOT_A_PLAYER", "Actor is not seated at this table");
    }

    const deck = createDeck();
    const hands = Object.fromEntries(state.playerIds.map((playerId) => [playerId, [] as Card[]]));
    for (let cardIndex = 0; cardIndex < 13 * state.playerIds.length; cardIndex += 1) {
      const playerId = state.playerIds[cardIndex % state.playerIds.length];
      const card = deck.shift();
      if (!card || !playerId) throw new Error("Rummy deck could not deal a complete hand");
      const hand = hands[playerId];
      if (!hand) throw new Error("Rummy player hand was not initialized");
      hand.push(card);
    }
    const discard = [deck.shift() as Card];
    const nextState: RummyState = {
      ...state,
      phase: "PLAYING",
      version: state.version + 1,
      players: state.playerIds.map((playerId) => ({ playerId, handSize: hands[playerId]?.length ?? 0 })),
      currentPlayerId: state.playerIds[0]!,
      deck,
      discard,
      hands,
      drawnThisTurn: false,
    };
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "rummy.started", payload: { currentPlayerId: nextState.currentPlayerId } }],
    };
  }

  private draw(state: RummyState, command: GameCommand): EngineResult {
    const payload = (command.payload ?? {}) as RummyPayload;
    if (!this.isCurrentPlayer(state, command, "draw")) return errorEvent(state, command, "NOT_YOUR_TURN", "Only the current player may draw");
    if (state.drawnThisTurn) return errorEvent(state, command, "ALREADY_DREW", "The current player has already drawn");
    if (payload.source !== "deck" && payload.source !== "discard") {
      return errorEvent(state, command, "INVALID_SOURCE", "Draw source must be deck or discard");
    }
    const card = payload.source === "deck" ? state.deck[0] : state.discard[state.discard.length - 1];
    if (!card) return errorEvent(state, command, "EMPTY_SOURCE", "The selected draw source is empty");

    const deck = payload.source === "deck" ? state.deck.slice(1) : state.deck.slice();
    const discard = payload.source === "discard" ? state.discard.slice(0, -1) : state.discard.slice();
    const hands = cloneHands(state.hands);
    const actorHand = hands[command.actorId];
    if (!actorHand) return errorEvent(state, command, "NOT_A_PLAYER", "Actor is not seated at this table");
    actorHand.push(card);
    const nextState = this.withUpdatedHands({ ...state, version: state.version + 1, deck, discard, hands, drawnThisTurn: true });
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "rummy.drew", payload: { playerId: command.actorId, source: payload.source, card } }],
    };
  }

  private discardCard(state: RummyState, command: GameCommand): EngineResult {
    if (!this.isCurrentPlayer(state, command, "discard")) return errorEvent(state, command, "NOT_YOUR_TURN", "Only the current player may discard");
    if (!state.drawnThisTurn) return errorEvent(state, command, "MUST_DRAW", "A player must draw before discarding");
    const payload = (command.payload ?? {}) as RummyPayload;
    if (!isCard(payload.card)) return errorEvent(state, command, "INVALID_CARD", "A valid card is required");
    const hand = state.hands[command.actorId] ?? [];
    const cardIndex = hand.indexOf(payload.card);
    if (cardIndex < 0) return errorEvent(state, command, "CARD_NOT_IN_HAND", "The selected card is not in the actor's hand");
    const hands = cloneHands(state.hands);
    const actorHand = hands[command.actorId];
    if (!actorHand) return errorEvent(state, command, "NOT_A_PLAYER", "Actor is not seated at this table");
    actorHand.splice(cardIndex, 1);
    const nextPlayerIndex = (state.playerIds.indexOf(command.actorId) + 1) % state.playerIds.length;
    const nextState = this.withUpdatedHands({
      ...state,
      version: state.version + 1,
      discard: [...state.discard, payload.card],
      hands,
      currentPlayerId: state.playerIds[nextPlayerIndex],
      drawnThisTurn: false,
    });
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "rummy.discarded", payload: { playerId: command.actorId, card: payload.card, nextPlayerId: nextState.currentPlayerId } }],
    };
  }

  private declare(state: RummyState, command: GameCommand): EngineResult {
    if (!this.isCurrentPlayer(state, command, "declare")) return errorEvent(state, command, "NOT_YOUR_TURN", "Only the current player may declare");
    const hand = state.hands[command.actorId] ?? [];
    if (hand.length !== 13) return errorEvent(state, command, "INVALID_HAND_SIZE", "A Rummy declaration requires exactly 13 cards");
    if (!isWinningRummyHand(hand)) return errorEvent(state, command, "INVALID_DECLARATION", "The hand must contain two sequences, including a pure sequence");
    const nextState: RummyState = { ...state, phase: "ROUND_COMPLETE", version: state.version + 1, winnerId: command.actorId };
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "rummy.declared", payload: { winnerId: command.actorId } }],
    };
  }

  private isCurrentPlayer(state: RummyState, command: GameCommand, _action: string) {
    return state.phase === "PLAYING" && state.currentPlayerId === command.actorId && state.playerIds.includes(command.actorId);
  }

  private withUpdatedHands(state: RummyState): RummyState {
    return {
      ...state,
      players: state.playerIds.map((playerId) => ({ playerId, handSize: state.hands[playerId]?.length ?? 0 })),
    };
  }
}

function cloneHands(hands: Record<string, Card[]>): Record<string, Card[]> {
  return Object.fromEntries(Object.entries(hands).map(([playerId, cards]) => [playerId, [...cards]]));
}

function projectPrivateStates(state: RummyState): PrivatePlayerState[] {
  return state.playerIds.map((playerId) => ({
    playerId,
    data: { hand: [...(state.hands[playerId] ?? [])], drawnThisTurn: state.currentPlayerId === playerId && state.drawnThisTurn },
  }));
}

function isWinningRummyHand(hand: Card[]): boolean {
  if (new Set(hand).size !== hand.length) return false;
  const melds = findMelds(hand);
  return melds.some((partition) => partition.filter((meld) => meld.kind === "sequence").length >= 2);
}

type Meld = { kind: "sequence" | "set"; cards: Card[] };

function findMelds(cards: Card[]): Meld[][] {
  if (cards.length === 0) return [[]];
  const first = cards[0];
  if (!first) return [];
  const rest = cards.slice(1);
  const result: Meld[][] = [];
  for (const candidate of possibleMelds(first, cards)) {
    const remaining = rest.filter((card) => !candidate.includes(card));
    if (remaining.length + candidate.length !== cards.length) continue;
    for (const partition of findMelds(remaining)) result.push([{ kind: candidateIsSequence(candidate) ? "sequence" : "set", cards: candidate }, ...partition]);
  }
  return result;
}

function possibleMelds(first: Card, cards: Card[]): Card[][] {
  const sameSuit = cards.filter((card) => cardSuit(card) === cardSuit(first));
  const sameRank = cards.filter((card) => cardRank(card) === cardRank(first));
  const sequences: Card[][] = [];
  for (let length = 3; length <= sameSuit.length; length += 1) {
    for (const combination of combinations(sameSuit, length)) {
      if (isSequence(combination)) sequences.push(combination);
    }
  }
  const sets = [...combinations(sameRank, 3), ...combinations(sameRank, 4)];
  return [...sequences, ...sets].filter((candidate) => candidate.includes(first));
}

function candidateIsSequence(cards: Card[]) {
  return new Set(cards.map(cardSuit)).size === 1;
}

function isSequence(cards: Card[]) {
  const regular = cards.map((card) => rankValue(card));
  const sorted = [...regular].sort((a, b) => a - b);
  if (new Set(sorted).size !== cards.length) return false;
  const consecutive = sorted.every((value, index) => index === 0 || value === sorted[index - 1]! + 1);
  const aceLow = sorted[sorted.length - 1] === 14 && sorted.slice(0, -1).every((value, index) => value === index + 2);
  return consecutive || aceLow;
}

function combinations<T>(items: T[], length: number): T[][] {
  if (length === 0) return [[]];
  if (items.length < length) return [];
  const [first, ...rest] = items;
  return [
    ...combinations(rest, length - 1).map((combination) => [first, ...combination]),
    ...combinations(rest, length),
  ].filter((combination): combination is T[] => combination.length === length);
}

export const rummyGameEngine = new RummyGameEngine();
