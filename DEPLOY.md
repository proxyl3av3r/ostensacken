# Деплой ostensacken.com (статика через Nginx)

Задача этого этапа — просто поднять лендинг. Backend/админку подключим позже.
Схема: **GitHub-репозиторий → `git clone` на VPS → Nginx отдаёт `public/` → HTTPS через Certbot.**

---

## Часть A. Запушить проект на GitHub (делается локально, на Windows)

> Выполняется один раз. Дальнейшие обновления сайта — просто `git push` отсюда и `git pull` на сервере.

Репозиторий уже создан. Подставь его URL вместо `<REPO_URL>` (например `https://github.com/USER/ostensacken.git`).
Это уже подготовлено скриптом — если делаешь вручную, команды такие:

```bash
cd "C:/Users/klebold/Documents/claude/ostensacken.com"
git init
git add .
git commit -m "Initial: static landing"
git branch -M main
git remote add origin <REPO_URL>
git push -u origin main
```

При `git push` GitHub попросит логин — вставь **Personal Access Token** вместо пароля
(GitHub → Settings → Developer settings → Personal access tokens → Generate, дать право `repo`).

---

## Часть B. Настройка сервера (по SSH, на VPS Ubuntu)

### 1. Зайти на сервер
```bash
ssh root@<IP_СЕРВЕРА>
```

### 2. Вариант «одной командой» (проще)
На сервере:
```bash
# клонируем только чтобы взять скрипт, потом он сам доклонирует всё
git clone <REPO_URL> /var/www/ostensacken
nano /var/www/ostensacken/deploy/setup.sh   # впиши REPO_URL в начало файла, Ctrl+O, Enter, Ctrl+X
bash /var/www/ostensacken/deploy/setup.sh
```
Скрипт сам поставит nginx + certbot, применит конфиг и выпустит HTTPS. После — открой `https://ostensacken.com`.

### 3. Вариант «вручную по шагам» (если хочешь контролировать)

```bash
# 3.1 Пакеты
apt update && apt install -y nginx git certbot python3-certbot-nginx

# 3.2 Клон репозитория
git clone <REPO_URL> /var/www/ostensacken

# 3.3 Nginx-конфиг
cp /var/www/ostensacken/deploy/nginx.conf /etc/nginx/sites-available/ostensacken.com
ln -sf /etc/nginx/sites-available/ostensacken.com /etc/nginx/sites-enabled/ostensacken.com
rm -f /etc/nginx/sites-enabled/default

# 3.4 Проверка и запуск
nginx -t
systemctl reload nginx

# 3.5 HTTPS (Let's Encrypt). Домен уже должен указывать A-записью на этот сервер!
certbot --nginx -d ostensacken.com -d www.ostensacken.com --redirect -m rishelie2003@gmail.com --agree-tos --non-interactive
```

Проверь: открой `http://ostensacken.com` (должен редиректить на https).

---

## Часть C. Как обновлять сайт потом

**Локально (Windows):** внёс правки → 
```bash
git add . && git commit -m "что изменил" && git push
```

**На сервере:**
```bash
cd /var/www/ostensacken && git pull
```
Nginx подхватит новые файлы сразу (статика, перезапуск не нужен).

---

## Проверки, если что-то не так

| Симптом | Что смотреть |
|---|---|
| Сайт не открывается | `nginx -t` (ошибки конфига), `systemctl status nginx` |
| 404 на всё | правильный ли `root` в конфиге, есть ли `/var/www/ostensacken/public/index.html` |
| Домен не резолвится | DNS A-запись `ostensacken.com` → IP сервера (проверь `ping ostensacken.com`) |
| Certbot падает | домен ещё не указывает на сервер / закрыт порт 80 |
| Firewall | `ufw allow 'Nginx Full'` (если ufw включён) |
