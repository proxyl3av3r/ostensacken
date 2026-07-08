#!/usr/bin/env bash
# ============================================================
#  Первичная настройка сервера для ostensacken.com (статика)
#  Запускать на СВЕЖЕМ Ubuntu-сервере от root:
#     bash setup.sh
#  Перед запуском поправь REPO_URL ниже на свой репозиторий.
# ============================================================
set -euo pipefail

# --- НАСТРОЙКИ (поправь при необходимости) ---
REPO_URL="https://github.com/proxyl3av3r/ostensacken.git"
DOMAIN="ostensacken.com"
APP_DIR="/var/www/ostensacken"
CERTBOT_EMAIL="rishelie2003@gmail.com"          # почта для Let's Encrypt
# ---------------------------------------------

echo ">>> Обновляю пакеты и ставлю nginx, git, certbot..."
apt-get update -y
apt-get install -y nginx git certbot python3-certbot-nginx

echo ">>> Клонирую (или обновляю) репозиторий в $APP_DIR ..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

echo ">>> Ставлю nginx-конфиг..."
cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
# отключаем дефолтный сайт, чтобы не мешал
rm -f /etc/nginx/sites-enabled/default

echo ">>> Проверяю конфиг и перезагружаю nginx..."
nginx -t
systemctl reload nginx
systemctl enable nginx

echo ">>> Выпускаю HTTPS-сертификат (Let's Encrypt)..."
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect

echo ""
echo ">>> ГОТОВО. Открой https://$DOMAIN"
