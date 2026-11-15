export type GameType = "POKER" | "RUMMY" | "POT";
export type RoomStatus = "WAITING" | "READY" | "PLAYING" | "ROUND_COMPLETE" | "CLOSED";
export type AuthProvider = "email" | "google" | "guest";

export interface AuthSession {
  userId: string;
  username: string;
  provider: AuthProvider;
  isGuest: boolean;
  token?: string;
}

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  guest: boolean;
  online: boolean;
}

export type FriendshipStatus = "PENDING" | "ACCEPTED" | "BLOCKED";

export interface FriendConnection {
  id: string;
  fromId: string;
  toId: string;
  status: FriendshipStatus;
  profile: UserProfile;
}

export interface WalletSnapshot {
  balance: number;
  transactions: Array<{
    id: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    createdAt: string;
  }>;
}

export interface GameHistoryEntry {
  id: string;
  gameType: GameType;
  result: Record<string, unknown>;
  createdAt: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  handsPlayed: number;
}

export interface Notification {
  id: string;
  kind: "FRIEND_REQUEST" | "INVITE" | "SYSTEM";
  message: string;
  read: boolean;
  createdAt: string;
}

export type { AuthBoundary, AuthIdentity, PasswordAuthBoundary } from "./auth";

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
