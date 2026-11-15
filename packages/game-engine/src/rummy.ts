import { randomInt } from "node:crypto";
import type { EngineResult, GameCommand, GameEngine, PublicGameState } from "./index";

export type RummySuit = "C" | "D" | "H" | "S";
export type RummyRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type RummyStage = "WAITING" | "DRAW" | "DISCARD" | "DECLARATION" | "COMPLETE";

export interface RummyCard {
  id?: string;
  rank: RummyRank;
  suit: RummySuit;
}

export interface RummyGroup {
  cardIds: string[];
}

export interface RummyPlayerState {
  id: string;
  hand: RummyCard[];
  score: number;
  declared: boolean;
  invalidDeclaration: boolean;
}

export interface RummyPublicPlayer {
  id: string;
  cardCount: number;
  score: number;
  declared: boolean;
  invalidDeclaration: boolean;
}

export interface RummyPublicState extends PublicGameState {
  gameType: "RUMMY";
  phase: RummyStage;
  roundNumber: number;
  currentPlayerId?: string;
  wildJoker: RummyRank;
  discardTop?: RummyCard;
  stockCount: number;
  players: RummyPublicPlayer[];
  winnerId?: string;
}

export interface RummyState extends RummyPublicState {
  deck: RummyCard[];
  discardPile: RummyCard[];
  playersInternal: RummyPlayerState[];
  currentPlayerIndex?: number;
  drawnCard?: RummyCard;
}

export interface RummyEngineOptions {
  randomIndex?: (length: number) => number;
  deckCount?: number;
  printedJokersPerDeck?: number;
}

export class RummyDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const SUITS: RummySuit[] = ["C", "D", "H", "S"];
const RANKS: RummyRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const MAX_SCORE = 80;

export class RummyEngine implements GameEngine<RummyState> {
  readonly gameType = "RUMMY" as const;
  private readonly randomIndex: (length: number) => number;
  private readonly deckCount: number;
  private readonly printedJokersPerDeck: number;

  constructor(options: RummyEngineOptions = {}) {
    this.randomIndex = options.randomIndex ?? ((length) => randomInt(length));
    this.deckCount = options.deckCount ?? 2;
    this.printedJokersPerDeck = options.printedJokersPerDeck ?? 2;
    if (!Number.isInteger(this.deckCount) || this.deckCount < 1 ||
      !Number.isInteger(this.printedJokersPerDeck) || this.printedJokersPerDeck < 0) {
      throw new RummyDomainError("INVALID_TABLE_CONFIG", "Rummy deck configuration is invalid");
    }
  }

  createInitialState(playerIds: string[]): RummyState {
    if (new Set(playerIds).size !== playerIds.length || playerIds.length < 2 || playerIds.length > 6) {
      throw new RummyDomainError("INVALID_PLAYERS", "Rummy tables support 2 to 6 unique players");
    }
    return {
      gameType: "RUMMY",
      phase: "WAITING",
      version: 0,
      roundNumber: 0,
      wildJoker: 1,
      stockCount: 0,
      players: playerIds.map((id) => ({ id, cardCount: 0, score: 0, declared: false, invalidDeclaration: false })),
      deck: [],
      discardPile: [],
      playersInternal: playerIds.map((id) => ({ id, hand: [], score: 0, declared: false, invalidDeclaration: false })),
    };
  }

  applyCommand(state: RummyState, command: GameCommand): EngineResult<RummyPublicState> {
    switch (command.type) {
      case "start":
        this.startRound(state, command.actorId);
        break;
      case "draw":
        this.drawCard(state, command.actorId, command.payload);
        break;
      case "discard":
        this.discardCard(state, command.actorId, command.payload);
        break;
      case "declare":
        this.declare(state, command.actorId, command.payload);
        break;
      default:
        throw new RummyDomainError("UNKNOWN_ACTION", `Unknown rummy action: ${command.type}`);
    }
    state.version += 1;
    return {
      publicState: this.toPublicState(state),
      privateStates: state.playersInternal.map((player) => ({
        playerId: player.id,
        data: { hand: player.hand, wildJoker: state.wildJoker, phase: state.phase },
      })),
      events: [{ type: "rummy:state-changed", payload: { version: state.version, phase: state.phase } }],
    };
  }

