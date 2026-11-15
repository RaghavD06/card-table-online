# Card Table Online

The server-authoritative multiplayer room foundation includes transport-independent Rummy and Pot engines in `packages/game-engine`. Room lifecycle and gameplay remain separate concerns.

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

## Production deployment

The web app is configured for Vercel through `vercel.json`. Create the Vercel project
from the repository root and keep the build command as `npm run build:web`. Set
`NEXT_PUBLIC_SERVER_URL` (when the web client begins using it) to the public server
origin; do not proxy Socket.IO through Vercel.

The server is configured as a Docker web service in `render.yaml` and can also be
deployed to Railway using `apps/server/Dockerfile` with the repository root as the
Docker context. Both providers must expose the server's `/health` endpoint and
provide their dynamic `PORT`. Socket.IO requires a long-lived Node process and
WebSocket/HTTP upgrade support; do not deploy the server as a serverless function.

Production server variables are required explicitly:

- `NODE_ENV=production`
- `PORT` (provider-assigned; `SERVER_PORT` remains available for local use)
- `WEB_ORIGIN` (the exact public Vercel origin, including scheme and no trailing path)
- `DATABASE_URL` (managed PostgreSQL connection string)
- `REDIS_URL` (managed Redis connection string; reserved for shared room/presence coordination)
- `AUTH_SECRET` (a long random secret; never commit it)

`WEB_ORIGIN` is used for both Express CORS and Socket.IO CORS. Keep the web and server
on HTTPS in production, and configure the provider's health check to call
`GET /health`. Database schema deployment is intentionally separate from image startup;
run the repository's Prisma migration/deployment procedure from a controlled release
step rather than making every container boot mutate the database.

## Architecture

- `apps/web`: Next.js App Router shell and design system.
- `apps/server`: Node.js/TypeScript HTTP and Socket.IO boundary.
- `packages/config`: validated environment configuration.
- `packages/game-engine`: transport-independent game contracts plus deterministic Rummy and Pot rules.
- `packages/shared`: domain primitives and authentication boundary contracts.
- `packages/socket-contracts`: typed Socket.IO event contracts.
- `prisma/schema.prisma`: durable persistence foundation.

The server owns room state, player presence, host assignment, readiness, card generation, balances, and future game actions. Clients receive public room state plus their own private projection; they never submit authoritative state.

## Multiplayer rooms

The Socket.IO server supports `room:create`, `room:join`, `room:leave`, and `room:ready`. Room codes are six-character uppercase codes without ambiguous characters. A stable optional `playerId` lets a disconnected player reconnect to the same seat; otherwise the socket ID is used. Disconnects mark a player offline and transfer the host role to the first connected player.

Room state is currently held in `InMemoryRoomStateStore`, behind the `RoomStateStore` interface in `apps/server/src/rooms.ts`. This is the Redis integration boundary for the phase: a Redis-backed implementation can replace the store without changing Socket.IO handlers or room domain rules. No gameplay or fake game outcomes are included.
