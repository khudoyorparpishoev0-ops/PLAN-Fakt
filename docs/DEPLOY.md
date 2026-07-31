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
В браузере по IP сервера открывается экран входа; интерфейс (админ-панель
или кабинет бухгалтера) определяется ролью учётной записи (ШАГ 2).

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

Пароли из seed — **временные** (`must_change_password = true`): при первом
входе интерфейс потребует их сменить (форсирование входа — на шаге 2 вместе
с авторизацией; форма смены пароля в интерфейсе уже есть). Правила
обновления при повторном seed:

- значение `SEED_PASSWORD_*` изменилось → пароль пользователя обновляется
  (снова помечается временным);
- значение не изменилось → хэш не переписывается;
- пользователь уже сменил пароль в интерфейсе (`password_changed_at`
  заполнен) → seed его пароль **не трогает** и пишет предупреждение.

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

---

# Авторизация (ШАГ 2)

Вход по email/паролю (bcrypt), JWT access (15 мин) + refresh (7 дней), роль в
токене. Интерфейс: admin и director → админ-панель, accountant → кабинет
бухгалтера. Демо-переключатель ролей удалён — вместо него настоящие вход и
выход. Пока `must_change_password = true` (временный пароль из seed), сервер
отвечает 403 `password_change_required` на все защищённые эндпоинты, а
интерфейс форсирует экран смены пароля.

Требование: `JWT_SECRET` в `/opt/app/.env` обязателен (в production без него
backend не стартует). TTL настраиваются `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`
(необязательные).

Эндпоинты: `POST /api/auth/login`, `POST /api/auth/refresh`,
`GET /api/auth/me`, `POST /api/auth/password`, `GET /api/users` (только admin).
Выход — на клиенте (токены удаляются; серверного отзыва токенов нет — при
компрометации сменить JWT_SECRET).

Проверка после деплоя:

```bash
# вход (вернёт токены и пользователя; при временном пароле mustChangePassword=true)
curl -s -X POST http://localhost/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@it-hona.tj","password":"<SEED_PASSWORD_ADMIN>"}'

# чужой эндпоинт возвращает 403: возьмите accessToken бухгалтера и вызовите
curl -s -w '\n%{http_code}\n' http://localhost/api/users -H "Authorization: Bearer <ACCESS_БУХГАЛТЕРА>"
# → {"error":{"code":"forbidden",...}} 403
```

---

# Данные из API (ШАГ 3)

Интерфейс работает на реальных данных БД: кабинет бухгалтера (заявки —
создание/список/удаление черновика, проекты, ставка км), админ-панель
(журнал операций, план-факт, «Требует внимания» с настоящим одобрением,
справочники). Одобрение заявки директором создаёт **плановую операцию
расхода** по проекту (ТЗ, п. 8) — она видна в журнале (тег «План») и в
план-факте.

Эндпоинты (все под JWT; чужая роль получает 403):

| Метод и путь | Кому | Что |
|---|---|---|
| `GET /api/requests?kind=&status=` | бухгалтер (только свои) · директор · админ | список заявок |
| `POST /api/requests` | бухгалтер | создать заявку (сразу «Отправлено») |
| `PATCH /api/requests/:id/status` | директор · админ | `review` / `approved` / `rejected`; одобрение создаёт плановую операцию; одобренная заявка неизменяема |
| `DELETE /api/requests/:id` | бухгалтер (автор) | удалить, только «Черновик» |
| `GET /api/operations` | директор · админ | журнал операций |
| `GET /api/planfact` | директор · админ | строки план-факта (доходы/расходы) |
| `GET /api/projects` | все роли | проекты (метаданные) |
| `GET /api/dictionaries` | директор · админ | статьи, контрагенты, счета, юрлица, товары, услуги |
| `GET /api/settings` | все роли | `{ kmRate }` — ставка компенсации, сомони/км |
| `PATCH /api/settings` | админ | задать ставку: `{"kmRate": 1.5}` |

Деплой той же одной командой `deploy.sh`: миграция
`step3_planfact_display_settings_goods_services` и обновлённый seed
применяются автоматически (`prisma migrate deploy` + `npm run seed`).

Ставка компенсации поездок хранится в БД (`settings.km_rate`, дирам/км),
по умолчанию 0 — поездки показываются в километрах. Задать (пример 1,50
сомони/км):

```bash
curl -s -X PATCH http://localhost/api/settings -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <ACCESS_АДМИНА>" -d '{"kmRate":1.5}'
```

Сквозной сценарий приёмки (ТЗ, п. 11) — проверить в браузере:

1. Войти бухгалтером → «Заявки на оплату» → заполнить форму → отправить
   (появится в «МОИ ПОСЛЕДНИЕ ЗАЯВКИ» со статусом «Отправлено»).
2. Выйти, войти директором → «Показатели» → «Требует внимания» →
   «Ждёт вашего согласования … заявка З-NNN» → «Согласовать».
