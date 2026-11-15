import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { config } from "@card-table/config";
import type { ClientToServerEvents, ServerToClientEvents } from "@card-table/socket-contracts";

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.WEB_ORIGIN }));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok", phase: 1 }));
  return app;
}

const app = createApp();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: config.WEB_ORIGIN } });
io.on("connection", (socket) => socket.emit("system:ready", { serverTime: new Date().toISOString() }));

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(config.SERVER_PORT, () => console.log(`Card Table server listening on ${config.SERVER_PORT}`));
}
