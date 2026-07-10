'use strict';

/* Публічні контакти магазину (для листа-підтвердження клієнту) */
var SHOP_EMAIL = process.env.SHOP_EMAIL || 'info@ostensacken.com';
var SHOP_PHONE = process.env.SHOP_PHONE || '+380-50-777-0238';

/* Екранування для безпечної вставки у HTML */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(s) { return esc(s).replace(/\r?\n/g, '<br>'); }
function kyivNow() { return new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }); }

/* Каркас листа (шапка + тіло + підвал) */
function shell(tagline, bodyHtml) {
  return (
'<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
'<body style="margin:0;padding:0;background:#FAF9F6;">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F6;padding:24px 12px;">' +
'<tr><td align="center">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E5E5E5;">' +
'<tr><td style="background:#010203;padding:26px 32px;font-family:Arial,Helvetica,sans-serif;">' +
'<div style="font-size:22px;font-weight:700;letter-spacing:2px;color:#FAF9F6;">OSTEN — SACKEN</div>' +
'<div style="font-size:13px;color:#E31919;margin-top:6px;letter-spacing:1px;">' + esc(tagline) + '</div>' +
'</td></tr>' +
'<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;">' + bodyHtml + '</td></tr>' +
'<tr><td style="padding:16px 32px;background:#F5F5F5;border-top:1px solid #E5E5E5;font-family:Arial,Helvetica,sans-serif;">' +
'<div style="color:#A3A3A3;font-size:12px;">Osten-Sacken · ' + esc(kyivNow()) + ' (Київ)</div>' +
'</td></tr>' +
'</table></td></tr></table></body></html>'
  );
}

