/* Редактор фото: кадрирование, выравнивание горизонта, коррекция цвета.
   Открывается из вкладки «Сжатие». Работает с объектом edit:
   { angle, crop:{x,y,w,h} в долях 0..1, brightness, contrast, saturation, auto } */

(function (global) {
  const $ = (id) => document.getElementById(id);

  const DEFAULT_EDIT = () => ({
    angle: 0, crop: null,
    brightness: 100, contrast: 100, saturation: 100,
    auto: false,
  });

  /* Наибольший прямоугольник, вписанный в повёрнутое изображение —
     чтобы после выравнивания не оставалось пустых углов. */
  function largestInnerRect(w, h, angleRad) {
    const sinA = Math.abs(Math.sin(angleRad));
    const cosA = Math.abs(Math.cos(angleRad));
    if (sinA < 1e-9) return { w, h };
    const longSide = Math.max(w, h), shortSide = Math.min(w, h);
    if (shortSide <= 2 * sinA * cosA * longSide || Math.abs(sinA - cosA) < 1e-9) {
      const x = 0.5 * shortSide;
      return w >= h ? { w: x / sinA, h: x / cosA } : { w: x / cosA, h: x / sinA };
    }
    const cos2a = cosA * cosA - sinA * sinA;
    return { w: (w * cosA - h * sinA) / cos2a, h: (h * cosA - w * sinA) / cos2a };
  }

  /* Выпрямленное изображение: поворот на angle + обрезка пустых углов */
  function straighten(img, angleDeg) {
    const a = angleDeg * Math.PI / 180;
    const iw = img.width, ih = img.height;
    if (!angleDeg) {
      const c = document.createElement('canvas');
      c.width = iw; c.height = ih;
      c.getContext('2d').drawImage(img, 0, 0);
      return c;
    }
    const inner = largestInnerRect(iw, ih, a);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(inner.w));
    c.height = Math.max(1, Math.round(inner.h));
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.translate(c.width / 2, c.height / 2);
    x.rotate(-a);
    x.drawImage(img, -iw / 2, -ih / 2);
    return c;
  }

  /* Автоконтраст: растягиваем яркостный диапазон по гистограмме */
  function autoLevels(canvas) {
    const s = 160;
    const k = Math.min(1, s / Math.max(canvas.width, canvas.height));
    const sw = Math.max(1, Math.round(canvas.width * k));
    const sh = Math.max(1, Math.round(canvas.height * k));
    const tmp = document.createElement('canvas');
    tmp.width = sw; tmp.height = sh;
    tmp.getContext('2d').drawImage(canvas, 0, 0, sw, sh);
    const d = tmp.getContext('2d').getImageData(0, 0, sw, sh).data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
    }
    const total = sw * sh, cut = total * 0.005;   // отбрасываем по 0.5% хвостов
    let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > cut) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > cut) { hi = i; break; } }
    if (hi - lo < 8) return null;
    return { lo, hi };
  }

  /* Применяет коррекцию к готовому холсту (на месте) */
  function applyAdjust(canvas, edit) {
    const needFilter = edit.brightness !== 100 || edit.contrast !== 100 || edit.saturation !== 100;
    let levels = edit.auto ? autoLevels(canvas) : null;
    if (!needFilter && !levels) return canvas;

    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const x = out.getContext('2d');
    if (needFilter) {
      x.filter = `brightness(${edit.brightness}%) contrast(${edit.contrast}%) saturate(${edit.saturation}%)`;
    }
    x.drawImage(canvas, 0, 0);
    x.filter = 'none';

    if (levels) {
      const img = x.getImageData(0, 0, out.width, out.height);
      const d = img.data;
      const lut = new Uint8ClampedArray(256);
      const range = levels.hi - levels.lo;
      for (let i = 0; i < 256; i++) lut[i] = ((i - levels.lo) * 255) / range;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]];
      }
      x.putImageData(img, 0, 0);
    }
    return out;
  }

  /* Полный конвейер редактирования: выпрямить → обрезать → скорректировать */
  function render(img, edit) {
    let c = straighten(img, edit.angle || 0);
    const cr = edit.crop;
    if (cr && (cr.x > 0 || cr.y > 0 || cr.w < 1 || cr.h < 1)) {
      const sx = Math.round(cr.x * c.width);
      const sy = Math.round(cr.y * c.height);
      const sw = Math.max(1, Math.round(cr.w * c.width));
      const sh = Math.max(1, Math.round(cr.h * c.height));
      const cut = document.createElement('canvas');
      cut.width = sw; cut.height = sh;
      cut.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
      c = cut;
    }
    return applyAdjust(c, edit);
  }

  const hasEdits = (e) => !!e && (e.angle !== 0 || e.auto ||
    e.brightness !== 100 || e.contrast !== 100 || e.saturation !== 100 ||
    (e.crop && (e.crop.x > 0 || e.crop.y > 0 || e.crop.w < 1 || e.crop.h < 1)));

  /* ================= Интерфейс редактора ================= */
  let cur = null, edit = null, onApply = null;
  let base = null;              // выпрямленный холст (без обрезки), для превью
  let view = { x: 0, y: 0, w: 0, h: 0 };  // куда вписан base на канве
  let crop = { x: 0, y: 0, w: 1, h: 1 };
  let aspect = 0;               // 0 = свободно
  let drag = null;

  function open(item, cb) {
    cur = item; onApply = cb;
    edit = Object.assign(DEFAULT_EDIT(), item.edit || {});
    crop = edit.crop ? Object.assign({}, edit.crop) : { x: 0, y: 0, w: 1, h: 1 };
    aspect = 0;
    $('edAngle').value = edit.angle;
    $('edAngleVal').textContent = (+edit.angle).toFixed(1) + '°';
    $('edBright').value = edit.brightness;
    $('edContrast').value = edit.contrast;
    $('edSat').value = edit.saturation;
    $('edAuto').checked = !!edit.auto;
    syncVals();
    document.querySelectorAll('#edAspect .chip').forEach((b) => b.classList.toggle('on', b.dataset.a === '0'));
    $('edTitle').textContent = item.name;
    $('edModal').hidden = false;
    rebuildBase();
  }

  function close() { $('edModal').hidden = true; cur = null; }

  function syncVals() {
    $('edBrightVal').textContent = $('edBright').value + '%';
    $('edContrastVal').textContent = $('edContrast').value + '%';
    $('edSatVal').textContent = $('edSat').value + '%';
  }

  function rebuildBase() {
    if (!cur) return;
    edit.angle = +$('edAngle').value;
    base = straighten(cur.img, edit.angle);
    draw();
  }

  function draw() {
    if (!cur || !base) return;
    const cv = $('edCanvas');
    const box = cv.parentElement.getBoundingClientRect();
    const maxW = Math.max(200, box.width - 4), maxH = Math.max(200, box.height - 4);
    const k = Math.min(maxW / base.width, maxH / base.height);
    cv.width = Math.round(base.width * k);
    cv.height = Math.round(base.height * k);
    view = { x: 0, y: 0, w: cv.width, h: cv.height };

    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    x.filter = `brightness(${$('edBright').value}%) contrast(${$('edContrast').value}%) saturate(${$('edSat').value}%)`;
    x.drawImage(base, 0, 0, cv.width, cv.height);
    x.filter = 'none';

    // затемнение вне рамки кадрирования
    const r = cropPx();
    x.fillStyle = 'rgba(6,10,20,0.62)';
    x.fillRect(0, 0, cv.width, r.y);
    x.fillRect(0, r.y + r.h, cv.width, cv.height - r.y - r.h);
    x.fillRect(0, r.y, r.x, r.h);
    x.fillRect(r.x + r.w, r.y, cv.width - r.x - r.w, r.h);

    // рамка и сетка третей
    x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1;
    x.beginPath();
    for (let i = 1; i < 3; i++) {
      x.moveTo(r.x + r.w * i / 3, r.y); x.lineTo(r.x + r.w * i / 3, r.y + r.h);
      x.moveTo(r.x, r.y + r.h * i / 3); x.lineTo(r.x + r.w, r.y + r.h * i / 3);
    }
    x.stroke();

    // угловые маркеры
    x.fillStyle = '#2aa79b';
    corners(r).forEach((c) => x.fillRect(c.x - 5, c.y - 5, 10, 10));

    $('edSize').textContent = `${Math.round(crop.w * base.width)} × ${Math.round(crop.h * base.height)} px`;
  }

  const cropPx = () => ({
    x: view.x + crop.x * view.w, y: view.y + crop.y * view.h,
    w: crop.w * view.w, h: crop.h * view.h,
  });
  const corners = (r) => ([
    { k: 'nw', x: r.x, y: r.y }, { k: 'ne', x: r.x + r.w, y: r.y },
    { k: 'sw', x: r.x, y: r.y + r.h }, { k: 'se', x: r.x + r.w, y: r.y + r.h },
  ]);

  function pos(e) {
    const cv = $('edCanvas');
    const b = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - b.left) * (cv.width / b.width), y: (p.clientY - b.top) * (cv.height / b.height) };
  }

  function onDown(e) {
    if (!cur) return;
    const p = pos(e), r = cropPx();
    const hit = corners(r).find((c) => Math.abs(p.x - c.x) < 14 && Math.abs(p.y - c.y) < 14);
    if (hit) drag = { mode: hit.k, sx: p.x, sy: p.y, start: Object.assign({}, crop) };
    else if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h)
      drag = { mode: 'move', sx: p.x, sy: p.y, start: Object.assign({}, crop) };
    else return;
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag || !view.w) return;
    const p = pos(e);
    const dx = (p.x - drag.sx) / view.w, dy = (p.y - drag.sy) / view.h;
    const s = drag.start;
    let c = Object.assign({}, s);

    if (drag.mode === 'move') {
      c.x = Math.min(1 - s.w, Math.max(0, s.x + dx));
      c.y = Math.min(1 - s.h, Math.max(0, s.y + dy));
    } else {
      const MIN = 0.05;
      if (drag.mode.includes('w')) { c.x = Math.min(s.x + s.w - MIN, Math.max(0, s.x + dx)); c.w = s.x + s.w - c.x; }
      if (drag.mode.includes('e')) { c.w = Math.min(1 - s.x, Math.max(MIN, s.w + dx)); }
      if (drag.mode.includes('n')) { c.y = Math.min(s.y + s.h - MIN, Math.max(0, s.y + dy)); c.h = s.y + s.h - c.y; }
      if (drag.mode.includes('s')) { c.h = Math.min(1 - s.y, Math.max(MIN, s.h + dy)); }
      if (aspect) c = fitAspect(c, drag.mode);
    }
    crop = c;
    draw();
    e.preventDefault();
  }
  function onUp() { drag = null; }

  /* Подгоняет прямоугольник под заданные пропорции (в пикселях изображения) */
  function fitAspect(c, mode) {
    const iw = base.width, ih = base.height;
    let wpx = c.w * iw, hpx = c.h * ih;
    if (wpx / hpx > aspect) wpx = hpx * aspect; else hpx = wpx / aspect;
    let w = wpx / iw, h = hpx / ih;
    let x = c.x, y = c.y;
    if (mode && mode.includes('w')) x = c.x + c.w - w;
    if (mode && mode.includes('n')) y = c.y + c.h - h;
    x = Math.min(1 - w, Math.max(0, x));
    y = Math.min(1 - h, Math.max(0, y));
    return { x, y, w, h };
  }

  function setAspect(a) {
    aspect = a;
    document.querySelectorAll('#edAspect .chip').forEach((b) =>
      b.classList.toggle('on', +b.dataset.a === a));
    if (a) {
      // вписываем максимальный прямоугольник нужных пропорций по центру
      const iw = base.width, ih = base.height;
      let wpx = iw, hpx = iw / a;
      if (hpx > ih) { hpx = ih; wpx = ih * a; }
      crop = { x: (1 - wpx / iw) / 2, y: (1 - hpx / ih) / 2, w: wpx / iw, h: hpx / ih };
    } else {
      crop = { x: 0, y: 0, w: 1, h: 1 };
    }
    draw();
  }

  /* ---------- Привязка контролов ---------- */
  function bind() {
    const cv = $('edCanvas');
    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    $('edAngle').addEventListener('input', () => {
      $('edAngleVal').textContent = (+$('edAngle').value).toFixed(1) + '°';
      rebuildBase();
    });
    ['edBright', 'edContrast', 'edSat'].forEach((id) =>
      $(id).addEventListener('input', () => { syncVals(); draw(); }));
    $('edAuto').addEventListener('change', draw);

    document.querySelectorAll('#edAspect .chip').forEach((b) =>
      b.addEventListener('click', () => setAspect(+b.dataset.a)));

    $('edReset').addEventListener('click', () => {
      edit = DEFAULT_EDIT();
      crop = { x: 0, y: 0, w: 1, h: 1 };
      aspect = 0;
      $('edAngle').value = 0; $('edAngleVal').textContent = '0.0°';
      $('edBright').value = 100; $('edContrast').value = 100; $('edSat').value = 100;
      $('edAuto').checked = false;
      syncVals();
      document.querySelectorAll('#edAspect .chip').forEach((b) => b.classList.toggle('on', b.dataset.a === '0'));
      rebuildBase();
    });

    $('edCancel').addEventListener('click', close);
    $('edClose').addEventListener('click', close);
    $('edApply').addEventListener('click', () => {
      const e = {
        angle: +$('edAngle').value,
        crop: Object.assign({}, crop),
        brightness: +$('edBright').value,
        contrast: +$('edContrast').value,
        saturation: +$('edSat').value,
        auto: $('edAuto').checked,
      };
      const item = cur;
      close();
      if (onApply) onApply(item, e);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !$('edModal').hidden) close();
    });
    window.addEventListener('resize', () => { if (cur) draw(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  global.PhotoEditor = { open, render, hasEdits, DEFAULT_EDIT };
})(window);
