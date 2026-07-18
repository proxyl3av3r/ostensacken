'use strict';

/* Генератор хеша пароля для адмінки.
   Використання:  node scripts/hash-password.js "ваш-пароль"
   Результат впишіть у .env як ADMIN_PASSWORD_HASH=... і видаліть ADMIN_PASSWORD. */

const { hashPassword } = require('../lib/auth');

const pw = process.argv[2];
if (!pw) {
  console.error('Вкажіть пароль: node scripts/hash-password.js "ваш-пароль"');
  process.exit(1);
}
if (pw.length < 8) {
  console.error('Пароль закороткий — мінімум 8 символів.');
  process.exit(1);
}
console.log('\nADMIN_PASSWORD_HASH=' + hashPassword(pw) + '\n');
