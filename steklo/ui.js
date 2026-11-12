// Общее поведение стекла сайта (из образца docs/design/zhidkoe-steklo/_common/ui.js без заглушек примерки:
// ссылки ведут куда ведут, копирование делает скрипт страницы). Нажатие видно на касании: Safari на iPhone
// без слушателя касаний не показывает :active. Блик за пальцем и курсором для кнопок с data-follow.
(function () {
  document.addEventListener('touchstart', function () {}, { passive: true });

  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('[data-follow]');
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
  /* Мастер подключения «шаг выполнен → дальше» (спека podklyuchenie-po-shagam): куда ведёт кнопка, знает таблица
     общего модуля бота в data-tablica; этап помнится во вкладке по устройству (data-klyuch), новый заход открывает
     карточку без мастера. Пока мастер идёт, оплата и приглашения ([data-posle-da]) ждут «Да». Без скрипта
     видны три шага списком. */
  var box = document.querySelector('[data-master]');
  if (!box) return;
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssTake(k) { try { var v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch (e) { return null; } }
  var tab = {};
  try { tab = JSON.parse(box.dataset.tablica); } catch (e) {}
  var key = box.dataset.klyuch, etap = '', saved = ssGet(key);
  if (ssTake('shtil_m_start')) { etap = '1'; ssSet(key, etap); }
  else if (tab[saved]) { etap = saved; }
  else if (tab[box.dataset.etap]) { etap = box.dataset.etap; }
  var etapy = [].slice.call(box.querySelectorAll('[data-etap-id]'));
  var nav = box.querySelector('[data-mnav]');
  var knopki = nav ? [].slice.call(nav.querySelectorAll('[data-m]')) : [];
  var bez = box.querySelector('[data-bez-mastera]'), ura = box.querySelector('[data-m-gotovo]');
  var posle = [].slice.call(document.querySelectorAll('[data-posle-da]'));
  var tiho = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function tip(e) { return /^\d$/.test(e) ? 'shag' : e === 'ok' ? 'vopros' : /^b\d$/.test(e) ? 'beda' : e; }
  function risovat() {
    if (box.hidden) return null;
    var idet = !!tab[etap] && etap !== 'gotovo', t = tip(etap), cur = null;
    etapy.forEach(function (el) { var on = idet && el.dataset.etapId === etap; el.hidden = !on; if (on) cur = el; });
    knopki.forEach(function (b) {
      var k = b.dataset.m, gr = (b.dataset.gruppa || '').split(' ');
      b.hidden = !idet || gr.indexOf(t) < 0 || tab[etap][k] === etap
        || (k === 'dalshe' && !!cur && cur.hasAttribute('data-zhdyot'));
    });
    if (nav) nav.hidden = !idet;
    if (bez) bez.hidden = idet;
    posle.forEach(function (el) { el.hidden = idet; });
    box.setAttribute('data-idet', idet ? t : '');
    return cur;
  }
  function idti(k) {
    var s = tab[etap] ? etap : 'gotovo', novyy = tab[s] && tab[s][k];
    if (!novyy || novyy === etap) return;
    etap = novyy;
    ssSet(key, etap);
    if (ura) ura.hidden = !(etap === 'gotovo' && k === 'da');
    var cur = risovat();
    if (!cur) return;
    var tiko = !!(tiho && tiho.matches), dx = tiko ? 0 : (k === 'nazad' ? -12 : 12);
    if (cur.animate) {
      cur.animate([{ opacity: 0, transform: 'translateX(' + dx + 'px)' }, { opacity: 1, transform: 'none' }],
        { duration: tiko ? 150 : 220, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    }
    var f = cur.hasAttribute('tabindex') ? cur : cur.querySelector('[tabindex]');
    if (f) f.focus({ preventScroll: true });
    if (box.getBoundingClientRect().top < 0) box.scrollIntoView({ block: 'start', behavior: tiko ? 'auto' : 'smooth' });
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-m]');
    if (b && box.contains(b)) idti(b.dataset.m);
  });
  document.addEventListener('master', function (e) {
    var d = e.detail || {};
    if (d.k && (!d.esli || d.esli === etap)) idti(d.k); else risovat();
  });
  // Шаг ждал ключа (data-zhdyot): страница сняла метку, мастер перерисовывается сам
  if (window.MutationObserver) {
    new MutationObserver(function () { risovat(); }).observe(box, { subtree: true, attributeFilter: ['data-zhdyot'] });
  }
  risovat();
})();
