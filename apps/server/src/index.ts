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
import { checkDatabaseReadiness } from "./prisma";

const API_RATE_WINDOW_MS = 60_000;
const API_RATE_LIMIT = 120;
const AUTH_RATE_LIMIT = 20;

function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return { allowed: current.count <= limit, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  };
}

export function createApp(options: { auth?: MemoryAuthBoundary; social?: SocialService } = {}) {
  const app = express();
  const auth = options.auth ?? new MemoryAuthBoundary();
  const social = options.social ?? new SocialService(auth);
  const apiLimiter = createRateLimiter(API_RATE_LIMIT, API_RATE_WINDOW_MS);
  const authLimiter = createRateLimiter(AUTH_RATE_LIMIT, API_RATE_WINDOW_MS);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (config.NODE_ENV === "production") response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || config.WEB_ORIGINS.includes(origin)),
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (request, response, next) => {
    const result = apiLimiter(request.ip ?? "unknown");
    if (!result.allowed) {
      response.setHeader("Retry-After", String(result.retryAfterSeconds));
      response.status(429).json({ error: "RATE_LIMITED", message: "Too many requests" });
      return;
    }
    next();
  });
  const route = (handler: (request: express.Request, response: express.Response) => Promise<void> | void) =>
    async (request: express.Request, response: express.Response) => {
      try { await handler(request, response); }
      catch (error) {
        if (error instanceof PlatformError) {
          response.status(error.code === "UNAUTHENTICATED" ? 401 : error.code === "RATE_LIMITED" ? 429 : 400).json({ error: error.code, message: error.message });
          return;
        }
        response.status(500).json({ error: "INTERNAL_ERROR", message: "Request could not be completed" });
      }
    };
  app.get("/health", (_request, response) => response.json({ status: "ok", phase: 7 }));
  app.get("/health/live", (_request, response) => response.json({ status: "ok" }));
  app.get("/health/ready", route(async (_request, response) => {
    const database = await checkDatabaseReadiness();
    const ready = database.ok && Boolean(config.REDIS_URL);
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", checks: { database, redis: { configured: Boolean(config.REDIS_URL) } } });
  }));
  const requireSession = async (request: express.Request) => {
    const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new PlatformError("UNAUTHENTICATED", "Authentication is required");
    const current = await auth.resolveSession(token);
    if (!current) throw new PlatformError("UNAUTHENTICATED", "Session is invalid or expired");
    return current;
  };
  const authRoute = (handler: (request: express.Request, response: express.Response) => Promise<void> | void) =>
    (request: express.Request, response: express.Response, next: express.NextFunction) => {
      const result = authLimiter(request.ip ?? "unknown");
      if (!result.allowed) {
        response.setHeader("Retry-After", String(result.retryAfterSeconds));
        response.status(429).json({ error: "RATE_LIMITED", message: "Too many authentication attempts" });
        return;
      }
      void route(handler)(request, response).catch(next);
    };
  app.post("/api/auth/guest", authRoute(async (request, response) => {
    response.status(201).json(await auth.createGuestSession(String(request.body?.displayName ?? "")));
  }));
  app.post("/api/auth/register", authRoute(async (request, response) => {
    const body = request.body ?? {};
    response.status(201).json(await auth.registerEmail(String(body.email ?? ""), String(body.password ?? ""), String(body.displayName ?? "")));
  }));
  app.post("/api/auth/login", authRoute(async (request, response) => {
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
    cors: { origin: config.WEB_ORIGINS, methods: ["GET", "POST"], credentials: false },
    maxHttpBufferSize: 32 * 1024,
  });
  const pokerStates = new Map<string, PokerState>();
  const rummyStates = new Map<string, RummyState>();
  const potStates = new Map<string, PotState>();

  io.on("connection", (socket) => {
    const token = typeof socket.handshake.auth?.sessionToken === "string" && socket.handshake.auth.sessionToken.length <= 512
      ? socket.handshake.auth.sessionToken
      : undefined;
    if (token) void auth.resolveSession(token).then((session) => {
      if (session) {
        socket.data.session = session;
        auth.setOnline(session.userId, true);
        socket.emit("session:authenticated", { userId: session.userId, username: session.username, isGuest: session.isGuest });
      }
    });
    socket.emit("system:ready", { serverTime: new Date().toISOString() });
    const socketActions = createRateLimiter(120, API_RATE_WINDOW_MS);

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
        const actionRate = socketActions(socket.id);
        if (!actionRate.allowed) throw new PlatformError("RATE_LIMITED", "Too many messages");
        const room = roomManager.getRoomForSocket(socket.id);
        const session = socket.data.session;
        if (!room || !session) throw new PlatformError("UNAUTHENTICATED", "Authenticate and join a room before chatting");
        const member = room.players.find((player) => player.socketId === socket.id && player.id === session.userId);
        if (!member) throw new RoomDomainError("NOT_ROOM_MEMBER", "You are not a member of this room");
        const body = typeof payload.body === "string" ? payload.body.trim() : "";
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
