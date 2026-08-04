#!/bin/sh
# Полная проверка сервиса «Финансы План-Факт» одной командой:
#   sudo sh /opt/app/app/deploy/check-service.sh
#
# Проверяет всё, от чего зависит работа сайта: контейнеры, API и базу,
# фронтенд и его кэш-заголовки, миграции, резервные копии с таймером,
# nginx, диск. Каждый пункт — ✓/✗ с пояснением; в конце итог и код
# выхода (0 — всё в порядке), так что скрипт годится и для cron/мониторинга.

set -u

COMPOSE_FILE=/opt/app/docker-compose.yml
BACKUP_DIR=/opt/app/backups

COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || COMPOSE="docker-compose"
C="$COMPOSE -f $COMPOSE_FILE --project-directory /opt/app"

PASS=0; FAIL=0; WARN=0
ok()   { PASS=$((PASS+1)); printf '  \342\234\223 %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \342\234\227 %s\n' "$1"; }
warn() { WARN=$((WARN+1)); printf '  ! %s\n' "$1"; }

echo ""
echo "==> Контейнеры"
for svc in postgres backend frontend; do
  state=$($C ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$svc" '$1==s {print $2}')
  # Старый docker compose без --format: смотрим контейнер по имени напрямую
  if [ -z "$state" ]; then
    state=$(docker ps --filter "name=finmodule-$svc" --format '{{.State}}' 2>/dev/null | head -1)
  fi
  if [ "$state" = "running" ]; then ok "$svc запущен"; else bad "$svc: состояние «${state:-нет контейнера}»"; fi
done

echo ""
echo "==> API и база"
health=$(curl -sf -m 10 http://127.0.0.1/api/health 2>/dev/null || true)
case "$health" in
  *'"status":"ok"'*'"db":"ok"'*) ok "GET /api/health: сервис и база отвечают" ;;
  '') bad "GET /api/health не отвечает — сайт не работает" ;;
  *) bad "GET /api/health вернул: $health" ;;
esac

# Миграции: рабочая схема должна совпадать с кодом
if $C exec -T backend npx prisma migrate status 2>/dev/null | grep -q 'up to date'; then
  ok "миграции применены, схема совпадает с кодом"
else
  bad "prisma migrate status: есть неприменённые миграции (запустите deploy.sh)"
fi

# Данные на месте: пользователи есть всегда, даже на чистой базе
in_pg() { $C exec -T postgres sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -tAc "'"$1"'"' 2>/dev/null | tr -d '[:space:]'; }
users=$(in_pg 'select count(*) from users where deleted_at is null')
if [ -n "$users" ] && [ "$users" -gt 0 ] 2>/dev/null; then ok "пользователей в базе: $users"; else bad "не удалось посчитать пользователей (users=${users:-пусто})"; fi

cleaned=$(in_pg "select value from settings where key='demo_cleaned_at'")
if [ -n "$cleaned" ]; then
  ok "база боевая: демо-данные вычищены $cleaned, сид при деплое пропускается"
else
  warn "база демонстрационная (очистка demo не выполнялась) — перед реальной работой: clean:demo"
fi

echo ""
echo "==> Фронтенд"
page=$(curl -sf -m 10 http://127.0.0.1/ 2>/dev/null || true)
case "$page" in
  *'<div id="root"'*|*'<div id=root'*) ok "страница отдаётся" ;;
  '') bad "главная страница не отвечает" ;;
  *) warn "главная отвечает, но содержимое неожиданное" ;;
esac
# Заголовок против устаревшего кэша: index.html не должен кэшироваться,
# иначе после деплоя браузеры показывают старую версию (уже наступали)
cc=$(curl -sfI -m 10 http://127.0.0.1/ 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control" {print $2}')
case "$cc" in
  *no-cache*|*no-store*) ok "index.html не кэшируется (Cache-Control: $cc)" ;;
  '') bad "у index.html нет Cache-Control — после деплоя браузеры будут держать старую версию" ;;
  *) bad "index.html кэшируется (Cache-Control: $cc) — после деплоя возможна старая версия" ;;
esac

echo ""
echo "==> Резервные копии"
latest=$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1)
if [ -z "$latest" ]; then
  bad "в $BACKUP_DIR нет ни одной копии"
else
  size=$(wc -c < "$latest")
  age_h=$(( ( $(date +%s) - $(date -r "$latest" +%s) ) / 3600 ))
  head5=$(head -c 5 "$latest")
  if [ "$head5" = "PGDMP" ] && [ "$size" -gt 1024 ]; then
    ok "свежая копия: $(basename "$latest") ($((size/1024)) КБ, ${age_h} ч назад)"
  else
    bad "последняя копия повреждена: $(basename "$latest") (${size} байт, заголовок «$head5»)"
  fi
  if [ "$age_h" -gt 26 ]; then bad "копия старше суток (${age_h} ч) — таймер не отработал"; fi
  total=$(ls "$BACKUP_DIR"/*.dump 2>/dev/null | wc -l)
  ok "всего копий: $total"
fi
if systemctl is-active --quiet ithona-backup.timer 2>/dev/null; then
  nextrun=$(systemctl list-timers ithona-backup.timer --no-pager 2>/dev/null | awk 'NR==2 {print $1" "$2" "$3}')
  ok "таймер копий включён (следующий запуск: ${nextrun:-см. systemctl list-timers})"
else
  bad "таймер ithona-backup.timer не активен — копии не снимаются"
fi

echo ""
echo "==> Сервер"
if nginx -t >/dev/null 2>&1 && systemctl is-active --quiet nginx 2>/dev/null; then
  ok "nginx работает, конфигурация корректна"
else
  bad "nginx: проблема (nginx -t или служба)"
fi
disk=$(df -P /opt | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ -n "$disk" ] && [ "$disk" -lt 85 ] 2>/dev/null; then
  ok "диск: занято ${disk}%"
elif [ -n "$disk" ]; then
  bad "диск: занято ${disk}% — место кончается, копии и база под угрозой"
else
  warn "не удалось определить занятость диска"
fi
if systemctl is-active --quiet fail2ban 2>/dev/null; then ok "fail2ban защищает SSH"; else warn "fail2ban не активен"; fi

echo ""
echo "─────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo "ИТОГ: всё в порядке ($PASS проверок пройдено$( [ "$WARN" -gt 0 ] && echo ", предупреждений: $WARN" ))."
else
  echo "ИТОГ: провалено проверок: $FAIL (пройдено $PASS). Смотрите строки с ✗ выше."
fi
echo ""
exit $( [ "$FAIL" -eq 0 ] && echo 0 || echo 1 )
