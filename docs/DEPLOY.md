# Выкладка фронтенда IT-HONA «Финансы План-Факт» (ШАГ 0)

Целевой сервер: Ubuntu 22.04, установлены Docker / Docker Compose, PostgreSQL 16
и MinIO уже запущены; существуют `/opt/app/docker-compose.yml` и `/opt/app/.env`.
Все команды выполняются на сервере от пользователя с правами sudo.
Единственная подстановка — домен в разделах 3 и 5 (пока домена нет, работаем по IP).

---

## Быстрый путь — одна команда (`deploy.sh`)

Скрипт `deploy.sh` в корне репозитория разворачивает ВЕСЬ стек (фронтенд +
бэкенд + БД-миграции) сам:

- ставит git/nginx/curl при отсутствии, проверяет Docker;
- клонирует или обновляет `/opt/app/app`;
- дописывает недостающие переменные в `/opt/app/.env` (существующие значения
  не перезаписывает; `DATABASE_URL` собирает из `POSTGRES_*`, недостающие
  секреты — `JWT_SECRET`, `SEED_PASSWORD_*` и т.п. — генерирует);
- дописывает сервисы `backend` и `frontend` в `/opt/app/docker-compose.yml`,
  не трогая существующие postgres/minio (перед правкой делает `.bak`,
  после — проверяет файл через `docker compose config`);
- собирает и поднимает контейнеры, выполняет `prisma migrate deploy` и
  идемпотентный seed;
- настраивает системный nginx (`/` → :8080, `/api/` → :3000) и проверяет
  `http://localhost/` и `http://localhost/api/health`.

Идемпотентен — повторный запуск обновляет развёрнутое, дублей не создаёт.

Если репозиторий доступен серверу напрямую (публичный или с настроенным доступом):

```bash
sudo sh -c "$(curl -fsSL https://raw.githubusercontent.com/khudoyorparpishoev0-ops/PLAN-Fakt/refs/heads/claude/design-handoff-implementation-3okq4o/deploy.sh)"
```

Либо скопируйте один файл `deploy.sh` на сервер любым способом (scp и т.п.) и:

```bash
sudo sh deploy.sh
```

Параметры (по умолчанию — текущий репозиторий и ветка
`claude/design-handoff-implementation-3okq4o`); для приватного репозитория
передайте URL с токеном:

```bash
sudo sh deploy.sh https://<TOKEN>@github.com/khudoyorparpishoev0-ops/PLAN-Fakt.git claude/design-handoff-implementation-3okq4o
```

Успешное завершение печатает: `ГОТОВО, откройте http://<IP>/`.
При ошибке скрипт называет шаг, на котором остановился, и команды диагностики.

---

## Подробные шаги (запасной вариант, вручную)

## 1. Клонирование репозитория

```bash
sudo mkdir -p /opt/app
cd /opt/app
git clone https://github.com/khudoyorparpishoev0-ops/PLAN-Fakt.git app
cd /opt/app/app
git checkout claude/design-handoff-implementation-3okq4o
```

Обновление до свежей версии в дальнейшем:

```bash
cd /opt/app/app && git pull
```

## 2. Сборка и запуск контейнера фронтенда

```bash
cd /opt/app/app
docker compose -f docker-compose.frontend.yml up -d --build
```

Проверка, что контейнер поднялся и отвечает локально:

```bash
docker ps --filter name=it-hona-frontend
curl -I http://127.0.0.1:8080/
```

Ожидаемо: контейнер в статусе `Up`, ответ `HTTP/1.1 200 OK`.

Пересборка после обновления кода:

```bash
cd /opt/app/app && git pull && docker compose -f docker-compose.frontend.yml up -d --build
```

## 3. Системный nginx (проксирование на контейнер)

Шаблон `server-setup/03_nginx/crm.conf.example` в репозитории отсутствует —
конфиг приведён целиком ниже. Создать файл:

```bash
sudo tee /etc/nginx/sites-available/crm.conf > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    # Пока домена нет — ловим все обращения по IP; после выпуска домена
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

    # Задел под backend (шаг 1): начнёт работать после запуска сервиса на :3000
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
```

Включить сайт и перечитать конфигурацию:

