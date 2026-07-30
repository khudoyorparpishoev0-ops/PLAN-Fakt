#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Однокомандный деплой фронтенда IT-HONA «Финансы План-Факт».
#
# Использование (под root, POSIX sh, без интерактивных вопросов):
#   sudo sh deploy.sh [REPO_URL] [BRANCH]
#
# По умолчанию:
#   REPO_URL = https://github.com/khudoyorparpishoev0-ops/PLAN-Fakt.git
#   BRANCH   = claude/design-handoff-implementation-3okq4o
#
# Что делает: ставит git/nginx/curl при отсутствии; клонирует или обновляет
# /opt/app/app; собирает образ it-hona-frontend; перезапускает контейнер на
# 127.0.0.1:8080; пишет конфиг системного nginx (proxy_pass на :8080,
# client_max_body_size 12m, задел /api -> :3000) и перезагружает nginx;
# в конце проверяет curl -I http://localhost/ и печатает итог.
# Идемпотентен: повторный запуск безопасен.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

REPO_URL="${1:-https://github.com/khudoyorparpishoev0-ops/PLAN-Fakt.git}"
BRANCH="${2:-claude/design-handoff-implementation-3okq4o}"
APP_DIR=/opt/app/app
IMAGE=it-hona-frontend:latest
CONTAINER=it-hona-frontend
NGINX_SITE=/etc/nginx/sites-available/crm.conf

STEP="подготовка"
on_exit() {
  code=$?
  if [ "$code" -ne 0 ]; then
    echo ""
    echo "ОШИБКА на шаге: $STEP (код $code). Подробности — в выводе выше."
  fi
}
trap on_exit EXIT

say() { echo ""; echo "==> $1"; }

if [ "$(id -u)" != "0" ]; then
  echo "Запустите под root: sudo sh $0"
  exit 1
fi

# ── Docker должен быть установлен заранее (по условиям сервера) ─────────────
STEP="проверка Docker"
say "Проверка Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не установлен. Установите Docker (https://docs.docker.com/engine/install/ubuntu/) и запустите скрипт снова."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker-демон не отвечает. Запустите его: systemctl start docker"
  exit 1
fi

# ── git / nginx / curl — доставить недостающее ──────────────────────────────
STEP="установка git/nginx/curl"
need=""
command -v git   >/dev/null 2>&1 || need="$need git"
command -v nginx >/dev/null 2>&1 || need="$need nginx"
command -v curl  >/dev/null 2>&1 || need="$need curl"
if [ -n "$need" ]; then
  say "Установка пакетов:$need"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # shellcheck disable=SC2086 — need намеренно без кавычек: список пакетов
  apt-get install -y -qq $need
else
  say "git, nginx и curl уже установлены"
fi

# ── Код: клонировать или обновить ───────────────────────────────────────────
STEP="клонирование/обновление репозитория"
say "Код: $REPO_URL (ветка $BRANCH) -> $APP_DIR"
mkdir -p /opt/app
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH" 2>/dev/null \
    || git -C "$APP_DIR" checkout -qb "$BRANCH" "origin/$BRANCH"
  git -C "$APP_DIR" reset --hard -q "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ── Сборка образа и перезапуск контейнера ───────────────────────────────────
STEP="сборка docker-образа"
say "Сборка образа $IMAGE"
docker build -t "$IMAGE" "$APP_DIR"

STEP="перезапуск контейнера"
say "Перезапуск контейнера $CONTAINER на 127.0.0.1:8080"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --restart unless-stopped \
  -p 127.0.0.1:8080:80 "$IMAGE" >/dev/null

# ── Системный nginx ─────────────────────────────────────────────────────────
STEP="настройка системного nginx"
say "Конфиг nginx: $NGINX_SITE"
cat > "$NGINX_SITE" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    # Пока домена нет — принимаем обращения по IP; после выпуска домена
    # заменить `_` на имя, например: server_name crm.example.tj;
    server_name _;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Задел под backend (шаг 1): заработает после запуска сервиса на :3000
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
mkdir -p /etc/nginx/sites-enabled
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/crm.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx

# ── Проверка ────────────────────────────────────────────────────────────────
STEP="итоговая проверка"
say "Проверка"
sleep 1
if ! curl -fsSI http://127.0.0.1:8080/ >/dev/null 2>&1; then
  echo "Контейнер не отвечает на 127.0.0.1:8080."
  echo "Диагностика: docker ps --filter name=$CONTAINER ; docker logs $CONTAINER"
  exit 1
fi
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/ || echo 000)
if [ "$code" = "200" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "$IP" ] || IP="IP-сервера"
  echo ""
  echo "ГОТОВО, откройте http://$IP/"
else
  echo "nginx отвечает кодом $code на http://localhost/ (ожидалось 200)."
  echo "Диагностика: nginx -t ; systemctl status nginx ; curl -I http://127.0.0.1:8080/"
  exit 1
fi
