'use strict';

/* Екранування для безпечної вставки у HTML-лист */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function nl2br(s) { return esc(s).replace(/\r?\n/g, '<br>'); }

/* HTML-лист замовлення у фірмовому стилі Osten-Sacken.
   Стилі inline — так вимагають поштові клієнти. */
function orderEmailHtml(data) {
  var when = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  var phoneDigits = String(data.phone || '').replace(/[^\d+]/g, '');

  var row = function (label, valueHtml) {
    return (
      '<tr>' +
        '<td style="padding:12px 0;border-bottom:1px solid #E5E5E5;color:#434343;font-size:14px;width:150px;vertical-align:top;">' + esc(label) + '</td>' +
        '<td style="padding:12px 0;border-bottom:1px solid #E5E5E5;color:#010203;font-size:15px;font-weight:600;vertical-align:top;">' + valueHtml + '</td>' +
      '</tr>'
    );
  };

  return (
'<!DOCTYPE html>' +
'<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
'<body style="margin:0;padding:0;background:#FAF9F6;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F6;padding:24px 12px;">' +
    '<tr><td align="center">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E5E5E5;">' +

        // Шапка
        '<tr><td style="background:#010203;padding:28px 32px;">' +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;color:#FAF9F6;">OSTEN — SACKEN</div>' +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#E31919;margin-top:6px;letter-spacing:1px;">НОВЕ ЗВЕРНЕННЯ З САЙТУ</div>' +
        '</td></tr>' +

        // Тіло
        '<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;">' +
          '<p style="margin:0 0 20px;color:#434343;font-size:15px;line-height:1.5;">Надійшло нове звернення. Деталі нижче.</p>' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
            row('Ім\'я', esc(data.name)) +
            (data.phone ? row('Телефон', '<a href="tel:' + esc(phoneDigits) + '" style="color:#E31919;text-decoration:none;">' + esc(data.phone) + '</a>') : '') +
            row('Пошта', '<a href="mailto:' + esc(data.email) + '" style="color:#E31919;text-decoration:none;">' + esc(data.email) + '</a>') +
          '</table>' +

          '<div style="margin-top:24px;">' +
            '<div style="color:#434343;font-size:14px;margin-bottom:8px;">Повідомлення / замовлення:</div>' +
            '<div style="background:#F5F5F5;border-left:3px solid #E31919;padding:16px;color:#010203;font-size:15px;line-height:1.6;white-space:pre-wrap;">' + nl2br(data.question) + '</div>' +
          '</div>' +
        '</td></tr>' +

        // Підвал
        '<tr><td style="padding:18px 32px;background:#F5F5F5;border-top:1px solid #E5E5E5;font-family:Arial,Helvetica,sans-serif;">' +
          '<div style="color:#A3A3A3;font-size:12px;">Отримано: ' + esc(when) + ' (Київ)</div>' +
        '</td></tr>' +

      '</table>' +
    '</td></tr>' +
  '</table>' +
'</body></html>'
  );
}

/* Текстова версія (fallback) */
function orderEmailText(data) {
  return [
    'Нове звернення з сайту Osten-Sacken',
    '',
    "Ім'я: " + data.name,
    (data.phone ? 'Телефон: ' + data.phone : 'Телефон: —'),
    'Пошта: ' + data.email,
    '',
    'Повідомлення / замовлення:',
    data.question,
    '',
    'Отримано: ' + new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }) + ' (Київ)'
  ].join('\n');
}

module.exports = { orderEmailHtml, orderEmailText };
