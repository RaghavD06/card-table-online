import type { GameCommand, PokerPublicState, PublicGameState, RummyPublicState } from "@card-table/game-engine";
import type { GameType, RoomSummary } from "@card-table/shared";

export interface ClientToServerEvents {
  "room:create": (payload: { gameType: GameType; maxPlayers: number; playerId?: string; playerName?: string }) => void;
  "room:join": (payload: { code: string; password?: string; playerId?: string; playerName?: string }) => void;
  "room:leave": () => void;
  "room:ready": (payload: { ready: boolean }) => void;
  "game:start": () => void;
  "game:action": (command: GameCommand) => void;
  "chat:message": (payload: { body: string }) => void;
}

export interface ServerToClientEvents {
  "system:ready": (payload: { serverTime: string }) => void;
  "room:update": (room: RoomSummary) => void;
  "game:state": (state: PublicGameState | PokerPublicState | RummyPublicState) => void;
  "game:private-state": (state: unknown) => void;
  "chat:message": (payload: { id: string; senderId: string; body: string }) => void;
  "error:domain": (payload: { code: string; message: string }) => void;
}
