import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type {
  AuthIdentity,
  AuthProvider,
  AuthSession,
  FriendConnection,
  GameHistoryEntry,
  Notification,
  PlayerStats,
  UserProfile,
  WalletSnapshot,
  PasswordAuthBoundary,
} from "@card-table/shared";
import { config } from "@card-table/config";

const scrypt = promisify(nodeScrypt);
const MAX_NAME = 40;
const MAX_BIO = 280;
const MAX_CHAT = 500;

export class PlatformError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface StoredUser {
  id: string;
  username: string;
  email?: string;
  passwordHash?: string;
  provider: AuthProvider;
  providerAccountId: string;
  guest: boolean;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  online: boolean;
  balance: number;
  transactions: WalletSnapshot["transactions"];
  stats: PlayerStats;
  history: GameHistoryEntry[];
  friends: Map<string, FriendConnection>;
  notifications: Notification[];
}

export class MemoryAuthBoundary implements PasswordAuthBoundary {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, AuthSession>();

  async createGuestSession(displayName: string) {
    const name = normalizeName(displayName);
    const id = randomUUID();
    const user = this.createUser({ id, username: `guest-${id.slice(0, 8)}`, displayName: name, provider: "guest", providerAccountId: id, guest: true });
    return this.issue(user);
  }

  async authenticate(identity: AuthIdentity) {
    const existing = [...this.users.values()].find((user) => user.provider === identity.provider && user.providerAccountId === identity.providerAccountId);
    const user = existing ?? this.createUser({
      id: identity.id || randomUUID(),
      username: identity.email?.split("@")[0] || `${identity.provider}-${identity.providerAccountId.slice(0, 8)}`,
      email: identity.email,
      displayName: identity.email?.split("@")[0] || "Player",
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      guest: false,
    });
    return this.issue(user);
  }

  async registerEmail(email: string, password: string, displayName: string) {
    const normalizedEmail = normalizeEmail(email);
    validatePassword(password);
    if ([...this.users.values()].some((user) => user.email === normalizedEmail)) throw new PlatformError("EMAIL_TAKEN", "An account with that email already exists");
    const id = randomUUID();
    const user = this.createUser({ id, username: normalizedEmail.split("@")[0] || `player-${id.slice(0, 8)}`, email: normalizedEmail, displayName: normalizeName(displayName), provider: "email", providerAccountId: normalizedEmail, guest: false });
    user.passwordHash = await hashPassword(password);
    return this.issue(user);
  }

  async loginEmail(email: string, password: string) {
    const user = [...this.users.values()].find((candidate) => candidate.email === normalizeEmail(email));
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) throw new PlatformError("INVALID_CREDENTIALS", "Email or password is incorrect");
    return this.issue(user);
  }

  beginGoogleLogin() {
    return config.GOOGLE_CLIENT_ID
      ? { enabled: true, authorizationUrl: "/api/auth/google/start" }
      : { enabled: false };
  }

  async resolveSession(sessionToken: string) {
    return this.sessions.get(sessionToken) ?? null;
  }

  getUser(userId: string) {
    const user = this.users.get(userId);
    if (!user) throw new PlatformError("USER_NOT_FOUND", "User was not found");
    return user;
  }

  setOnline(userId: string, online: boolean) {
    this.getUser(userId).online = online;
  }

  private createUser(input: Omit<StoredUser, "passwordHash" | "balance" | "transactions" | "stats" | "history" | "friends" | "notifications" | "online"> & { passwordHash?: string }) {
    const user: StoredUser = { ...input, online: true, balance: 1000, transactions: [], stats: { gamesPlayed: 0, gamesWon: 0, handsPlayed: 0 }, history: [], friends: new Map(), notifications: [] };
    this.users.set(user.id, user);
    user.transactions.push({ id: randomUUID(), amount: 1000, balanceAfter: 1000, reason: "welcome_bonus", createdAt: new Date().toISOString() });
    return user;
  }

  private issue(user: StoredUser): AuthSession {
    const token = randomBytes(32).toString("base64url");
    const session: AuthSession = { userId: user.id, username: user.username, provider: user.provider, isGuest: user.guest, token };
    this.sessions.set(token, session);
    user.online = true;
    return session;
  }
}

export class SocialService {
  constructor(private readonly auth: MemoryAuthBoundary) {}