  toPublicState(state: RummyState): RummyPublicState {
    return {
      gameType: "RUMMY",
      phase: state.phase,
      version: state.version,
      roundNumber: state.roundNumber,
      currentPlayerId: state.playersInternal[state.currentPlayerIndex ?? -1]?.id,
      wildJoker: state.wildJoker,
      discardTop: state.discardPile[state.discardPile.length - 1],
      stockCount: state.deck.length,
      players: state.playersInternal.map(({ id, hand, score, declared, invalidDeclaration }) => ({
        id, cardCount: hand.length, score, declared, invalidDeclaration,
      })),
      winnerId: state.playersInternal.find((player) => player.declared && !player.invalidDeclaration)?.id,
    };
  }

  private startRound(state: RummyState, actorId: string) {
    if (state.phase !== "WAITING" && state.phase !== "COMPLETE") {
      throw new RummyDomainError("ROUND_IN_PROGRESS", "A rummy round is already in progress");
    }
    if (actorId !== state.playersInternal[0]?.id) throw new RummyDomainError("NOT_HOST", "Only the table host may start the round");
    state.roundNumber += 1;
    state.phase = "DRAW";
    state.deck = shuffledDeck(this.randomIndex, this.deckCount, this.printedJokersPerDeck);
    state.discardPile = [];
    const jokerCard = draw(state.deck);
    state.wildJoker = jokerCard.rank === 0 ? 1 : jokerCard.rank;
    state.deck.push(jokerCard);
    state.discardPile.push(draw(state.deck));
    state.playersInternal.forEach((player) => {
      player.hand = [];
      player.score = 0;
      player.declared = false;
      player.invalidDeclaration = false;
      for (let count = 0; count < 13; count += 1) player.hand.push(draw(state.deck));
    });
    state.currentPlayerIndex = 0;
    state.drawnCard = undefined;
  }

  private drawCard(state: RummyState, actorId: string, payload: unknown) {
    const player = this.requireCurrentPlayer(state, actorId);
    if (state.phase !== "DRAW") throw new RummyDomainError("INVALID_PHASE", "A player can draw only at the start of their turn");
    const source = readDrawSource(payload);
    const card = source === "discard" ? state.discardPile.pop() : state.deck.pop();
    if (!card) throw new RummyDomainError("DECK_EMPTY", "The requested pile is empty");
    player.hand.push(card);
    state.drawnCard = card;
    state.phase = "DISCARD";
  }

  private discardCard(state: RummyState, actorId: string, payload: unknown) {
    const player = this.requireCurrentPlayer(state, actorId);
    if (state.phase !== "DISCARD" || player.hand.length !== 14) {
      throw new RummyDomainError("INVALID_PHASE", "Draw before discarding");
    }
    const cardId = readCardId(payload);
    const cardIndex = player.hand.findIndex((card, index) => cardId === cardKey(card, index));
    if (cardIndex < 0) throw new RummyDomainError("CARD_NOT_IN_HAND", "The selected card is not in the player's hand");
    const [card] = player.hand.splice(cardIndex, 1);
    if (!card) throw new RummyDomainError("CARD_NOT_IN_HAND", "The selected card is not in the player's hand");
    state.discardPile.push(card);
    state.drawnCard = undefined;
    state.phase = "DRAW";
    state.currentPlayerIndex = nextPlayerIndex(state);
  }

  private declare(state: RummyState, actorId: string, payload: unknown) {
    const player = this.requireCurrentPlayer(state, actorId);
    if (state.phase !== "DRAW" || player.hand.length !== 13) {
      throw new RummyDomainError("INVALID_DECLARATION", "A declaration requires exactly 13 cards after discarding");
    }
    const groups = readGroups(payload);
    const validation = validateDeclaration(player.hand, groups, state.wildJoker);
    player.declared = true;
    if (!validation.valid) {
      player.invalidDeclaration = true;
      player.score = MAX_SCORE;
      state.phase = "DECLARATION";
      state.playersInternal.filter((candidate) => candidate.id !== player.id).forEach((candidate) => {
        candidate.score = scoreHand(candidate.hand, state.wildJoker);
      });
      state.phase = "COMPLETE";
      return;
    }
    player.score = 0;
    state.playersInternal.filter((candidate) => candidate.id !== player.id).forEach((candidate) => {
      candidate.score = scoreHand(candidate.hand, state.wildJoker);
    });
    state.phase = "COMPLETE";
  }

  private requireCurrentPlayer(state: RummyState, actorId: string) {
    const index = state.playersInternal.findIndex((player) => player.id === actorId);
    if (index < 0 || index !== state.currentPlayerIndex) throw new RummyDomainError("NOT_YOUR_TURN", "It is not this player's turn");
    return state.playersInternal[index]!;
  }
}

