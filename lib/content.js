'use strict';

/* ============================================================
   Osten-Sacken — керований контент (CMS-шар)
   Джерело правди: data/content.json (створюється при першому збереженні).
   Публічний лендінг гідратується через GET /api/content (див. site.js).
   Дефолти нижче ДЗЕРКАЛЯТЬ поточний index.html — якщо міняєте розмітку,
   синхронізуйте значення тут, щоб при порожньому content.json не було стрибка.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

/* ---- Дефолти (1:1 з index.html) ---- */
const DEFAULTS = {
  texts: {
    hero_subtitle: 'Індивідуальне виготовлення для будь-якого калібру нарізної зброї. Максимальна точність, надійність і бездоганна якість виконання.',
    about_text: 'Ми спеціалізуємося на індивідуальному виготовленні титанових глушників для нарізної зброї. Кожен виріб проєктується відповідно до параметрів зброї та вимог замовника, проходить контроль якості й створюється з акцентом на ефективність, довговічність і бездоганне виконання.',
    email: 'info@ostensacken.com',
    phone: '+380-50-777-0238'
  },
  prices: [
    { cal: '.22 LR', std: '5 000 грн', int: '13 000 грн' },
    { cal: '.223 Rem', std: '8 000 грн', int: '13 000 грн' },
    { cal: '.30 Cal', std: '8 000 грн', int: '13 000 грн' },
    { cal: '.338', std: '9 000 грн', int: '15 000 грн' }
  ],
  faq: [
    { q: 'Чи виготовляєте ви глушники під індивідуальні параметри?', a: 'Так, ми можемо виготовити глушник під конкретний калібр, різьбу та вимоги замовника. Індивідуальні замовлення обговорюються окремо.' },
    { q: 'У чому різниця між стандартним та інтегрованим глушником?', a: 'Стандартний глушник встановлюється на дулову частину зброї, тоді як інтегрований є частиною конструкції ствола і забезпечує більш компактне рішення.' },
    { q: 'З яких матеріалів виготовляються глушники?', a: 'Ми використовуємо високоякісні матеріали, включаючи титан, що забезпечує міцність, легкість та довговічність виробу.' },
    { q: 'Чи підходять глушники для всіх видів нарізної зброї?', a: 'Ми виготовляємо рішення для більшості популярних калібрів. Якщо у вас нестандартна зброя — можливе індивідуальне виробництво.' },
    { q: 'Скільки часу займає виготовлення?', a: 'Термін виробництва залежить від складності замовлення та завантаженості виробництва. Точні строки уточнюються під час оформлення замовлення.' }
  ],
  // slot -> шлях відносно /public (без провідного слешу)
  images: {
    hero: 'images/hero-cutout.png',
    'supp-standard': 'images/supp-standard-1.png',
    about: 'images/about-soldier.png',
    steps: 'images/rifle-cutout.png',
    'ammo-22lr': 'images/ammo-22lr.png',
    'ammo-223': 'images/ammo-223.png',
    'ammo-545': 'images/ammo-545.png',
    'ammo-30': 'images/ammo-30.png',
    'ammo-338': 'images/ammo-338.png',
    footer: 'images/footer-weapon-cutout.png'
  },
  // Галереї карток товару: admin ДОДАЄ фото (не заміна) — карусель будується з цього списку
  galleries: {
    standard: ['images/supp-standard-1.png'],
    integrated: ['images/supp-standard-1.png']
  },
  // Наявність: true = «в наявності», false = «немає». Категорії (типи) + підкатегорії (калібри)
  availability: {
    products: { standard: true, integrated: true },
    calibers: { 'ammo-22lr': true, 'ammo-223': true, 'ammo-545': true, 'ammo-30': true, 'ammo-338': true }
  }
};

const PRODUCTS = ['standard', 'integrated'];
const AVAIL_CALIBERS = ['ammo-22lr', 'ammo-223', 'ammo-545', 'ammo-30', 'ammo-338'];
const MAX_GALLERY = 12;

/* Дозволені ключі — щоб адмінка не могла записати сторонні поля/шляхи */
const IMAGE_SLOTS = Object.keys(DEFAULTS.images);
const TEXT_KEYS = Object.keys(DEFAULTS.texts);

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

/* Санітизація тексту: прибираємо керуючі символи, обрізаємо довжину.
   Значення виводяться на сторінці лише через textContent — тож HTML тут не потрібен. */
function cleanText(s, max) {
  s = String(s == null ? '' : s);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 32 && c !== 9 && c !== 10) || (c >= 127 && c <= 159)) continue;
    out += s.charAt(i);
  }
  out = out.trim();
  return max ? out.slice(0, max) : out;
}

