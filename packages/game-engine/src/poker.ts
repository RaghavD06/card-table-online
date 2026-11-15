import { randomInt } from "node:crypto";
import type { EngineResult, GameCommand, GameEngine, PublicGameState } from "./index";

export type Suit = "C" | "D" | "H" | "S";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card { rank: Rank; suit: Suit; }
export type PokerStage = "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN" | "COMPLETE";

export interface PokerPlayerState {
  id: string;
  stack: number;
  committed: number;
  streetCommitted: number;
  folded: boolean;
  allIn: boolean;
  holeCards: Card[];
  acted: boolean;
}

export interface PokerPublicPlayer {
  id: string;
  stack: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  hasCards: boolean;
}

export interface PokerPublicState extends PublicGameState {
  gameType: "POKER";
  phase: PokerStage;
  handNumber: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  pot: number;
  currentBet: number;
  minRaise: number;
  currentPlayerId?: string;
  board: Card[];
  players: PokerPublicPlayer[];
  winners: string[];
}

export interface PokerState extends PokerPublicState {
  deck: Card[];
  playersInternal: PokerPlayerState[];
  handStarted: boolean;
  currentPlayerIndex?: number;
}

export interface PokerEngineOptions {
  smallBlind?: number;
  bigBlind?: number;
  startingStack?: number;
  randomIndex?: (length: number) => number;
}

export class PokerDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const SUITS: Suit[] = ["C", "D", "H", "S"];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const ACTIONS = new Set(["fold", "check", "call", "bet", "raise", "all-in"]);

export class PokerEngine implements GameEngine<PokerState> {
  readonly gameType = "POKER" as const;
  private readonly smallBlind: number;
  private readonly bigBlind: number;
  private readonly startingStack: number;
  private readonly randomIndex: (length: number) => number;

  constructor(options: PokerEngineOptions = {}) {
    this.smallBlind = options.smallBlind ?? 5;
    this.bigBlind = options.bigBlind ?? 10;
    this.startingStack = options.startingStack ?? 1_000;
    this.randomIndex = options.randomIndex ?? ((length) => randomInt(length));
    if (!Number.isInteger(this.smallBlind) || this.smallBlind <= 0 ||
      !Number.isInteger(this.bigBlind) || this.bigBlind < this.smallBlind ||
      !Number.isInteger(this.startingStack) || this.startingStack < this.bigBlind) {
      throw new PokerDomainError("INVALID_TABLE_CONFIG", "Blind and starting stack values are invalid");
    }
  }

  createInitialState(playerIds: string[]): PokerState {
    if (new Set(playerIds).size !== playerIds.length || playerIds.length > 9) {
      throw new PokerDomainError("INVALID_PLAYERS", "Poker tables support 2 to 9 unique players");
    }
    return {
      gameType: "POKER",
      phase: "WAITING",
      version: 0,
      handNumber: 0,
      dealerIndex: -1,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      pot: 0,
      currentBet: 0,
      minRaise: this.bigBlind,
      board: [],
      players: playerIds.map((id) => ({
        id, stack: this.startingStack, committed: 0, folded: false, allIn: false, hasCards: false,
      })),
      winners: [],
      deck: [],
      playersInternal: playerIds.map((id) => ({
        id, stack: this.startingStack, committed: 0, streetCommitted: 0,
        folded: false, allIn: false, holeCards: [], acted: false,
      })),
      handStarted: false,
    };
  }

  applyCommand(state: PokerState, command: GameCommand): EngineResult<PokerPublicState> {
    if (command.type === "start") this.startHand(state, command.actorId);
    else if (ACTIONS.has(command.type)) this.applyAction(state, command);
    else throw new PokerDomainError("UNKNOWN_ACTION", `Unknown poker action: ${command.type}`);
    state.version += 1;
    return {
      publicState: this.toPublicState(state),
      privateStates: state.playersInternal.map((player) => ({
        playerId: player.id,
        data: { holeCards: player.holeCards, stage: state.phase },
      })),
      events: [{ type: "poker:state-changed", payload: { version: state.version, phase: state.phase } }],
    };
  }

