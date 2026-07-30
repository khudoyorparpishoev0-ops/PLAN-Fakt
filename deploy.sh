#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Однокомандный деплой IT-HONA «Финансы План-Факт»: фронтенд + бэкенд.
#
# Использование (под root, POSIX sh, без интерактивных вопросов):
#   sudo sh deploy.sh [REPO_URL] [BRANCH]
#
# По умолчанию:
#   REPO_URL = https://github.com/khudoyorparpishoev0-ops/PLAN-Fakt.git
#   BRANCH   = claude/design-handoff-implementation-3okq4o
#
# Что делает:
#   1) ставит git/nginx/curl при отсутствии; проверяет Docker;
#   2) клонирует или обновляет /opt/app/app;
#   3) дописывает недостающие переменные в /opt/app/.env (существующие значения
#      не трогает; недостающие секреты генерирует);
#   4) дописывает сервисы backend и frontend в /opt/app/docker-compose.yml
#      (не ломая postgres/minio; повторный запуск дублей не создаёт);
#   5) собирает и поднимает контейнеры, выполняет prisma migrate deploy и seed;
#   6) настраивает системный nginx (проксирование / -> :8080, /api/ -> :3000);
#   7) проверяет http://localhost/ и http://localhost/api/health и печатает итог.
# Идемпотентен: повторный запуск обновляет развёрнутое, ничего не ломая.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

REPO_URL="${1:-https://github.com/khudoyorparpishoev0-ops/PLAN-Fakt.git}"
BRANCH="${2:-claude/design-handoff-implementation-3okq4o}"
APP_DIR=/opt/app/app
COMPOSE_FILE=/opt/app/docker-compose.yml
ENV_FILE=/opt/app/.env
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
gen_secret() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32; }

# Значение переменной из ENV_FILE (без кавычек), пусто — если нет.
env_get() {
  sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -1 | sed "s/^[\"']//;s/[\"']\$//"
}

# ensure_env KEY VALUE — добавить переменную, если её нет или она пустая.
# Существующие непустые значения никогда не перезаписываются.
ensure_env() {
  key=$1; val=$2
  if grep -qE "^${key}=..*" "$ENV_FILE"; then
    return 0
  fi
  if grep -qE "^${key}=[[:space:]]*\$" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
  echo "  + ${key} добавлен в ${ENV_FILE}"
}

if [ "$(id -u)" != "0" ]; then
  echo "Запустите под root: sudo sh $0"
  exit 1
fi

# ── Docker и compose ────────────────────────────────────────────────────────
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
COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    echo "Не найден ни плагин docker compose, ни docker-compose."
    exit 1
  fi
fi

# ── git / nginx / curl ──────────────────────────────────────────────────────
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

# ── Код ─────────────────────────────────────────────────────────────────────
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

# ── Переменные окружения ────────────────────────────────────────────────────
STEP="переменные окружения ($ENV_FILE)"
say "Переменные окружения: $ENV_FILE"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

if ! grep -qE '^DATABASE_URL=..*' "$ENV_FILE"; then
  PG_USER=$(env_get POSTGRES_USER)
  PG_PASS=$(env_get POSTGRES_PASSWORD)
  PG_DB=$(env_get POSTGRES_DB)
  if [ -z "$PG_PASS" ]; then
    echo "В $ENV_FILE нет ни DATABASE_URL, ни POSTGRES_PASSWORD."
    echo "Задайте DATABASE_URL вручную (postgresql://user:pass@postgres:5432/db?schema=public) и повторите."
    exit 1
  fi
  ensure_env DATABASE_URL "postgresql://${PG_USER:-postgres}:${PG_PASS}@postgres:5432/${PG_DB:-${PG_USER:-postgres}}?schema=public"
fi
ensure_env JWT_SECRET "$(gen_secret)"
ensure_env S3_ENDPOINT "http://minio:9000"
ensure_env MINIO_ROOT_USER "minio"
ensure_env MINIO_ROOT_PASSWORD "$(gen_secret)"
ensure_env MINIO_BUCKET "ithona-attachments"
ensure_env TZ "Asia/Dushanbe"
ensure_env SEED_PASSWORD_ADMIN "$(gen_secret)"
ensure_env SEED_PASSWORD_DIRECTOR "$(gen_secret)"
ensure_env SEED_PASSWORD_ACCOUNTANT "$(gen_secret)"

# ── Сервисы в docker-compose.yml ────────────────────────────────────────────
STEP="сервисы в $COMPOSE_FILE"
say "Сервисы backend/frontend в $COMPOSE_FILE"
if [ ! -f "$COMPOSE_FILE" ]; then
  printf 'services:\n' > "$COMPOSE_FILE"
