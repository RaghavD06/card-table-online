# Card Table Online

Phase 2 adds the server-authoritative multiplayer room foundation. Gameplay is intentionally not implemented yet.

## Setup

Requires Node.js 20+, npm 10+, and Docker Desktop.

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:push
npm run dev
```

Open `http://localhost:3000`. The backend health endpoint is available at `http://localhost:4000/health`.

## Architecture

- `apps/web`: Next.js App Router shell and design system.
- `apps/server`: Node.js/TypeScript HTTP and Socket.IO boundary.
- `packages/config`: validated environment configuration.
- `packages/game-engine`: transport-independent game contracts.
- `packages/shared`: domain primitives and authentication boundary contracts.
- `packages/socket-contracts`: typed Socket.IO event contracts.
- `prisma/schema.prisma`: durable persistence foundation.

The server owns room state, player presence, host assignment, readiness, card generation, balances, and future game actions. Clients receive public room state plus their own private projection; they never submit authoritative state.

## Multiplayer rooms

The Socket.IO server supports `room:create`, `room:join`, `room:leave`, and `room:ready`. Room codes are six-character uppercase codes without ambiguous characters. A stable optional `playerId` lets a disconnected player reconnect to the same seat; otherwise the socket ID is used. Disconnects mark a player offline and transfer the host role to the first connected player.

Room state is currently held in `InMemoryRoomStateStore`, behind the `RoomStateStore` interface in `apps/server/src/rooms.ts`. This is the Redis integration boundary for the phase: a Redis-backed implementation can replace the store without changing Socket.IO handlers or room domain rules. No gameplay or fake game outcomes are included.
