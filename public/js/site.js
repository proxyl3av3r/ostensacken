/* ============================================================
   Osten-Sacken — Landing behaviour
   ============================================================ */
(function () {
  'use strict';

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Гідратація керованим контентом (ціни/FAQ/тексти/фото з адмінки) ----
     Значення виводяться лише через textContent / src — жодного innerHTML,
     тож XSS з боку збережених даних неможливий. Якщо запит впав — лишається
     статична розмітка (дефолти), сайт не ламається. */
  (function hydrate() {
    var GALLERIES = null;   // галереї з адмінки (звичайні + «з покриттям»)
    fetch('/api/content', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { if (c) applyContent(c); })
      .catch(function () {});

    function applyContent(c) {
      // Тексти
      if (c.texts) {
        // Тайтл сторінки (вкладка браузера / SEO) — керується з адмінки
        if (typeof c.texts.site_title === 'string' && c.texts.site_title) {
          document.title = c.texts.site_title;
        }
        document.querySelectorAll('[data-text]').forEach(function (el) {
          var v = c.texts[el.getAttribute('data-text')];
          if (typeof v !== 'string' || !v) return;
          if (el.hasAttribute('data-rich')) setRichText(el, v); else el.textContent = v;
        });
        // Контакти (href + видимий текст)
        var email = c.texts.email, phone = c.texts.phone;
        if (email) document.querySelectorAll('[data-contact="email"]').forEach(function (a) {
          a.setAttribute('href', 'mailto:' + email);
          var t = a.querySelector('[data-contact-text]'); if (t) t.textContent = email;
        });
        if (phone) document.querySelectorAll('[data-contact="phone"]').forEach(function (a) {
          a.setAttribute('href', 'tel:+' + String(phone).replace(/\D/g, ''));
          var t = a.querySelector('[data-contact-text]'); if (t) t.textContent = phone;
        });
      }
      // Фото (одиночні слоти)
      if (c.images) {
        document.querySelectorAll('[data-img]').forEach(function (img) {
          var p = c.images[img.getAttribute('data-img')];
          if (typeof p === 'string' && p) img.setAttribute('src', '/' + p.replace(/^\/+/, ''));
        });
      }
      // Галереї карток товару (перебудова слайдів + дотів + ре-ініт каруселі)
      if (c.galleries) {
        GALLERIES = c.galleries;
        window.__renderProdGallery = renderProdGallery;   // викликає тумблер покриття
        renderProdGallery('standard');
        renderProdGallery('integrated');
      }
      // Відео-відгуки (перебудова треку з урахуванням ліміту показу) + ре-ініт каруселі
      if (c.reviews) renderReviews(c.reviews);
      // Ціни
      if (Array.isArray(c.prices)) {
        var table = document.querySelector('[data-prices]');
        if (table) {
          table.querySelectorAll('.prow:not(.prow--head)').forEach(function (r) { r.remove(); });
          c.prices.forEach(function (p) {
            var row = document.createElement('div'); row.className = 'prow';
            row.appendChild(pcell('pcell pcell--cal', 'Калібр', p.cal));
            row.appendChild(pcell('pcell', 'Стандартний', p.std));
            row.appendChild(pcell('pcell', 'Інтегрований', p.int));
            table.appendChild(row);
          });
        }
      }
      // FAQ
      if (Array.isArray(c.faq)) {
        var list = document.querySelector('[data-faq]');
        if (list) {
          list.innerHTML = '';
          c.faq.forEach(function (f) {
            var d = document.createElement('details'); d.className = 'faq__item';
            var s = document.createElement('summary'); s.className = 'faq__q'; s.textContent = f.q;
            var a = document.createElement('div'); a.className = 'faq__a'; a.textContent = f.a;
            d.appendChild(s); d.appendChild(a); list.appendChild(d);
          });
        }
      }
    }
    function pcell(cls, label, text) {
      var el = document.createElement('div');
      el.className = cls; el.setAttribute('data-label', label);
      el.textContent = text == null ? '' : text;
      return el;
    }
    /* Rich-заголовок: слово(а) в *зірочках* → <span class="accent"> (червоний).
       Будуємо через DOM (textNode / span.textContent) — без innerHTML, тож XSS неможливий. */
    function setRichText(el, val) {
      while (el.firstChild) el.removeChild(el.firstChild);
      String(val).split('*').forEach(function (seg, idx) {
        if (seg === '') return;
        if (idx % 2 === 1) {
          var s = document.createElement('span'); s.className = 'accent'; s.textContent = seg;
          el.appendChild(s);
        } else {
          el.appendChild(document.createTextNode(seg));
        }
      });
    }
    /* Поточний стан тумблера «Гумове покриття» на картці */
    function currentCoating(product) {
      var prod = document.querySelector('.prod[data-product="' + product + '"]');
      var on = prod && prod.querySelector('.toggle__opt.is-on');
      return on ? on.getAttribute('data-coating') : 'Ні';
    }
    /* Показати галерею картки з урахуванням покриття:
       «Так» → фото з покриттям; якщо їх ще не додали — звичайні. */
    function renderProdGallery(product, coating) {
      if (!GALLERIES) return;
      if (!coating) coating = currentCoating(product);
      var key = product + (coating === 'Так' ? '_coated' : '');
      var photos = (GALLERIES[key] && GALLERIES[key].length) ? GALLERIES[key] : GALLERIES[product];
      applyGallery(product, photos);
    }

    function applyGallery(type, photos) {
      if (!Array.isArray(photos) || !photos.length) return;
      var prod = document.querySelector('.prod[data-product="' + type + '"]');
      if (!prod) return;
      var car = prod.querySelector('[data-carousel]');
      var track = car && car.querySelector('.prod__track');
      if (!track) return;
      var altBase = prod.getAttribute('data-type') || '';
      track.innerHTML = '';
      photos.forEach(function (p) {
        var slide = document.createElement('div'); slide.className = 'prod__slide';
        var img = document.createElement('img');
        img.src = '/' + String(p).replace(/^\/+/, '');
        img.alt = (altBase + ' титановий глушник').trim();
        img.loading = 'lazy'; img.decoding = 'async';
        slide.appendChild(img); track.appendChild(slide);
      });
      var dotsWrap = car.querySelector('[data-carousel-dots]');
      if (dotsWrap) {
        dotsWrap.innerHTML = '';
        photos.forEach(function (_, idx) {
          var s = document.createElement('span'); if (idx === 0) s.className = 'is-active';
          dotsWrap.appendChild(s);
        });
      }
      if (typeof window.__mountCarousel === 'function') window.__mountCarousel(car);
    }

    /* Кнопки керування відео (звук + play) — статична розмітка, без даних користувача. */
    var REVIEW_CTRLS =
      '<button class="review__sound" type="button" aria-label="Увімкнути звук">' +
      '<svg class="ic-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>' +
      '<svg class="ic-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.7 6a8.5 8.5 0 0 1 0 12"/></svg>' +
      '</button>' +
      '<button class="review__play" type="button" aria-label="Відтворити">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button>';

    /* Перебудова треку відео-відгуків зі списку в контенті з урахуванням ліміту показу.
       src підставляється лише як атрибут <source> через DOM (не innerHTML) — без ін'єкцій. */
    function renderReviews(reviews) {
      var track = document.getElementById('reviews-track');
      if (!track || !reviews) return;
      var vids = Array.isArray(reviews.videos) ? reviews.videos.slice() : [];
      var limit = parseInt(reviews.limit, 10);
      if (limit > 0) vids = vids.slice(0, limit);
      if (!vids.length) return;   // порожньо — лишаємо статичну розмітку
      track.innerHTML = '';
      vids.forEach(function (src) {
        var fig = document.createElement('figure'); fig.className = 'review is-paused';
        var video = document.createElement('video'); video.className = 'review__video';
        video.loop = true; video.muted = true; video.preload = 'metadata';
        video.setAttribute('playsinline', ''); video.playsInline = true;
        var source = document.createElement('source');
        source.src = '/' + String(src).replace(/^\/+/, '');
        source.type = /\.webm$/i.test(src) ? 'video/webm' : 'video/mp4';
        video.appendChild(source);
        fig.appendChild(video);
        fig.insertAdjacentHTML('beforeend', REVIEW_CTRLS);
        track.appendChild(fig);
      });
      if (typeof window.__initReviews === 'function') window.__initReviews();
    }
  })();

  /* ---- Header shadow ---- */
  var header = document.getElementById('header');
  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Burger ---- */
  var burger = document.querySelector('.burger');
  var nav = document.querySelector('.nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open'); burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else { revealEls.forEach(function (el) { el.classList.add('is-visible'); }); }

  /* ---- Counter ---- */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    function animate() {
      var target = parseInt(el.getAttribute('data-count'), 10);
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1400, start = null;
      function tick(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target).toLocaleString('uk-UA') + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    if ('IntersectionObserver' in window) {
      var o = new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting) { animate(); o.unobserve(e.target); } }); }, { threshold: 0.6 });
      o.observe(el);
    } else { animate(); }
  });

  /* ---- Coating toggle (Так/Ні) — перемикає ще й фото картки ---- */
  document.querySelectorAll('.toggle').forEach(function (group) {
    group.querySelectorAll('.toggle__opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        group.querySelectorAll('.toggle__opt').forEach(function (b) { b.classList.remove('is-on'); });
        btn.classList.add('is-on');
        var prod = btn.closest('.prod');
        var product = prod && prod.getAttribute('data-product');
        if (product && typeof window.__renderProdGallery === 'function') {
          window.__renderProdGallery(product, btn.getAttribute('data-coating'));
        }
      });
    });
  });

  /* ---- Product carousel (стрілки вперед/назад, без «перескоку» через край).
         mountCarousel — ідемпотентна (onclick перезаписується), тож її можна
         викликати повторно після перебудови слайдів галереї. ---- */
  function mountCarousel(car) {
    var track = car.querySelector('.prod__track');
    var next = car.querySelector('[data-carousel-next]');
    var prev = car.querySelector('[data-carousel-prev]');
    var dots = Array.prototype.slice.call(car.querySelectorAll('[data-carousel-dots] span'));
    var count = track ? track.children.length : 0;
    var i = 0;
    function go(n) {
      i = Math.max(0, Math.min(count - 1, n));
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      dots.forEach(function (d, idx) { d.classList.toggle('is-active', idx === i); });
      if (prev) prev.hidden = (i === 0);
      if (next) next.hidden = (count <= 1 || i === count - 1);
    }
    if (next) next.onclick = function () { go(i + 1); };
    if (prev) prev.onclick = function () { go(i - 1); };
    go(0);
  }
  window.__mountCarousel = mountCarousel;
  document.querySelectorAll('[data-carousel]').forEach(mountCarousel);

  /* ---- Calibers: mobile "drum" — картка, найближча до центру екрана, стає чіткою.
         Рахуємо від центру ВІКНА при звичайному скролі сторінки (без вкладеного скролу). ---- */
  (function () {
    var row = document.getElementById('ammo-row');
    if (!row) return;
    var cards = Array.prototype.slice.call(row.querySelectorAll('.ammo'));
    var mq = window.matchMedia('(max-width:980px)');
    var ticking = false;
    function apply() {
      ticking = false;
      if (!mq.matches) { cards.forEach(function (c) { c.classList.remove('is-center'); }); return; }
      var mid = window.innerHeight / 2;
      var best = null, bestDist = Infinity;
      cards.forEach(function (c) {
        var r = c.getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestDist) { bestDist = d; best = c; }
      });
      cards.forEach(function (c) { c.classList.toggle('is-center', c === best); });
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(apply); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', apply);
    if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
    apply();
    setTimeout(apply, 300);
  })();

  /* ---- Reviews: відео-відгуки (звук / play-pause / автоплей у в'юпорті / навігація).
         initReviews — ідемпотентна: після перебудови списку (з адмінки) її можна викликати
         повторно; вона перечитує .review з треку і навішує обробники наново. ---- */
  function initReviews() {
    var track = document.getElementById('reviews-track');
    if (!track) return;
    var next = document.getElementById('reviews-next');
    var prev = document.getElementById('reviews-prev');
    var figures = Array.prototype.slice.call(track.querySelectorAll('.review'));
    var count = figures.length, i = 0;

    // Стан кожного відео: play/pause + звук
    figures.forEach(function (fig) {
      var video = fig.querySelector('.review__video');
      var soundBtn = fig.querySelector('.review__sound');
      var playBtn = fig.querySelector('.review__play');
      if (!video) return;

      function syncPaused() { fig.classList.toggle('is-paused', video.paused); }
      video.addEventListener('play', syncPaused);
      video.addEventListener('pause', syncPaused);

      function togglePlay() {
        if (video.paused) { video.play().catch(function () {}); }
        else { video.pause(); }
      }
      if (playBtn) playBtn.addEventListener('click', togglePlay);
      video.addEventListener('click', togglePlay);

      if (soundBtn) soundBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        video.muted = !video.muted;
        soundBtn.classList.toggle('is-unmuted', !video.muted);
        soundBtn.setAttribute('aria-label', video.muted ? 'Увімкнути звук' : 'Вимкнути звук');
        if (video.muted === false && video.paused) video.play().catch(function () {});
      });

      // Автоплей (без звуку) лише коли відео у в'юпорті
      if ('IntersectionObserver' in window) {
        var vo = new IntersectionObserver(function (ents) {
          ents.forEach(function (en) {
            if (en.isIntersecting) { video.play().catch(function () {}); }
            else { video.pause(); }
          });
        }, { threshold: 0.5 });
        vo.observe(video);
      }
      syncPaused();
    });

    // Навігація між кількома відео
    function go(n) {
      i = Math.max(0, Math.min(count - 1, n));
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      if (prev) prev.hidden = (i === 0);
      if (next) next.hidden = (i === count - 1);
      figures.forEach(function (fig, idx) {
        var v = fig.querySelector('.review__video');
        if (v && idx !== i) { v.pause(); }
      });
    }
    if (count > 1) {
      if (next) next.onclick = function () { go(i + 1); };
      if (prev) prev.onclick = function () { go(i - 1); };
      go(0);
    } else {
      if (next) next.hidden = true;
      if (prev) prev.hidden = true;
      track.style.transform = 'translateX(0%)';
    }
  }
  window.__initReviews = initReviews;
  initReviews();

  /* ---- Кнопки «Замовити» відкривають модалку замовлення (див. order.js) ---- */
  /*    data-pick-type / data-pick-caliber / data-open-order обробляє order.js    */

  /* ---- Feedback form: сувора валідація + санітизація ----
     ВАЖЛИВО (backend): клієнтська валідація — лише для UX. Реальний захист від
     SQL-ін'єкцій/XSS робиться на сервері: parameterized queries / prepared statements
     (жодної конкатенації SQL з введеним текстом) + HTML-екранування при виводі в адмінці
     та у листі. Тут ми лише обмежуємо формат/довжину і чистимо керуючі символи. */
  var form = document.getElementById('order-form');
  var statusBox = document.getElementById('order-status');
  var submitBtn = document.getElementById('order-submit');
  function showStatus(msg, ok) {
    statusBox.hidden = false; statusBox.textContent = msg;
    statusBox.classList.toggle('is-ok', ok); statusBox.classList.toggle('is-err', !ok);
  }
  // прибрати керуючі/невидимі символи (захист від «хитрих» вставок)
  function clean(s) { s = String(s == null ? '' : s); var o = ''; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if ((c < 32 && c !== 9 && c !== 10) || (c >= 127 && c <= 159)) continue; o += s.charAt(i); } return o.trim(); }

  // Українські імена: літери (кир/лат), пробіл, апостроф, дефіс
  var NAME_RE = /^[A-Za-zА-Яа-яІіЇїЄєҐґ'’ \-]{2,40}$/;
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

  var validators = {
    name: function (v) {
      v = clean(v);
      if (!v) return 'Вкажіть ваше ім\'я';
      if (v.length < 2) return 'Ім\'я занадто коротке';
      if (!NAME_RE.test(v)) return 'Лише літери, пробіл, апостроф і дефіс';
      return '';
    },
    phone: function (v) {
      var d = String(v).replace(/\D/g, '');
      if (!d) return 'Вкажіть номер телефону';
      // приймаємо 380XXXXXXXXX (12), 80XXXXXXXXX (11), 0XXXXXXXXX (10)
      var ok = (d.length === 12 && d.indexOf('380') === 0) ||
               (d.length === 11 && d.indexOf('80') === 0) ||
               (d.length === 10 && d.charAt(0) === '0');
      return ok ? '' : 'Формат: +38 (0XX) XXX-XX-XX';
    },
    email: function (v) {
      v = clean(v);
      if (!v) return 'Вкажіть пошту';
      if (v.length > 60 || !EMAIL_RE.test(v)) return 'Некоректна пошта, напр. name@gmail.com';
      return '';
    },
    question: function (v) {
      v = clean(v);
      if (!v) return 'Напишіть ваше питання';
      if (v.length > 1200) return 'Максимум 1200 символів';
      return '';
    }
  };

  function setFieldError(inp, msg) {
    var field = inp.closest('.field');
    var errEl = field.querySelector('.field__err');
    if (msg) { if (errEl) errEl.textContent = msg; field.classList.add('is-invalid'); }
    else { field.classList.remove('is-invalid'); }
    return !msg;
  }

  // Маска телефону: +38 (0XX) XXX-XX-XX
  function formatPhone(v) {
    var d = String(v).replace(/\D/g, '');
    // наш префікс «+38 (» сам містить «38» — зрізаємо код країни один раз,
    // лишається національний номер 0XXXXXXXXX (це і робить видалення робочим)
    if (d.indexOf('38') === 0) d = d.slice(2);
    d = d.slice(0, 10);
    if (!d) return '';                                 // порожньо → поле повністю очищається
    var out = '+38 (' + d.slice(0, 3);
    if (d.length >= 3) out += ')';
    if (d.length > 3) out += ' ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }

  if (form) {
    var phoneInp = form.elements['phone'];
    if (phoneInp) {
      // національні цифри номера (без коду країни), максимум 10
      var natPhone = function (v) { var d = String(v).replace(/\D/g, ''); if (d.indexOf('38') === 0) d = d.slice(2); return d.slice(0, 10); };
      var prevPhone = natPhone(phoneInp.value);
      phoneInp.addEventListener('input', function (e) {
        var d = natPhone(phoneInp.value);
        // Backspace на символі форматування (напр. «)») не зменшує кількість цифр —
        // тоді прибираємо останню цифру самі, інакше номер «застрягає» на +38 (0XX).
        var deleting = e.inputType && e.inputType.indexOf('delete') === 0;
        if (deleting && d.length === prevPhone.length && d.length > 0) d = d.slice(0, -1);
        prevPhone = d;
        phoneInp.value = formatPhone(d);
        var L = phoneInp.value.length;
        try { phoneInp.setSelectionRange(L, L); } catch (e2) {}
        phoneInp.closest('.field').classList.remove('is-invalid');
      });
    }
    // прибирати помилку під час вводу
    form.querySelectorAll('.input').forEach(function (inp) {
      inp.addEventListener('input', function () { inp.closest('.field').classList.remove('is-invalid'); });
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var ok = true, firstBad = null;
      ['name', 'phone', 'email', 'question'].forEach(function (n) {
        var inp = form.elements[n];
        var msg = validators[n](inp.value);
        if (!setFieldError(inp, msg)) { ok = false; if (!firstBad) firstBad = inp; }
      });
      if (!ok) { if (firstBad) firstBad.focus(); return; }

      var payload = {
        name: clean(form.name.value),
        phone: '+' + String(form.phone.value).replace(/\D/g, '').replace(/^80/, '380').replace(/^0/, '380'),
        email: clean(form.email.value),
        question: clean(form.question.value)
      };
      submitBtn.disabled = true;
      var oldHtml = submitBtn.innerHTML; submitBtn.querySelector('.btn__label').textContent = 'Надсилаємо…';
      fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d.success) { showStatus('Дякуємо! Ваше звернення прийнято. Ми зв\'яжемося з вами найближчим часом.', true); form.reset(); }
          else { showStatus(res.d.error || 'Не вдалося надіслати. Спробуйте ще раз або зателефонуйте нам.', false); }
        })
        .catch(function () { showStatus('Помилка з\'єднання. Перевірте інтернет і спробуйте ще раз.', false); })
        .finally(function () { submitBtn.disabled = false; submitBtn.innerHTML = oldHtml; });
    });
  }
})();