  toPublicState(state: PokerState): PokerPublicState {
    return {
      gameType: "POKER",
      phase: state.phase,
      version: state.version,
      handNumber: state.handNumber,
      dealerIndex: state.dealerIndex,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      pot: state.playersInternal.reduce((sum, player) => sum + player.committed, 0),
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      currentPlayerId: state.playersInternal[state.currentPlayerIndex ?? -1]?.id,
      board: state.board,
      players: state.playersInternal.map((player) => ({
        id: player.id,
        stack: player.stack,
        committed: player.committed,
        folded: player.folded,
        allIn: player.allIn,
        hasCards: player.holeCards.length > 0,
      })),
      winners: state.winners,
    };
  }

  private startHand(state: PokerState, actorId: string) {
    if (state.handStarted && state.phase !== "COMPLETE") {
      throw new PokerDomainError("HAND_IN_PROGRESS", "A hand is already in progress");
    }
    if (state.playersInternal.length < 2) throw new PokerDomainError("NOT_ENOUGH_PLAYERS", "At least two players are required");
    if (actorId !== state.playersInternal[0]?.id) throw new PokerDomainError("NOT_HOST", "Only the table host may start the hand");
    const eligible = state.playersInternal.filter((player) => player.stack > 0);
    if (eligible.length < 2) throw new PokerDomainError("NOT_ENOUGH_CHIPS", "At least two players need chips");

    state.handNumber += 1;
    state.handStarted = true;
    state.phase = "PREFLOP";
    state.winners = [];
    state.board = [];
    state.deck = shuffledDeck(this.randomIndex);
    state.dealerIndex = nextSeat(state.dealerIndex, state.playersInternal.length, (player) => player.stack > 0, state.playersInternal);
    for (const player of state.playersInternal) {
      player.committed = 0;
      player.streetCommitted = 0;
      player.folded = player.stack <= 0;
      player.allIn = false;
      player.holeCards = [];
      player.acted = false;
    }
    for (let round = 0; round < 2; round += 1) {
      for (let offset = 1; offset <= state.playersInternal.length; offset += 1) {
        const player = state.playersInternal[(state.dealerIndex + offset) % state.playersInternal.length];
        if (player && !player.folded) player.holeCards.push(draw(state.deck));
      }
    }
    const smallBlindIndex = nextSeat(state.dealerIndex, state.playersInternal.length, (player) => !player.folded, state.playersInternal);
    const bigBlindIndex = nextSeat(smallBlindIndex, state.playersInternal.length, (player) => !player.folded, state.playersInternal);
    commit(state.playersInternal[smallBlindIndex], this.smallBlind);
    commit(state.playersInternal[bigBlindIndex], this.bigBlind);
    state.currentBet = Math.max(
      state.playersInternal[smallBlindIndex]?.streetCommitted ?? 0,
      state.playersInternal[bigBlindIndex]?.streetCommitted ?? 0,
    );
    state.minRaise = this.bigBlind;
    state.currentPlayerIndex = nextSeat(bigBlindIndex, state.playersInternal.length, canAct, state.playersInternal);
    normalizeAllIns(state);
  }

