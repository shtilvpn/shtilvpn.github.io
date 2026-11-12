/* «Связь по регионам»: нажатие на регион выделяет его и подписывает название. Страница без скрипта работает:
   карта, легенда и список всех регионов на месте. Название берётся из <title> региона, своих слов нет. */
(function () {
  var svg = document.querySelector('.kt-risunok svg');
  var cap = document.querySelector('.kt-imya');
  if (!svg || !cap) return;
  var txt = cap.querySelector('span'), dot = cap.querySelector('i'), cur = null;

  function zvet(p) { return (p.getAttribute('class').match(/z-\w+/) || [''])[0]; }
  function pick(p) {
    if (cur) cur.classList.remove('on');
    if (!p || p === cur) {
      cur = null; svg.removeAttribute('data-vybor'); cap.hidden = true; return;
    }
    cur = p; p.classList.add('on'); svg.setAttribute('data-vybor', '');
    svg.insertBefore(p, svg.querySelector('circle'));
    txt.textContent = p.querySelector('title').textContent;
    dot.className = 'kt-kv ' + zvet(p);
    cap.hidden = false;
  }
  svg.addEventListener('click', function (e) {
    var t = e.target.closest('path.r, circle.t');
    if (t && t.tagName === 'circle') {
      var b = t.getBoundingClientRect();
      t = [].slice.call(document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2))
        .filter(function (el) { return el.matches && el.matches('path.r'); })[0];
    }
    pick(t || null);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pick(null); });
})();
