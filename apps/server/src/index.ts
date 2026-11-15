import cors from "cors";
import express from "express";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "@card-table/config";
import {
  PokerDomainError,
  PokerEngine,
  PotDomainError,
  PotEngine,
  RummyDomainError,
  RummyEngine,
  type PokerState,
  type PotState,
  type RummyState,
} from "@card-table/game-engine";
import type { GameCommand } from "@card-table/game-engine";
import type { ClientToServerEvents, ServerToClientEvents } from "@card-table/socket-contracts";
import { RoomDomainError, RoomManager } from "./rooms";

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.WEB_ORIGIN }));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok", phase: 5 }));
  return app;
}

export function createRealtimeServer(options: { httpServer?: HttpServer; roomManager?: RoomManager } = {}) {
  const httpServer = options.httpServer ?? createHttpServer(createApp());
  const roomManager = options.roomManager ?? new RoomManager();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.WEB_ORIGIN },
  });
  const pokerStates = new Map<string, PokerState>();
  const rummyStates = new Map<string, RummyState>();
  const potStates = new Map<string, PotState>();

  io.on("connection", (socket) => {
    socket.emit("system:ready", { serverTime: new Date().toISOString() });

    const handleError = (error: unknown) => {
      if (error instanceof RoomDomainError) {
        socket.emit("error:domain", { code: error.code, message: error.message });
        return;
      }
      if (error instanceof PokerDomainError) {
        socket.emit("error:domain", { code: error.code, message: error.message });
        return;
      }
      if (error instanceof RummyDomainError) {
        socket.emit("error:domain", { code: error.code, message: error.message });
        return;
      }
      if (error instanceof PotDomainError) {
        socket.emit("error:domain", { code: error.code, message: error.message });
        return;
      }
      throw error;
    };

    socket.on("room:create", (payload) => {
      try {
        const playerId = payload.playerId?.trim() || socket.id;
        const playerName = payload.playerName?.trim() || `Player ${playerId.slice(0, 6)}`;
        const room = roomManager.createRoom({ ...payload, playerId, playerName, socketId: socket.id });
        socket.data.playerId = playerId;
        socket.join(room.code);
        socket.emit("room:update", roomManager.toSummary(room));
      } catch (error) {
        handleError(error);
      }
    });

    socket.on("room:join", (payload) => {
      try {
        const playerId = payload.playerId?.trim() || socket.id;
        const playerName = payload.playerName?.trim() || `Player ${playerId.slice(0, 6)}`;
        const room = roomManager.joinRoom({ ...payload, playerId, playerName, socketId: socket.id });
        socket.data.playerId = playerId;
        socket.join(room.code);
        socket.emit("room:update", roomManager.toSummary(room));
        io.to(room.code).emit("room:update", roomManager.toSummary(room));
      } catch (error) {
        handleError(error);
      }
    });

    socket.on("room:ready", (payload) => {
      try {
        const room = roomManager.setReady(socket.id, payload.ready);
        io.to(room.code).emit("room:update", roomManager.toSummary(room));
      } catch (error) {
        handleError(error);
      }
    });

    socket.on("game:start", () => {
      try {
        const room = roomManager.startGame(socket.id);
        const playerIds = room.players.filter((player) => player.connected).map((player) => player.id);
        const result = room.gameType === "POKER"
          ? startPoker(room.code, playerIds, room.hostPlayerId)
          : room.gameType === "RUMMY"
            ? startRummy(room.code, playerIds, room.hostPlayerId)
            : startPot(room.code, playerIds, room.hostPlayerId);
        io.to(room.code).emit("room:update", roomManager.toSummary(room));
        io.to(room.code).emit("game:state", result.publicState);
        emitPrivateStates(room, result.privateStates);
      } catch (error) {
        handleError(error);
      }
    });

    socket.on("game:action", (command) => {
      try {
        const room = roomManager.getRoomForSocket(socket.id);
        if (!room || (room.gameType !== "POKER" && room.gameType !== "RUMMY" && room.gameType !== "POT")) {
          throw new RoomDomainError("NOT_IN_GAME", "Player is not in a supported game room");
        }
        const actorId = room.players.find((player) => player.socketId === socket.id)?.id ?? "";
        const result = room.gameType === "POKER"
          ? applyPokerAction(room.code, { ...command, actorId })
          : room.gameType === "RUMMY"
            ? applyRummyAction(room.code, { ...command, actorId })
            : applyPotAction(room.code, { ...command, actorId });
        io.to(room.code).emit("game:state", result.publicState);
        emitPrivateStates(room, result.privateStates);
      } catch (error) {
        handleError(error);
      }
    });

    function emitPrivateStates(room: NonNullable<ReturnType<RoomManager["getRoomForSocket"]>>, privateStates: Array<{ playerId: string; data: unknown }>) {
      for (const privateState of privateStates) {
        const target = room.players.find((player) => player.id === privateState.playerId);
        if (target?.socketId) io.to(target.socketId).emit("game:private-state", privateState.data);
      }
    }

    socket.on("room:leave", () => {
      const room = roomManager.leaveRoom(socket.id);
      if (room) {
        socket.leave(room.code);
        io.to(room.code).emit("room:update", roomManager.toSummary(room));
      }
    });

    socket.on("disconnecting", () => {
      const room = roomManager.leaveRoom(socket.id);
      if (room) io.to(room.code).emit("room:update", roomManager.toSummary(room));
    });
  });

  function startPoker(code: string, playerIds: string[], hostPlayerId: string) {
    const state = pokerStates.get(code) ?? new PokerEngine().createInitialState(playerIds);
    pokerStates.set(code, state);
    return new PokerEngine().applyCommand(state, {
      type: "start",
      actorId: hostPlayerId,
      requestId: `${code}-start-${state.handNumber + 1}`,
      payload: null,
    });
  }

  function startRummy(code: string, playerIds: string[], hostPlayerId: string) {
    const state = rummyStates.get(code) ?? new RummyEngine().createInitialState(playerIds);
    rummyStates.set(code, state);
    return new RummyEngine().applyCommand(state, {
      type: "start",
      actorId: hostPlayerId,
      requestId: `${code}-start-${state.roundNumber + 1}`,
      payload: null,
    });
  }

  function applyPokerAction(code: string, command: GameCommand) {
    const state = pokerStates.get(code);
    if (!state) throw new PokerDomainError("NO_HAND", "There is no active hand");
    return new PokerEngine().applyCommand(state, command);
  }

  function applyRummyAction(code: string, command: GameCommand) {
    const state = rummyStates.get(code);
    if (!state) throw new RummyDomainError("NO_ROUND", "There is no active round");
    return new RummyEngine().applyCommand(state, command);
  }

  function startPot(code: string, playerIds: string[], hostPlayerId: string) {
    const state = potStates.get(code) ?? new PotEngine().createInitialState(playerIds);
    potStates.set(code, state);
    return new PotEngine().applyCommand(state, {
      type: "start",
      actorId: hostPlayerId,
      requestId: `${code}-start-${state.version + 1}`,
      payload: null,
    });
  }

  function applyPotAction(code: string, command: GameCommand) {
    const state = potStates.get(code);
    if (!state) throw new PotDomainError("NO_ROUND", "There is no active pot round");
    return new PotEngine().applyCommand(state, command);
  }

  return { httpServer, io, roomManager };
}

export function startServer() {
  const realtime = createRealtimeServer();
  realtime.httpServer.listen(config.SERVER_PORT, () => {
    console.log(`Card Table server listening on ${config.SERVER_PORT}`);
  });
  return realtime;
}

if (process.env.NODE_ENV !== "test") startServer();
