#!/usr/bin/env bash
# ============================================================
#  Первичная настройка сервера для ostensacken.com
#  (статика + Node-бэкенд для приёма заказов на почту)
#  Запускать на СВЕЖЕМ Ubuntu-сервере от root:
#     bash /var/www/ostensacken/deploy/setup.sh
#  ВАЖНО: перед запуском создай и заполни .env (см. .env.example).
# ============================================================
set -euo pipefail

# --- НАСТРОЙКИ ---
REPO_URL="https://github.com/proxyl3av3r/ostensacken.git"
DOMAIN="ostensacken.com"
APP_DIR="/var/www/ostensacken"
CERTBOT_EMAIL="rishelie2003@gmail.com"
NODE_MAJOR=20
# -----------------

echo ">>> Пакеты: nginx, git, certbot..."
apt-get update -y
apt-get install -y nginx git certbot python3-certbot-nginx curl

echo ">>> Node.js ${NODE_MAJOR} (если ещё не стоит)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v

echo ">>> Репозиторий в $APP_DIR ..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo ">>> Проверка .env ..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "!!! Создан $APP_DIR/.env из шаблона."
  echo "!!! ЗАПОЛНИ его (RESEND_API_KEY, FROM_EMAIL, TO_EMAIL):  nano $APP_DIR/.env"
  echo "!!! Затем запусти этот скрипт ещё раз."
  exit 1
fi

echo ">>> npm install (prod)..."
npm install --omit=dev

echo ">>> PM2: запуск server.js..."
npm install -g pm2
pm2 start server.js --name ostensacken --update-env || pm2 restart ostensacken --update-env
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo ">>> Nginx-конфиг..."
cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl enable nginx

echo ">>> HTTPS (Let's Encrypt)..."
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

echo ""
echo ">>> ГОТОВО. Открой https://$DOMAIN"
echo ">>> Проверка бэкенда:  curl -s http://127.0.0.1:3000/api/health"