  private applyAction(state: PokerState, command: GameCommand) {
    if (!state.handStarted || state.phase === "WAITING" || state.phase === "COMPLETE") {
      throw new PokerDomainError("NO_HAND", "There is no active hand");
    }
    const playerIndex = state.playersInternal.findIndex((player) => player.id === command.actorId);
    const player = state.playersInternal[playerIndex];
    if (!player || playerIndex !== state.currentPlayerIndex) throw new PokerDomainError("NOT_YOUR_TURN", "It is not this player's turn");
    if (player.folded || player.allIn) throw new PokerDomainError("PLAYER_INACTIVE", "This player cannot act");
    const toCall = state.currentBet - player.streetCommitted;
    const amount = command.type === "fold" || command.type === "check" ? 0 : readAmount(command.payload);
    switch (command.type) {
      case "fold":
        player.folded = true;
        player.acted = true;
        break;
      case "check":
        if (toCall !== 0) throw new PokerDomainError("INVALID_CHECK", "Cannot check while facing a bet");
        player.acted = true;
        break;
      case "call":
        if (toCall <= 0) throw new PokerDomainError("INVALID_CALL", "There is no bet to call");
        commit(player, Math.min(toCall, player.stack));
        player.acted = true;
        break;
      case "bet":
        if (state.currentBet !== 0 || amount <= 0 || amount < state.minRaise || amount > player.stack) {
          throw new PokerDomainError("INVALID_BET", "Bet must be at least the minimum and within the player's stack");
        }
        commit(player, amount);
        state.currentBet = player.streetCommitted;
        state.minRaise = amount;
        resetActionCycle(state, playerIndex);
        player.acted = true;
        break;
      case "raise": {
        const raiseTo = amount;
        const raiseSize = raiseTo - state.currentBet;
        const isAllIn = raiseTo === player.streetCommitted + player.stack;
        if (state.currentBet <= 0 || raiseTo <= state.currentBet || raiseTo > player.streetCommitted + player.stack ||
          (!isAllIn && raiseSize < state.minRaise)) {
          throw new PokerDomainError("INVALID_RAISE", "Raise must increase the current bet by at least the minimum raise");
        }
        commit(player, raiseTo - player.streetCommitted);
        state.currentBet = raiseTo;
        state.minRaise = raiseSize;
        resetActionCycle(state, playerIndex);
        player.acted = true;
        break;
      }
      case "all-in": {
        const before = state.currentBet;
        commit(player, player.stack);
        player.acted = true;
        if (player.streetCommitted > before) {
          const raiseSize = player.streetCommitted - before;
          if (player.streetCommitted > state.currentBet) {
            state.currentBet = player.streetCommitted;
            if (raiseSize >= state.minRaise) {
              state.minRaise = raiseSize;
              resetActionCycle(state, playerIndex);
              player.acted = true;
            }
          }
        }
        break;
      }
    }
    normalizeAllIns(state);
    if (remainingPlayers(state).length === 1) {
      settle(state);
      return;
    }
    if (bettingRoundComplete(state)) advanceStreet(state);
    else state.currentPlayerIndex = nextSeat(playerIndex, state.playersInternal.length, canAct, state.playersInternal);
  }

}

function shuffledDeck(randomIndex: (length: number) => number): Card[] {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank } as Card)));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return deck;
}

function draw(deck: Card[]) {
  const card = deck.pop();
  if (!card) throw new PokerDomainError("DECK_EMPTY", "The deck is empty");
  return card;
}

function nextSeat(start: number, count: number, predicate: (player: PokerPlayerState) => boolean, players?: PokerPlayerState[]) {
  if (!players) throw new Error("players are required");
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (start + offset + count) % count;
    const player = players[index];
    if (player && predicate(player)) return index;
  }
  throw new PokerDomainError("NO_ELIGIBLE_SEAT", "No eligible player seat remains");
}

function commit(player: PokerPlayerState | undefined, amount: number) {
  if (!player || amount < 0 || amount > player.stack) throw new PokerDomainError("INVALID_AMOUNT", "Invalid chip amount");
  player.stack -= amount;
  player.committed += amount;
  player.streetCommitted += amount;
  if (player.stack === 0) player.allIn = true;
}

function readAmount(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("amount" in payload) || typeof payload.amount !== "number" ||
    !Number.isInteger(payload.amount)) throw new PokerDomainError("INVALID_AMOUNT", "An integer amount is required");
  return payload.amount;
}

function canAct(player: PokerPlayerState) {
  return !player.folded && !player.allIn;
}

function normalizeAllIns(state: PokerState) {
  state.playersInternal.forEach((player) => {
    if (player.stack === 0) player.allIn = true;
  });
}

function resetActionCycle(state: PokerState, actorIndex: number) {
  state.playersInternal.forEach((player, index) => {
    if (index !== actorIndex && canAct(player)) player.acted = false;
  });
}

function remainingPlayers(state: PokerState) {
  return state.playersInternal.filter((player) => !player.folded);
}

function bettingRoundComplete(state: PokerState) {
  const active = state.playersInternal.filter(canAct);
  return active.length === 0 || active.every((player) => player.acted && player.streetCommitted === state.currentBet);
}

