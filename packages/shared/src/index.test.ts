import { describe, expect, it } from "vitest";
import type { AuthSession, RoomSummary } from "./index";

describe("shared domain contracts", () => {
  it("keeps auth and room projections serializable", () => {
    const session: AuthSession = { userId: "u1", username: "guest", provider: "guest", isGuest: true };
    const room: RoomSummary = {
      id: "r1",
      code: "ABC123",
      gameType: "POKER",
      status: "WAITING",
      playerCount: 1,
      maxPlayers: 9,
      hostPlayerId: "u1",
      players: [{ id: "u1", name: "guest", connected: true, ready: false, isHost: true }],
    };
    expect(JSON.parse(JSON.stringify({ session, room }))).toEqual({ session, room });
  });
});