3. «Операции»: появилась строка «Заявка З-NNN · …» с тегом «План»;
   «План-Факт»: категория заявки в блоке расходов.
4. Снова бухгалтером: у заявки решение «Одобрено».

---

# Периоды, фильтры и справочники (завершение этапа 1)

- `GET /api/planfact?from=YYYY-MM-DD&to=YYYY-MM-DD` — план-факт за период
  плюс блок `metrics`: остатки касс и счетов, ожидаемые поступления,
  предстоящие выплаты, свободный остаток, кассовый разрыв, дебиторская и
  кредиторская задолженность с просрочкой, перерасход, экономия, прогноз,
  прибыль прошлого периода. Карточки «Деньги» и «Задолженности» на
  «Показателях» больше не константы.
- Переключатель «День / Неделя / Месяц / Квартал / Год» в интерфейсе
  фильтрует данные; по умолчанию — «Год» (см. `docs/CABINET_DIFF.md`).
- Справочники: `POST /api/dictionaries/:kind`,
  `PATCH /api/dictionaries/:kind/:id`, `DELETE /api/dictionaries/:kind/:id`,
  где `:kind` = `counterparty | account | entity | good | service | article`.
  Системные статьи и записи, на которые ссылаются операции, удалить нельзя —
  сервер отвечает 422 с пояснением (ТЗ, п. 8).
- Проекты: `POST /api/projects` (создание), `PATCH /api/projects/:id`
  (карточка и/или архив). В интерфейсе — «+ Проект» и «Редактировать».
- Заявки: `PATCH /api/requests/:id` — правка автором в статусах «Черновик»
  и «Отклонено», с `resend: true` заявка уходит директору заново
  (в кабинете — «Исправить и отправить снова» в карточке заявки).

Счета в справочнике получили вид (касса / расчётный счёт) и входящий
остаток — их разбирает seed из подписей вида «Расчётный счёт · остаток
512 600 смн». Для нового счёта вид выбирается в форме.

---

# ШАГИ 4–7: вложения (MinIO), сторнирование, журнал, проекты, Excel, администрирование

## Вложения (ШАГ 4)

Файлы заявок (счёт / фото одометра / чек — JPG/PNG/PDF до 10 МБ) загружаются
в **MinIO** через S3-API: `POST /api/uploads` → ключ → передаётся в
`POST /api/requests`; скачивание — `GET /api/attachments/:id` (бухгалтер —
только свои). Backend сам создаёт бакет при старте. Переменные уже
прописывает `deploy.sh` (`S3_ENDPOINT=http://minio:9000`, `MINIO_*`).
Если `S3_ENDPOINT` не задан — файлы пишутся в каталог `STORAGE_DIR`
(запасной вариант; в docker-контейнере без тома файлы не переживут
пересборку — используйте MinIO).

Имена вложений из seed — заглушки без файлов: интерфейс подскажет
«демо-имя, файла нет». Реальные файлы появляются у новых заявок.

## Сторнирование (ШАГ 4)

`PATCH /api/requests/:id/storno` (директор/админ): плановая операция
гасится обратной записью `req:<номер>:storno` (история в журнале
сохраняется), строка план-факта получает статус «Сторнировано» с планом 0.
В интерфейсе — кнопка «Сторнировать» в карточке строки «План · заявка …»
(экран «Расходы», открывается по клику на строку).

## Журнал операций (ШАГ 5)

- `GET /api/operations` — серверные фильтры (ТЗ, п. 9): `type[]`,
  `confirmed`, `date_from/to`, `account`, `counterparty`, `article`,
  `project`, `amount_min/max`, `q`; пагинация `limit/offset`
  (по умолчанию 50, «Показать ещё» в интерфейсе).
- `POST /api/operations` (админ/директор) — формы «+ Доход» / «+ Расход»:
  без фактической суммы создаётся ПЛАНОВАЯ операция на плановую сумму.

## Проекты и Excel (ШАГ 6)

Суммы проектов считаются из БД (seed заводит «входящие остатки» под данные
примера — см. docs/CABINET_DIFF.md); статусы «Плановый/В работе» — по факту
платежей, «Завершён» — вручную. `GET /api/projects/:id/summary` — сводка
по статьям (в карточке проекта). Архив — `PATCH /api/projects/:id`.
Экспорт: `GET /api/export/report.xlsx` и `GET /api/export/projects.xlsx`
(кнопки «Excel» на экранах «План-Факт» и «Проекты»).

## Администрирование (ШАГ 7)

- «Настройки → Пользователи» (только админ): создание с временным паролем
  (показывается один раз), блокировка/разблокировка
  (`GET/POST /api/users`, `PATCH /api/users/:id`).
- «Настройки → Общие настройки»: ставка компенсации км (PATCH /api/settings).
- «Настройки → Курсы валют»: `GET/POST /api/rates` — курс к TJS на дату;
  используется при одобрении валютных заявок и вводе операций.
