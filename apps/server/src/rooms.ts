import { randomInt, randomUUID } from "node:crypto";
import type { GameType, PlayerSummary, RoomStatus, RoomSummary } from "@card-table/shared";

export interface RoomPlayer extends PlayerSummary {
  socketId?: string;
}

export interface RoomState extends RoomSummary {
  players: RoomPlayer[];
}

export interface RoomStateStore {
  get(code: string): RoomState | undefined;
  set(room: RoomState): void;
  delete(code: string): void;
  values(): RoomState[];
}

export type RoomPersistence = (room: RoomState) => Promise<void>;

export class InMemoryRoomStateStore implements RoomStateStore {
  private readonly rooms = new Map<string, RoomState>();

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
}

export class RoomDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  constructor(
    private readonly store: RoomStateStore = new InMemoryRoomStateStore(),
    private readonly codeLength = 6,
    private readonly persistence?: RoomPersistence,
  ) {}

  createRoom(input: {
    gameType: GameType;
    maxPlayers: number;
    playerId: string;
    playerName: string;
    socketId: string;
  }) {
    if (!Number.isInteger(input.maxPlayers) || input.maxPlayers < 2 || input.maxPlayers > 10) {
      throw new RoomDomainError("INVALID_MAX_PLAYERS", "maxPlayers must be between 2 and 10");
    }

    const code = this.createUniqueCode();
    const room: RoomState = {
      id: randomUUID(),
      code,
      gameType: input.gameType,
      status: "WAITING",
      playerCount: 1,
      maxPlayers: input.maxPlayers,
      hostPlayerId: input.playerId,
      players: [{
        id: input.playerId,
        name: input.playerName,
        connected: true,
        ready: false,
        isHost: true,
        socketId: input.socketId,
      }],
    };
    this.store.set(room);
    this.persist(room);
    return room;
  }

  joinRoom(input: { code: string; playerId: string; playerName: string; socketId: string }) {
    const room = this.requireRoom(input.code);
    const existing = room.players.find((player) => player.id === input.playerId);
    if (existing) {
      existing.name = input.playerName;
      existing.connected = true;
      existing.socketId = input.socketId;
    } else {
      if (room.players.length >= room.maxPlayers) {
        throw new RoomDomainError("ROOM_FULL", "Room is full");
      }
      room.players.push({
        id: input.playerId,
        name: input.playerName,
        connected: true,
        ready: false,
        isHost: false,
        socketId: input.socketId,
      });
    }
    this.persist(room);
    return room;
  }

  leaveRoom(socketId: string) {
    const room = this.findBySocket(socketId);
    if (!room) return undefined;
    const player = room.players.find((candidate) => candidate.socketId === socketId);
    if (!player) return undefined;
    player.connected = false;
    player.socketId = undefined;
    player.ready = false;
    this.reassignHost(room);
    this.persist(room);
    return room;
  }

  setReady(socketId: string, ready: boolean) {
    const room = this.requireSocketRoom(socketId);
    const player = room.players.find((candidate) => candidate.socketId === socketId);
    if (!player) throw new RoomDomainError("NOT_IN_ROOM", "Player is not in a room");
    player.ready = ready;
    room.status = this.getConnectedPlayers(room).length > 0 && this.getConnectedPlayers(room).every((candidate) => candidate.ready)
      ? "READY"
      : "WAITING";
    this.persist(room);
    return room;
  }

  startGame(socketId: string) {
    const room = this.requireSocketRoom(socketId);
    const player = room.players.find((candidate) => candidate.socketId === socketId);
    if (!player || player.id !== room.hostPlayerId) {
      throw new RoomDomainError("NOT_HOST", "Only the host may start the game");
    }
    const connected = this.getConnectedPlayers(room);
    if (connected.length < 2 || !connected.every((candidate) => candidate.ready)) {
      throw new RoomDomainError("ROOM_NOT_READY", "Every connected player must be ready before starting");
    }
    room.status = "PLAYING";
    this.persist(room);
    return room;
  }

  getRoomForSocket(socketId: string) {
    return this.findBySocket(socketId);
  }

  toSummary(room: RoomState): RoomSummary {
    return {
      id: room.id,
      code: room.code,
      gameType: room.gameType,
      status: room.status,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map(({ socketId: _socketId, ...player }) => player),
    };
  }

  private createUniqueCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = "";
      for (let index = 0; index < this.codeLength; index += 1) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.store.get(code)) return code;
    }
    throw new RoomDomainError("ROOM_CODE_UNAVAILABLE", "Could not allocate a unique room code");
  }

  private requireRoom(code: string) {
    const room = this.store.get(code.trim().toUpperCase());
    if (!room) throw new RoomDomainError("ROOM_NOT_FOUND", "Room was not found");
    return room;
  }

  private requireSocketRoom(socketId: string) {
    const room = this.findBySocket(socketId);
    if (!room) throw new RoomDomainError("NOT_IN_ROOM", "Player is not in a room");
    return room;
  }

  private findBySocket(socketId: string) {
    return this.store.values().find((room) => room.players.some((player) => player.socketId === socketId));
  }

  private getConnectedPlayers(room: RoomState) {
    return room.players.filter((player) => player.connected);
  }

  private reassignHost(room: RoomState) {
    const currentHost = room.players.find((player) => player.id === room.hostPlayerId);
    if (currentHost?.connected) return;
    const nextHost = this.getConnectedPlayers(room)[0] ?? room.players[0];
    if (!nextHost) return;
    room.hostPlayerId = nextHost.id;
    room.players.forEach((player) => {
      player.isHost = player.id === nextHost.id;
    });
  }

  private persist(room: RoomState) {
    room.playerCount = room.players.length;
    this.store.set(room);
    if (this.persistence) {
      void this.persistence(room).catch((error: unknown) => {
        console.error("Failed to persist room state", error);
      });
    }
  }
}