export function validateDeclaration(hand: RummyCard[], groups: RummyGroup[], wildJoker: RummyRank) {
  const cardsById = new Map(hand.map((card, index) => [cardKey(card, index), card]));
  const used = new Set<string>();
  const parsedGroups = groups.map((group) => group.cardIds.map((id) => {
    const card = cardsById.get(id);
    if (!card || used.has(id)) return undefined;
    used.add(id);
    return card;
  }));
  if (parsedGroups.some((group) => group.some((card) => !card)) || used.size !== hand.length ||
    parsedGroups.some((group) => group.length < 3)) {
    return { valid: false, pureSequences: 0, sequences: 0, reason: "GROUPS_DO_NOT_PARTITION_HAND" };
  }
  const groupResults = parsedGroups.map((group) => classifyGroup(group as RummyCard[], wildJoker));
  const pureSequences = groupResults.filter((result) => result === "PURE_SEQUENCE").length;
  const sequences = groupResults.filter((result) => result === "PURE_SEQUENCE" || result === "IMPURE_SEQUENCE").length;
  return {
    valid: pureSequences >= 1 && sequences >= 2 && groupResults.every((result) => result !== "INVALID"),
    pureSequences,
    sequences,
    reason: pureSequences >= 1 && sequences >= 2 ? undefined : "TWO_SEQUENCES_REQUIRED",
  };
}

export function classifyGroup(cards: RummyCard[], wildJoker: RummyRank): "PURE_SEQUENCE" | "IMPURE_SEQUENCE" | "SET" | "INVALID" {
  const natural = cards.filter((card) => !isWild(card, wildJoker));
  const wildCount = cards.length - natural.length;
  if (natural.length > 0 && new Set(natural.map((card) => card.rank)).size === 1 &&
    new Set(natural.map((card) => card.suit)).size === natural.length &&
    natural.length + wildCount >= 3) return "SET";
  if (natural.length === 0) return "IMPURE_SEQUENCE";
  if (new Set(natural.map((card) => card.suit)).size !== 1) return "INVALID";
  const ranks = natural.map((card) => card.rank).sort((a, b) => a - b);
  const gaps = ranks.reduce((sum: number, rank, index) => index === 0 ? 0 : sum + rank - ranks[index - 1]! - 1, 0);
  if (gaps > wildCount || new Set(ranks).size !== ranks.length) return "INVALID";
  return wildCount === 0 ? "PURE_SEQUENCE" : "IMPURE_SEQUENCE";
}

export function scoreHand(hand: RummyCard[], wildJoker: RummyRank) {
  return Math.min(MAX_SCORE, hand.reduce((score, card) => score + (isWild(card, wildJoker) ? 0 : Math.min(card.rank === 1 ? 10 : card.rank, 10)), 0));
}

function isWild(card: RummyCard, wildJoker: RummyRank) {
  return card.rank === 0 || card.rank === wildJoker;
}

function shuffledDeck(randomIndex: (length: number) => number, deckCount: number, printedJokersPerDeck: number) {
  const deck: RummyCard[] = [];
  for (let copy = 0; copy < deckCount; copy += 1) {
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: `${copy}-${rank}${suit}`, rank, suit });
    for (let joker = 0; joker < printedJokersPerDeck; joker += 1) deck.push({ id: `${copy}-J${joker}`, rank: 0, suit: "C" });
  }
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return deck;
}

function draw(deck: RummyCard[]) {
  const card = deck.pop();
  if (!card) throw new RummyDomainError("DECK_EMPTY", "The deck is empty");
  return card;
}

function nextPlayerIndex(state: RummyState) {
  return ((state.currentPlayerIndex ?? 0) + 1) % state.playersInternal.length;
}

function readDrawSource(payload: unknown): "stock" | "discard" {
  if (!payload || typeof payload !== "object" || !("from" in payload) ||
    (payload.from !== "stock" && payload.from !== "discard")) {
    throw new RummyDomainError("INVALID_DRAW", "Draw source must be stock or discard");
  }
  return payload.from;
}

function readCardId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("cardId" in payload) || typeof payload.cardId !== "string") {
    throw new RummyDomainError("INVALID_CARD", "A cardId is required");
  }
  return payload.cardId;
}

function readGroups(payload: unknown): RummyGroup[] {
  if (!payload || typeof payload !== "object" || !("groups" in payload) || !Array.isArray(payload.groups)) {
    throw new RummyDomainError("INVALID_DECLARATION", "Declaration groups are required");
  }
  return payload.groups as RummyGroup[];
}

function cardKey(card: RummyCard, index: number) {
  return card.id ?? `${card.rank}${card.suit}-${index}`;
}
