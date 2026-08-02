# Бэкенд «Финансы План-Факт» (NestJS + Prisma).
# ВАЖНО: контекст сборки — КОРЕНЬ репозитория (для seed нужны фикстуры src/data):
#   docker build -f server/Dockerfile -t it-hona-backend .
# Обе ступени — node:20-slim (Debian bookworm, OpenSSL 3): glibc — первично
# поддерживаемая Prisma платформа, а одинаковая база build/runtime гарантирует,
# что движок, скачанный prisma generate (binaryTargets в schema.prisma:
# "debian-openssl-3.0.x"), совпадает с рантаймом.
# В образе остаются prisma CLI и tsx — для `prisma migrate deploy` и `npm run seed`
# внутри контейнера (см. docs/DEPLOY.md).

# ── Ступень 1: зависимости, генерация Prisma-клиента, сборка ───────────────
FROM node:20-slim AS build
RUN apt-get update -qq && apt-get install -y -qq openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY server/tsconfig.json ./server/
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY server/scripts ./server/scripts
# Фикстуры фронтенда — источник данных для seed и очистки демо-данных.
# theme.ts тоже нужен: из него фикстуры берут цвета статусов (C).
# Любой новый импорт за пределы этого среза ломает seed внутри контейнера,
# поэтому ниже стоит проверка scripts/verify-image-imports.ts.
COPY src/data ./src/data
COPY src/lib ./src/lib
COPY src/theme.ts ./src/theme.ts

# generate выполняется ПОСЛЕ копирования schema.prisma с binaryTargets;
# сразу проверяем, что движок под Debian/OpenSSL 3 скачан
RUN cd server && npx prisma generate \
  && test -f node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node
RUN cd server && npm run build

# ── Ступень 2: рантайм ─────────────────────────────────────────────────────
FROM node:20-slim
RUN apt-get update -qq && apt-get install -y -qq openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/server

COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/prisma ./prisma
COPY --from=build /app/server/scripts ./scripts
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/src /app/src

# Контроль: движок под этот рантайм реально попал в финальный образ
RUN test -f node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node

# Контроль: срез фронтенда полный — иначе `npm run seed` упадёт на деплое,
# уже после миграций, и не доедет до установки резервных копий
RUN npm run verify:imports

EXPOSE 3000
CMD ["node", "dist/main.js"]
