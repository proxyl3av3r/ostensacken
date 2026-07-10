'use strict';

/* ============================================================
   Osten-Sacken — backend
   - віддає статику з ./public
   - POST /api/order: валідація → лист продавцю (Resend) → бекап на диск
   nginx проксіює /api/ сюди (127.0.0.1:PORT), статику віддає сам.
   ============================================================ */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Resend } = require('resend');
const { sellerHtml, sellerText, clientHtml, clientText } = require('./lib/email-template');

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const TO_EMAIL = process.env.TO_EMAIL || '';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const app = express();
app.set('trust proxy', 1);                 // за nginx — коректний IP клієнта
app.use(express.json({ limit: '32kb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

/* ---------- Валідація/санітизація (дзеркалить клієнтську) ---------- */
// прибираємо керуючі/невидимі символи (C0 та C1)
function clean(s) {
  s = String(s == null ? "" : s);
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
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

  // Телефон необовʼязковий; якщо вказаний — має бути валідним UA-форматом
  let phone = '';
  if (phoneDigits) {
    const phoneOk =
      (phoneDigits.length === 12 && phoneDigits.startsWith('380')) ||
      (phoneDigits.length === 11 && phoneDigits.startsWith('80')) ||
      (phoneDigits.length === 10 && phoneDigits.startsWith('0'));
    if (!phoneOk) return { error: 'Некоректний номер телефону' };
    let d = phoneDigits;
    if (d.length === 10) d = '38' + d;       // 0XXXXXXXXX → 380XXXXXXXXX
    else if (d.length === 11) d = '3' + d;   // 80XXXXXXXXX → 380XXXXXXXXX
    phone = '+' + d;
  }

  if (emailRaw.length > 60 || !EMAIL_RE.test(emailRaw)) return { error: 'Некоректна пошта' };

  const cap = (s, n) => clean(s).slice(0, n);

  // Замовлення (структуровані дані з модалки) чи звернення (форма «питання»)?
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
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;           // 10 хв
  const max = 5;                             // до 5 звернень з IP
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}
setInterval(() => {                          // прибирання старих записів
  const now = Date.now();
  for (const [ip, arr] of hits) {
    const keep = arr.filter((t) => now - t < 10 * 60 * 1000);
    if (keep.length) hits.set(ip, keep); else hits.delete(ip);
  }
}, 15 * 60 * 1000).unref();

/* ---------- Бекап замовлення на диск (щоб нічого не втратити) ---------- */
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

/* ---------- Health ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, resend: !!resend, to: !!TO_EMAIL });
});

/* ---------- Прийом замовлення ---------- */
app.post('/api/order', async (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: 'Забагато звернень. Спробуйте трохи згодом.' });
  }

  const v = validate(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const data = v.data;

  // Завжди зберігаємо копію (навіть якщо лист не піде)
  saveOrder({ at: new Date().toISOString(), ip: req.ip, ...data });

  if (!resend || !TO_EMAIL) {
    console.error('[order] Resend не налаштований (RESEND_API_KEY / TO_EMAIL). Замовлення збережено на диск.');
    return res.status(503).json({ error: 'Тимчасово не вдалося надіслати. Зателефонуйте нам, будь ласка.' });
  }

  const isOrder = data.kind === 'order';
  try {
    // 1) лист продавцю (головний — від нього залежить success)
    const seller = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: data.email,
      subject: isOrder ? 'Нове замовлення з сайту Osten-Sacken' : 'Нове звернення з сайту Osten-Sacken',
      html: sellerHtml(data),
      text: sellerText(data)
    });
    if (seller.error) throw new Error(seller.error.message || 'Resend error');

    // 2) лист-підтвердження клієнту (best-effort — не валимо запит, якщо не піде)
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

/* ---------- Статика (fallback; на проді її віддає nginx) ---------- */
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log('Osten-Sacken server on http://127.0.0.1:' + PORT +
    '  (resend: ' + (!!resend) + ', to: ' + (TO_EMAIL || '—') + ')');
});
