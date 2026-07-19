'use strict';

/* ============================================================
   Osten-Sacken — backend
   - віддає статику з ./public
   - POST /api/order: валідація → лист продавцю (Resend) → бекап на диск
   - GET  /api/content: керований контент лендінга (ціни/FAQ/тексти/фото)
   - /api/admin/*: вхід за паролем + перегляд замовлень + редагування контенту
   nginx проксіює /api/ сюди (127.0.0.1:PORT), статику віддає сам.
   ============================================================ */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Resend } = require('resend');
const { sellerHtml, sellerText, clientHtml, clientText } = require('./lib/email-template');
const content = require('./lib/content');
const { checkPassword, createSessionStore, safeEqualStr } = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TO_EMAIL = process.env.TO_EMAIL || '';
const ADMIN_PW_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_PW_PLAIN = process.env.ADMIN_PASSWORD || '';
const ADMIN_CONFIGURED = !!(ADMIN_PW_HASH || ADMIN_PW_PLAIN);

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const sessions = createSessionStore();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                 // за nginx — коректний IP клієнта

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'images', 'uploads');

/* ---------- Security headers (для всіх відповідей) ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  if (req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/* ---------- Парсери тіла: маленький ліміт скрізь, більший — лише на аплоуд ---------- */
const jsonBig = express.json({ limit: '12mb' });   // base64 6 МБ зображення ≈ 8 МБ + запас
const jsonSmall = express.json({ limit: '32kb' });
const BIG_BODY_PATHS = ['/api/admin/upload', '/api/admin/gallery/add'];
app.use((req, res, next) => (BIG_BODY_PATHS.indexOf(req.path) >= 0 ? jsonBig : jsonSmall)(req, res, next));

/* ---------- Валідація/санітизація замовлення (дзеркалить клієнтську) ---------- */
function clean(s) {
  s = String(s == null ? '' : s);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 32 && c !== 9 && c !== 10) || (c >= 127 && c <= 159)) continue;  // керуючі, крім tab/переносу
    out += s.charAt(i);
  }
  return out.trim();
}
const NAME_RE = /^[A-Za-zА-Яа-яІіЇїЄєҐґ'’ \-]{2,40}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function validate(body) {
  const name = clean(body && body.name);
  const emailRaw = clean(body && body.email);
  const phoneDigits = String((body && body.phone) || '').replace(/\D/g, '');

  if (!NAME_RE.test(name)) return { error: 'Некоректне імʼя' };

  let phone = '';
  if (phoneDigits) {
    const phoneOk =
      (phoneDigits.length === 12 && phoneDigits.startsWith('380')) ||
      (phoneDigits.length === 11 && phoneDigits.startsWith('80')) ||
      (phoneDigits.length === 10 && phoneDigits.startsWith('0'));
    if (!phoneOk) return { error: 'Некоректний номер телефону' };
    let d = phoneDigits;
    if (d.length === 10) d = '38' + d;
    else if (d.length === 11) d = '3' + d;
    phone = '+' + d;
  }

  if (emailRaw.length > 60 || !EMAIL_RE.test(emailRaw)) return { error: 'Некоректна пошта' };

  const cap = (s, n) => clean(s).slice(0, n);

  const rawOrder = body && body.order;
  if (rawOrder && typeof rawOrder === 'object') {
    const order = {
      type: cap(rawOrder.type, 40),
      caliber: cap(rawOrder.caliber, 30),
      thread: cap(rawOrder.thread, 30),
      coating: rawOrder.coating === 'Так' ? 'Так' : 'Ні',
      qty: Math.max(1, Math.min(99, parseInt(rawOrder.qty, 10) || 1))
    };
    if (!order.type || !order.caliber || !order.thread) return { error: 'Неповні дані замовлення' };
    return { data: { kind: 'order', name, phone, email: emailRaw, order, note: cap(body.note, 1000) } };
  }

  const question = cap(body && body.question, 1200);
  if (!question) return { error: 'Некоректне повідомлення' };
  return { data: { kind: 'question', name, phone, email: emailRaw, question } };
}

