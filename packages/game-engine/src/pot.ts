import { randomInt } from "node:crypto";
import type { EngineResult, GameCommand, GameEngine, PublicGameState } from "./index";

export type PotSuit = "C" | "D" | "H" | "S";
export type PotRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type PotAceRanking = "LOW" | "HIGH";
export type PotStage = "WAITING" | "BETTING" | "COMPLETE";
export type PotOutcome = "WIN" | "LOSE" | "PASSED";

export interface PotCard {
  id: string;
  rank: PotRank;
  suit: PotSuit;
}

export interface PotPlayerState {
  id: string;
  balance: number;
  wins: number;
  losses: number;
  passes: number;
}

export interface PotPublicPlayer {
  id: string;
  balance: number;
  wins: number;
  losses: number;
  passes: number;
}

export interface PotPublicState extends PublicGameState {
  gameType: "POT";
  phase: PotStage;
  aceRanking: PotAceRanking;
  minBet: number;
  maxBet: number;
  currentPlayerId?: string;
  lowerCard?: PotCard;
  upperCard?: PotCard;
  revealedCard?: PotCard;
  lastOutcome?: PotOutcome;
  lastBet?: number;
  players: PotPublicPlayer[];
}

export interface PotState extends PotPublicState {
  deck: PotCard[];
  playersInternal: PotPlayerState[];
  currentPlayerIndex?: number;
  processedRequestIds: Set<string>;
}

export interface PotEngineOptions {
  minBet?: number;
  maxBet?: number;
  startingBalance?: number;
  aceRanking?: PotAceRanking;
  randomIndex?: (length: number) => number;
}

export class PotDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const SUITS: PotSuit[] = ["C", "D", "H", "S"];
const RANKS: PotRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export class PotEngine implements GameEngine<PotState> {
  readonly gameType = "POT" as const;
  private readonly minBet: number;
  private readonly maxBet: number;
  private readonly startingBalance: number;
  private readonly aceRanking: PotAceRanking;
  private readonly randomIndex: (length: number) => number;

  constructor(options: PotEngineOptions = {}) {
    this.minBet = options.minBet ?? 1;
    this.maxBet = options.maxBet ?? 100;
    this.startingBalance = options.startingBalance ?? 1_000;
    this.aceRanking = options.aceRanking ?? "HIGH";
    this.randomIndex = options.randomIndex ?? ((length) => randomInt(length));
    if (!Number.isInteger(this.minBet) || this.minBet <= 0 ||
      !Number.isInteger(this.maxBet) || this.maxBet < this.minBet ||
      !Number.isInteger(this.startingBalance) || this.startingBalance < this.minBet ||
      (this.aceRanking !== "LOW" && this.aceRanking !== "HIGH")) {
      throw new PotDomainError("INVALID_TABLE_CONFIG", "Pot betting configuration is invalid");
    }
  }

  createInitialState(playerIds: string[]): PotState {
    if (new Set(playerIds).size !== playerIds.length || playerIds.length < 2 || playerIds.length > 6) {
      throw new PotDomainError("INVALID_PLAYERS", "Pot tables support 2 to 6 unique players");
    }
    return {
      gameType: "POT",
      phase: "WAITING",
      version: 0,
      aceRanking: this.aceRanking,
      minBet: this.minBet,
      maxBet: this.maxBet,
      players: playerIds.map((id) => ({ id, balance: this.startingBalance, wins: 0, losses: 0, passes: 0 })),
      deck: [],
      playersInternal: playerIds.map((id) => ({ id, balance: this.startingBalance, wins: 0, losses: 0, passes: 0 })),
      processedRequestIds: new Set<string>(),
    };
  }

  applyCommand(state: PotState, command: GameCommand): EngineResult<PotPublicState> {
    if (state.processedRequestIds.has(command.requestId)) {
      throw new PotDomainError("DUPLICATE_ACTION", "This action has already been processed");
    }
    if (!command.requestId.trim()) throw new PotDomainError("INVALID_REQUEST", "A requestId is required");

    if (command.type === "start") this.startRound(state, command.actorId);
    else if (command.type === "bet") this.bet(state, command.actorId, command.payload);
    else if (command.type === "pass") this.pass(state, command.actorId);
    else throw new PotDomainError("UNKNOWN_ACTION", `Unknown pot action: ${command.type}`);

    state.processedRequestIds.add(command.requestId);
    state.version += 1;
    return {
      publicState: this.toPublicState(state),
      privateStates: state.playersInternal.map((player) => ({
        playerId: player.id,
        data: { balance: player.balance, phase: state.phase, currentPlayerId: state.playersInternal[state.currentPlayerIndex ?? -1]?.id },
      })),
      events: [{ type: "pot:state-changed", payload: { version: state.version, phase: state.phase } }],
    };
  }

  toPublicState(state: PotState): PotPublicState {
    return {
      gameType: "POT",
      phase: state.phase,
      version: state.version,
      aceRanking: state.aceRanking,
      minBet: state.minBet,
      maxBet: state.maxBet,
      currentPlayerId: state.playersInternal[state.currentPlayerIndex ?? -1]?.id,
      lowerCard: state.lowerCard,
      upperCard: state.upperCard,
      revealedCard: state.revealedCard,
      lastOutcome: state.lastOutcome,
      lastBet: state.lastBet,
      players: state.playersInternal.map(({ id, balance, wins, losses, passes }) => ({ id, balance, wins, losses, passes })),
    };
  }

  private startRound(state: PotState, actorId: string) {
    if (state.phase !== "WAITING" && state.phase !== "COMPLETE") {
      throw new PotDomainError("ROUND_IN_PROGRESS", "A pot round is already in progress");
    }
    if (actorId !== state.playersInternal[0]?.id) throw new PotDomainError("NOT_HOST", "Only the table host may start the round");
    if (state.playersInternal.filter((player) => player.balance >= state.minBet).length < 2) {
      throw new PotDomainError("NOT_ENOUGH_PLAYERS", "At least two players need enough balance to play");
    }
    state.deck = shuffledDeck(this.randomIndex);
    state.currentPlayerIndex = 0;
    state.phase = "BETTING";
    state.lastOutcome = undefined;
    state.lastBet = undefined;
    state.revealedCard = undefined;
    this.dealBoundary(state);
  }

  private bet(state: PotState, actorId: string, payload: unknown) {
    const player = this.requireCurrentPlayer(state, actorId);
    const amount = readAmount(payload);
    if (amount < state.minBet || amount > state.maxBet || amount > player.balance) {
      throw new PotDomainError("INVALID_BET", `Bet must be between ${state.minBet} and ${state.maxBet} and within balance`);
    }
    player.balance -= amount;
    state.lastBet = amount;
    state.revealedCard = this.drawCard(state);
    state.lastOutcome = evaluatePotHand(state.lowerCard, state.upperCard, state.revealedCard, state.aceRanking);
    if (state.lastOutcome === "WIN") {
      player.balance += amount * 2;
      player.wins += 1;
    } else {
      player.losses += 1;
    }
    this.advanceTurn(state);
  }

  private pass(state: PotState, actorId: string) {
    const player = this.requireCurrentPlayer(state, actorId);
    state.lastBet = 0;
    state.revealedCard = undefined;
    state.lastOutcome = "PASSED";
    player.passes += 1;
    this.advanceTurn(state);
  }

  private requireCurrentPlayer(state: PotState, actorId: string) {
    if (state.phase !== "BETTING") throw new PotDomainError("INVALID_PHASE", "The pot table is not accepting actions");
    const index = state.playersInternal.findIndex((player) => player.id === actorId);
    if (index < 0 || index !== state.currentPlayerIndex) throw new PotDomainError("NOT_YOUR_TURN", "It is not this player's turn");
    return state.playersInternal[index]!;
  }

  private advanceTurn(state: PotState) {
    const next = nextEligibleIndex(state);
    if (next === undefined) {
      state.phase = "COMPLETE";
      state.currentPlayerIndex = undefined;
      return;
    }
    state.currentPlayerIndex = next;
    this.dealBoundary(state);
  }

  private drawCard(state: PotState) {
    if (state.deck.length < 1) state.deck = shuffledDeck(this.randomIndex);
    const card = state.deck.pop();
    if (!card) throw new PotDomainError("DECK_EMPTY", "The card deck is empty");
    return card;
  }

  private dealBoundary(state: PotState) {
    state.lowerCard = this.drawCard(state);
    state.upperCard = this.drawCard(state);
    state.revealedCard = undefined;
  }
}

