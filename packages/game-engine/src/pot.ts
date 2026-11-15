import type { EngineResult, GameCommand, GameEngine, PrivatePlayerState, PublicGameState } from "./index";
import { createDeck, isCard, isStrictlyBetween, type Card } from "./cards";

export type PotPhase = "WAITING" | "PLAYING" | "ROUND_COMPLETE";
export type PotPlayerStatus = "ACTIVE" | "FOLDED" | "WINNER";

export interface PotPlayerView {
  playerId: string;
  balance: number;
  status: PotPlayerStatus;
}

export interface PotState extends PublicGameState {
  gameType: "POT";
  phase: PotPhase;
  playerIds: string[];
  players: PotPlayerView[];
  currentPlayerId?: string;
  deck: Card[];
  boundaries: Record<string, [Card, Card]>;
  revealed: Record<string, Card | undefined>;
  wagers: Record<string, number>;
  pot: number;
  winnerIds: string[];
}

type PotPayload = { wager?: number };

const STARTING_BALANCE = 100;
const ANTE = 1;

const errorEvent = (state: PotState, command: GameCommand, code: string, message: string): EngineResult => ({
  publicState: state,
  privateStates: projectPrivateStates(state),
  events: [{ type: "game.error", payload: { requestId: command.requestId, code, message } }],
});

export class PotGameEngine implements GameEngine {
  readonly gameType = "POT" as const;

  createInitialState(playerIds: string[]): PotState {
    const uniquePlayerIds = [...new Set(playerIds)];
    return {
      gameType: "POT",
      phase: "WAITING",
      version: 0,
      playerIds: uniquePlayerIds,
      players: uniquePlayerIds.map((playerId) => ({ playerId, balance: STARTING_BALANCE, status: "ACTIVE" })),
      deck: [],
      boundaries: {},
      revealed: {},
      wagers: {},
      pot: 0,
      winnerIds: [],
    };
  }

  applyCommand(state: PublicGameState, command: GameCommand): EngineResult {
    const current = state as PotState;
    if (current.gameType !== "POT") return errorEvent(current, command, "WRONG_GAME", "Command does not target a Pot state");
    switch (command.type) {
      case "start":
        return this.start(current, command);
      case "wager":
      case "play":
        return this.wager(current, command);
      case "fold":
        return this.fold(current, command);
      default:
        return errorEvent(current, command, "UNKNOWN_COMMAND", `Unknown Pot command: ${command.type}`);
    }
  }

