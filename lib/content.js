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
  // Галереї карток товару: admin ДОДАЄ фото. Для кожного типу — звичайне фото
  // та окреме «з гумовим покриттям» (показується в окні замовлення при виборі покриття).
  galleries: {
    standard: ['images/supp-standard-1.png'],
    standard_coated: [],
    integrated: ['images/supp-standard-1.png'],
    integrated_coated: []
  },
  // Наявність за КОМБІНАЦІЄЮ параметрів: ключ "type|caliber|thread|coating" -> кількість.
  // Порожньо = «немає в наявності» (виготовлення під замовлення).
  stock: {}
};

const PRODUCTS = ['standard', 'integrated'];
const GALLERY_KEYS = ['standard', 'standard_coated', 'integrated', 'integrated_coated'];
const MAX_GALLERY = 12;
const STOCK_SEP = '|';

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
    for (const k of GALLERY_KEYS) {
      if (Array.isArray(saved.galleries[k])) {
        out.galleries[k] = saved.galleries[k].filter((x) => typeof x === 'string' && x).slice(0, MAX_GALLERY);
      }
    }
  }
  if (saved.stock && typeof saved.stock === 'object') {
    out.stock = {};
    for (const key of Object.keys(saved.stock)) {
      const q = parseInt(saved.stock[key], 10);
      if (key && Number.isFinite(q) && q > 0) out.stock[key] = Math.min(9999, q);
    }
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

/* ---- Галереї карток товару (додавання/видалення фото за ключем галереї) ---- */
function addGalleryPhoto(key, relPath) {
  if (GALLERY_KEYS.indexOf(key) < 0) throw new Error('Невідома галерея');
  const saved = readRaw();
  const cur = getContent().galleries[key];   // поточний (з дефолтами)
  if (cur.length >= MAX_GALLERY) throw new Error('Досягнуто ліміт фото (' + MAX_GALLERY + ')');
  const next = cur.concat([String(relPath)]);
  saved.galleries = Object.assign({}, saved.galleries);
  saved.galleries[key] = next;
  writeRaw(saved);
  return next;
}
// повертає { gallery, removed } — removed використовується сервером для видалення файлу
function removeGalleryPhoto(key, index) {
  if (GALLERY_KEYS.indexOf(key) < 0) throw new Error('Невідома галерея');
  const saved = readRaw();
  const cur = getContent().galleries[key].slice();
  const i = parseInt(index, 10);
  if (!(i >= 0 && i < cur.length)) throw new Error('Невірний індекс фото');
  const removed = cur.splice(i, 1)[0];
  saved.galleries = Object.assign({}, saved.galleries);
  saved.galleries[key] = cur;
  writeRaw(saved);
  return { gallery: cur, removed: removed };
}

/* ---- Наявність за комбінацією параметрів ---- */
function stockKey(type, caliber, thread, coating) {
  return [type, caliber, thread, coating].map((s) => cleanText(s, 60)).join(STOCK_SEP);
}
// qty > 0 — додати/оновити; qty <= 0 — прибрати запис
function setStock(type, caliber, thread, coating, qty) {
  const t = cleanText(type, 60), cal = cleanText(caliber, 60), thr = cleanText(thread, 60), co = cleanText(coating, 60);
  if (!t || !cal || !thr || !co) throw new Error('Неповна комбінація параметрів');
  const key = [t, cal, thr, co].join(STOCK_SEP);
  const q = Math.max(0, Math.min(9999, parseInt(qty, 10) || 0));
  const saved = readRaw();
  saved.stock = Object.assign({}, saved.stock);
  if (q > 0) saved.stock[key] = q; else delete saved.stock[key];
  writeRaw(saved);
  return getContent().stock;
}
function removeStock(key) {
  const saved = readRaw();
  saved.stock = Object.assign({}, saved.stock);
  delete saved.stock[String(key)];
  writeRaw(saved);
  return getContent().stock;
}

module.exports = {
  DEFAULTS, IMAGE_SLOTS, TEXT_KEYS, PRODUCTS, GALLERY_KEYS, MAX_GALLERY, STOCK_SEP,
  getContent, saveTexts, savePrices, saveFaq, setImage, cleanText,
  addGalleryPhoto, removeGalleryPhoto, stockKey, setStock, removeStock
};
