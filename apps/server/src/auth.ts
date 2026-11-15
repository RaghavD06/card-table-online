import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AuthBoundary, AuthIdentity, AuthProvider, AuthSession, AuthSessionToken } from "@card-table/shared";
import { PrismaClient, AuthProvider as PrismaAuthProvider } from "@prisma/client";
import { config } from "@card-table/config";

type AuthDatabase = Pick<PrismaClient, "user" | "userIdentity" | "authSession">;

const providerMap: Record<AuthProvider, PrismaAuthProvider> = {
  email: PrismaAuthProvider.EMAIL,
  google: PrismaAuthProvider.GOOGLE,
  guest: PrismaAuthProvider.GUEST,
};

function hashToken(token: string) {
  return createHmac("sha256", config.AUTH_SECRET).update(token).digest("hex");
}

function normalizeDisplayName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return name || "Guest";
}

function usernameBase(value: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  return base || "player";
}

export class AuthService implements AuthBoundary {
  constructor(
    private readonly database: AuthDatabase = new PrismaClient(),
    private readonly sessionTtlDays = config.SESSION_TTL_DAYS,
  ) {}

  async createGuestSession(displayName: string) {
    return (await this.createGuestSessionWithToken(displayName)).session;
  }

  async createGuestSessionWithToken(displayName: string): Promise<AuthSessionToken> {
    const guestId = `guest:${randomUUID()}`;
    return this.createSessionForIdentity({
      id: guestId,
      provider: "guest",
      providerAccountId: guestId,
    }, normalizeDisplayName(displayName), true);
  }

  async authenticate(identity: AuthIdentity) {
    return (await this.authenticateWithToken(identity)).session;
  }

  async authenticateWithToken(identity: AuthIdentity): Promise<AuthSessionToken> {
    const provider = providerMap[identity.provider];
    const existing = await this.database.userIdentity.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: identity.providerAccountId } },
      include: { user: true },
    });
    if (existing) {
      return this.createSession(existing.user.id, {
        userId: existing.user.id,
        username: existing.user.username,
        provider: identity.provider,
        isGuest: existing.user.guest,
      });
    }

    const base = usernameBase(identity.email?.split("@")[0] ?? identity.providerAccountId);
    const user = await this.database.user.create({
      data: {
        username: `${base}_${randomBytes(3).toString("hex")}`,
        email: identity.email,
        guest: identity.provider === "guest",
        identities: { create: { provider, providerAccountId: identity.providerAccountId } },
      },
    });
    return this.createSession(user.id, {
      userId: user.id,
      username: user.username,
      provider: identity.provider,
      isGuest: user.guest,
    });
  }

  async resolveSession(sessionToken: string) {
    const token = sessionToken.trim();
    if (!token) return null;
    const record = await this.database.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { identities: true } } },
    });
    if (!record) return null;
    if (record.expiresAt <= new Date()) {
      await this.database.authSession.delete({ where: { id: record.id } });
      return null;
    }
    const identity = record.user.identities[0];
    return {
      userId: record.user.id,
      username: record.user.username,
      provider: identity?.provider === "GOOGLE" ? "google" : identity?.provider === "GUEST" ? "guest" : "email",
      isGuest: record.user.guest,
    } satisfies AuthSession;
  }

  private async createSessionForIdentity(identity: AuthIdentity, displayName: string, guest: boolean) {
    const user = await this.database.user.create({
      data: {
        username: `${usernameBase(displayName)}_${randomBytes(3).toString("hex")}`,
        guest,
        identities: { create: { provider: providerMap[identity.provider], providerAccountId: identity.providerAccountId } },
      },
    });
    return this.createSession(user.id, {
      userId: user.id,
      username: user.username,
      provider: identity.provider,
      isGuest: guest,
    });
  }

  private async createSession(userId: string, session: AuthSession): Promise<AuthSessionToken> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionTtlDays * 24 * 60 * 60 * 1000);
    await this.database.authSession.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });
    return { session, token };
  }
}