/* ---------- Простий rate-limit (in-memory) ---------- */
function makeLimiter(windowMs, max) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
      const keep = arr.filter((t) => now - t < windowMs);
      if (keep.length) hits.set(ip, keep); else hits.delete(ip);
    }
  }, windowMs).unref();
  return function limited(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > max;
  };
}
const orderLimited = makeLimiter(10 * 60 * 1000, 5);   // 5 звернень / 10 хв
const loginLimited = makeLimiter(10 * 60 * 1000, 10);  // 10 спроб входу / 10 хв
const adminWriteLimited = makeLimiter(10 * 60 * 1000, 120); // адмін-мутації

/* ---------- Бекап замовлення на диск ---------- */
function saveOrder(record) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    let list = [];
    if (fs.existsSync(ORDERS_FILE)) {
      try { list = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) || []; } catch (_) { list = []; }
    }
    list.push(record);
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('[orders] не вдалося зберегти на диск:', e.message);
  }
}
function readOrders() {
  try { if (fs.existsSync(ORDERS_FILE)) return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) || []; } catch (_) {}
  return [];
}

/* ---------- Health ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, resend: !!resend, to: !!TO_EMAIL, admin: ADMIN_CONFIGURED });
});

/* ---------- Публічний контент лендінга ---------- */
app.get('/api/content', (req, res) => {
  res.json(content.getContent());
});

/* ---------- Прийом замовлення ---------- */
app.post('/api/order', async (req, res) => {
  if (orderLimited(req.ip)) {
    return res.status(429).json({ error: 'Забагато звернень. Спробуйте трохи згодом.' });
  }

  const v = validate(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const data = v.data;

  saveOrder({ at: new Date().toISOString(), ip: req.ip, ...data });

  if (!resend || !TO_EMAIL) {
    console.error('[order] Resend не налаштований. Замовлення збережено на диск.');
    return res.status(503).json({ error: 'Тимчасово не вдалося надіслати. Зателефонуйте нам, будь ласка.' });
  }

  const isOrder = data.kind === 'order';
  try {
    const seller = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: data.email,
      subject: isOrder ? 'Нове замовлення з сайту Osten-Sacken' : 'Нове звернення з сайту Osten-Sacken',
      html: sellerHtml(data),
      text: sellerText(data)
    });
    if (seller.error) throw new Error(seller.error.message || 'Resend error');

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        replyTo: TO_EMAIL,
        subject: isOrder ? 'Ваше замовлення прийнято — Osten-Sacken' : 'Ми отримали ваше звернення — Osten-Sacken',
        html: clientHtml(data),
        text: clientText(data)
      });
    } catch (e2) {
      console.error('[order] лист клієнту не надіслано:', e2 && e2.message);
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('[order] помилка надсилання:', e.message);
    return res.status(502).json({ error: 'Не вдалося надіслати лист. Зателефонуйте нам, будь ласка.' });
  }
});

/* =====================================================================
   АДМІН-ПАНЕЛЬ (/api/admin)
   ===================================================================== */
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('='); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentSession(req) {
  const c = parseCookies(req);
  return sessions.get(c.os_admin);
}
function requireAdmin(req, res, next) {
  const s = currentSession(req);
  if (!s) return res.status(401).json({ error: 'Не авторизовано' });
  req.session = s;
  next();
}
// CSRF (double-submit): заголовок має збігатися з токеном сесії
function requireCsrf(req, res, next) {
  if (adminWriteLimited(req.ip)) return res.status(429).json({ error: 'Забагато запитів.' });
  const hdr = req.headers['x-csrf-token'];
  if (!hdr || !req.session || !safeEqualStr(hdr, req.session.csrf)) {
    return res.status(403).json({ error: 'CSRF-перевірка не пройдена' });
  }
  next();
}
function setSessionCookies(req, res, sid, csrf) {
  const secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  const maxAge = Math.floor(sessions.ttlMs / 1000);
  res.setHeader('Set-Cookie', [
    'os_admin=' + sid + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + maxAge + secure,
    'os_csrf=' + csrf + '; Path=/; SameSite=Lax; Max-Age=' + maxAge + secure
  ]);
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_CONFIGURED) return res.status(503).json({ error: 'Адмінку не налаштовано (ADMIN_PASSWORD_HASH у .env)' });
  if (loginLimited(req.ip)) return res.status(429).json({ error: 'Забагато спроб. Спробуйте пізніше.' });
  const pw = String((req.body && req.body.password) || '');
  if (!checkPassword(pw, { hash: ADMIN_PW_HASH, plain: ADMIN_PW_PLAIN })) {
    return res.status(401).json({ error: 'Невірний пароль' });
  }
  const { sid, csrf } = sessions.create();
  setSessionCookies(req, res, sid, csrf);
  res.json({ success: true, csrf });
});