function advanceStreet(state: PokerState) {
  state.playersInternal.forEach((player) => {
    player.streetCommitted = 0;
    player.acted = false;
  });
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  if (state.phase === "PREFLOP") {
    draw(state.deck);
    state.board.push(draw(state.deck), draw(state.deck), draw(state.deck));
    state.phase = "FLOP";
  } else if (state.phase === "FLOP") {
    draw(state.deck);
    state.board.push(draw(state.deck));
    state.phase = "TURN";
  } else if (state.phase === "TURN") {
    draw(state.deck);
    state.board.push(draw(state.deck));
    state.phase = "RIVER";
  } else {
    settle(state);
    return;
  }
  state.currentPlayerIndex = nextSeat(state.dealerIndex, state.playersInternal.length, canAct, state.playersInternal);
}

function settle(state: PokerState) {
  state.phase = "SHOWDOWN";
  const pots = buildPots(state.playersInternal);
  const payouts = new Map<string, number>();
  const winners: string[] = [];
  for (const pot of pots) {
    const eligible = pot.players.filter((player) => !player.folded);
    if (eligible.length === 0) continue;
    const best = eligible.map((player) => ({ player, score: evaluateHand([...player.holeCards, ...state.board]) }))
      .sort((left, right) => compareScores(right.score, left.score))[0]?.score;
    const potWinners = eligible.filter((player) => best && compareScores(evaluateHand([...player.holeCards, ...state.board]), best) === 0);
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - share * potWinners.length;
    potWinners.forEach((player) => {
      payouts.set(player.id, (payouts.get(player.id) ?? 0) + share + (remainder-- > 0 ? 1 : 0));
      if (!winners.includes(player.id)) winners.push(player.id);
    });
  }
  state.playersInternal.forEach((player) => {
    player.stack += payouts.get(player.id) ?? 0;
    player.committed = 0;
    player.streetCommitted = 0;
  });
  state.winners = winners;
  state.phase = "COMPLETE";
  state.handStarted = false;
  state.currentPlayerIndex = undefined;
}

function buildPots(players: PokerPlayerState[]) {
  const levels = [...new Set(players.map((player) => player.committed).filter((value) => value > 0))].sort((a, b) => a - b);
  let previous = 0;
  return levels.map((level) => {
    const contributors = players.filter((player) => player.committed >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    return { amount, players: contributors };
  }).filter((pot) => pot.amount > 0);
}

export type HandScore = [number, ...number[]];
export function evaluateHand(cards: Card[]): HandScore {
  const counts = new Map<number, number>();
  cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1));
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flushSuit = SUITS.find((suit) => cards.filter((card) => card.suit === suit).length >= 5);
  const straight = straightHigh(cards.map((card) => card.rank));
  const flushCards = flushSuit ? cards.filter((card) => card.suit === flushSuit) : [];
  const straightFlush = flushSuit ? straightHigh(flushCards.map((card) => card.rank)) : undefined;
  if (straightFlush) return [8, straightFlush];
  if (byCount[0]?.[1] === 4) return [7, byCount[0][0], byCount[1]?.[0] ?? 0];
  if (byCount[0]?.[1] === 3 && byCount.some((entry, index) => index > 0 && entry[1] >= 2)) {
    return [6, byCount[0][0], byCount.find((entry, index) => index > 0 && entry[1] >= 2)?.[0] ?? 0];
  }
  if (flushSuit) return [5, ...flushCards.map((card) => card.rank).sort((a, b) => b - a).slice(0, 5)];
  if (straight) return [4, straight];
  if (byCount[0]?.[1] === 3) return [3, byCount[0][0], ...byCount.slice(1).map((entry) => entry[0]).slice(0, 2)];
  if (byCount[0]?.[1] === 2 && byCount[1]?.[1] === 2) return [2, byCount[0][0], byCount[1][0], byCount[2]?.[0] ?? 0];
  if (byCount[0]?.[1] === 2) return [1, byCount[0][0], ...byCount.slice(1).map((entry) => entry[0]).slice(0, 3)];
  return [0, ...cards.map((card) => card.rank).sort((a, b) => b - a).slice(0, 5)];
}

function straightHigh(ranks: number[]) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique.slice(index, index + 5).every((rank, offset) => rank === unique[index]! - offset)) return unique[index];
  }
  return undefined;
}

function compareScores(left: HandScore, right: HandScore) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
