FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/socket-contracts/package.json packages/socket-contracts/package.json
COPY prisma prisma

RUN npm ci

COPY . .

RUN npm run db:generate -w @card-table/server && npm run build -w @card-table/server

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || process.env.SERVER_PORT || 4000) + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "run", "start:server"]
