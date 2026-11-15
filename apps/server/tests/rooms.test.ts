import { describe, expect, it } from "vitest";
import { InMemoryRoomStateStore, RoomManager } from "../src/rooms";

describe("room infrastructure", () => {
  it("creates unique rooms with a host", () => {
    const manager = new RoomManager(new InMemoryRoomStateStore());
    const room = manager.createRoom({
      gameType: "POKER",
      maxPlayers: 4,
      playerId: "user-1",
      playerName: "Alice",
      socketId: "socket-1",
    });

    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.hostPlayerId).toBe("user-1");
    expect(room.players[0].isHost).toBe(true);
  });

  it("supports reconnecting the same player and transfers host on disconnect", () => {
    const manager = new RoomManager();
    const room = manager.createRoom({
      gameType: "RUMMY",
      maxPlayers: 4,
      playerId: "user-1",
      playerName: "Alice",
      socketId: "socket-1",
    });
    manager.joinRoom({ code: room.code, playerId: "user-2", playerName: "Bob", socketId: "socket-2" });
    manager.leaveRoom("socket-1");
    expect(manager.getRoomForSocket("socket-2")?.hostPlayerId).toBe("user-2");

    const reconnected = manager.joinRoom({
      code: room.code,
      playerId: "user-1",
      playerName: "Alice",
      socketId: "socket-3",
    });
    expect(reconnected.players).toHaveLength(2);
    expect(reconnected.players.find((player) => player.id === "user-1")?.connected).toBe(true);
  });

  it("moves a room to READY only when every connected player is ready", () => {
    const manager = new RoomManager();
    const room = manager.createRoom({
      gameType: "POT",
      maxPlayers: 2,
      playerId: "user-1",
      playerName: "Alice",
      socketId: "socket-1",
    });
    manager.joinRoom({ code: room.code, playerId: "user-2", playerName: "Bob", socketId: "socket-2" });
    manager.setReady("socket-1", true);
    expect(manager.getRoomForSocket("socket-1")?.status).toBe("WAITING");
    manager.setReady("socket-2", true);
    expect(manager.getRoomForSocket("socket-1")?.status).toBe("READY");
  });
});
