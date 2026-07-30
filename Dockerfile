# ── Ступень 1: сборка фронтенда ────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Сначала только манифесты — слой с зависимостями кэшируется отдельно
COPY package.json package-lock.json ./
RUN npm ci

# Исходники и сборка (tsc -b && vite build)
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# ── Ступень 2: отдача статики через nginx ──────────────────────────────────
FROM nginx:alpine
COPY deploy/nginx-frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
