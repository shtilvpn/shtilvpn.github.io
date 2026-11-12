// «Жидкое стекло», одинаковое в любом браузере: море и преломление рисует видеокарта (WebGL),
// а не фильтр браузера (url-фильтр в backdrop-filter есть только в Chrome, в Safari стекло выходило матовым).
// 1) Море: холст во весь экран, стоит на месте, волны считает шейдер той же формулой, что была в SVG.
// 2) Стекло: второй холст во всю страницу, едет вместе с ней при прокрутке, поэтому стекло не отстаёт
//    от кнопок. Под каждой стеклянной кнопкой, карточкой и главной цифрой шейдер берёт море со сдвигом
//    по кромке (преломление), размывает, добавляет насыщенность. Заливку, кромку и текст рисует страница.
// 3) Главная цифра или знак: форма на холсте, из неё карта сдвига, маска и свечение под ней (в текстуру),
//    блики по кромке отдельным холстом поверх. Размытие считается своим кодом, без ctx.filter.
// Сайт: на странице входа несколько экранов, скрипт страницы показывает один. Предмет берётся видимый,
// смену экрана и настроения моря страница сообщает событием moodchange.
(function () {
  var root = document.documentElement;
  if (/nosf/.test(location.hash)) root.classList.add('nosf');
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cs = function (n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); };
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var probe = document.createElement('canvas').getContext('2d');
  function rgb(c) {
    probe.fillStyle = '#000'; probe.fillStyle = (c || '').trim() || '#fff';
    var v = probe.fillStyle;
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    return v.replace(/[^\d.,]/g, '').split(',').slice(0, 3).map(Number);
  }
  function mix(c, w, k) { return rgb(c).map(function (v) { return Math.round(v + (w - v) * k) / 255; }); }

  var old = document.querySelector('.wall'); if (old) old.remove();
  var oldfx = document.querySelector('.fx'); if (oldfx) oldfx.remove();
  var seaC = document.createElement('canvas'); seaC.className = 'sea'; seaC.setAttribute('aria-hidden', 'true');
  var glC = document.createElement('canvas'); glC.className = 'glass'; glC.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(glC, document.body.firstChild);
  document.body.insertBefore(seaC, glC);

  // ── Шейдеры ────────────────────────────────────────────────────────────
  var HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  var SEA =
    'uniform vec2 uView; uniform float uScale, uT, uShore, uGap0, uAmp, uBreathe, uSpd, uCrestA;' +
    'uniform vec4 uB[7]; uniform vec3 uC0[7]; uniform vec3 uC1[7]; uniform vec3 uC2[7]; uniform vec3 uSky1, uSky2;' +
    'float Phi(float z) { return 1.0 / (1.0 + exp(-1.702 * z)); }' +
    // Цвет моря в точке p (пиксели страницы относительно окна), blur: радиус размытия под стеклом
    'vec3 seaColor(vec2 p, float blur) {' +
    '  vec3 col = mix(uSky1, uSky2, clamp(p.y / uView.y, 0.0, 1.0));' +
    '  float sig = sqrt(blur * blur + 0.25 / (uScale * uScale));' +
    '  float dd[7]; float yt[7];' +
    '  float y = uShore, gap = uGap0; int k = -1;' +
    '  for (int i = 0; i < 7; i++) {' +
    '    float fi = float(i); vec4 b = uB[i];' +
    '    float amp = uAmp * (0.55 + fi * 0.16);' +
    '    float yy = y + sin(uT * 0.9 + fi * 0.5) * uBreathe * (i == 0 ? 0.6 : 1.0);' +
    '    float w1 = 6.2832 / b.x, w2 = w1 * 1.9, ph = uT * uSpd * b.w;' +
    '    float s1 = w1 * p.x + b.y + ph * 6.0, s2 = w2 * p.x + b.z - ph * 9.0;' +
    '    float c = yy + amp * (0.72 * sin(s1) + 0.28 * sin(s2));' +
    '    float sl = amp * (0.72 * w1 * cos(s1) + 0.28 * w2 * cos(s2));' +
    '    yt[i] = yy - amp; dd[i] = (p.y - c) / sqrt(1.0 + sl * sl);' +
    '    if (dd[i] > 4.0 * sig + 1.0) k = i;' +
    '    y += gap; gap *= 1.36;' +
    '  }' +
    '  for (int i = 0; i < 7; i++) {' +
    '    if (i < k) continue;' +
    '    if (p.y < yt[i] - 26.0 - 3.0 * blur) break;' +
    '    float d = dd[i];' +
    '    if (i > 0 && i > k) col = mix(col, vec3(10.0, 15.0, 42.0) / 255.0, 0.26 * Phi((d + 5.0) / sqrt(49.0 + blur * blur)));' +
    '    float g = clamp((p.y - yt[i]) / (uView.y + 40.0 - yt[i]), 0.0, 1.0);' +
    '    vec3 bc = g < 0.22 ? mix(uC0[i], uC1[i], g / 0.22) : mix(uC1[i], uC2[i], (g - 0.22) / 0.78);' +
    '    col = mix(col, bc, i == k ? 1.0 : Phi(d / sig));' +
    '    if (i > k || d < 4.0 * sig + 1.0) col = mix(col, vec3(1.0), uCrestA * (Phi((d + 0.6) / sig) - Phi((d - 0.6) / sig)));' +
    '  }' +
    '  return col;' +
    '}' +
    'vec3 sat(vec3 c, float s) {' +
    '  mat3 m = mat3(0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.715 + 0.285 * s,' +
    '    0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s);' +
    '  return clamp(m * c, 0.0, 1.0);' +
    '}';
  var VS_SEA = 'attribute vec2 aQ; void main() { gl_Position = vec4(aQ, 0.0, 1.0); }';
  var FS_SEA = HEAD + SEA + 'void main() { vec2 p = vec2(gl_FragCoord.x / uScale, uView.y - gl_FragCoord.y / uScale);' +
    ' gl_FragColor = vec4(seaColor(p, 0.0), 1.0); }';
  var VS_GL =
    'attribute vec2 aP; attribute vec4 aR, aS, aF; uniform vec2 uDoc; varying vec2 vP; varying vec4 vR, vS, vF;' +
    'void main() { vP = aP; vR = aR; vS = aS; vF = aF; gl_Position = vec4(aP.x / uDoc.x * 2.0 - 1.0, 1.0 - aP.y / uDoc.y * 2.0, 0.0, 1.0); }';
  var FS_GL = HEAD + SEA +
    'uniform float uScroll, uObjD, uShade; uniform sampler2D uTex; varying vec2 vP; varying vec4 vR, vS, vF;' +
    'void main() {' +
    '  vec2 q = vP - vR.xy;' +
    '  if (vF.w < 0.5) {' +
    // Скруглённый прямоугольник: покрытие по расстоянию до края, нормаль и глубина кромки как в прежней карте сдвига
    '    float r = vS.x; vec2 hs = vR.zw * 0.5; vec2 dq = abs(q - hs) - (hs - vec2(r));' +
    '    float sd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - r;' +
    '    float cov = clamp(0.5 - sd * uScale, 0.0, 1.0);' +
    '    if (cov <= 0.0) discard;' +
    '    vec2 cc = clamp(q, vec2(r), vR.zw - vec2(r)); vec2 n = q - cc; float dist = length(n); float edge;' +
    '    if (dist > 0.0) { edge = r - dist; n /= dist; }' +
    '    else { float dl = q.x, dr = vR.z - q.x, dt = q.y, db = vR.w - q.y; float m = min(min(dl, dr), min(dt, db)); edge = m;' +
    '      n = m == dl ? vec2(-1.0, 0.0) : m == dr ? vec2(1.0, 0.0) : m == dt ? vec2(0.0, -1.0) : vec2(0.0, 1.0); }' +
    '    float kk = 0.0; if (edge >= 0.0 && edge < vS.y) { float qq = 1.0 - edge / vS.y; kk = qq * qq; }' +
    '    vec2 s = vP + n * kk * vS.z * 0.498;' +
    '    vec3 c = sat(seaColor(s - vec2(0.0, uScroll), vS.w), vF.x) * vF.y;' +
    '    float a = cov * vF.z;' +
    '    gl_FragColor = vec4(c * a, a);' +
    '  } else {' +
    // Стеклянный предмет: сдвиг из текстуры, под стеклом море со свечением, по маске
    '    vec4 t = texture2D(uTex, q / vR.zw);' +
    '    vec2 s = vP + (t.rg - 0.5) * uObjD;' +
    '    float glow = uShade * texture2D(uTex, (s - vR.xy) / vR.zw).b;' +
    '    vec3 c = mix(seaColor(s - vec2(0.0, uScroll), 0.0), vec3(1.0), glow);' +
    '    c = clamp(sat(c, 1.5) * 1.08, 0.0, 1.0);' +
    '    float sh = uShade * t.b, m = t.a * vF.z;' +
    '    gl_FragColor = vec4(c * m + vec3(sh) * (1.0 - m), m + sh * (1.0 - m));' +
    '  }' +
    '}';

  function makeGL(canvas, attrs, vs, fs) {
    var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) return null;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    var locs = {};
    return { gl: gl, p: p, u: function (n) { return n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(p, n)); } };
  }
  var S = makeGL(seaC, { alpha: false, antialias: false, depth: false, stencil: false }, VS_SEA, FS_SEA);
  var G = S && makeGL(glC, { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }, VS_GL, FS_GL);
  if (!S || !G) { root.classList.add('no-gl'); return; }

  // Море: один треугольник на весь экран
  (function () {
    var gl = S.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var a = gl.getAttribLocation(S.p, 'aQ'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  })();
  // Стекло: пачка четырёхугольников, по 14 чисел на вершину
  var gbuf = G.gl.createBuffer();
  (function () {
    var gl = G.gl; gl.bindBuffer(gl.ARRAY_BUFFER, gbuf);
    [['aP', 2, 0], ['aR', 4, 2], ['aS', 4, 6], ['aF', 4, 10]].forEach(function (x) {
      var a = gl.getAttribLocation(G.p, x[0]); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, x[1], gl.FLOAT, false, 56, x[2] * 4);
    });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 0]));
    gl.uniform1i(G.u('uTex'), 0);
  })();

  // ── Настройки моря из состояния страницы ──────────────────────────────
  var W = 0, H = 0, DW = 0, DH = 0, scale = Math.min(2, devicePixelRatio || 1), shore = 300, gap0 = 30, P = {};
  function readMood() {
    var dark = root.getAttribute('data-theme') === 'dark';
    P = { amp: +cs('--amp') || 10, len: +cs('--len') || 400, spd: +cs('--spd') || 0, breathe: +cs('--breathe') || 0 };
    var r = rnd(5), B = [], C0 = [], C1 = [], C2 = [];
    for (var i = 1; i <= 7; i++) {
      var c = cs('--b' + i);
      var lam = P.len * (.78 + r() * .5), p1 = r() * 6.28, p2 = r() * 6.28, dir = r() < .5 ? -1 : 1, k = .8 + r() * .5;
      B.push(lam, p1, p2, dir * k);
      C0.push.apply(C0, mix(c, 255, dark ? .1 : .3)); C1.push.apply(C1, mix(c, 0, 0)); C2.push.apply(C2, mix(c, 0, dark ? .2 : .08));
    }
    P.B = B; P.C0 = C0; P.C1 = C1; P.C2 = C2;
    P.sky1 = mix(cs('--sky1'), 0, 0); P.sky2 = mix(cs('--sky2'), 0, 0); P.crest = dark ? .16 : .5;
    P.shade = parseFloat(getComputedStyle(root).getPropertyValue('--shade')) || .2;
  }
  function seaUniforms(X) {
    var gl = X.gl;
    gl.uniform4fv(X.u('uB'), P.B); gl.uniform3fv(X.u('uC0'), P.C0); gl.uniform3fv(X.u('uC1'), P.C1); gl.uniform3fv(X.u('uC2'), P.C2);
    gl.uniform3fv(X.u('uSky1'), P.sky1); gl.uniform3fv(X.u('uSky2'), P.sky2);
    gl.uniform1f(X.u('uAmp'), P.amp); gl.uniform1f(X.u('uBreathe'), P.breathe); gl.uniform1f(X.u('uSpd'), P.spd);
    gl.uniform1f(X.u('uCrestA'), P.crest); gl.uniform1f(X.u('uShore'), shore); gl.uniform1f(X.u('uGap0'), gap0);
    gl.uniform2f(X.u('uView'), W, H); gl.uniform1f(X.u('uScale'), scale);
  }
  function measure() {
    W = innerWidth; H = innerHeight;
    var o = obj && obj.closest('.hero') ? obj : null;
    if (o) {
      var r = o.getBoundingClientRect(), cut = o.classList.contains('o-word') ? .42 : o.classList.contains('o-code') ? .46 : .36;
      shore = r.top + scrollY + r.height * cut;
    } else shore = H * .4;
    gap0 = Math.max(18, Math.min(34, (H - shore) / 16));
    seaC.width = Math.round(W * scale); seaC.height = Math.round(H * scale);
    S.gl.viewport(0, 0, seaC.width, seaC.height);
  }
  var page = document.querySelector('.page');
  function docSize() {
    var w = document.documentElement.clientWidth, h = Math.max(innerHeight, Math.ceil(page.getBoundingClientRect().bottom + scrollY));
    if (w === DW && h === DH) return false;
    DW = w; DH = h;
    glC.style.width = w + 'px'; glC.style.height = h + 'px';
    glC.width = Math.round(w * scale); glC.height = Math.round(h * scale);
    G.gl.viewport(0, 0, glC.width, glC.height);
    G.gl.uniform2f(G.u('uDoc'), w, h);
    return true;
  }

  // ── Стеклянный предмет: форма, карта сдвига, свечение, блики ───────────
  function blur(a, w, h, sigma) { // три прохода скользящего окна ≈ гауссово размытие
    var r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2)), t = new Float32Array(a.length), n = 2 * r + 1;
    for (var pass = 0; pass < 3; pass++) {
      for (var y = 0; y < h; y++) {
        var o = y * w, acc = 0, i;
        for (i = -r; i <= r; i++) acc += a[o + Math.min(w - 1, Math.max(0, i))];
        for (var x = 0; x < w; x++) {
          t[o + x] = acc / n;
          acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
        }
      }
      for (var x2 = 0; x2 < w; x2++) {
        var acc2 = 0, j;
        for (j = -r; j <= r; j++) acc2 += t[Math.min(h - 1, Math.max(0, j)) * w + x2];
        for (var y2 = 0; y2 < h; y2++) {
          a[y2 * w + x2] = acc2 / n;
          acc2 += t[Math.min(h - 1, y2 + r + 1) * w + x2] - t[Math.max(0, y2 - r) * w + x2];
        }
      }
    }
    return a;
  }
  function shapeCanvas(el, dpr) {
    var st = getComputedStyle(el), kind = el.getAttribute('data-shape'), pad = 26;
    var c = document.createElement('canvas'), x = c.getContext('2d'), w, h;
    if (kind === 'text') {
      // Разрядка по буквам вручную: ctx.letterSpacing есть не во всех браузерах
      var font = st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily, txt = el.getAttribute('data-text');
      var ls = parseFloat(st.letterSpacing) || 0, adv = [], asc = 0, desc = 0, left = 0, right = 0, run = 0;
      x.font = font;
      for (var i = 0; i < txt.length; i++) {
        var m = x.measureText(txt[i]);
        asc = Math.max(asc, m.actualBoundingBoxAscent); desc = Math.max(desc, m.actualBoundingBoxDescent);
        if (!i) left = m.actualBoundingBoxLeft;
        adv.push(run); if (i === txt.length - 1) right = run + m.actualBoundingBoxRight;
        run += m.width + ls;
      }
      w = Math.ceil(left + right + pad * 2); h = Math.ceil(asc + desc + pad * 2);
      c.width = w * dpr; c.height = h * dpr;
      x = c.getContext('2d'); x.scale(dpr, dpr); x.font = font; x.fillStyle = '#fff';
      for (var j = 0; j < txt.length; j++) x.fillText(txt[j], pad + left + adv[j], pad + asc);
    } else {
      var sz = parseFloat(st.getPropertyValue('--size')) || 180;
      w = h = Math.round(sz + pad * 2); c.width = w * dpr; c.height = h * dpr;
      x.scale(dpr, dpr); x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round';
      var s = Math.min(w, h) - pad * 2, cx = w / 2, cy = h / 2;
      var rr = function (X, Y, Wd, Hd, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + Wd, Y, X + Wd, Y + Hd, R); x.arcTo(X + Wd, Y + Hd, X, Y + Hd, R); x.arcTo(X, Y + Hd, X, Y, R); x.arcTo(X, Y, X + Wd, Y, R); x.closePath(); };
      if (kind === 'pause') {
        var bw = s * .26, bh = s * .86, gap = s * .16;
        [cx - gap / 2 - bw, cx + gap / 2].forEach(function (bx) { rr(bx, cy - bh / 2, bw, bh, bw / 2); x.fill(); });
      } else if (kind === 'watch') {
        var R = s * .4, lw = s * .115, cy2 = cy + s * .06;
        x.lineWidth = lw; x.beginPath(); x.arc(cx, cy2, R, 0, 6.2832); x.stroke();
        rr(cx - s * .09, cy2 - R - lw * .5 - s * .12, s * .18, s * .09, s * .03); x.fill();
        x.lineWidth = lw * .78;
        x.beginPath(); x.moveTo(cx, cy2); x.lineTo(cx, cy2 - R * .55); x.stroke();
        x.beginPath(); x.moveTo(cx, cy2); x.lineTo(cx + R * .42, cy2 + R * .22); x.stroke();
      }
    }
    return { c: c, w: w, h: h, pad: pad };
  }
  function pick() { return [].filter.call(document.querySelectorAll('.obj'), function (o) { return o.getClientRects().length; })[0] || null; }
  var obj = pick(), objD = 28;
  function solid(el) {
    var dpr = Math.min(2, devicePixelRatio || 1), Sh = shapeCanvas(el, 1), w = Sh.w, h = Sh.h;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    var A0 = Sh.c.getContext('2d').getImageData(0, 0, w, h).data, A = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) A[i] = A0[i * 4 + 3] / 255;
    var fs = parseFloat(getComputedStyle(el).fontSize) || 200;
    var bevel = el.getAttribute('data-shape') === 'text' ? Math.max(3, Math.min(9, fs * .03)) : Math.max(5, Math.min(10, w * .035));
    var B = blur(new Float32Array(A), w, h, bevel);
    // свечение: та же форма ниже на 1.4 кромки, размытая на 0.8 кромки: так оно выглядело в эталоне
    // (там холст размывал в точках экрана при плотности 2, то есть вдвое меньше, чем писал код)
    var off = Math.round(bevel * 1.4), L = new Float32Array(w * h);
    for (var y = off; y < h; y++) for (var x = 0; x < w; x++) L[y * w + x] = A[(y - off) * w + x];
    blur(L, w, h, bevel * .8);
    var maxD = Math.max(14, bevel * 3.2), zoom = .07, gain = 3.2 / bevel * 6;
    var v = function (i, j) { i = i < 0 ? 0 : i >= w ? w - 1 : i; j = j < 0 ? 0 : j >= h ? h - 1 : j; return B[j * w + i]; };
    var T = new Uint8Array(w * h * 4), N = new Float32Array(w * h * 3);
    for (var j = 0; j < h; j++) for (var i2 = 0; i2 < w; i2++) {
      var gx = (v(i2 + 1, j) - v(i2 - 1, j)) / 2, gy = (v(i2, j + 1) - v(i2, j - 1)) / 2, o = j * w + i2, a = A[o];
      var ax = -gx * gain * maxD + (w / 2 - i2) * zoom * a, ay = -gy * gain * maxD + (h / 2 - j) * zoom * a;
      T[o * 4] = 128 + Math.max(-1, Math.min(1, ax / maxD)) * 127;
      T[o * 4 + 1] = 128 + Math.max(-1, Math.min(1, ay / maxD)) * 127;
      T[o * 4 + 2] = Math.round(Math.min(1, L[o]) * 255); T[o * 4 + 3] = Math.round(a * 255);
      var l = Math.sqrt(gx * gx + gy * gy); N[o * 3] = l ? -gx / l : 0; N[o * 3 + 1] = l ? -gy / l : 0; N[o * 3 + 2] = Math.min(1, l * gain);
    }
    objD = maxD * 2;
    var gl = G.gl; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, T);
    // блики по кромке: тело с оттенком моря, тёмная кромка с теневой стороны, белый блик со стороны света
    el.innerHTML = '<canvas class="spec"></canvas>';
    var dark = root.getAttribute('data-theme') === 'dark';
    var hi = el.querySelector('.spec'), D = shapeCanvas(el, dpr);
    hi.width = w * dpr; hi.height = h * dpr;
    var hx = hi.getContext('2d'), HD = hx.createImageData(w * dpr, h * dpr), HA = D.c.getContext('2d').getImageData(0, 0, w * dpr, h * dpr).data, Q = HD.data;
    var est = getComputedStyle(el), num = function (n, d) { return parseFloat(est.getPropertyValue(n)) || d; };
    var body = num('--body', .12), edge = num('--edge', .5);
    var cb = rgb(est.getPropertyValue('--body-c')), ce = rgb(est.getPropertyValue('--edge-c'));
    for (var y2 = 0; y2 < h * dpr; y2++) for (var x2 = 0; x2 < w * dpr; x2++) {
      var o2 = (y2 * w * dpr + x2), a2 = HA[o2 * 4 + 3] / 255; if (!a2) continue;
      var n = ((y2 / dpr | 0) * w + (x2 / dpr | 0)) * 3, nx = N[n], ny = N[n + 1], mg = N[n + 2];
      var lit = -nx * .55 - ny * .83, s1 = Math.max(0, lit), s2 = Math.max(0, -lit) * .5;
      var aw = Math.min(1, (Math.pow(s1, 2.2) + Math.pow(s2, 2.6)) * mg * 1.25 * (dark ? .85 : 1));
      var ae = Math.min(1, Math.pow(mg, 1.4) * (1 - s1) * edge);
      var R = cb[0] * body, Gc = cb[1] * body, Bq = cb[2] * body, A2 = body;
      R = ce[0] * ae + R * (1 - ae); Gc = ce[1] * ae + Gc * (1 - ae); Bq = ce[2] * ae + Bq * (1 - ae); A2 = ae + A2 * (1 - ae);
      R = 255 * aw + R * (1 - aw); Gc = 255 * aw + Gc * (1 - aw); Bq = 255 * aw + Bq * (1 - aw); A2 = aw + A2 * (1 - aw);
      Q[o2 * 4] = R / A2; Q[o2 * 4 + 1] = Gc / A2; Q[o2 * 4 + 2] = Bq / A2; Q[o2 * 4 + 3] = A2 * a2 * 255;
    }
    hx.putImageData(HD, 0, 0);
  }

  // ── Где стекло: прямоугольники страницы каждый кадр (кнопка нажата, карточка раскрылась) ──
  var glass = [].slice.call(document.querySelectorAll('.gl:not(.bar)'));
  var KIND = {
    clear: { blur: 1.2, sat: 1.7, bri: 1.04, scale: 26 }, pane: { blur: 9, sat: 1.9, bri: 1.02, scale: 34 },
    tint: { blur: 2, sat: 1.5, bri: 1, scale: 26 },
  };
  var verts = new Float32Array((glass.length + 1) * 6 * 14), lastKey = '';
  function quad(k, x, y, w, h, s0, s1, s2, s3, f0, f1, f2, f3) {
    var X0 = x - 1, Y0 = y - 1, X1 = x + w + 1, Y1 = y + h + 1;
    [[X0, Y0], [X1, Y0], [X0, Y1], [X0, Y1], [X1, Y0], [X1, Y1]].forEach(function (pt, i) {
      verts.set([pt[0], pt[1], x, y, w, h, s0, s1, s2, s3, f0, f1, f2, f3], (k * 6 + i) * 14);
    });
  }
  function collect() {
    var k = 0, sx = scrollX, sy = scrollY, key = '';
    glass.forEach(function (el) {
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      var st = getComputedStyle(el), K = KIND[el.getAttribute('data-glass')] || KIND.clear;
      var op = parseFloat(st.opacity), rad = Math.min(parseFloat(st.borderTopLeftRadius) || 0, r.height / 2, r.width / 2);
      var bevel = K === KIND.pane ? 22 : Math.min(18, r.height * .36);
      quad(k++, r.left + sx, r.top + sy, r.width, r.height, rad, bevel, K.scale, K.blur, K.sat, K.bri, op, 0);
      key += (r.left + sx).toFixed(1) + ',' + (r.top + sy).toFixed(1) + ',' + r.width.toFixed(1) + ',' + r.height.toFixed(1) + ',' + op + ';';
    });
    if (obj && obj.style.width) {
      var r2 = obj.getBoundingClientRect();
      quad(k++, r2.left + sx, r2.top + sy, r2.width, r2.height, 0, 0, 0, 0, 0, 0, 1, 1);
      key += r2.left.toFixed(1) + ',' + (r2.top + sy).toFixed(1) + ',' + r2.width.toFixed(1);
    }
    var changed = key !== lastKey; lastKey = key;
    return { n: k, changed: changed };
  }

  // ── Кадр ───────────────────────────────────────────────────────────────
  var t0 = performance.now(), seaT = 0, frameN = 0, lastSy = -1, fpsN = 0, fpsT = performance.now();
  window.__fps = null;
  function drawSea(t) {
    var gl = S.gl; gl.uniform1f(S.u('uT'), t); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function drawGlass(n) {
    var gl = G.gl;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!n) return;
    gl.uniform1f(G.u('uT'), seaT); gl.uniform1f(G.u('uScroll'), scrollY);
    gl.uniform1f(G.u('uObjD'), objD); gl.uniform1f(G.u('uShade'), P.shade);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n * 6 * 14), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, n * 6);
  }
  function frame(now, force) {
    var sized = docSize();
    var tick = force || (!still && (frameN++ & 1) === 0);
    if (tick) { seaT = still ? 0 : (now - t0) / 1000; drawSea(seaT); }
    var c = collect(), moved = scrollY !== lastSy; lastSy = scrollY;
    if (tick || moved || c.changed || sized) drawGlass(c.n);
    fpsN++; if (now - fpsT >= 1000) { window.__fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; }
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (root.classList.contains('paused') || document.hidden) return;
    frame(now, false);
  }
  function all() {
    obj = pick(); readMood(); measure(); seaUniforms(S); seaUniforms(G);
    if (obj) solid(obj);
    DW = 0; docSize(); lastKey = '';
    frame(performance.now(), true);
  }
  function start() {
    all();
    requestAnimationFrame(loop);
    var tm; addEventListener('resize', function () { clearTimeout(tm); tm = setTimeout(all, 120); });
    addEventListener('themechange', function () { requestAnimationFrame(all); });
    addEventListener('moodchange', function () { requestAnimationFrame(all); });
  }
  var ready = [document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()];
  if (obj && document.fonts && document.fonts.load) {
    var st0 = getComputedStyle(obj); ready.push(document.fonts.load(st0.fontWeight + ' ' + st0.fontSize + ' ' + st0.fontFamily, obj.getAttribute('data-text') || '0').catch(function () {}));
  }
  Promise.all(ready).then(start, start);
})();