app.post('/api/admin/logout', (req, res) => {
  const c = parseCookies(req);
  sessions.destroy(c.os_admin);
  res.setHeader('Set-Cookie', [
    'os_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    'os_csrf=; Path=/; SameSite=Lax; Max-Age=0'
  ]);
  res.json({ success: true });
});

app.get('/api/admin/session', (req, res) => {
  const s = currentSession(req);
  res.json({ authed: !!s, csrf: s ? s.csrf : null });
});

/* --- Замовлення --- */
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const list = readOrders().map((o, i) => Object.assign({ index: i, status: o.status || 'Нове' }, o));
  res.json({ orders: list.reverse() });
});
app.post('/api/admin/order-status', requireAdmin, requireCsrf, (req, res) => {
  const idx = parseInt(req.body && req.body.index, 10);
  const allowed = ['Нове', 'В роботі', 'Виконано', 'Скасовано'];
  const status = String((req.body && req.body.status) || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Невірний статус' });
  const list = readOrders();
  if (!(idx >= 0 && idx < list.length)) return res.status(404).json({ error: 'Замовлення не знайдено' });
  list[idx].status = status;
  try { fs.writeFileSync(ORDERS_FILE, JSON.stringify(list, null, 2)); }
  catch (e) { return res.status(500).json({ error: 'Не вдалося зберегти' }); }
  res.json({ success: true });
});

/* --- Контент: тексти / ціни / FAQ --- */
app.post('/api/admin/content/texts', requireAdmin, requireCsrf, (req, res) => {
  try { res.json({ success: true, texts: content.saveTexts(req.body && req.body.texts) }); }
  catch (e) { res.status(400).json({ error: e.message || 'Помилка збереження' }); }
});
app.post('/api/admin/content/prices', requireAdmin, requireCsrf, (req, res) => {
  try { res.json({ success: true, prices: content.savePrices(req.body && req.body.prices) }); }
  catch (e) { res.status(400).json({ error: e.message || 'Помилка збереження' }); }
});
app.post('/api/admin/content/faq', requireAdmin, requireCsrf, (req, res) => {
  try { res.json({ success: true, faq: content.saveFaq(req.body && req.body.faq) }); }
  catch (e) { res.status(400).json({ error: e.message || 'Помилка збереження' }); }
});

/* --- Завантаження зображення (base64, без сторонніх залежностей) --- */
const IMG_TYPES = {
  'image/png': { ext: 'png', magic: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', magic: (b) => b.length > 12 && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' }
};
const MAX_IMG_BYTES = 6 * 1024 * 1024;

// Декодує data-URL, валідує тип/розмір/сигнатуру. Повертає {buf,ext} або {error}.
function decodeImage(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return { error: 'Некоректні дані зображення' };
  const spec = IMG_TYPES[m[1]];
  if (!spec) return { error: 'Дозволені лише PNG, JPG або WEBP' };
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (_) { return { error: 'Некоректний base64' }; }
  if (!buf.length || buf.length > MAX_IMG_BYTES) return { error: 'Файл завеликий (максимум 6 МБ)' };
  if (!spec.magic(buf)) return { error: 'Вміст файлу не відповідає типу зображення' };
  return { buf: buf, ext: spec.ext };
}
// Зберігає файл у uploads, повертає відносний шлях (images/uploads/...).
function saveImageFile(buf, ext, prefix) {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const safePrefix = String(prefix).replace(/[^a-z0-9\-]/gi, '') || 'img';
  const fname = safePrefix + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
  return 'images/uploads/' + fname;
}
// Видаляє файл, лише якщо він у uploads (не чіпаємо базові ассети репозиторію).
function removeUploadedFile(rel) {
  if (rel && String(rel).indexOf('images/uploads/') === 0) {
    fs.unlink(path.join(PUBLIC_DIR, rel), () => {});
  }
}

// Заміна одиночного зображення (hero/about/калібри тощо)
app.post('/api/admin/upload', requireAdmin, requireCsrf, (req, res) => {
  const slot = String((req.body && req.body.slot) || '');
  if (content.IMAGE_SLOTS.indexOf(slot) < 0) return res.status(400).json({ error: 'Невідомий слот' });
  const dec = decodeImage(req.body && req.body.dataUrl);
  if (dec.error) return res.status(400).json({ error: dec.error });
  try {
    const prev = content.getContent().images[slot];
    const rel = saveImageFile(dec.buf, dec.ext, slot);
    content.setImage(slot, rel);
    if (prev !== rel) removeUploadedFile(prev);
    res.json({ success: true, slot, path: rel });
  } catch (e) {
    console.error('[upload] помилка:', e.message);
    res.status(500).json({ error: 'Не вдалося зберегти файл' });
  }
});

// Галерея карток товару: ДОДАТИ фото (key = standard|standard_coated|integrated|integrated_coated)
app.post('/api/admin/gallery/add', requireAdmin, requireCsrf, (req, res) => {
  const key = String((req.body && req.body.key) || '');
  if (content.GALLERY_KEYS.indexOf(key) < 0) return res.status(400).json({ error: 'Невідома галерея' });
  const dec = decodeImage(req.body && req.body.dataUrl);
  if (dec.error) return res.status(400).json({ error: dec.error });
  try {
    const rel = saveImageFile(dec.buf, dec.ext, 'prod-' + key);
    const gallery = content.addGalleryPhoto(key, rel);
    res.json({ success: true, key: key, gallery: gallery });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Не вдалося додати' });
  }
});

// Галерея карток товару: ВИДАЛИТИ фото за індексом
app.post('/api/admin/gallery/remove', requireAdmin, requireCsrf, (req, res) => {
  const key = String((req.body && req.body.key) || '');
  if (content.GALLERY_KEYS.indexOf(key) < 0) return res.status(400).json({ error: 'Невідома галерея' });
  try {
    const out = content.removeGalleryPhoto(key, req.body && req.body.index);
    removeUploadedFile(out.removed);
    res.json({ success: true, key: key, gallery: out.gallery });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Не вдалося видалити' });
  }
});

// Наявність за комбінацією: встановити кількість (qty<=0 — прибрати)
app.post('/api/admin/stock/set', requireAdmin, requireCsrf, (req, res) => {
  const b = req.body || {};
  try {
    const stock = content.setStock(b.type, b.caliber, b.thread, b.coating, b.qty);
    res.json({ success: true, stock: stock });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Не вдалося зберегти' });
  }
});
// Наявність: прибрати запис за ключем
app.post('/api/admin/stock/remove', requireAdmin, requireCsrf, (req, res) => {
  try {
    const stock = content.removeStock((req.body && req.body.key) || '');
    res.json({ success: true, stock: stock });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Не вдалося видалити' });
  }
});

/* ---------- Статика (fallback; на проді її віддає nginx) ---------- */
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log('Osten-Sacken server on http://127.0.0.1:' + PORT +
    '  (resend: ' + (!!resend) + ', to: ' + (TO_EMAIL || '—') + ', admin: ' + ADMIN_CONFIGURED + ')');
});
