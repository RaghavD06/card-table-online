FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/game-engine/package.json packages/game-engine/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/socket-contracts/package.json packages/socket-contracts/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/src apps/server/src
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/prisma prisma
EXPOSE 4000
CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
