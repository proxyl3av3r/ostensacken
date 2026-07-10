# Деплой ostensacken.com (статика + Node-бэкенд для заказов на почту)

Схема: **GitHub → `git clone` на VPS → Node/Express (PM2) принимает заявки и шлёт письмо через Resend → Nginx отдаёт статику и проксирует `/api/` на Node → HTTPS (Certbot).**

- Форма на сайте шлёт `POST /api/order` → сервер валидирует, сохраняет копию в `data/orders.json` и отправляет **письмо продавцу** через Resend.
- Заказ со страницы `order.html` попадает в поле «Ваше питання» и уходит тем же письмом.

---

## Часть 0. Resend (почта) — сделать один раз

1. Зарегистрируйся на https://resend.com.
2. **API Keys → Create** → скопируй ключ (`re_...`).
3. Для теста этого достаточно: письма пойдут с `onboarding@resend.dev` и придут **только на почту владельца аккаунта Resend**.
4. Чтобы письма шли с `noreply@ostensacken.com` — **Domains → Add domain `ostensacken.com`**, добавь показанные DNS-записи (SPF/DKIM) у регистратора, дождись Verified. Тогда в `.env` поставь `FROM_EMAIL=Osten-Sacken <noreply@ostensacken.com>`.

---

## Часть A. Пуш на GitHub (локально, Windows) — уже настроено

Репозиторий: `https://github.com/proxyl3av3r/ostensacken.git`. Обновления:
```bash
cd "C:/Users/klebold/Documents/claude/ostensacken.com"
git add . && git commit -m "что изменил" && git push
```

---

## Часть B. Первый деплой на сервере (Ubuntu, по SSH)

```bash
ssh root@<IP_СЕРВЕРА>

# 1. Клонируем репозиторий
git clone https://github.com/proxyl3av3r/ostensacken.git /var/www/ostensacken
cd /var/www/ostensacken

# 2. Создаём и заполняем .env (ключ Resend, почты)
cp .env.example .env
nano .env        # впиши RESEND_API_KEY, FROM_EMAIL, TO_EMAIL → Ctrl+O, Enter, Ctrl+X

# 3. Запускаем автоскрипт (Node + PM2 + Nginx + HTTPS)
bash deploy/setup.sh
```

Скрипт: поставит Node 20, nginx, certbot; `npm install`; запустит `server.js` под PM2; применит nginx-конфиг; выпустит HTTPS.
DNS `ostensacken.com` (и `www`) должен уже указывать A-записью на этот сервер — иначе certbot не пройдёт.

После — проверь:
```bash
curl -s http://127.0.0.1:3000/api/health      # {"ok":true,"resend":true,"to":true}
```
и открой **https://ostensacken.com**, отправь тестовую заявку через форму.

### Ручные шаги (если не через скрипт) — кратко
```bash
apt update && apt install -y nginx git certbot python3-certbot-nginx curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
cd /var/www/ostensacken && npm install --omit=dev
npm install -g pm2 && pm2 start server.js --name ostensacken && pm2 save
pm2 startup systemd -u root --hp /root      # выполни команду, которую он напечатает
cp deploy/nginx.conf /etc/nginx/sites-available/ostensacken.com
ln -sf /etc/nginx/sites-available/ostensacken.com /etc/nginx/sites-enabled/ostensacken.com
rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx
certbot --nginx -d ostensacken.com -d www.ostensacken.com --redirect -m rishelie2003@gmail.com --agree-tos --non-interactive
```

---

## Часть C. Обновления потом

**Локально:** `git push`.
**На сервере:**
```bash
cd /var/www/ostensacken
git pull
npm install --omit=dev      # только если менялись зависимости (package.json)
pm2 restart ostensacken     # перечитать код/.env; статика подхватится и без этого
```

Изменил только `.env`? → `pm2 restart ostensacken --update-env`.

---

## Адмін-панель (/admin)

Вхід за паролем, перегляд заявок і зміна статусів. Дані беруться з `data/orders.json`.

1. У `.env` заповни:
   ```
   ADMIN_PASSWORD=<складний пароль>
   SESSION_SECRET=<довгий випадковий рядок>
   ```
   Згенерувати секрет:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Перезапусти: `pm2 restart ostensacken --update-env`
3. Відкрий **https://ostensacken.com/admin**, увійди паролем.

> Cookie httpOnly + SameSite=Lax; на HTTPS додається Secure. Пароль ніде не зберігається у відкритому вигляді (у cookie — HMAC-токен). Спроби входу обмежені (10/10 хв).

---

## Диагностика

| Симптом | Что смотреть |
|---|---|
| Форма пишет «Не вдалося надіслати» | `pm2 logs ostensacken` — ошибка Resend (ключ/FROM_EMAIL/домен) |
| Письмо не приходит | до верификации домена шлёт только на почту владельца Resend; проверь `TO_EMAIL` и спам |
| `/api/*` отдаёт 502 | Node не запущен: `pm2 status`, `pm2 restart ostensacken` |
| Сайт не открывается | `nginx -t`, `systemctl status nginx` |
| Домен не резолвится | A-запись `ostensacken.com` → IP сервера (`ping ostensacken.com`) |
| Заказы (бэкап) | `cat /var/www/ostensacken/data/orders.json` |
| Firewall | `ufw allow 'Nginx Full'` |
