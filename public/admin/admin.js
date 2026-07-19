/* Osten-Sacken — адмін-панель (замовлення + контент) */
(function () {
  'use strict';

  var CSRF = null; // токен поточної сесії

  var loginView = document.getElementById('login');
  var dashView = document.getElementById('dash');
  var loginForm = document.getElementById('login-form');
  var loginErr = document.getElementById('login-err');
  var rows = document.getElementById('rows');
  var empty = document.getElementById('empty');
  var tablewrap = document.getElementById('tablewrap');
  var statsBox = document.getElementById('stats');
  var toastEl = document.getElementById('toast');

  var STATUSES = ['Нове', 'В роботі', 'Виконано', 'Скасовано'];
  var PRODUCT_LABELS = { standard: 'Стандартний', integrated: 'Інтегрований' };
  var CALIBER_LABELS = { 'ammo-22lr': '.22 LR', 'ammo-223': '.223', 'ammo-545': '5.45', 'ammo-30': '.30', 'ammo-338': '.338 LM/WM' };
  var IMAGE_LABELS = {
    hero: 'Hero — головне фото', 'supp-standard': 'Стандартний глушник (карусель)',
    about: 'Фото «Про нас»', steps: 'Гвинтівка (3 кроки)',
    'ammo-22lr': 'Калібр .22 LR', 'ammo-223': 'Калібр .223', 'ammo-545': 'Калібр 5.45',
    'ammo-30': 'Калібр .30', 'ammo-338': 'Калібр .338', footer: 'Гвинтівка у футері'
  };

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
  var toastTimer;
  function toast(msg, ok) {
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (ok ? 'is-ok' : 'is-err');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  /* ---------- HTTP ---------- */
  function getJSON(url) {
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (r.status === 401) { show('login'); throw new Error('unauth'); }
      return r.json();
    });
  }
  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF || '' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
    });
  }

  /* ---------- Сесія ---------- */
  function checkSession() {
    fetch('/api/admin/session').then(function (r) { return r.json(); }).then(function (d) {
      if (d.authed) { CSRF = d.csrf; show('dash'); loadAll(); }
      else { show('login'); setTimeout(function () { document.getElementById('password').focus(); }, 30); }
    }).catch(function () { show('login'); });
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginErr.hidden = true;
    var pw = document.getElementById('password').value;
    var btn = loginForm.querySelector('button'); btn.disabled = true;
    postJSON('/api/admin/login', { password: pw })
      .then(function (res) {
        if (res.ok && res.d.success) {
          CSRF = res.d.csrf;
          document.getElementById('password').value = '';
          show('dash'); loadAll();
        } else { loginErr.textContent = res.d.error || 'Помилка входу'; loginErr.hidden = false; }
      }).catch(function () { loginErr.textContent = 'Помилка зʼєднання'; loginErr.hidden = false; })
      .finally(function () { btn.disabled = false; });
  });

  document.getElementById('logout').addEventListener('click', function () {
    postJSON('/api/admin/logout', {}).finally(function () { CSRF = null; show('login'); });
  });
  document.getElementById('refresh').addEventListener('click', loadOrders);

  /* ---------- Вкладки ---------- */
  document.getElementById('tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.tab'); if (!btn) return;
    var name = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('is-active', t === btn); });
    document.querySelectorAll('.panel').forEach(function (p) {
      var on = p.getAttribute('data-panel') === name;
      p.classList.toggle('is-active', on); p.hidden = !on;
    });
  });

  function loadAll() { loadOrders(); loadContent(); }

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

  function renderOrders(orders) {
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
        var index = +sel.getAttribute('data-index');
        sel.disabled = true;
        postJSON('/api/admin/order-status', { index: index, status: sel.value })
          .then(function (res) {
            if (res.ok && res.d.success) { sel.setAttribute('data-s', sel.value); }
            else if (res.status === 401) { show('login'); }
            else { toast(res.d.error || 'Не вдалося зберегти', false); }
          }).finally(function () { sel.disabled = false; });
      });
    });
  }

  function loadOrders() {
    getJSON('/api/admin/orders').then(function (d) { if (d && d.orders) renderOrders(d.orders); }).catch(function () {});
  }

  /* ---------- Контент ---------- */
  function loadContent() {
    getJSON('/api/content').then(function (c) {
      renderPrices(c.prices || []);
      renderFaq(c.faq || []);
      fillTexts(c.texts || {});
      renderGalleries(c.galleries || {});
      renderImages(c.images || {});
      renderAvailability(c.availability || {});
    }).catch(function () {});
  }

  /* --- Наявність --- */
  function stockRow(kind, key, label, inStock) {
    var row = document.createElement('div'); row.className = 'stockrow';
    var name = document.createElement('span'); name.className = 'stockrow__name'; name.textContent = label;
    var btn = document.createElement('button'); btn.type = 'button';
    function paint(on) {
      btn.className = 'stockbtn ' + (on ? 'is-in' : 'is-out');
      btn.innerHTML = '<span class="stockbtn__dot"></span>' + (on ? 'В наявності' : 'Немає');
    }
    paint(inStock);
    btn.addEventListener('click', function () {
      var next = !(btn.className.indexOf('is-in') >= 0);
      btn.disabled = true;
      postJSON('/api/admin/availability', { kind: kind, key: key, value: next }).then(function (res) {
        if (res.ok && res.d.success) { paint(next); toast('Збережено: ' + label, true); }
        else if (res.status === 401) show('login');
        else toast(res.d.error || 'Помилка', false);
      }).catch(function () { toast('Помилка звʼязку', false); })
        .finally(function () { btn.disabled = false; });
    });
    row.appendChild(name); row.appendChild(btn);
    return row;
  }
  function renderAvailability(av) {
    var prod = av.products || {}, cal = av.calibers || {};
    var pbox = document.getElementById('stock-products'); pbox.innerHTML = '';
    Object.keys(PRODUCT_LABELS).forEach(function (k) {
      pbox.appendChild(stockRow('products', k, PRODUCT_LABELS[k], prod[k] !== false));
    });
    var cbox = document.getElementById('stock-calibers'); cbox.innerHTML = '';
    Object.keys(CALIBER_LABELS).forEach(function (k) {
      cbox.appendChild(stockRow('calibers', k, CALIBER_LABELS[k], cal[k] !== false));
    });
  }

  /* --- Ціни --- */
  function priceRow(p) {
    p = p || {};
    var row = document.createElement('div'); row.className = 'erow erow--price';
    row.innerHTML =
      '<input class="p-cal" placeholder="Калібр" />' +
      '<input class="p-std" placeholder="Стандартний" />' +
      '<input class="p-int" placeholder="Інтегрований" />' +
      '<button class="btn btn--del" title="Видалити" type="button">✕</button>';
    row.querySelector('.p-cal').value = p.cal || '';
    row.querySelector('.p-std').value = p.std || '';
    row.querySelector('.p-int').value = p.int || '';
    row.querySelector('.btn--del').addEventListener('click', function () { row.remove(); });
    return row;
  }
  function renderPrices(list) {
    var box = document.getElementById('price-rows'); box.innerHTML = '';
    list.forEach(function (p) { box.appendChild(priceRow(p)); });
  }
  document.getElementById('price-add').addEventListener('click', function () {
    document.getElementById('price-rows').appendChild(priceRow({}));
  });
  document.getElementById('price-save').addEventListener('click', function () {
    var list = Array.prototype.map.call(document.querySelectorAll('#price-rows .erow'), function (r) {
      return { cal: r.querySelector('.p-cal').value, std: r.querySelector('.p-std').value, int: r.querySelector('.p-int').value };
    });
    postJSON('/api/admin/content/prices', { prices: list }).then(function (res) {
      if (res.ok && res.d.success) { renderPrices(res.d.prices); toast('Ціни збережено', true); }
      else if (res.status === 401) show('login');
      else toast(res.d.error || 'Помилка', false);
    });
  });

  /* --- FAQ --- */
  function faqRow(f) {
    f = f || {};
    var row = document.createElement('div'); row.className = 'erow erow--faq';
    row.innerHTML =
      '<div class="erow__grow">' +
      '<input class="f-q" placeholder="Питання" />' +
      '<textarea class="f-a" rows="2" placeholder="Відповідь"></textarea>' +
      '</div>' +
      '<button class="btn btn--del" title="Видалити" type="button">✕</button>';
    row.querySelector('.f-q').value = f.q || '';
    row.querySelector('.f-a').value = f.a || '';
    row.querySelector('.btn--del').addEventListener('click', function () { row.remove(); });
    return row;
  }
  function renderFaq(list) {
    var box = document.getElementById('faq-rows'); box.innerHTML = '';
    list.forEach(function (f) { box.appendChild(faqRow(f)); });
  }
  document.getElementById('faq-add').addEventListener('click', function () {
    document.getElementById('faq-rows').appendChild(faqRow({}));
  });
  document.getElementById('faq-save').addEventListener('click', function () {
    var list = Array.prototype.map.call(document.querySelectorAll('#faq-rows .erow'), function (r) {
      return { q: r.querySelector('.f-q').value, a: r.querySelector('.f-a').value };
    });
    postJSON('/api/admin/content/faq', { faq: list }).then(function (res) {
      if (res.ok && res.d.success) { renderFaq(res.d.faq); toast('FAQ збережено', true); }
      else if (res.status === 401) show('login');
      else toast(res.d.error || 'Помилка', false);
    });
  });

  /* --- Тексти --- */
  function fillTexts(t) {
    ['hero_subtitle', 'about_text', 'email', 'phone'].forEach(function (k) {
      var el = document.getElementById('t-' + k);
      if (el) el.value = t[k] || '';
    });
  }
  document.getElementById('texts-save').addEventListener('click', function () {
    var texts = {};
    ['hero_subtitle', 'about_text', 'email', 'phone'].forEach(function (k) {
      texts[k] = document.getElementById('t-' + k).value;
    });
    postJSON('/api/admin/content/texts', { texts: texts }).then(function (res) {
      if (res.ok && res.d.success) { fillTexts(res.d.texts); toast('Тексти збережено', true); }
      else if (res.status === 401) show('login');
      else toast(res.d.error || 'Помилка', false);
    });
  });

  /* --- Галерея карток товару (додати/видалити фото) --- */
  function readFileAsDataUrl(file, cb) {
    var reader = new FileReader();
    reader.onload = function () { cb(reader.result); };
    reader.readAsDataURL(file);
  }
  function renderGalleries(galleries) {
    var wrap = document.getElementById('galleries'); wrap.innerHTML = '';
    Object.keys(PRODUCT_LABELS).forEach(function (product) {
      var photos = Array.isArray(galleries[product]) ? galleries[product] : [];
      var block = document.createElement('div'); block.className = 'gblock';
      var head = document.createElement('div'); head.className = 'gblock__head';
      head.textContent = PRODUCT_LABELS[product] + ' — ' + photos.length + ' фото';
      var strip = document.createElement('div'); strip.className = 'gstrip';

      photos.forEach(function (p, idx) {
        var cell = document.createElement('div'); cell.className = 'gphoto';
        var img = document.createElement('img'); img.src = '/' + String(p).replace(/^\/+/, '') + '?t=' + Date.now();
        var del = document.createElement('button'); del.className = 'gphoto__del'; del.type = 'button';
        del.title = 'Видалити'; del.textContent = '✕';
        del.addEventListener('click', function () {
          if (!confirm('Видалити це фото?')) return;
          del.disabled = true;
          postJSON('/api/admin/gallery/remove', { product: product, index: idx }).then(function (res) {
            if (res.ok && res.d.success) { renderGalleries(setGallery(galleries, product, res.d.gallery)); toast('Фото видалено', true); }
            else if (res.status === 401) show('login');
            else { toast(res.d.error || 'Помилка', false); del.disabled = false; }
          }).catch(function () { del.disabled = false; });
        });
        cell.appendChild(img); cell.appendChild(del); strip.appendChild(cell);
      });

      var add = document.createElement('label'); add.className = 'gadd';
      add.innerHTML = '<span>+ Додати</span><input type="file" accept="image/png,image/jpeg,image/webp" hidden />';
      var input = add.querySelector('input');
      input.addEventListener('change', function () {
        var file = input.files && input.files[0]; if (!file) return;
        if (file.size > 6 * 1024 * 1024) { toast('Файл завеликий (макс 6 МБ)', false); input.value = ''; return; }
        add.classList.add('is-busy');
        readFileAsDataUrl(file, function (dataUrl) {
          postJSON('/api/admin/gallery/add', { product: product, dataUrl: dataUrl }).then(function (res) {
            if (res.ok && res.d.success) { renderGalleries(setGallery(galleries, product, res.d.gallery)); toast('Фото додано: ' + PRODUCT_LABELS[product], true); }
            else if (res.status === 401) show('login');
            else toast(res.d.error || 'Помилка', false);
          }).catch(function () { toast('Помилка звʼязку', false); })
            .finally(function () { add.classList.remove('is-busy'); });
        });
        input.value = '';
      });
      strip.appendChild(add);

      block.appendChild(head); block.appendChild(strip); wrap.appendChild(block);
    });
  }
  // локально оновити об'єкт галерей і повернути його (щоб re-render мав свіжі дані)
  function setGallery(galleries, product, list) {
    var g = Object.assign({}, galleries); g[product] = list; return g;
  }

  /* --- Окремі зображення --- */
  function renderImages(images) {
    var grid = document.getElementById('imggrid'); grid.innerHTML = '';
    Object.keys(IMAGE_LABELS).forEach(function (slot) {
      var card = document.createElement('div'); card.className = 'imgcard';
      var src = images[slot] ? ('/' + String(images[slot]).replace(/^\/+/, '')) : '';
      card.innerHTML =
        '<div class="imgcard__prev"><img alt="" /></div>' +
        '<div class="imgcard__name"></div>' +
        '<label class="btn imgcard__pick">Обрати файл<input type="file" accept="image/png,image/jpeg,image/webp" hidden /></label>' +
        '<span class="imgcard__status"></span>';
      card.querySelector('.imgcard__name').textContent = IMAGE_LABELS[slot];
      if (src) card.querySelector('img').src = src + '?t=' + Date.now();
      var input = card.querySelector('input[type=file]');
      var status = card.querySelector('.imgcard__status');
      input.addEventListener('change', function () {
        var file = input.files && input.files[0]; if (!file) return;
        if (file.size > 6 * 1024 * 1024) { status.textContent = 'Файл завеликий (макс 6 МБ)'; return; }
        status.textContent = 'Завантаження…';
        var reader = new FileReader();
        reader.onload = function () {
          postJSON('/api/admin/upload', { slot: slot, dataUrl: reader.result }).then(function (res) {
            if (res.ok && res.d.success) {
              card.querySelector('img').src = '/' + res.d.path + '?t=' + Date.now();
              status.textContent = 'Оновлено ✓';
              toast('Фото оновлено: ' + IMAGE_LABELS[slot], true);
            } else if (res.status === 401) { show('login'); }
            else { status.textContent = res.d.error || 'Помилка'; }
          }).catch(function () { status.textContent = 'Помилка звʼязку'; });
        };
        reader.readAsDataURL(file);
        input.value = '';
      });
      grid.appendChild(card);
    });
  }

  checkSession();
})();
