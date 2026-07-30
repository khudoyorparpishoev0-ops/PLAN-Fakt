# Бэкенд «Финансы План-Факт» (NestJS + Prisma).
# ВАЖНО: контекст сборки — КОРЕНЬ репозитория (для seed нужны фикстуры src/data):
#   docker build -f server/Dockerfile -t it-hona-backend .
# В образе остаются prisma CLI и tsx — для `prisma migrate deploy` и `npm run seed`
# внутри контейнера (см. docs/DEPLOY.md).

# ── Ступень 1: зависимости, генерация Prisma-клиента, сборка ───────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY server/tsconfig.json ./server/
COPY server/prisma ./server/prisma
COPY server/src ./server/src
# Фикстуры фронтенда — источник данных для seed
COPY src/data ./src/data
COPY src/lib ./src/lib

RUN cd server && npx prisma generate && npm run build

# ── Ступень 2: рантайм ─────────────────────────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/server

COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/src /app/src

EXPOSE 3000
CMD ["node", "dist/main.js"]