function readRaw() {
  try {
    if (fs.existsSync(CONTENT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.error('[content] не вдалося прочитати content.json:', e.message);
  }
  return {};
}

/* Повний контент = дефолти, поверх яких накладені збережені зміни. */
function getContent() {
  const saved = readRaw();
  const out = deepClone(DEFAULTS);
  if (saved.texts && typeof saved.texts === 'object') {
    for (const k of TEXT_KEYS) if (typeof saved.texts[k] === 'string') out.texts[k] = saved.texts[k];
  }
  if (Array.isArray(saved.prices)) out.prices = saved.prices;
  if (Array.isArray(saved.faq)) out.faq = saved.faq;
  if (saved.images && typeof saved.images === 'object') {
    for (const slot of IMAGE_SLOTS) if (typeof saved.images[slot] === 'string') out.images[slot] = saved.images[slot];
  }
  if (saved.galleries && typeof saved.galleries === 'object') {
    for (const p of PRODUCTS) {
      if (Array.isArray(saved.galleries[p])) {
        out.galleries[p] = saved.galleries[p].filter((x) => typeof x === 'string' && x).slice(0, MAX_GALLERY);
      }
    }
  }
  if (saved.availability && typeof saved.availability === 'object') {
    const sp = saved.availability.products, sc = saved.availability.calibers;
    if (sp && typeof sp === 'object') for (const p of PRODUCTS) if (typeof sp[p] === 'boolean') out.availability.products[p] = sp[p];
    if (sc && typeof sc === 'object') for (const c of AVAIL_CALIBERS) if (typeof sc[c] === 'boolean') out.availability.calibers[c] = sc[c];
  }
  return out;
}

function writeRaw(obj) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(obj, null, 2));
}

/* ---- Оновлення секцій (кожна валідується окремо) ---- */

function saveTexts(input) {
  const saved = readRaw();
  const texts = Object.assign({}, saved.texts);
  if (input && typeof input === 'object') {
    for (const k of TEXT_KEYS) {
      if (typeof input[k] === 'string') texts[k] = cleanText(input[k], 2000);
    }
  }
  saved.texts = texts;
  writeRaw(saved);
  return getContent().texts;
}

function savePrices(list) {
  if (!Array.isArray(list)) throw new Error('prices: очікується масив');
  const clean = list.slice(0, 20).map((r) => ({
    cal: cleanText(r && r.cal, 40),
    std: cleanText(r && r.std, 40),
    int: cleanText(r && r.int, 40)
  })).filter((r) => r.cal);
  const saved = readRaw();
  saved.prices = clean;
  writeRaw(saved);
  return clean;
}

function saveFaq(list) {
  if (!Array.isArray(list)) throw new Error('faq: очікується масив');
  const clean = list.slice(0, 40).map((r) => ({
    q: cleanText(r && r.q, 300),
    a: cleanText(r && r.a, 2000)
  })).filter((r) => r.q && r.a);
  const saved = readRaw();
  saved.faq = clean;
  writeRaw(saved);
  return clean;
}

/* Записати новий шлях для слота зображення (шлях формує сервер після аплоуду). */
function setImage(slot, relPath) {
  if (IMAGE_SLOTS.indexOf(slot) < 0) throw new Error('Невідомий слот зображення');
  const saved = readRaw();
  saved.images = Object.assign({}, saved.images);
  saved.images[slot] = String(relPath);
  writeRaw(saved);
  return getContent().images;
}

/* ---- Галереї карток товару (додавання/видалення фото) ---- */
function getGallery(product) {
  if (PRODUCTS.indexOf(product) < 0) throw new Error('Невідома картка товару');
  return getContent().galleries[product];
}
function addGalleryPhoto(product, relPath) {
  if (PRODUCTS.indexOf(product) < 0) throw new Error('Невідома картка товару');
  const saved = readRaw();
  const cur = getContent().galleries[product];   // поточний (з дефолтами)
  if (cur.length >= MAX_GALLERY) throw new Error('Досягнуто ліміт фото (' + MAX_GALLERY + ')');
  const next = cur.concat([String(relPath)]);
  saved.galleries = Object.assign({}, saved.galleries);
  saved.galleries[product] = next;
  writeRaw(saved);
  return next;
}
// повертає { gallery, removed } — removed використовується сервером для видалення файлу
function removeGalleryPhoto(product, index) {
  if (PRODUCTS.indexOf(product) < 0) throw new Error('Невідома картка товару');
  const saved = readRaw();
  const cur = getContent().galleries[product].slice();
  const i = parseInt(index, 10);
  if (!(i >= 0 && i < cur.length)) throw new Error('Невірний індекс фото');
  const removed = cur.splice(i, 1)[0];
  saved.galleries = Object.assign({}, saved.galleries);
  saved.galleries[product] = cur;
  writeRaw(saved);
  return { gallery: cur, removed: removed };
}

/* ---- Наявність (в наявності / немає) ---- */
function setAvailability(kind, key, value) {
  const list = kind === 'products' ? PRODUCTS : (kind === 'calibers' ? AVAIL_CALIBERS : null);
  if (!list) throw new Error('Невідома категорія наявності');
  if (list.indexOf(key) < 0) throw new Error('Невідомий елемент');
  const saved = readRaw();
  saved.availability = saved.availability || {};
  saved.availability[kind] = Object.assign({}, saved.availability[kind]);
  saved.availability[kind][key] = !!value;
  writeRaw(saved);
  return getContent().availability;
}

module.exports = {
  DEFAULTS, IMAGE_SLOTS, TEXT_KEYS, PRODUCTS, AVAIL_CALIBERS, MAX_GALLERY,
  getContent, saveTexts, savePrices, saveFaq, setImage, cleanText,
  getGallery, addGalleryPhoto, removeGalleryPhoto, setAvailability
};
