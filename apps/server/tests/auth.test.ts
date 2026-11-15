import { describe, expect, it } from "vitest";
import { AuthService } from "../src/auth";

type User = { id: string; username: string; guest: boolean };

function createDatabase() {
  const users: User[] = [];
  const identities: Array<{ provider: "GUEST" | "EMAIL" | "GOOGLE"; providerAccountId: string; user: User }> = [];
  const sessions: Array<{ id: string; userId: string; tokenHash: string; expiresAt: Date }> = [];
  let sequence = 0;
  return {
    userIdentity: {
      findUnique: async ({ where }: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => {
        return identities.find((identity) =>
          identity.provider === where.provider_providerAccountId.provider &&
          identity.providerAccountId === where.provider_providerAccountId.providerAccountId,
        ) ?? null;
      },
    },
    user: {
      create: async ({ data }: { data: { username: string; guest: boolean; identities: { create: { provider: "GUEST" | "EMAIL" | "GOOGLE"; providerAccountId: string } } } }) => {
        const user = { id: `user-${++sequence}`, username: data.username, guest: data.guest };
        users.push(user);
        identities.push({ ...data.identities.create, user });
        return user;
      },
    },
    authSession: {
      create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const session = { id: `session-${++sequence}`, ...data };
        sessions.push(session);
        return session;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const session = sessions.find((candidate) => candidate.tokenHash === where.tokenHash);
        if (!session) return null;
        const user = users.find((candidate) => candidate.id === session.userId);
        return { ...session, user: user ? { ...user, identities: identities.filter((identity) => identity.user.id === user.id) } : undefined };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = sessions.findIndex((session) => session.id === where.id);
        if (index >= 0) sessions.splice(index, 1);
      },
    },
  };
}

describe("authentication boundary", () => {
  it("creates a durable guest session and resolves its bearer token", async () => {
    const service = new AuthService(createDatabase(), 30);
    const issued = await service.createGuestSessionWithToken("  Alice   Guest ");

    expect(issued.session.isGuest).toBe(true);
    expect(issued.session.username).toMatch(/^alice_guest_/);
    await expect(service.resolveSession(issued.token)).resolves.toMatchObject({
      userId: issued.session.userId,
      username: issued.session.username,
      provider: "guest",
    });
  });

  it("rejects unknown and expired tokens", async () => {
    const service = new AuthService(createDatabase(), 0.000001);
    const issued = await service.createGuestSessionWithToken("Bob");

    await expect(service.resolveSession("not-a-token")).resolves.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 120));
    await expect(service.resolveSession(issued.token)).resolves.toBeNull();
  });
});