export function evaluatePotHand(
  lowerCard: PotCard | undefined,
  upperCard: PotCard | undefined,
  revealedCard: PotCard | undefined,
  aceRanking: PotAceRanking = "HIGH",
): Exclude<PotOutcome, "PASSED"> {
  if (!lowerCard || !upperCard || !revealedCard) throw new PotDomainError("MISSING_CARDS", "Three cards are required to evaluate a pot hand");
  const lower = cardValue(lowerCard, aceRanking);
  const upper = cardValue(upperCard, aceRanking);
  const revealed = cardValue(revealedCard, aceRanking);
  const low = Math.min(lower, upper);
  const high = Math.max(lower, upper);
  return revealed > low && revealed < high ? "WIN" : "LOSE";
}

function shuffledDeck(randomIndex: (length: number) => number) {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${rank}${suit}`, rank, suit })));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return deck;
}

function nextEligibleIndex(state: PotState) {
  const current = state.currentPlayerIndex ?? -1;
  for (let offset = 1; offset <= state.playersInternal.length; offset += 1) {
    const index = (current + offset) % state.playersInternal.length;
    const player = state.playersInternal[index];
    if (player && player.balance >= state.minBet) return index;
  }
  return undefined;
}

function cardValue(card: PotCard, aceRanking: PotAceRanking) {
  return card.rank === 1 && aceRanking === "HIGH" ? 14 : card.rank;
}

function readAmount(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("amount" in payload) ||
    typeof payload.amount !== "number" || !Number.isInteger(payload.amount)) {
    throw new PotDomainError("INVALID_BET", "An integer bet amount is required");
  }
  return payload.amount;
}
