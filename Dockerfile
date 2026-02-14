FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json

RUN pnpm install --frozen-lockfile --filter @telegram-manager/backend...

COPY backend backend
COPY config config

RUN pnpm --filter @telegram-manager/backend build

FROM node:20-alpine AS runtime

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json

RUN pnpm install --prod --frozen-lockfile --filter @telegram-manager/backend...

COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/config config

EXPOSE 3000

CMD ["pnpm", "--filter", "@telegram-manager/backend", "start"]
