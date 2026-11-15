import { createServer } from "node:http";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type { RoomSummary } from "@card-table/shared";
import { createApp, createRealtimeServer } from "../src";

describe("Socket.IO room lifecycle", () => {
  const clients: Socket[] = [];

  afterEach(() => {
    clients.splice(0).forEach((client) => client.close());
  });

  it("broadcasts authoritative presence and readiness updates", async () => {
    const httpServer = createServer(createApp());
    const realtime = createRealtimeServer({ httpServer });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const url = `http://localhost:${address.port}`;

    const first = connect(url);
    const second = connect(url);
    clients.push(first, second);
    await Promise.all([once(first, "system:ready"), once(second, "system:ready")]);

    const firstRoom = once<RoomSummary>(first, "room:update");
    first.emit("room:create", { gameType: "POKER", maxPlayers: 2, playerId: "alice", playerName: "Alice" });
    const room = await firstRoom;
    expect(room.players).toHaveLength(1);

    const joinedRoom = once<RoomSummary>(first, "room:update");
    second.emit("room:join", { code: room.code, playerId: "bob", playerName: "Bob" });
    const joined = await joinedRoom;
    expect(joined.playerCount).toBe(2);

    const readyRoom = once<RoomSummary>(first, "room:update");
    first.emit("room:ready", { ready: true });
    expect((await readyRoom).status).toBe("WAITING");

    const allReadyRoom = once<RoomSummary>(first, "room:update");
    second.emit("room:ready", { ready: true });
    expect((await allReadyRoom).status).toBe("READY");

    const disconnectedRoom = onceMatching<RoomSummary>(second, "room:update", (candidate) =>
      candidate.players.some((player) => player.id === "alice" && !player.connected),
    );
    first.emit("room:leave");
    const disconnected = await disconnectedRoom;
    expect(disconnected.players.find((player) => player.id === "alice")?.connected).toBe(false);
    expect(disconnected.hostPlayerId).toBe("bob");

    realtime.io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});

function once<T = unknown>(socket: Socket, event: string) {
  return new Promise<T>((resolve) => socket.once(event, resolve));
}

function onceMatching<T>(socket: Socket, event: string, predicate: (value: T) => boolean) {
  return new Promise<T>((resolve) => {
    const listener = (value: T) => {
      if (predicate(value)) {
        resolve(value);
        return;
      }
      socket.once(event, listener);
    };
    socket.once(event, listener);
  });
}
