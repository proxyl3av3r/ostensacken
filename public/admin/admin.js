/* Osten-Sacken — адмін-панель (Етап 1) */
(function () {
  'use strict';

  var loginView = document.getElementById('login');
  var dashView = document.getElementById('dash');
  var loginForm = document.getElementById('login-form');
  var loginErr = document.getElementById('login-err');
  var rows = document.getElementById('rows');
  var empty = document.getElementById('empty');
  var tablewrap = document.getElementById('tablewrap');
  var statsBox = document.getElementById('stats');

  var STATUSES = ['Нове', 'В роботі', 'Виконано', 'Скасовано'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function show(view) {
    loginView.hidden = view !== 'login';
    dashView.hidden = view !== 'dash';
  }

  /* ---------- Сесія ---------- */
  function checkSession() {
    fetch('/api/admin/session').then(function (r) { return r.json(); }).then(function (d) {
      if (d.authed) { show('dash'); loadOrders(); }
      else { show('login'); setTimeout(function () { document.getElementById('password').focus(); }, 30); }
    }).catch(function () { show('login'); });
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginErr.hidden = true;
    var pw = document.getElementById('password').value;
    var btn = loginForm.querySelector('button'); btn.disabled = true;
    fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.success) { document.getElementById('password').value = ''; show('dash'); loadOrders(); }
        else { loginErr.textContent = res.d.error || 'Помилка входу'; loginErr.hidden = false; }
      }).catch(function () { loginErr.textContent = 'Помилка зʼєднання'; loginErr.hidden = false; })
      .finally(function () { btn.disabled = false; });
  });

  document.getElementById('logout').addEventListener('click', function () {
    fetch('/api/admin/logout', { method: 'POST' }).finally(function () { show('login'); });
  });
  document.getElementById('refresh').addEventListener('click', loadOrders);

  /* ---------- Замовлення ---------- */
  function detailsHtml(o) {
    var html = '';
    if (o.kind === 'order' && o.order) {
      var x = o.order;
      html = '<div class="cell-det">' +
        '<div><span class="k">Тип:</span> ' + esc(x.type) + '</div>' +
        '<div><span class="k">Калібр:</span> ' + esc(x.caliber) + '</div>' +
        '<div><span class="k">Різьба:</span> ' + esc(x.thread) + '</div>' +
        '<div><span class="k">Покриття:</span> ' + esc(x.coating) + ' · <span class="k">К-сть:</span> ' + esc(x.qty) + '</div>' +
        '</div>';
      if (o.note) html += '<div class="cell-note">' + esc(o.note) + '</div>';
    } else {
      html = '<div class="cell-note">' + esc(o.question || '') + '</div>';
    }
    return html;
  }

  function render(orders) {
    // статистика
    var total = orders.length;
    var neworders = orders.filter(function (o) { return (o.status || 'Нове') === 'Нове'; }).length;
    statsBox.innerHTML =
      '<div class="stat"><b>' + total + '</b><span>Всього</span></div>' +
      '<div class="stat"><b>' + neworders + '</b><span>Нових</span></div>';

    if (!orders.length) { tablewrap.hidden = true; empty.hidden = false; rows.innerHTML = ''; return; }
    tablewrap.hidden = false; empty.hidden = true;

    rows.innerHTML = orders.map(function (o) {
      var phone = o.phone ? ('<a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a>') : '<span class="k">—</span>';
      var email = o.email ? ('<a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>') : '';
      var tag = o.kind === 'order'
        ? '<span class="tag tag--order">Замовлення</span>'
        : '<span class="tag tag--question">Звернення</span>';
      var st = o.status || 'Нове';
      var opts = STATUSES.map(function (s) { return '<option' + (s === st ? ' selected' : '') + '>' + s + '</option>'; }).join('');
      return '<tr>' +
        '<td class="when">' + fmtDate(o.at) + '</td>' +
        '<td>' + tag + '</td>' +
        '<td>' + esc(o.name || '—') + '</td>' +
        '<td class="contact">' + phone + email + '</td>' +
        '<td>' + detailsHtml(o) + '</td>' +
        '<td><select class="status" data-index="' + o.index + '" data-s="' + esc(st) + '">' + opts + '</select></td>' +
        '</tr>';
    }).join('');

    rows.querySelectorAll('select.status').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var index = sel.getAttribute('data-index');
        var status = sel.value;
        sel.disabled = true;
        fetch('/api/admin/order-status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: +index, status: status })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (res) {
            if (res.ok && res.d.success) { sel.setAttribute('data-s', status); }
            else if (res.ok === false && res.d && res.d.error === 'Не авторизовано') { show('login'); }
          }).finally(function () { sel.disabled = false; });
      });
    });
  }

  function loadOrders() {
    fetch('/api/admin/orders').then(function (r) {
      if (r.status === 401) { show('login'); return null; }
      return r.json();
    }).then(function (d) { if (d && d.orders) render(d.orders); })
      .catch(function () {});
  }

  checkSession();
})();
