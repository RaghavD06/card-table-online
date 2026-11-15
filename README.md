# Card Table Online

Phase 1 establishes the production-oriented foundation for a server-authoritative multiplayer card platform. Gameplay is intentionally not implemented yet.

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

The server owns room state, card generation, balances, and future game actions. Clients receive public room state plus their own private projection; they never submit authoritative state. Room lifecycle, Redis coordination, and game engines are Phase 2+ work and are represented only by explicit interfaces.
