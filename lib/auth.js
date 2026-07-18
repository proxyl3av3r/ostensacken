'use strict';

/* ============================================================
   Osten-Sacken — автентифікація адмінки
   - Пароль зберігається як scrypt-хеш (ADMIN_PASSWORD_HASH) або, для
     зворотної сумісності, як відкритий ADMIN_PASSWORD (не рекомендовано).
   - Сесії — серверні (in-memory), cookie містить лише випадковий id.
     Тому logout реально інвалідовує сесію, а пароль ніде не «зашитий» у токен.
   - CSRF — double-submit: окремий не-HttpOnly токен, який клієнт шле
     заголовком X-CSRF-Token на мутуючі запити.
   ============================================================ */

const crypto = require('crypto');

/* ---------- Пароль ---------- */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex');
}

function verifyHash(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const key = crypto.scryptSync(String(password), salt, expected.length, SCRYPT_PARAMS);
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (_) {
    return false;
  }
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // порівняння сталого часу навіть за різної довжини
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/* Перевірка введеного пароля проти конфігурації.
   Пріоритет — хеш; якщо хеша немає, падаємо на відкритий пароль. */
function checkPassword(input, cfg) {
  if (cfg.hash) return verifyHash(input, cfg.hash);
  if (cfg.plain) return safeEqualStr(input, cfg.plain);
  return false;
}

/* ---------- Серверні сесії ---------- */
function createSessionStore(ttlMs) {
  const TTL = ttlMs || 7 * 24 * 60 * 60 * 1000; // 7 днів
  const sessions = new Map(); // sid -> { csrf, exp }

  function create() {
    const sid = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(32).toString('hex');
    sessions.set(sid, { csrf, exp: Date.now() + TTL });
    return { sid, csrf };
  }
  function get(sid) {
    if (!sid) return null;
    const s = sessions.get(sid);
    if (!s) return null;
    if (s.exp < Date.now()) { sessions.delete(sid); return null; }
    return s;
  }
  function destroy(sid) { if (sid) sessions.delete(sid); }
  function sweep() {
    const now = Date.now();
    for (const [sid, s] of sessions) if (s.exp < now) sessions.delete(sid);
  }
  setInterval(sweep, 60 * 60 * 1000).unref();

  return { create, get, destroy, ttlMs: TTL };
}

module.exports = { hashPassword, verifyHash, safeEqualStr, checkPassword, createSessionStore };