```bash
sudo ln -sf /etc/nginx/sites-available/crm.conf /etc/nginx/sites-enabled/crm.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Проверка

```bash
curl -I http://localhost/
```

Ожидаемо: `HTTP/1.1 200 OK` (отдаёт index.html приложения через прокси).
В браузере по IP сервера должна открыться админ-панель «Финансы План-Факт»;
переключатель ролей в шапке ведёт в кабинет бухгалтера (`#/cabinet`).

## 5. Сертификат TLS — выполнить позже, когда появится домен

> Раздел отложен: домена ещё нет. После делегирования домена на IP сервера:

```bash
# 1) вписать домен в server_name в /etc/nginx/sites-available/crm.conf
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.example.tj   # подставить реальный домен
sudo systemctl reload nginx
```

Certbot сам добавит 443-блок и редирект с http. Автопродление проверяется:

```bash
sudo certbot renew --dry-run
```

---

# Бэкенд (ШАГ 1): API + PostgreSQL

Бэкенд — NestJS + Prisma, каталог `server/`. Слушает `127.0.0.1:3000`, наружу
не публикуется: системный nginx из раздела 3 уже проксирует `/api/` на
`127.0.0.1:3000`. Использует существующие PostgreSQL и MinIO из
`/opt/app/docker-compose.yml`.

> **Быстрый путь:** всё, что описано ниже (env, сервисы compose, сборка,
> миграции, seed, проверка), автоматически делает `deploy.sh` — см. раздел
> «Быстрый путь» в начале документа. Ручные шаги ниже — запасной вариант
> и справка о том, что именно происходит.

## 1. Переменные окружения

Дополнить `/opt/app/.env` (имена — как в `server/.env.example`; уже существующие
значения не менять):

```bash
# хост postgres = имя сервиса в /opt/app/docker-compose.yml
DATABASE_URL=postgresql://<PG_USER>:<PG_PASSWORD>@postgres:5432/<PG_DB>?schema=public
JWT_SECRET=<случайная строка, понадобится на шаге 2>
TZ=Asia/Dushanbe
# пароли тестовых пользователей для seed (иначе будут сгенерированы и напечатаны)
SEED_PASSWORD_ADMIN=<пароль администратора>
SEED_PASSWORD_DIRECTOR=<пароль директора>
SEED_PASSWORD_ACCOUNTANT=<пароль бухгалтера>
```

## 2. Сервисы в /opt/app/docker-compose.yml

В существующий `/opt/app/docker-compose.yml` (рядом с postgres и minio; там есть
заготовка в комментариях) добавить:

```yaml
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

  frontend:
    build:
      context: /opt/app/app
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8080:80"
    restart: unless-stopped
```

Имя `postgres` в `depends_on` и в `DATABASE_URL` — фактическое имя сервиса
PostgreSQL из вашего compose-файла (подставить, если отличается).

Если фронтенд ранее был запущен скриптом `deploy.sh` (одиночный контейнер
`it-hona-frontend`), перед `docker compose up` удалить его, чтобы не конфликтовал
порт: `docker rm -f it-hona-frontend`.

## 3. Сборка, запуск, миграции, seed

```bash
cd /opt/app/app && git pull
cd /opt/app
docker compose up -d --build backend frontend
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

Seed идемпотентен — можно запускать повторно. Если `SEED_PASSWORD_*` не заданы,
случайные пароли печатаются в вывод один раз — сохраните их.

## 4. Проверка

```bash
curl http://127.0.0.1:3000/api/health
# → {"status":"ok","db":"ok","time":"..."}
curl http://localhost/api/health   # через системный nginx
```

В базе после seed: проекты, учётные статьи, контрагенты, счета, операции и
заявки — те же, что сейчас отображает интерфейс на фикстурах. Быстрая сверка:

```bash
docker compose exec postgres psql -U <PG_USER> -d <PG_DB> -c \
  "SELECT count(*) AS projects FROM projects; SELECT count(*) AS requests FROM requests;"
```

Примечание: фронтенд к API пока не подключён (шаг 3) — интерфейс продолжает
работать на фикстурах; бэкенд отдаёт только `/api/health`.
