import type { GameCommand, PokerPublicState, PotPublicState, PublicGameState, RummyPublicState } from "@card-table/game-engine";
import type { GameType, RoomSummary } from "@card-table/shared";

export interface ClientToServerEvents {
  "session:authenticate": (payload: { sessionToken: string }) => void;
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
  "session:authenticated": (payload: { userId: string; username: string; isGuest: boolean }) => void;
  "room:update": (room: RoomSummary) => void;
  "game:state": (state: PublicGameState | PokerPublicState | RummyPublicState | PotPublicState) => void;
  "game:private-state": (state: unknown) => void;
  "chat:message": (payload: { id: string; senderId: string; senderName: string; body: string; createdAt: string }) => void;
  "error:domain": (payload: { code: string; message: string }) => void;
}
