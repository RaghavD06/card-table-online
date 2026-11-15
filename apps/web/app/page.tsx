"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@card-table/socket-contracts";
import type { GameType, RoomSummary } from "@card-table/shared";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type PlayerIdentity = { id: string; name: string };

const IDENTITY_KEY = "card-table-online:guest";
const ROOM_KEY = "card-table-online:room";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";
const games: Array<{ value: GameType; name: string; description: string; players: string }> = [
  { value: "POKER", name: "Texas Hold'em", description: "A focused table for strategic hands and friendly competition.", players: "2–9 players" },
  { value: "RUMMY", name: "Indian Rummy", description: "Arrange, draw, and declare with your own private table.", players: "2–6 players" },
  { value: "POT", name: "Pot", description: "A fast, social in-between game with configurable table rules.", players: "2+ players" },
];

function createIdentity(): PlayerIdentity {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `guest-${Date.now()}`;
  return { id, name: `Guest ${id.slice(0, 6)}` };
}

function loadIdentity(): PlayerIdentity {
  if (typeof window === "undefined") return createIdentity();
  try {
    const saved = window.localStorage.getItem(IDENTITY_KEY);
    if (saved) {
      const identity = JSON.parse(saved) as Partial<PlayerIdentity>;
      if (identity.id && identity.name) return { id: identity.id, name: identity.name };
    }
  } catch {
    // A malformed local identity should not prevent a new guest session.
  }
  const identity = createIdentity();
  window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export default function HomePage() {
  const socketRef = useRef<RoomSocket | null>(null);
  const [identity, setIdentity] = useState<PlayerIdentity>({ id: "", name: "" });
  const [room, setRoom] = useState<RoomSummary>();
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [gameType, setGameType] = useState<GameType>("POKER");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [error, setError] = useState<string>();
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline">("connecting");

  useEffect(() => {
    const savedIdentity = loadIdentity();
    setIdentity(savedIdentity);
    setName(savedIdentity.name);
    const savedRoomCode = window.localStorage.getItem(ROOM_KEY);

    const socket = io(socketUrl, { autoConnect: true, reconnection: true });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnectionState("connected");
      if (savedRoomCode) {
        socket.emit("room:join", { code: savedRoomCode, playerId: savedIdentity.id, playerName: savedIdentity.name });
      }
    });
    socket.on("disconnect", () => setConnectionState("offline"));
    socket.on("connect_error", () => {
      setConnectionState("offline");
      setError("The table server is unavailable. Check that the server is running and try again.");
    });
    socket.on("room:update", (nextRoom) => {
      setRoom(nextRoom);
      window.localStorage.setItem(ROOM_KEY, nextRoom.code);
      setError(undefined);
    });
    socket.on("error:domain", ({ code, message }) => {
      if (code === "ROOM_NOT_FOUND") window.localStorage.removeItem(ROOM_KEY);
      setError(message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const currentPlayer = useMemo(() => room?.players.find((player) => player.id === identity.id), [identity.id, room]);
  const saveName = (nextName: string) => {
    const nextIdentity = { ...identity, name: nextName };
    setName(nextName);
    setIdentity(nextIdentity);
    if (nextIdentity.id) window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(nextIdentity));
  };
  const emit = (event: "room:create" | "room:join" | "room:ready", payload: Parameters<RoomSocket["emit"]>[1]) => {
    setError(undefined);
    socketRef.current?.emit(event, payload as never);
  };

  const createRoom = () => {
    if (!name.trim()) return setError("Enter a display name before creating a room.");
    emit("room:create", { gameType, maxPlayers: Number(maxPlayers), playerId: identity.id, playerName: name.trim() });
  };
  const joinRoom = () => {
    if (!name.trim()) return setError("Enter a display name before joining a room.");
    if (!roomCode.trim()) return setError("Enter a room code.");
    emit("room:join", { code: roomCode.trim(), playerId: identity.id, playerName: name.trim() });
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17243b,transparent_45%),#070b16]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-gold">Card Table</div>
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <span className="hidden text-xs uppercase tracking-[0.16em] text-slate-500 sm:inline">
            {connectionState === "connected" ? "Server connected" : connectionState === "connecting" ? "Connecting…" : "Server offline"}
          </span>
          <span className="rounded-full border border-white/10 px-4 py-2">{name || "Guest"}</span>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        {!room ? (
          <>
            <div className="max-w-3xl">
              <p className="mb-5 text-sm uppercase tracking-[0.25em] text-gold">Private tables. Real-time play.</p>
              <h1 className="text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Gather your people around the table.</h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">Create a private room, share the code, and keep every player in sync.</p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-glow">
                <p className="text-xs uppercase tracking-[0.2em] text-gold">Your table identity</p>
                <label className="mt-5 block text-sm text-slate-300" htmlFor="player-name">Display name</label>
                <input id="player-name" value={name} onChange={(event) => saveName(event.target.value)} maxLength={24} className="mt-2 w-full rounded-2xl border border-white/10 bg-ink px-4 py-3 outline-none focus:border-gold" placeholder="How should friends see you?" />
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-slate-300" htmlFor="game-type">Game</label>
                    <select id="game-type" value={gameType} onChange={(event) => setGameType(event.target.value as GameType)} className="mt-2 w-full rounded-2xl border border-white/10 bg-ink px-4 py-3">
                      {games.map((game) => <option key={game.value} value={game.value}>{game.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-slate-300" htmlFor="max-players">Max players</label>
                    <select id="max-players" value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-ink px-4 py-3">
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => <option key={count} value={count}>{count} players</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={createRoom} disabled={connectionState !== "connected"} className="mt-6 w-full rounded-full bg-emerald-500 px-6 py-3 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50">Create a room</button>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-gold">Join a table</p>
                <p className="mt-4 leading-7 text-slate-400">Use the six-character code shared by your host.</p>
                <label className="mt-6 block text-sm text-slate-300" htmlFor="room-code">Room code</label>
                <input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={6} className="mt-2 w-full rounded-2xl border border-white/10 bg-ink px-4 py-3 font-mono uppercase tracking-[0.3em] outline-none focus:border-gold" placeholder="ABC123" />
                <button onClick={joinRoom} disabled={connectionState !== "connected"} className="mt-6 w-full rounded-full border border-white/15 px-6 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50">Join with a code</button>
              </div>
            </div>
            <div className="mt-16 grid gap-4 md:grid-cols-3">
              {games.map((game) => <article key={game.value} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><div className="mb-14 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-gold"><span>Phase 2</span><span>{game.players}</span></div><h2 className="text-2xl font-semibold">{game.name}</h2><p className="mt-3 leading-7 text-slate-400">{game.description}</p></article>)}
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div><p className="text-sm uppercase tracking-[0.25em] text-gold">Waiting room</p><h1 className="mt-3 text-5xl font-semibold tracking-tight">{room.code}</h1><p className="mt-3 text-slate-400">{room.gameType} · {room.playerCount}/{room.maxPlayers} players · {room.status}</p></div>
              <button onClick={() => { socketRef.current?.emit("room:leave"); window.localStorage.removeItem(ROOM_KEY); setRoom(undefined); }} className="rounded-full border border-white/15 px-5 py-2 text-sm">Leave room</button>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-glow">
                <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Players</h2><span className="text-sm text-slate-400">{room.players.filter((player) => player.connected).length} connected</span></div>
                <div className="mt-5 space-y-3">{room.players.map((player) => <div key={player.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-ink/60 px-4 py-3"><div><p className="font-medium">{player.name} {player.id === identity.id ? <span className="text-slate-500">(you)</span> : null}</p><p className="text-xs text-slate-500">{player.connected ? "Connected" : "Reconnecting…"}</p></div><div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em]">{player.isHost ? <span className="rounded-full bg-gold/20 px-3 py-1 text-gold">Host</span> : null}<span className={player.ready ? "text-emerald-400" : "text-slate-500"}>{player.ready ? "Ready" : "Not ready"}</span></div></div>)}</div>
                <button onClick={() => emit("room:ready", { ready: !currentPlayer?.ready })} className="mt-6 w-full rounded-full bg-emerald-500 px-6 py-3 font-semibold text-ink">{currentPlayer?.ready ? "Mark not ready" : "Mark ready"}</button>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-xs uppercase tracking-[0.2em] text-gold">Future game state</p><h2 className="mt-4 text-2xl font-semibold">The table is being dealt.</h2><p className="mt-3 leading-7 text-slate-400">Game commands and private hands will appear here in the next phase. For now, use this room to confirm everyone is present and ready.</p><div className="mt-8 rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-500">Ready state is authoritative and synchronized live.</div></div>
            </div>
          </div>
        )}
        {error ? <div role="alert" className="mx-auto mt-6 max-w-4xl rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      </section>
    </main>
  );
}

