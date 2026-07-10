/* =====================================================================
   ORDER PAGE — конфігуратор замовлення (order.html)
   - читає ?type= / ?caliber= з URL (кнопки з лендінга);
   - вибір опцій (тип / калібр / хід різьби / покриття / кількість);
   - фото та характеристики залежать від типу і покриття;
   - «Замовити» активна лише коли обрано КАЛІБР і ХІД РІЗЬБИ;
   - клік по активній → зберігає замовлення і веде на форму контактів
     лендінга (index.html#order), де дані підставляються у «Ваше питання».
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Дані продуктів ----------
     img: фото під кожен стан покриття. Поки використовуємо наявні плейсхолдери —
     адміністратор замінить на реальні (стандарт/інтегрований, з покриттям і без). */
  var PLACEHOLDER = './images/supp-standard-1.png';
  var PRODUCTS = {
    'Стандартний': {
      desc: 'Класичне рішення для більшості видів нарізної зброї. Поєднує ефективне зниження шуму, просте встановлення та високу надійність.',
      weight: 540,               // базова вага, г (без покриття)
      specs: [
        ['Вага', null],          // null → підставляється з урахуванням покриття
        ['Довжина від зрізу ствола', '200мм'],
        ['Діаметр', '50мм'],
        ['Камер', '13'],
        ['Ресурс роботи', '10 000+ пострілів']
      ],
      img: { 'Ні': [PLACEHOLDER], 'Так': [PLACEHOLDER] }
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
      ],
      img: { 'Ні': [PLACEHOLDER], 'Так': [PLACEHOLDER] }
    }
  };
  var COATING_ADD = 100; // +100г до ваги за гумове покриття

  /* ---------- Стан ---------- */
  var params = new URLSearchParams(location.search);
  // Калібри лендінга можуть приходити в іншому написанні — зводимо до значень чіпів
  var CALIBER_MAP = {
    '.22 LR': '.22 LR', '.223 Rem': '.223', '.223': '.223',
    '5.45': '5.45', '.30 Cal': '.30', '.30': '.30',
    '.338': '.338 LM', '.338 LM': '.338 LM', '.338 WM': '.338 WM'
  };
  function normCaliber(v) {
    if (!v) return '';
    if (CALIBER_MAP[v]) return CALIBER_MAP[v];
    return document.querySelector('.op-chips[data-group="caliber"] .op-chip[data-value="' + (window.CSS && CSS.escape ? CSS.escape(v) : v) + '"]') ? v : '';
  }
  var coatingParam = params.get('coating');
  var state = {
    type: PRODUCTS[params.get('type')] ? params.get('type') : 'Стандартний',
    caliber: normCaliber(params.get('caliber')),
    thread: '',
    coating: (coatingParam === 'Так' || coatingParam === 'Ні') ? coatingParam : 'Ні',
    qty: 1
  };

  /* ---------- Хелпери вибору чіпів ---------- */
  function chipGroup(group) { return document.querySelector('.op-chips[data-group="' + group + '"]'); }
  function selectChip(group, value) {
    var box = chipGroup(group);
    if (!box) return;
    box.querySelectorAll('.op-chip').forEach(function (c) {
      c.classList.toggle('is-sel', c.getAttribute('data-value') === value);
    });
  }

  /* ---------- Галерея ---------- */
  var track = document.getElementById('op-track');
  var dotsBox = document.getElementById('op-dots');
  var prevBtn = document.querySelector('.op-nav--prev');
  var nextBtn = document.querySelector('.op-nav--next');
  var galleryIndex = 0;

  function buildGallery() {
    var imgs = PRODUCTS[state.type].img[state.coating] || [PLACEHOLDER];
    galleryIndex = 0;
    track.innerHTML = imgs.map(function (src) {
      return '<div class="op-figure__slide"><img src="' + src + '" alt="' + state.type + ' титановий глушник" /></div>';
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
    dotsBox.querySelectorAll('span').forEach(function (d, i) {
      d.classList.toggle('is-active', i === galleryIndex);
    });
  }
  function slide(dir) {
    var n = track.children.length; if (!n) return;
    galleryIndex = (galleryIndex + dir + n) % n; updateGallery();
  }
  if (prevBtn) prevBtn.addEventListener('click', function () { slide(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { slide(1); });
  if (dotsBox) dotsBox.addEventListener('click', function (e) {
    var d = e.target.closest('span[data-i]'); if (!d) return;
    galleryIndex = +d.getAttribute('data-i'); updateGallery();
  });

  /* ---------- Характеристики ---------- */
  function renderSpecs() {
    var p = PRODUCTS[state.type];
    var box = document.getElementById('op-specs');
    box.innerHTML = p.specs.map(function (row, i) {
      var k = row[0];
      var v = row[1];
      if (v === null) { // Вага з урахуванням покриття
        var w = p.weight + (state.coating === 'Так' ? COATING_ADD : 0);
        v = w + 'г';
      }
      var head = i === 0 ? ' op-specrow--head' : '';
      return '<div class="op-specrow' + head + '">' +
             '<div class="op-spec__k">' + k + '</div>' +
             '<div class="op-spec__v">' + v + '</div></div>';
    }).join('');
  }

  /* ---------- Кнопка «Замовити» + підказка ---------- */
  var orderBtn = document.getElementById('op-order');
  var hint = document.getElementById('op-hint');
  function refreshAction() {
    var ready = !!state.caliber && !!state.thread;
    orderBtn.disabled = !ready;
    hint.hidden = ready;
  }

  /* ---------- Повний рендер продукту ---------- */
  function renderProduct() {
    var p = PRODUCTS[state.type];
    document.getElementById('op-title').textContent = state.type;
    document.getElementById('op-desc').textContent = p.desc;
    buildGallery();
    renderSpecs();
  }

  /* ---------- Обробники чіпів ---------- */
  document.querySelectorAll('.op-chips').forEach(function (box) {
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

  /* ---------- Лічильник ---------- */
  var qtyEl = document.getElementById('op-qty');
  document.getElementById('op-counter').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]'); if (!b) return;
    var next = state.qty + (+b.getAttribute('data-step'));
    state.qty = Math.max(1, Math.min(99, next));
    qtyEl.textContent = state.qty;
  });

  /* ---------- «Назад» ---------- */
  var back = document.getElementById('op-back');
  if (back) back.addEventListener('click', function (e) {
    if (document.referrer && history.length > 1) { e.preventDefault(); history.back(); }
  });

  /* ---------- Оформлення → форма контактів лендінга ---------- */
  orderBtn.addEventListener('click', function () {
    if (orderBtn.disabled) return;
    var summary =
      'Замовлення глушника:\n' +
      '• Тип: ' + state.type + '\n' +
      '• Калібр: ' + state.caliber + '\n' +
      '• Хід різьби: ' + state.thread + '\n' +
      '• Гумове покриття: ' + state.coating + '\n' +
      '• Кількість: ' + state.qty;
    try {
      sessionStorage.setItem('os_order', JSON.stringify({
        type: state.type, caliber: state.caliber, thread: state.thread,
        coating: state.coating, qty: state.qty, summary: summary
      }));
    } catch (err) { /* приватний режим — не критично */ }
    location.href = './index.html#order';
  });

  /* ---------- Ініціалізація ---------- */
  selectChip('type', state.type);
  if (state.caliber) selectChip('caliber', state.caliber);
  selectChip('coating', state.coating);
  renderProduct();
  refreshAction();

  /* ---------- Дрібниці: рік у футері + бургер ---------- */
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  var burger = document.querySelector('.burger');
  if (burger) burger.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();
