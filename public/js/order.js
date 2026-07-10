/* =====================================================================
   ORDER MODAL — оверлей замовлення (працює на index.html)
   Флоу: config (вибір) → form (деталі + контакти) → done (успіх).
   Відкривається кнопками «Замовити» з лендінга. Підтвердження шле
   POST /api/order (той самий бекенд, що й форма «Залишились питання?»).
   ===================================================================== */
(function () {
  'use strict';

  var modal = document.getElementById('order-modal');
  if (!modal) return;

  /* ---------- Дані продуктів ---------- */
  var PLACEHOLDER = './images/supp-standard-1.png'; // TODO: реальні фото (адмін замінить)
  var PRODUCTS = {
    'Стандартний': {
      desc: 'Класичне рішення для більшості видів нарізної зброї. Поєднує ефективне зниження шуму, просте встановлення та високу надійність.',
      weight: 540,
      specs: [
        ['Вага', null],
        ['Довжина від зрізу ствола', '200мм'],
        ['Діаметр', '50мм'],
        ['Камер', '13'],
        ['Ресурс роботи', '10 000+ пострілів']
      ]
    },
    'Інтегрований': {
      desc: 'Інтегрований глушник є частиною конструкції ствола та забезпечує компактніше й збалансованіше рішення. Поєднує ефективне зниження шуму з бездоганним виконанням.',
      weight: 780,
      specs: [
        ['Вага', null],
        ['Загальна довжина', '330мм'],
        ['Діаметр', '50мм'],
        ['Камер', '13'],
        ['Ресурс роботи', '10 000+ пострілів']
      ]
    }
  };
  var COATING_ADD = 100;

  // Фото товару під карусель (реальне + плейсхолдери, як у картках товару)
  function galleryFor(/* type, coating */) {
    return [{ src: PLACEHOLDER }, { ph: 'Фото 2' }, { ph: 'Фото 3' }];
  }

  var CALIBER_MAP = {
    '.22 LR': '.22 LR', '.223 Rem': '.223', '.223': '.223',
    '5.45': '5.45', '.30 Cal': '.30', '.30': '.30',
    '.338': '.338 LM', '.338 LM': '.338 LM', '.338 WM': '.338 WM'
  };
  function normCaliber(v) { return v && CALIBER_MAP[v] ? CALIBER_MAP[v] : ''; }

  var state = { type: 'Стандартний', caliber: '', thread: '', coating: 'Ні', qty: 1 };

  /* ---------- Елементи ---------- */
  var elTitle = document.getElementById('op-title');
  var elDesc = document.getElementById('op-desc');
  var track = document.getElementById('op-track');
  var dotsBox = document.getElementById('op-dots');
  var prevBtn = modal.querySelector('.op-nav--prev');
  var nextBtn = modal.querySelector('.op-nav--next');
  var orderBtn = document.getElementById('op-order');
  var hint = document.getElementById('op-hint');
  var stepConfig = document.getElementById('ostep-config');
  var stepForm = document.getElementById('ostep-form');
  var success = document.getElementById('op-success');
  var qtyEl = document.getElementById('op-qty');
  var galleryIndex = 0;

  /* ---------- Чіпи ---------- */
  function selectChip(group, value) {
    var box = modal.querySelector('.op-chips[data-group="' + group + '"]');
    if (!box) return;
    box.querySelectorAll('.op-chip').forEach(function (c) {
      c.classList.toggle('is-sel', c.getAttribute('data-value') === value);
    });
  }

  /* ---------- Галерея ---------- */
  function buildGallery() {
    var imgs = galleryFor(state.type, state.coating);
    galleryIndex = 0;
    track.innerHTML = imgs.map(function (it) {
      if (it.ph) {
        return '<div class="op-figure__slide op-figure__slide--ph"><span>' + it.ph +
               '<br><small>додасть адміністратор</small></span></div>';
      }
      return '<div class="op-figure__slide"><img src="' + it.src + '" alt="' + state.type + ' титановий глушник" /></div>';
    }).join('');
    dotsBox.innerHTML = imgs.map(function (_, i) {
      return '<span class="' + (i === 0 ? 'is-active' : '') + '" data-i="' + i + '"></span>';
    }).join('');
    var many = imgs.length > 1;
    prevBtn.hidden = !many; nextBtn.hidden = !many;
    dotsBox.style.display = many ? '' : 'none';
    updateGallery();
  }
  function updateGallery() {
    track.style.transform = 'translateX(' + (-galleryIndex * 100) + '%)';
    dotsBox.querySelectorAll('span').forEach(function (d, i) { d.classList.toggle('is-active', i === galleryIndex); });
  }
  function slide(dir) {
    var n = track.children.length; if (!n) return;
    galleryIndex = (galleryIndex + dir + n) % n; updateGallery();
  }
  if (prevBtn) prevBtn.addEventListener('click', function () { slide(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { slide(1); });
  dotsBox.addEventListener('click', function (e) {
    var d = e.target.closest('span[data-i]'); if (!d) return;
    galleryIndex = +d.getAttribute('data-i'); updateGallery();
  });

  /* ---------- Характеристики ---------- */
  function renderSpecs() {
    var p = PRODUCTS[state.type];
    document.getElementById('op-specs').innerHTML = p.specs.map(function (row, i) {
      var v = row[1];
      if (v === null) v = (p.weight + (state.coating === 'Так' ? COATING_ADD : 0)) + 'г';
      return '<div class="op-specrow' + (i === 0 ? ' op-specrow--head' : '') + '">' +
             '<div class="op-spec__k">' + row[0] + '</div>' +
             '<div class="op-spec__v">' + v + '</div></div>';
    }).join('');
  }

  /* ---------- Кнопка config ---------- */
  function refreshAction() {
    var ready = !!state.caliber && !!state.thread;
    orderBtn.disabled = !ready;
    hint.hidden = ready;
  }

  function renderProduct() {
    elTitle.textContent = state.type;
    elDesc.textContent = PRODUCTS[state.type].desc;
    buildGallery();
    renderSpecs();
  }

  /* ---------- Кроки ---------- */
  function setStep(name) {
    success.hidden = (name !== 'done');
    stepConfig.hidden = (name === 'form');
    stepForm.hidden = (name !== 'form');
    if (name === 'form') renderSummary();
    modal.querySelector('.omodal__dialog').scrollTop = 0;
  }

  function orderLines() {
    return [
      'Тип: ' + state.type,
      'Калібр: ' + state.caliber,
      'Хід різьби: ' + state.thread,
      'Гумове покриття: ' + state.coating,
      'Кількість: ' + state.qty
    ];
  }
  function renderSummary() {
    document.getElementById('op-summary-box').innerHTML =
      '<p class="op-summary__name">' + state.type + '</p>' +
      '<p class="op-summary__row">Калібр: <b>' + state.caliber + '</b></p>' +
      '<p class="op-summary__row">Хід різьби: <b>' + state.thread + '</b></p>' +
      '<p class="op-summary__row">Гумове покриття: <b>' + state.coating + '</b></p>' +
      '<p class="op-summary__row">Кількість: <b>' + state.qty + '</b></p>';
  }

  /* ---------- Відкрити / закрити ---------- */
  function openModal(opts) {
    opts = opts || {};
    state.type = PRODUCTS[opts.type] ? opts.type : 'Стандартний';
    state.caliber = normCaliber(opts.caliber);
    state.thread = '';
    state.coating = (opts.coating === 'Так' || opts.coating === 'Ні') ? opts.coating : 'Ні';
    state.qty = 1;

    selectChip('type', state.type);
    selectChip('caliber', state.caliber);
    selectChip('thread', '');
    selectChip('coating', state.coating);
    qtyEl.textContent = '1';
    resetForm();
    renderProduct();
    refreshAction();
    setStep('config');

    modal.hidden = false;
    document.body.classList.add('omodal-open');
    setTimeout(function () { var b = document.getElementById('op-back'); if (b) b.focus(); }, 30);
  }
  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('omodal-open');
  }
  window.OrderModal = { open: openModal, close: closeModal };

  modal.addEventListener('click', function (e) {
    if (e.target.closest('[data-omodal-close]')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ---------- Обробники config ---------- */
  modal.querySelectorAll('.op-chips').forEach(function (box) {
    var group = box.getAttribute('data-group');
    box.addEventListener('click', function (e) {
      var chip = e.target.closest('.op-chip'); if (!chip) return;
      var value = chip.getAttribute('data-value');
      selectChip(group, value);
      if (group === 'type') { state.type = value; renderProduct(); }
      else if (group === 'caliber') { state.caliber = value; }
      else if (group === 'thread') { state.thread = value; }
      else if (group === 'coating') { state.coating = value; buildGallery(); renderSpecs(); }
      refreshAction();
    });
  });
  document.getElementById('op-counter').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]'); if (!b) return;
    state.qty = Math.max(1, Math.min(99, state.qty + (+b.getAttribute('data-step'))));
    qtyEl.textContent = state.qty;
  });
  orderBtn.addEventListener('click', function () { if (!orderBtn.disabled) setStep('form'); });
  document.getElementById('op-back').addEventListener('click', closeModal);

  /* ---------- Форма (крок form) ---------- */
  var form = document.getElementById('oform2');
  var statusBox = document.getElementById('oform2-status');
  var confirmBtn = document.getElementById('o-confirm');

  function clean(s) { s = String(s == null ? '' : s); var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 32 || (c >= 127 && c <= 159)) continue; o += s.charAt(i); } return o.trim(); }
  var NAME_RE = /^[A-Za-zА-Яа-яІіЇїЄєҐґ'’ \-]{2,40}$/;
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  function fieldErr(inp, msg) {
    var f = inp.closest('.field');
    if (msg) { f.classList.add('is-invalid'); return false; }
    f.classList.remove('is-invalid'); return true;
  }
  function phoneDigits(v) { return String(v).replace(/\D/g, ''); }
  function phoneValid(v) {
    var d = phoneDigits(v);
    if (!d) return true; // телефон необов'язковий
    return (d.length === 12 && d.indexOf('380') === 0) ||
           (d.length === 11 && d.indexOf('80') === 0) ||
           (d.length === 10 && d.charAt(0) === '0');
  }
  function formatPhone(v) {
    var d = phoneDigits(v);
    if (d.indexOf('380') === 0) d = d.slice(2); else if (d.indexOf('80') === 0) d = '0' + d.slice(2);
    if (d && d.charAt(0) !== '0') d = '0' + d;
    d = d.slice(0, 10); if (!d) return '';
    var p = d.split(''), out = '+38 (' + p.slice(0, 3).join('');
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ' ' + p.slice(3, 6).join('');
    if (d.length > 6) out += '-' + p.slice(6, 8).join('');
    if (d.length > 8) out += '-' + p.slice(8, 10).join('');
    return out;
  }

  var phoneInp = form.elements['phone'];
  phoneInp.addEventListener('input', function () { phoneInp.value = formatPhone(phoneInp.value); phoneInp.closest('.field').classList.remove('is-invalid'); });
  form.querySelectorAll('.input').forEach(function (inp) {
    inp.addEventListener('input', function () { inp.closest('.field').classList.remove('is-invalid'); });
  });

  function resetForm() {
    if (form) form.reset();
    if (statusBox) { statusBox.hidden = true; statusBox.textContent = ''; }
    form && form.querySelectorAll('.field').forEach(function (f) { f.classList.remove('is-invalid'); });
  }
  document.getElementById('o-close').addEventListener('click', function () { setStep('config'); });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = form.elements['name'], email = form.elements['email'], phone = form.elements['phone'];
    var ok = true, firstBad = null;
    if (!NAME_RE.test(clean(name.value))) { fieldErr(name, 1); ok = false; firstBad = firstBad || name; } else fieldErr(name, 0);
    if (!phoneValid(phone.value)) { fieldErr(phone, 1); ok = false; firstBad = firstBad || phone; } else fieldErr(phone, 0);
    var ev2 = clean(email.value);
    if (!ev2 || ev2.length > 60 || !EMAIL_RE.test(ev2)) { fieldErr(email, 1); ok = false; firstBad = firstBad || email; } else fieldErr(email, 0);
    if (!ok) { if (firstBad) firstBad.focus(); return; }

    var note = clean(form.elements['note'].value);
    var question = 'Замовлення глушника:\n• ' + orderLines().join('\n• ') + (note ? ('\n• Примітка: ' + note) : '');
    var pd = phoneDigits(phone.value);
    var payload = {
      name: clean(name.value),
      phone: pd ? ('+' + pd.replace(/^80/, '380').replace(/^0/, '380')) : '',
      email: ev2,
      question: question
    };

    confirmBtn.disabled = true;
    var lbl = confirmBtn.querySelector('.btn__label'); var old = lbl.textContent; lbl.textContent = 'Надсилаємо…';
    statusBox.hidden = true;
    fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.success) { setStep('done'); resetForm(); }
        else { statusBox.hidden = false; statusBox.className = 'oform2__status is-err'; statusBox.textContent = (res.d && res.d.error) || 'Не вдалося надіслати. Спробуйте ще раз або зателефонуйте нам.'; }
      })
      .catch(function () { statusBox.hidden = false; statusBox.className = 'oform2__status is-err'; statusBox.textContent = 'Помилка з\'єднання. Спробуйте ще раз.'; })
      .finally(function () { confirmBtn.disabled = false; lbl.textContent = old; });
  });

  /* ---------- Відкривачі з лендінга ---------- */
  document.querySelectorAll('[data-pick-type]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var card = btn.closest('.prod');
      var coatingBtn = card ? card.querySelector('.toggle__opt.is-on') : null;
      openModal({ type: btn.getAttribute('data-pick-type'), coating: coatingBtn ? coatingBtn.getAttribute('data-coating') : 'Ні' });
    });
  });
  document.querySelectorAll('[data-pick-caliber]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal({ type: 'Стандартний', caliber: btn.getAttribute('data-pick-caliber') });
    });
  });
  document.querySelectorAll('[data-open-order]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); openModal({}); });
  });
})();
