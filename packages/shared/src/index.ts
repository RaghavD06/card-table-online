export type GameType = "POKER" | "RUMMY" | "POT";
export type RoomStatus = "WAITING" | "READY" | "PLAYING" | "ROUND_COMPLETE" | "CLOSED";
export type AuthProvider = "email" | "google" | "guest";

export interface AuthSession {
  userId: string;
  username: string;
  provider: AuthProvider;
  isGuest: boolean;
}

export interface RoomSummary {
  id: string;
  code: string;
  gameType: GameType;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  hostPlayerId: string;
  players: PlayerSummary[];
}

export interface PlayerSummary {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
}
