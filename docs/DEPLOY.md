# Выкладка фронтенда IT-HONA «Финансы План-Факт» (ШАГ 0)

Целевой сервер: Ubuntu 22.04, установлены Docker / Docker Compose, PostgreSQL 16
и MinIO уже запущены; существуют `/opt/app/docker-compose.yml` и `/opt/app/.env`.
Все команды выполняются на сервере от пользователя с правами sudo.
Единственная подстановка — домен в разделах 3 и 5 (пока домена нет, работаем по IP).

---

## Быстрый путь — одна команда (`deploy.sh`)

Скрипт `deploy.sh` в корне репозитория делает всё сам: ставит git/nginx при
отсутствии, клонирует или обновляет `/opt/app/app`, собирает образ, перезапускает
контейнер на `127.0.0.1:8080`, настраивает системный nginx и проверяет результат.
Идемпотентен — можно запускать повторно при каждом обновлении.

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
