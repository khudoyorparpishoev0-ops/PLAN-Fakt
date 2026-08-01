#!/bin/sh
# Резервная копия базы IT-HONA.
#
# Ставится и включается автоматически через deploy.sh; запускается ежедневно
# systemd-таймером ithona-backup.timer. Можно вызвать руками:
#   sudo /opt/app/backup-db.sh
#
# Копия — сжатый pg_dump в кастомном формате (-Fc): он восстанавливается
# выборочно и не зависит от версии psql так сильно, как текстовый.
#
# Восстановление — см. docs/DEPLOY.md, раздел «Резервные копии».
set -eu

ENV_FILE=/opt/app/.env
BACKUP_DIR=/opt/app/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
COMPOSE_FILE=/opt/app/docker-compose.yml

log() { printf '[backup] %s\n' "$1"; }
fail() { printf '[backup] ОШИБКА: %s\n' "$1" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "нет $ENV_FILE"

# DATABASE_URL живёт в .env; postgres виден только внутри docker-сети,
# поэтому дамп снимаем изнутри контейнера.
DB_URL=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | tail -1 | sed "s/^[\"']//;s/[\"']$//")
[ -n "$DB_URL" ] || fail "в $ENV_FILE нет DATABASE_URL"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  fail "не найден docker compose"
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP=$(date +%Y-%m-%d_%H%M)
OUT="$BACKUP_DIR/ithona-$STAMP.dump"
TMP="$OUT.part"

log "снимаю дамп в $OUT"
# Пишем во временный файл: прерванный дамп не должен выглядеть готовым
if ! $COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app exec -T postgres \
    pg_dump -Fc --no-owner --no-acl "$DB_URL" > "$TMP" 2>"$TMP.err"; then
  head -5 "$TMP.err" >&2 || true
  rm -f "$TMP" "$TMP.err"
  fail "pg_dump не отработал"
fi
rm -f "$TMP.err"

SIZE=$(wc -c < "$TMP" | tr -d ' ')
# Пустой или обрезанный дамп хуже отсутствия: он создаёт ложное чувство
# защищённости. Заголовок кастомного формата начинается с «PGDMP».
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$TMP"
  fail "дамп подозрительно мал ($SIZE байт) — копия не сохранена"
fi
if ! head -c 5 "$TMP" | grep -q 'PGDMP'; then
  rm -f "$TMP"
  fail "в файле нет заголовка PGDMP — копия не сохранена"
fi

mv "$TMP" "$OUT"
chmod 600 "$OUT"
log "готово: $OUT ($((SIZE / 1024)) КБ)"

# Ротация: старые копии удаляются, но только если свежая на месте
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name 'ithona-*.dump' -mtime "+$KEEP_DAYS" -print -delete | wc -l | tr -d ' ')
[ "$DELETED" = "0" ] || log "удалено копий старше $KEEP_DAYS дней: $DELETED"

COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'ithona-*.dump' | wc -l | tr -d ' ')
TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | awk '{print $1}')
log "копий в $BACKUP_DIR: $COUNT, всего $TOTAL"
