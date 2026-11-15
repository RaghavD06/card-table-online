# Production deployment

## Required configuration

Copy `.env.example` into the deployment secret store and replace every local value:

- `AUTH_SECRET`: a randomly generated value with at least 16 characters. Production startup rejects the development placeholder.
- `DATABASE_URL`: the Railway PostgreSQL connection string, including `?schema=public`.
- `REDIS_URL`: the managed Redis connection string. The current server reports Redis configuration in readiness; room state remains in-memory until the Redis `RoomStateStore` implementation is introduced.
- `WEB_ORIGIN` and `WEB_ORIGINS`: the exact HTTPS Vercel origin(s), comma-separated for multiple origins.
- `NEXT_PUBLIC_SERVER_ORIGIN`: the public Railway API origin used by the browser.
- `PORT` or `SERVER_PORT`: Railway's injected `PORT` is preferred; `SERVER_PORT` is the local fallback.

Google login is capability-gated and is not enabled unless both Google provider credentials are configured. No deployment credential is stored in this repository.

## Railway backend

Create a Railway service from this repository. `railway.json` selects `apps/server/Dockerfile` and uses `/health/live` for liveness. Configure PostgreSQL and managed Redis plugins, add the environment variables above, and run the first schema migration from a controlled release environment:

```powershell
npm run db:generate
npm run db:migrate:deploy
```

The service listens on `SERVER_PORT` (Railway may inject a port). `/health/ready` returns `503` until PostgreSQL responds; this is a readiness signal, not proof that an external deployment completed.

## Vercel frontend

Import the repository into Vercel, set the project root to the repository root, and add `NEXT_PUBLIC_SERVER_ORIGIN` pointing at the Railway HTTPS origin. `vercel.json` builds the `@card-table/web` workspace. The browser talks to the server over HTTPS and Socket.IO/WSS; configure `WEB_ORIGIN(S)` on Railway to match the deployed Vercel origin exactly.

## Local production checks

```powershell
npm ci
npm run db:generate
npm run typecheck
npm run test
npm run build
npm run diff:check
```

External deployment, managed service provisioning, DNS, OAuth credentials, and migrations against a hosted database require the operator's accounts and are intentionally not claimed by this repository change.
