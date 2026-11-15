import type { GameType } from "@card-table/shared";

export interface GameCommand {
  type: string;
  actorId: string;
  requestId: string;
  payload: unknown;
}

export interface PublicGameState {
  gameType: GameType;
  phase: string;
  version: number;
}

export interface PrivatePlayerState {
  playerId: string;
  data: unknown;
}

export interface EngineResult {
  publicState: PublicGameState;
  privateStates: PrivatePlayerState[];
  events: Array<{ type: string; payload: unknown }>;
}

export interface GameEngine {
  readonly gameType: GameType;
  createInitialState(playerIds: string[]): PublicGameState;
  applyCommand(state: PublicGameState, command: GameCommand): EngineResult;
}

export { Card, RANKS, SUITS, cardRank, cardSuit, createDeck, isCard, isStrictlyBetween, rankValue } from "./cards";
export { PotGameEngine, potGameEngine } from "./pot";
export type { PotPhase, PotPlayerStatus, PotPlayerView, PotState } from "./pot";
export { RummyGameEngine, rummyGameEngine } from "./rummy";
export type { RummyPhase, RummyPlayerView, RummyState } from "./rummy";