  private start(state: PotState, command: GameCommand): EngineResult {
    if (state.phase !== "WAITING") return errorEvent(state, command, "INVALID_PHASE", "Pot has already started");
    if (state.playerIds.length < 2) return errorEvent(state, command, "INVALID_PLAYER_COUNT", "Pot requires at least 2 players");
    if (!state.playerIds.includes(command.actorId)) return errorEvent(state, command, "NOT_A_PLAYER", "Actor is not seated at this table");

    const deck = createDeck();
    const boundaries: Record<string, [Card, Card]> = {};
    for (const playerId of state.playerIds) {
      const first = deck.shift();
      const second = deck.shift();
      if (!first || !second) throw new Error("Pot deck could not deal boundaries");
      boundaries[playerId] = [first, second];
    }
    const nextState: PotState = {
      ...state,
      phase: "PLAYING",
      version: state.version + 1,
      deck,
      boundaries,
      pot: state.playerIds.length * ANTE,
      currentPlayerId: state.playerIds[0],
      players: state.players.map((player) => ({ ...player, balance: player.balance - ANTE })),
    };
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "pot.started", payload: { currentPlayerId: nextState.currentPlayerId, pot: nextState.pot } }],
    };
  }

  private wager(state: PotState, command: GameCommand): EngineResult {
    if (!this.isCurrentPlayer(state, command)) return errorEvent(state, command, "NOT_YOUR_TURN", "Only the current player may wager");
    const payload = (command.payload ?? {}) as PotPayload;
    const wager = payload.wager;
    if (typeof wager !== "number" || !Number.isInteger(wager) || wager < 1) {
      return errorEvent(state, command, "INVALID_WAGER", "Wager must be a positive whole number");
    }
    const player = state.players.find((candidate) => candidate.playerId === command.actorId);
    if (!player || wager > player.balance) return errorEvent(state, command, "INSUFFICIENT_BALANCE", "Wager exceeds the player's balance");
    const card = state.deck[0];
    const boundaries = state.boundaries[command.actorId];
    if (!card || !boundaries) return errorEvent(state, command, "DECK_EMPTY", "No card is available to reveal");
    const won = isStrictlyBetween(card, boundaries[0], boundaries[1]);
    const payout = won ? Math.min(wager * 2, state.pot + wager) : 0;
    const players = state.players.map((candidate) => candidate.playerId === command.actorId
      ? { ...candidate, balance: candidate.balance - wager + payout }
      : candidate);
    const nextState = this.advance({
      ...state,
      version: state.version + 1,
      deck: state.deck.slice(1),
      revealed: { ...state.revealed, [command.actorId]: card },
      wagers: { ...state.wagers, [command.actorId]: wager },
      players,
      pot: state.pot + wager - payout,
    });
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "pot.revealed", payload: { playerId: command.actorId, card, won, wager, payout, phase: nextState.phase } }],
    };
  }

  private fold(state: PotState, command: GameCommand): EngineResult {
    if (!this.isCurrentPlayer(state, command)) return errorEvent(state, command, "NOT_YOUR_TURN", "Only the current player may fold");
    const nextState = this.advance({
      ...state,
      version: state.version + 1,
      players: state.players.map((player) => player.playerId === command.actorId ? { ...player, status: "FOLDED" } : player),
    });
    return {
      publicState: nextState,
      privateStates: projectPrivateStates(nextState),
      events: [{ type: "pot.folded", payload: { playerId: command.actorId, phase: nextState.phase } }],
    };
  }

  private advance(state: PotState): PotState {
    const currentIndex = state.playerIds.indexOf(state.currentPlayerId ?? "");
    const nextPlayer = state.playerIds.slice(currentIndex + 1).find((playerId) => {
      const player = state.players.find((candidate) => candidate.playerId === playerId);
      return player?.status === "ACTIVE";
    });
    if (nextPlayer) return { ...state, currentPlayerId: nextPlayer };
    const activePlayers = state.players.filter((player) => player.status === "ACTIVE");
    const eligiblePlayers = activePlayers.length > 0 ? activePlayers : [];
    const highestBalance = eligiblePlayers.length > 0
      ? Math.max(...eligiblePlayers.map((player) => player.balance))
      : Number.NEGATIVE_INFINITY;
    const winnerIds = eligiblePlayers
      .filter((player) => player.balance === highestBalance)
      .map((player) => player.playerId);
    return {
      ...state,
      phase: "ROUND_COMPLETE",
      currentPlayerId: undefined,
      winnerIds,
      players: state.players.map((player) => winnerIds.includes(player.playerId) ? { ...player, status: "WINNER" } : player),
    };
  }

  private isCurrentPlayer(state: PotState, command: GameCommand) {
    return state.phase === "PLAYING" && state.currentPlayerId === command.actorId
      && state.players.some((player) => player.playerId === command.actorId && player.status === "ACTIVE");
  }
}

function projectPrivateStates(state: PotState): PrivatePlayerState[] {
  return state.playerIds.map((playerId) => ({
    playerId,
    data: {
      boundaries: state.boundaries[playerId],
      revealed: state.revealed[playerId],
      balance: state.players.find((player) => player.playerId === playerId)?.balance,
      pot: state.pot,
    },
  }));
}

export const potGameEngine = new PotGameEngine();
