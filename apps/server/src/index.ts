import cors from "cors";
import express from "express";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "@card-table/config";
import type { ClientToServerEvents, ServerToClientEvents } from "@card-table/socket-contracts";
import { RoomDomainError, RoomManager } from "./rooms";

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.WEB_ORIGIN }));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok", phase: 2 }));
  return app;
}

export function createRealtimeServer(options: { httpServer?: HttpServer; roomManager?: RoomManager } = {}) {
  const httpServer = options.httpServer ?? createHttpServer(createApp());
  const roomManager = options.roomManager ?? new RoomManager();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.WEB_ORIGIN },
  });

  io.on("connection", (socket) => {
    socket.emit("system:ready", { serverTime: new Date().toISOString() });

    const handleError = (error: unknown) => {
      if (error instanceof RoomDomainError) {
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

export function startServer() {
  const realtime = createRealtimeServer();
  realtime.httpServer.listen(config.SERVER_PORT, () => {
    console.log(`Card Table server listening on ${config.SERVER_PORT}`);
  });
  return realtime;
}

if (process.env.NODE_ENV !== "test") startServer();