- «Настройки → История действий» (только админ): аудит-лог `GET /api/audit`.
- «Настройки → Мой профиль»: смена пароля.

Проверка после деплоя (дополнительно к сценарию выше):

```bash
# вложение: загрузить и скачать (токен бухгалтера)
curl -s -X POST http://localhost/api/uploads -H "Authorization: Bearer <ACCESS>" \
  -F "file=@чек.jpg;type=image/jpeg"          # → {"key":"attachments/...", ...}
# Excel открывается без ошибок (критерий приёмки)
curl -s -o план-факт.xlsx http://localhost/api/export/report.xlsx -H "Authorization: Bearer <ACCESS_ДИРЕКТОРА>"
```

---

# ЭТАП 2: задачи, планирование, закупки, склад, клиенты, уведомления

Пункты меню «Задачи», «Планирование», «Склад» и «Клиенты» перестали быть
заглушками, а «Закупки» переехали с фикстур прототипа на реальные данные.

## Задачи

- `GET /api/tasks?status=&project=&assignee=` — список; бухгалтер **всегда**
  видит только назначенные ему задачи (параметр `assignee` игнорируется).
- `POST /api/tasks`, `DELETE /api/tasks/:id` — админ и директор.
- `PATCH /api/tasks/:id` — руководители правят карточку целиком, исполнитель
  меняет только статус своей задачи (остальные поля отбрасываются на сервере).
- Статусы: `open` → `in_progress` → `done` (плюс `canceled`).
- Экраны: «Задачи» в админ-панели и «Мои задачи» в кабинете бухгалтера —
  один компонент с разным набором действий по роли.

`GET /api/users/assignees` (админ и директор) — список исполнителей: только
имя и роль, без контактов. Полный `GET /api/users` по-прежнему только у админа.

## Планирование

- `GET /api/plans?period=YYYY-MM` — плановые суммы месяца по паре
  «статья + проект» с подтянутым фактом; `POST /api/plans` — ввод/правка
  (upsert по паре), `DELETE /api/plans/:id` — удаление.
- Это та самая база сравнения для отчёта «План–Факт» (ТЗ, п. 7): после
  правки плана панель и отчёт перечитываются автоматически.

## Закупки (сделки)

- `GET/POST /api/deals`, `PATCH/DELETE /api/deals/:id` — админ и директор.
- Номер выдаётся автоматически: «СД-001», «СД-002»…
- Сумма позиции считается как `кол-во × цена × (1 − скидка/100)`, суммы
  хранятся в дирамах.
- **Завершение сделки** (`status: done`) приходует на склад позиции, у которых
  выбран товар из справочника — по одному движению `in` на позицию с
  комментарием «Приход по сделке СД-XXX». Закрытая сделка не редактируется и
  не удаляется (422 `deal_closed`) — её можно только отменить.

## Склад

- `GET /api/stock` — остатки: сумма приходов минус списания, плюс признак
  `low` (остаток ниже минимального).
- `GET /api/stock/moves?good=` — история движений;
  `POST /api/stock/moves` — приход или списание вручную.
  Списание больше остатка отклоняется: 422 «На складе только N шт».
- `PATCH /api/stock/goods/:id` — артикул, единица, минимальный остаток.
- Входящие остатки заводит seed (движение «Входящий остаток склада»).

## Клиенты

- `GET /api/clients` — контрагенты с оборотами по подтверждённым операциям
  и числом сделок; `PATCH /api/clients/:id` — тип (клиент / поставщик /
  оба), ИНН, телефон, почта, адрес, контактное лицо, комментарий.
- Сам список контрагентов ведётся в «Справочниках» — здесь только карточка.

## Уведомления

`GET /api/notifications` — колокольчик в шапке (и админ-панели, и кабинета).
Состав зависит от роли:

- админ и директор: заявки, ждущие решения; просроченные плановые платежи;
  товары ниже минимального остатка;
- бухгалтер: решения по его заявкам (одобрена / отклонена);
- всем: свои задачи — просроченные и с сегодняшним сроком.

Счётчик на колокольчике — число событий; список перечитывается после
решения по заявке, сторнирования, правки плана и завершения сделки.

Проверка после деплоя:

```bash
# приход по сделке попадает на склад
curl -s -X PATCH http://localhost/api/deals/1 -H "Authorization: Bearer <ACCESS_ДИРЕКТОРА>" \
  -H 'Content-Type: application/json' -d '{"status":"done"}'   # → {"id":1,"closed":true}
curl -s http://localhost/api/stock -H "Authorization: Bearer <ACCESS_ДИРЕКТОРА>"
# бухгалтер не видит закупки, склад и клиентов
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/stock -H "Authorization: Bearer <ACCESS_БУХГАЛТЕРА>"  # → 403
```