  profile(userId: string): UserProfile {
    const user = this.auth.getUser(userId);
    return { userId: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, bio: user.bio, guest: user.guest, online: user.online };
  }

  updateProfile(userId: string, input: { displayName?: string; bio?: string; avatarUrl?: string }) {
    const user = this.auth.getUser(userId);
    if (input.displayName !== undefined) user.displayName = normalizeName(input.displayName);
    if (input.bio !== undefined) {
      if (input.bio.length > MAX_BIO) throw new PlatformError("BIO_TOO_LONG", `Bio must be ${MAX_BIO} characters or fewer`);
      user.bio = input.bio.trim();
    }
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl.trim().slice(0, 500);
    return this.profile(userId);
  }

  addFriend(userId: string, targetId: string) {
    if (userId === targetId) throw new PlatformError("INVALID_FRIEND", "You cannot add yourself");
    const target = this.auth.getUser(targetId);
    const user = this.auth.getUser(userId);
    const existing = user.friends.get(targetId);
    if (existing) return existing;
    const connection: FriendConnection = { id: randomUUID(), fromId: userId, toId: targetId, status: "PENDING", profile: this.profile(targetId) };
    user.friends.set(targetId, connection);
    target.friends.set(userId, { ...connection, fromId: userId, toId: targetId, profile: this.profile(userId) });
    target.notifications.unshift({ id: randomUUID(), kind: "FRIEND_REQUEST", message: `${user.displayName} sent you a friend request`, read: false, createdAt: new Date().toISOString() });
    return connection;
  }

  friends(userId: string) { return [...this.auth.getUser(userId).friends.values()]; }

  respondFriend(userId: string, targetId: string, status: "ACCEPTED" | "BLOCKED") {
    const user = this.auth.getUser(userId);
    const connection = user.friends.get(targetId);
    if (!connection) throw new PlatformError("FRIEND_NOT_FOUND", "Friend request was not found");
    connection.status = status;
    this.auth.getUser(targetId).friends.get(userId)!.status = status;
    return connection;
  }

  wallet(userId: string): WalletSnapshot {
    const user = this.auth.getUser(userId);
    return { balance: user.balance, transactions: user.transactions.slice(0, 50) };
  }

  adjustWallet(userId: string, amount: number, reason: string) {
    if (!Number.isInteger(amount) || Math.abs(amount) > 1_000_000) throw new PlatformError("INVALID_AMOUNT", "Amount must be an integer within the wallet limit");
    const user = this.auth.getUser(userId);
    if (user.balance + amount < 0) throw new PlatformError("INSUFFICIENT_FUNDS", "Wallet balance is too low");
    user.balance += amount;
    user.transactions.unshift({ id: randomUUID(), amount, balanceAfter: user.balance, reason: reason.slice(0, 80), createdAt: new Date().toISOString() });
    return this.wallet(userId);
  }

  history(userId: string) { return this.auth.getUser(userId).history.slice(0, 100); }
  stats(userId: string) { return this.auth.getUser(userId).stats; }

  recordGame(userId: string, entry: Omit<GameHistoryEntry, "id" | "createdAt"> & { won?: boolean }) {
    const user = this.auth.getUser(userId);
    user.history.unshift({ id: randomUUID(), gameType: entry.gameType, result: entry.result, createdAt: new Date().toISOString() });
    user.stats.gamesPlayed += 1;
    user.stats.handsPlayed += 1;
    if (entry.won) user.stats.gamesWon += 1;
  }

  notifications(userId: string) { return this.auth.getUser(userId).notifications.slice(0, 50); }

  invitation(code: string, userId: string) {
    if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new PlatformError("INVALID_INVITE", "Invitation code is invalid");
    this.auth.getUser(userId).notifications.unshift({ id: randomUUID(), kind: "INVITE", message: `Join room ${code}`, read: false, createdAt: new Date().toISOString() });
    return { code, url: `/join/${code}` };
  }
}

export function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME) throw new PlatformError("INVALID_NAME", `Display name must be 1-${MAX_NAME} characters`);
  return name;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new PlatformError("INVALID_EMAIL", "A valid email is required");
  return email;
}

function validatePassword(password: string) {
  if (password.length < 8 || password.length > 128) throw new PlatformError("INVALID_PASSWORD", "Password must be 8-128 characters");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), 64) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export const MAX_CHAT_LENGTH = MAX_CHAT;
export const safeHash = (value: string) => createHash("sha256").update(value).digest("hex");
