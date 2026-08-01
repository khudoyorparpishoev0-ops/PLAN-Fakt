#!/bin/sh
# Проверка, что резервная копия ВОССТАНАВЛИВАЕТСЯ.
#
# Копия, которую никто не пробовал развернуть, — не копия, а надежда.
# Скрипт берёт самый свежий дамп из /opt/app/backups, разворачивает его во
# временную базу рядом с рабочей и сверяет количество строк и суммы.
# Рабочую базу не трогает: только читает и создаёт отдельную временную.
#
#   sudo /opt/app/app/deploy/check-restore.sh
set -eu

ENV_FILE=/opt/app/.env
BACKUP_DIR=/opt/app/backups
COMPOSE_FILE=/opt/app/docker-compose.yml
TMP_DB=ithona_restore_check
fails=0

ok() {
  if [ "$2" = "1" ]; then printf '  ok   %s — %s\n' "$1" "$3"
  else printf ' FAIL  %s — %s\n' "$1" "$3"; fails=$((fails + 1)); fi
}
fail() { printf '[restore-check] ОШИБКА: %s\n' "$1" >&2; exit 2; }

[ -f "$ENV_FILE" ] || fail "нет $ENV_FILE"
DB_URL=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | tail -1 | sed "s/^[\"']//;s/[\"']$//")
[ -n "$DB_URL" ] || fail "в $ENV_FILE нет DATABASE_URL"

if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
else fail "не найден docker compose"; fi

DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -name 'ithona-*.dump' -type f 2>/dev/null | sort | tail -1)
[ -n "$DUMP" ] || fail "в $BACKUP_DIR нет ни одной копии — запустите /opt/app/backup-db.sh"

SIZE=$(wc -c < "$DUMP" | tr -d ' ')
ok "копия найдена" 1 "$(basename "$DUMP"), $((SIZE / 1024)) КБ"
ok "заголовок PGDMP на месте" "$(head -c 5 "$DUMP" | grep -q PGDMP && echo 1 || echo 0)" "формат pg_dump -Fc"

# Служебный URL к базе postgres — для создания и удаления временной
ADMIN_URL=$(printf '%s' "$DB_URL" | sed 's#/[^/?]*\(?.*\)\?$#/postgres#')
TMP_URL=$(printf '%s' "$DB_URL" | sed "s#/[^/?]*\(?.*\)\?\$#/$TMP_DB#")

psql_c() { $COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app exec -T postgres psql -t -A "$1" -c "$2" 2>/dev/null; }

psql_c "$ADMIN_URL" "DROP DATABASE IF EXISTS $TMP_DB" >/dev/null || true
psql_c "$ADMIN_URL" "CREATE DATABASE $TMP_DB" >/dev/null \
  || fail "не удалось создать временную базу $TMP_DB"

# Дамп лежит на хосте, восстанавливаем внутрь контейнера через stdin
$COMPOSE -f "$COMPOSE_FILE" --project-directory /opt/app exec -T postgres \
  pg_restore --no-owner --no-acl -d "$TMP_URL" < "$DUMP" >/dev/null 2>&1 || true

count() { psql_c "$1" "SELECT count(*) FROM $2" || echo ERR; }
for t in users operations projects requests articles; do
  A=$(count "$DB_URL" "$t"); B=$(count "$TMP_URL" "$t")
  ok "таблица $t" "$([ "$A" = "$B" ] && [ "$A" != "ERR" ] && [ -n "$A" ] && echo 1 || echo 0)" "$A = $B строк"
done

SA=$(psql_c "$DB_URL" "SELECT coalesce(sum(amount_tjs_dirams),0) FROM operations WHERE deleted_at IS NULL")
SB=$(psql_c "$TMP_URL" "SELECT coalesce(sum(amount_tjs_dirams),0) FROM operations WHERE deleted_at IS NULL")
ok "суммы операций совпадают" "$([ "$SA" = "$SB" ] && [ -n "$SA" ] && echo 1 || echo 0)" "$SA дирам"

MA=$(count "$DB_URL" '\"_prisma_migrations\"'); MB=$(count "$TMP_URL" '\"_prisma_migrations\"')
ok "история миграций восстановлена" "$([ "$MA" = "$MB" ] && [ -n "$MA" ] && echo 1 || echo 0)" "$MA = $MB"

psql_c "$ADMIN_URL" "DROP DATABASE IF EXISTS $TMP_DB" >/dev/null || true

if [ "$fails" = "0" ]; then
  printf '\nКопия восстанавливается: %s\n\n' "$(basename "$DUMP")"
  exit 0
fi
printf '\nПровалено проверок: %s — копии нельзя доверять\n\n' "$fails"
exit 1
