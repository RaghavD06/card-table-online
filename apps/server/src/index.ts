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
import { MemoryAuthBoundary, PlatformError, SocialService, MAX_CHAT_LENGTH, normalizeName } from "./platform";

export function createApp(options: { auth?: MemoryAuthBoundary; social?: SocialService } = {}) {
  const app = express();
  const auth = options.auth ?? new MemoryAuthBoundary();
  const social = options.social ?? new SocialService(auth);
  app.use(cors({ origin: config.WEB_ORIGIN }));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok", phase: 6 }));
  const requireSession = async (request: express.Request) => {
    const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new PlatformError("UNAUTHENTICATED", "Authentication is required");
    const current = await auth.resolveSession(token);
    if (!current) throw new PlatformError("UNAUTHENTICATED", "Session is invalid or expired");
    return current;
  };
  const route = (handler: (request: express.Request, response: express.Response) => Promise<void> | void) =>
    async (request: express.Request, response: express.Response) => {
      try { await handler(request, response); }
      catch (error) {
        if (error instanceof PlatformError) {
          response.status(error.code === "UNAUTHENTICATED" ? 401 : 400).json({ error: error.code, message: error.message });
          return;
        }
        response.status(500).json({ error: "INTERNAL_ERROR", message: "Request could not be completed" });
      }
    };
  app.post("/api/auth/guest", route(async (request, response) => {
    response.status(201).json(await auth.createGuestSession(String(request.body?.displayName ?? "")));
  }));
  app.post("/api/auth/register", route(async (request, response) => {
    const body = request.body ?? {};
    response.status(201).json(await auth.registerEmail(String(body.email ?? ""), String(body.password ?? ""), String(body.displayName ?? "")));
  }));
  app.post("/api/auth/login", route(async (request, response) => {
    const body = request.body ?? {};
    response.json(await auth.loginEmail(String(body.email ?? ""), String(body.password ?? "")));
  }));
  app.get("/api/auth/providers", (_request, response) => response.json({ email: true, guest: true, google: auth.beginGoogleLogin() }));
  app.get("/api/me", route(async (request, response) => {
    const current = await requireSession(request);
    response.json({ session: current, profile: social.profile(current.userId), wallet: social.wallet(current.userId), stats: social.stats(current.userId) });
  }));
  app.patch("/api/me/profile", route(async (request, response) => {
    const current = await requireSession(request);
    response.json(social.updateProfile(current.userId, request.body ?? {}));
  }));
  app.get("/api/me/friends", route(async (request, response) => {
    const current = await requireSession(request);
    response.json(social.friends(current.userId));
  }));
  app.post("/api/me/friends/:userId", route(async (request, response) => {
    const current = await requireSession(request);
    response.status(201).json(social.addFriend(current.userId, String(request.params.userId)));
  }));
  app.post("/api/me/friends/:userId/respond", route(async (request, response) => {
    const current = await requireSession(request);
    const status = request.body?.status;
    if (status !== "ACCEPTED" && status !== "BLOCKED") throw new PlatformError("INVALID_STATUS", "Friend response is invalid");
    response.json(social.respondFriend(current.userId, String(request.params.userId), status));
  }));
  app.get("/api/me/wallet", route(async (request, response) => {
    const current = await requireSession(request);
    response.json(social.wallet(current.userId));
  }));
  app.get("/api/me/history", route(async (request, response) => {
    const current = await requireSession(request);
    response.json({ history: social.history(current.userId), stats: social.stats(current.userId) });
  }));
  app.get("/api/me/notifications", route(async (request, response) => {
    const current = await requireSession(request);
    response.json(social.notifications(current.userId));
  }));
  app.post("/api/invitations", route(async (request, response) => {
    const current = await requireSession(request);
    response.status(201).json(social.invitation(String(request.body?.code ?? "").toUpperCase(), current.userId));
  }));
  return app;
}

export function createRealtimeServer(options: { httpServer?: HttpServer; roomManager?: RoomManager } = {}) {
  const auth = new MemoryAuthBoundary();
  const social = new SocialService(auth);
  const httpServer = options.httpServer ?? createHttpServer(createApp({ auth, social }));
  const roomManager = options.roomManager ?? new RoomManager();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: config.WEB_ORIGIN },
  });
  const pokerStates = new Map<string, PokerState>();
  const rummyStates = new Map<string, RummyState>();
  const potStates = new Map<string, PotState>();

  io.on("connection", (socket) => {
    const token = typeof socket.handshake.auth?.sessionToken === "string" ? socket.handshake.auth.sessionToken : undefined;
    if (token) void auth.resolveSession(token).then((session) => {
      if (session) {
        socket.data.session = session;
        auth.setOnline(session.userId, true);
        socket.emit("session:authenticated", { userId: session.userId, username: session.username, isGuest: session.isGuest });
      }
    });
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
      if (error instanceof PlatformError) {
        socket.emit("error:domain", { code: error.code, message: error.message });
        return;
      }
      throw error;
    };

    socket.on("session:authenticate", (payload) => {
      void auth.resolveSession(payload.sessionToken).then((session) => {
        if (!session) throw new PlatformError("UNAUTHENTICATED", "Session is invalid or expired");
        socket.data.session = session;
        auth.setOnline(session.userId, true);
        socket.emit("session:authenticated", { userId: session.userId, username: session.username, isGuest: session.isGuest });
      }).catch(handleError);
    });

    socket.on("room:create", (payload) => {
      try {
        const session = socket.data.session;
        const playerId = session?.userId ?? payload.playerId?.trim() ?? socket.id;
        const playerName = session?.username ?? normalizeName(payload.playerName?.trim() || `Player ${playerId.slice(0, 6)}`);
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
        const session = socket.data.session;
        const playerId = session?.userId ?? payload.playerId?.trim() ?? socket.id;
        const playerName = session?.username ?? normalizeName(payload.playerName?.trim() || `Player ${playerId.slice(0, 6)}`);
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

    socket.on("chat:message", (payload) => {
      try {
        const room = roomManager.getRoomForSocket(socket.id);
        const session = socket.data.session;
        if (!room || !session) throw new PlatformError("UNAUTHENTICATED", "Authenticate and join a room before chatting");
        const member = room.players.find((player) => player.socketId === socket.id && player.id === session.userId);
        if (!member) throw new RoomDomainError("NOT_ROOM_MEMBER", "You are not a member of this room");
        const body = payload.body.trim();
        if (!body || body.length > MAX_CHAT_LENGTH) throw new PlatformError("CHAT_TOO_LONG", `Chat messages must be 1-${MAX_CHAT_LENGTH} characters`);
        io.to(room.code).emit("chat:message", { id: `${Date.now()}-${socket.id}`, senderId: session.userId, senderName: session.username, body, createdAt: new Date().toISOString() });
      } catch (error) {
        handleError(error);
      }
    });

    socket.on("disconnect", () => {
      const session = socket.data.session;
      if (session) auth.setOnline(session.userId, false);
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
