import type { PrismaClient } from "@prisma/client";
import type { RoomState, RoomStateStore } from "./rooms";

export class PrismaRoomStateStore implements RoomStateStore {
  private readonly rooms = new Map<string, RoomState>();

  constructor(private readonly database: Pick<PrismaClient, "gameRoom">) {}

  get(code: string) {
    return this.rooms.get(code);
  }

  set(room: RoomState) {
    this.rooms.set(room.code, room);
  }

  delete(code: string) {
    this.rooms.delete(code);
  }

  values() {
    return [...this.rooms.values()];
  }

  async loadOpenRooms() {
    const rooms = await this.database.gameRoom.findMany({
      where: { status: { not: "CLOSED" } },
      include: { players: { include: { user: true } } },
    });
    for (const room of rooms) {
      this.set({
        id: room.id,
        code: room.code,
        gameType: room.gameType,
        status: room.status,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        hostPlayerId: room.hostId,
        players: room.players.map((player) => ({
          id: player.userId,
          name: player.user.username,
          connected: false,
          ready: player.ready,
          isHost: player.userId === room.hostId,
        })),
      });
    }
  }
}

export async function persistRoom(database: Pick<PrismaClient, "gameRoom">, room: RoomState) {
  await database.gameRoom.upsert({
    where: { code: room.code },
    create: {
      id: room.id,
      code: room.code,
      gameType: room.gameType,
      status: room.status,
      hostId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      settings: {},
      players: {
        create: room.players.map((player) => ({
          userId: player.id,
          ready: player.ready,
          connected: player.connected,
        })),
      },
    },
    update: {
      status: room.status,
      hostId: room.hostPlayerId,
      maxPlayers: room.maxPlayers,
      players: {
        deleteMany: {},
        create: room.players.map((player) => ({
          userId: player.id,
          ready: player.ready,
          connected: player.connected,
        })),
      },
    },
  });
}