/* Заголовок секції */
function h(title) {
  return '<div style="font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#A3A3A3;margin:22px 0 10px;">' + esc(title) + '</div>';
}
/* Таблиця «ключ — значення» */
function kv(rows) {
  var body = rows.filter(Boolean).map(function (r) {
    return '<tr>' +
      '<td style="padding:11px 0;border-bottom:1px solid #EEE;color:#434343;font-size:14px;width:170px;vertical-align:top;">' + esc(r[0]) + '</td>' +
      '<td style="padding:11px 0;border-bottom:1px solid #EEE;color:#010203;font-size:15px;font-weight:600;vertical-align:top;">' + (r[2] ? r[1] : esc(r[1])) + '</td>' +
    '</tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + body + '</table>';
}
/* Блок-цитата (примітка / повідомлення) */
function quote(text) {
  return '<div style="background:#F5F5F5;border-left:3px solid #E31919;padding:14px 16px;color:#010203;font-size:15px;line-height:1.6;white-space:pre-wrap;margin-top:6px;">' + nl2br(text) + '</div>';
}

/* Рядки деталей замовлення */
function orderRows(o) {
  return [
    ['Тип глушника', o.type],
    ['Калібр', o.caliber],
    ['Хід різьби', o.thread],
    ['Гумове покриття', o.coating],
    ['Кількість', String(o.qty)]
  ];
}
function contactRows(d) {
  var phoneDigits = String(d.phone || '').replace(/[^\d+]/g, '');
  return [
    ["Ім'я", esc(d.name), true],
    d.phone ? ['Телефон', '<a href="tel:' + esc(phoneDigits) + '" style="color:#E31919;text-decoration:none;">' + esc(d.phone) + '</a>', true] : null,
    ['Пошта', '<a href="mailto:' + esc(d.email) + '" style="color:#E31919;text-decoration:none;">' + esc(d.email) + '</a>', true]
  ];
}

/* ---------- ЛИСТ ПРОДАВЦЮ ---------- */
function sellerHtml(d) {
  var body;
  if (d.kind === 'order') {
    body = '<p style="margin:0 0 4px;color:#434343;font-size:15px;line-height:1.5;">Нове замовлення з сайту.</p>' +
      h('Деталі замовлення') + kv(orderRows(d.order)) +
      h('Контакт клієнта') + kv(contactRows(d)) +
      (d.note ? (h('Примітка') + quote(d.note)) : '');
  } else {
    body = '<p style="margin:0 0 4px;color:#434343;font-size:15px;line-height:1.5;">Нове звернення з сайту.</p>' +
      h('Контакт') + kv(contactRows(d)) +
      h('Повідомлення') + quote(d.question);
  }
  return shell(d.kind === 'order' ? 'НОВЕ ЗАМОВЛЕННЯ' : 'НОВЕ ЗВЕРНЕННЯ', body);
}
function sellerText(d) {
  var lines = [d.kind === 'order' ? 'Нове замовлення з сайту Osten-Sacken' : 'Нове звернення з сайту Osten-Sacken', ''];
  if (d.kind === 'order') orderRows(d.order).forEach(function (r) { lines.push(r[0] + ': ' + r[1]); });
  lines.push('', "Ім'я: " + d.name, 'Телефон: ' + (d.phone || '—'), 'Пошта: ' + d.email);
  if (d.kind === 'order') { if (d.note) lines.push('', 'Примітка: ' + d.note); }
  else lines.push('', 'Повідомлення:', d.question);
  lines.push('', kyivNow() + ' (Київ)');
  return lines.join('\n');
}

/* ---------- ЛИСТ-ПІДТВЕРДЖЕННЯ КЛІЄНТУ ---------- */
function clientHtml(d) {
  var intro, details;
  if (d.kind === 'order') {
    intro = 'Дякуємо за замовлення! Ми отримали вашу заявку і звʼяжемось із вами найближчим часом для уточнення деталей та ціни.';
    details = h('Ваше замовлення') + kv(orderRows(d.order)) + (d.note ? (h('Ваша примітка') + quote(d.note)) : '');
  } else {
    intro = 'Дякуємо за звернення! Ми отримали ваше повідомлення і відповімо якнайшвидше.';
    details = h('Ваше повідомлення') + quote(d.question);
  }
  var body =
    '<p style="margin:0 0 6px;color:#010203;font-size:17px;font-weight:600;">Вітаємо, ' + esc(d.name) + '!</p>' +
    '<p style="margin:0 0 4px;color:#434343;font-size:15px;line-height:1.55;">' + esc(intro) + '</p>' +
    details +
    h('Наші контакти') +
    kv([
      ['Телефон', '<a href="tel:' + esc(SHOP_PHONE.replace(/[^\d+]/g, '')) + '" style="color:#E31919;text-decoration:none;">' + esc(SHOP_PHONE) + '</a>', true],
      ['Пошта', '<a href="mailto:' + esc(SHOP_EMAIL) + '" style="color:#E31919;text-decoration:none;">' + esc(SHOP_EMAIL) + '</a>', true]
    ]);
  return shell(d.kind === 'order' ? 'ПІДТВЕРДЖЕННЯ ЗАМОВЛЕННЯ' : 'ПІДТВЕРДЖЕННЯ ЗВЕРНЕННЯ', body);
}
function clientText(d) {
  var lines = ['Вітаємо, ' + d.name + '!', ''];
  lines.push(d.kind === 'order'
    ? 'Дякуємо за замовлення! Ми отримали вашу заявку і звʼяжемось найближчим часом.'
    : 'Дякуємо за звернення! Ми отримали ваше повідомлення і відповімо якнайшвидше.');
  lines.push('');
  if (d.kind === 'order') { orderRows(d.order).forEach(function (r) { lines.push(r[0] + ': ' + r[1]); }); if (d.note) lines.push('Примітка: ' + d.note); }
  else lines.push('Ваше повідомлення:', d.question);
  lines.push('', 'Наші контакти:', 'Телефон: ' + SHOP_PHONE, 'Пошта: ' + SHOP_EMAIL);
  return lines.join('\n');
}

module.exports = { sellerHtml, sellerText, clientHtml, clientText };
