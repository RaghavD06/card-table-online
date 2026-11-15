import cors from "cors";
import express from "express";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "@card-table/config";
import type { AuthBoundary } from "@card-table/shared";
import { PokerDomainError, PokerEngine, type PokerState } from "@card-table/game-engine";
import type { ClientToServerEvents, ServerToClientEvents } from "@card-table/socket-contracts";
import { AuthService } from "./auth";
import { PrismaRoomStateStore, persistRoom } from "./persistence";
import { RoomDomainError, RoomManager, type RoomPersistence } from "./rooms";
import { PrismaClient } from "@prisma/client";

export function createApp(options: { authBoundary?: AuthService } = {}) {
  const app = express();
  app.use(cors({ origin: config.WEB_ORIGIN }));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok", phase: 3 }));
  app.post("/auth/guest", async (request, response) => {
    if (!options.authBoundary) {
      response.status(503).json({ code: "AUTH_UNAVAILABLE", message: "Authentication is not configured" });
      return;
    }
    try {
      const displayName = typeof request.body?.displayName === "string" ? request.body.displayName : "";
      const session = await options.authBoundary.createGuestSessionWithToken(displayName);
      response.status(201).json(session);
    } catch (error) {
      response.status(500).json({ code: "AUTH_UNAVAILABLE", message: error instanceof Error ? error.message : "Authentication failed" });
    }
  });
  app.get("/auth/session", async (request, response) => {
    if (!options.authBoundary) {
      response.status(503).json({ code: "AUTH_UNAVAILABLE", message: "Authentication is not configured" });
      return;
    }
    const header = request.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const session = await options.authBoundary.resolveSession(token);
    if (!session) {
      response.status(401).json({ code: "UNAUTHENTICATED", message: "A valid session is required" });
      return;
    }
    response.json(session);
  });
  return app;
}

export function createRealtimeServer(options: {
  httpServer?: HttpServer;
  roomManager?: RoomManager;
  authBoundary?: AuthBoundary;
  roomPersistence?: RoomPersistence;
} = {}) {
  const httpServer = options.httpServer ?? createHttpServer(createApp({
    authBoundary: options.authBoundary instanceof AuthService ? options.authBoundary : undefined,
  }));
  const roomManager = options.roomManager ?? new RoomManager(undefined, 6, options.roomPersistence);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.WEB_ORIGIN },
  });
  const pokerStates = new Map<string, PokerState>();

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
    if (!token) {
      if (config.NODE_ENV === "production") {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      next();
      return;
    }
    try {
      if (!options.authBoundary) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      const session = await options.authBoundary.resolveSession(token);
      if (!session) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      socket.data.authSession = session;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Authentication failed"));
    }
  });

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
      throw error;
    };

    socket.on("room:create", (payload) => {
      try {
        const playerId = socket.data.authSession?.userId ?? payload.playerId?.trim() ?? socket.id;
        const playerName = socket.data.authSession?.username ?? payload.playerName?.trim() ?? `Player ${playerId.slice(0, 6)}`;
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
        const playerId = socket.data.authSession?.userId ?? payload.playerId?.trim() ?? socket.id;
        const playerName = socket.data.authSession?.username ?? payload.playerName?.trim() ?? `Player ${playerId.slice(0, 6)}`;
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
        if (room.gameType !== "POKER") {
          throw new RoomDomainError("UNSUPPORTED_GAME", "Only Poker gameplay is available in this phase");
        }
        const state = pokerStates.get(room.code) ?? new PokerEngine().createInitialState(
          room.players.filter((player) => player.connected).map((player) => player.id),
        );
        pokerStates.set(room.code, state);
        const result = new PokerEngine().applyCommand(state, {
          type: "start",
          actorId: room.hostPlayerId,
          requestId: `${room.code}-start-${state.handNumber + 1}`,
          payload: null,
        });
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
        if (!room || room.gameType !== "POKER") throw new RoomDomainError("NOT_IN_GAME", "Player is not in a Poker room");
        const state = pokerStates.get(room.code);
        if (!state) throw new PokerDomainError("NO_HAND", "There is no active hand");
        const result = new PokerEngine().applyCommand(state, { ...command, actorId: room.players.find((player) => player.socketId === socket.id)?.id ?? "" });
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

  return { httpServer, io, roomManager };
}

export async function startServer() {
  const database = new PrismaClient();
  const authBoundary = new AuthService(database);
  const store = new PrismaRoomStateStore(database);
  await store.loadOpenRooms();
  const realtime = createRealtimeServer({
    authBoundary,
    roomManager: new RoomManager(store, 6, (room) => persistRoom(database, room)),
    roomPersistence: (room) => persistRoom(database, room),
  });
  realtime.httpServer.listen(config.SERVER_PORT, () => {
    console.log(`Card Table server listening on ${config.SERVER_PORT}`);
  });
  return realtime;
}

if (process.env.NODE_ENV !== "test") {
  void startServer().catch((error: unknown) => {
    console.error("Failed to start server", error);
    process.exitCode = 1;
  });
}
