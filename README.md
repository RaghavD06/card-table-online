# Card Table Online

Phase 3 adds the server-authoritative Texas Hold'em foundation on top of the Phase 2 multiplayer rooms.

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

The server owns room state, player presence, host assignment, readiness, Poker card generation, balances, and game actions. Clients receive public room state plus their own private projection; they never submit authoritative state.

## Game foundations

`@card-table/game-engine` exposes a transport-independent `PokerEngine`. It uses `node:crypto` randomness by default, rotates the dealer and blinds, validates fold/check/call/bet/raise/all-in actions, evaluates seven-card hands, and settles main and side pots with deterministic split handling. The engine's internal state is never emitted; Socket.IO sends public state to the room and private hole cards only to their owner.

`RummyEngine` provides server-authoritative draw/discard turns and declaration scoring. `PotEngine` provides In-Between/Acey-Deucey with cryptographic card generation, configurable ace ranking, strict-between evaluation, pass handling, integer min/max bet validation, duplicate request protection, 1:1 balance settlement, and turn rotation. The Pot UI foundation is available at `/pot`.

Phase 6 adds the social/auth boundary and local persistence seams. Use `/auth` for email/password or guest sessions, `/lobby` for the social navigation surface, and `/profile`, `/friends`, `/history`, and `/settings` for account projections. Server APIs live under `/api/auth/*`, `/api/me/*`, and `/api/invitations`; Socket.IO accepts `handshake.auth.sessionToken`, rejects unauthenticated room chat, and broadcasts only to current room members. Google remains disabled until `GOOGLE_CLIENT_ID` is configured. Prisma schema models cover users, identities, wallets, transactions, friendships, game history, notifications, and room invites; run `npm run db:generate` and `npm run db:push` after configuring PostgreSQL.

## Multiplayer rooms

The Socket.IO server supports `room:create`, `room:join`, `room:leave`, and `room:ready`. Room codes are six-character uppercase codes without ambiguous characters. A stable optional `playerId` lets a disconnected player reconnect to the same seat; otherwise the socket ID is used. Disconnects mark a player offline and transfer the host role to the first connected player.

Room state is currently held in `InMemoryRoomStateStore`, behind the `RoomStateStore` interface in `apps/server/src/rooms.ts`. This is the Redis integration boundary for the phase: a Redis-backed implementation can replace the store without changing Socket.IO handlers or room domain rules. No gameplay or fake game outcomes are included.