fi
cp -n "$COMPOSE_FILE" "$COMPOSE_FILE.bak" 2>/dev/null || true

add_service() { # имя_сервиса файл_с_блоком
  svc=$1; blk=$2
  if grep -qE "^[[:space:]]{1,4}${svc}:" "$COMPOSE_FILE"; then
    echo "  = сервис ${svc} уже есть — пропускаю"
    return 0
  fi
  if ! grep -qE '^services[[:space:]]*:' "$COMPOSE_FILE"; then
    printf 'services:\n' >> "$COMPOSE_FILE"
  fi
  awk -v f="$blk" '
    { print }
    !d && /^services[[:space:]]*:/ { while ((getline l < f) > 0) print l; close(f); d=1 }
  ' "$COMPOSE_FILE" > "$COMPOSE_FILE.tmp" && mv "$COMPOSE_FILE.tmp" "$COMPOSE_FILE"
  echo "  + сервис ${svc} добавлен"
}

TMPD=$(mktemp -d)
cat > "$TMPD/backend.yml" <<'EOF'
  backend:
    build:
      context: /opt/app/app
      dockerfile: server/Dockerfile
    env_file: /opt/app/.env
    ports:
      - "127.0.0.1:3000:3000"
    restart: unless-stopped
    depends_on:
      - postgres

EOF
cat > "$TMPD/frontend.yml" <<'EOF'
  frontend:
    build:
      context: /opt/app/app
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8080:80"
    restart: unless-stopped

EOF
add_service backend "$TMPD/backend.yml"
add_service frontend "$TMPD/frontend.yml"
rm -rf "$TMPD"

# Проверка, что compose-файл остался валидным; иначе — откат из .bak
if ! $COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app config -q 2>/dev/null; then
  echo "После правки $COMPOSE_FILE не проходит 'compose config' — восстанавливаю из .bak"
  cp "$COMPOSE_FILE.bak" "$COMPOSE_FILE"
  echo "Добавьте сервисы backend/frontend вручную (см. docs/DEPLOY.md, раздел «Бэкенд»)."
  exit 1
fi

# ── Сборка и запуск ─────────────────────────────────────────────────────────
STEP="сборка и запуск контейнеров"
say "Сборка и запуск backend + frontend"
# Фронтенд, запущенный старой версией скрипта одиночным контейнером,
# освобождает порт 8080 в пользу compose-сервиса
docker rm -f it-hona-frontend >/dev/null 2>&1 || true
$COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app up -d --build backend frontend

STEP="миграции БД (prisma migrate deploy)"
say "Миграции БД"
$COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app exec -T backend npx prisma migrate deploy

STEP="наполнение БД (seed)"
say "Seed (идемпотентный)"
$COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app exec -T backend npm run seed

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
  echo "Фронтенд не отвечает на 127.0.0.1:8080."
  echo "Диагностика: $COMPOSE -f $COMPOSE_FILE --project-directory /opt/app ps ; docker logs \$($COMPOSE -f $COMPOSE_FILE --project-directory /opt/app ps -q frontend)"
  exit 1
fi
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost/ || echo 000)
if [ "$code" != "200" ]; then
  echo "nginx отвечает кодом $code на http://localhost/ (ожидалось 200)."
  echo "Диагностика: nginx -t ; systemctl status nginx ; curl -I http://127.0.0.1:8080/"
  exit 1
fi

# API может подниматься пару секунд после старта контейнера — до 30 с ожидания
health=""
i=0
while [ $i -lt 15 ]; do
  health=$(curl -s http://localhost/api/health || true)
  case "$health" in
    *'"db":"ok"'*) break ;;
  esac
  i=$((i + 1))
  sleep 2
done
case "$health" in
  *'"db":"ok"'*)
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -n "$IP" ] || IP="IP-сервера"
    echo ""
    echo "ГОТОВО, откройте http://$IP/"
    echo "  Приложение: http://$IP/          (интерфейс, пока на фикстурах)"
    echo "  API:        http://$IP/api/health -> $health"
    echo "  Пароли тестовых пользователей — в $ENV_FILE (SEED_PASSWORD_*)."
    ;;
  *)
    echo "API не отвечает '\"db\":\"ok\"' на http://localhost/api/health. Последний ответ: ${health:-<пусто>}"
    echo "Диагностика: $COMPOSE -f $COMPOSE_FILE --project-directory /opt/app logs backend | tail -50"
    echo "Проверьте DATABASE_URL в $ENV_FILE (хост должен быть именем сервиса postgres)."
    exit 1
    ;;
esac
