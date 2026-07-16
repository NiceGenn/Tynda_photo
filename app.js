/* Было → Стало — генератор плашек.
   Вся обработка изображений выполняется в браузере на <canvas>. */

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let uidSeq = 0;
const state = {
  items: [],       // [{ id, name, img, url, palette }]
  current: -1,     // индекс выбранного для превью (режим «Плашка»)
  mode: 'preset',  // фон
  collage: false,  // режим коллажа
};

/* Макеты коллажа: ячейки в относительных координатах [x, y, w, h] (0..1) */
const LAYOUTS = {
  '2h': [[0, 0, .5, 1], [.5, 0, .5, 1]],
  '2v': [[0, 0, 1, .5], [0, .5, 1, .5]],
  '3l': [[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]],
  '3t': [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
  '3c': [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]],
  '4g': [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
  '4l': [[0, 0, .6, 1], [.6, 0, .4, 1 / 3], [.6, 1 / 3, .4, 1 / 3], [.6, 2 / 3, .4, 1 / 3]],
  '5m': [[0, 0, .5, .58], [.5, 0, .5, .58], [0, .58, 1 / 3, .42], [1 / 3, .58, 1 / 3, .42], [2 / 3, .58, 1 / 3, .42]],
  '6g': [[0, 0, 1 / 3, .5], [1 / 3, 0, 1 / 3, .5], [2 / 3, 0, 1 / 3, .5], [0, .5, 1 / 3, .5], [1 / 3, .5, 1 / 3, .5], [2 / 3, .5, 1 / 3, .5]],
};

/* ================= Загрузка файлов ================= */
const dropzone = $('dropzone');
const fileInput = $('fileInput');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value = ''; });

function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  let pending = files.length;
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // url НЕ отзываем сразу — он нужен превьюшкам в галерее; освободим при удалении
      state.items.push({ id: ++uidSeq, name: file.name, img, url, palette: extractPalette(img) });
      if (state.current < 0) state.current = state.items.length - 1;
      if (--pending === 0) { syncUI(); render(); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); if (--pending === 0) { syncUI(); render(); } };
    img.src = url;
  });
}

$('clearAll').addEventListener('click', () => {
  state.items.forEach((it) => URL.revokeObjectURL(it.url));
  state.items = []; state.current = -1;
  canvas.classList.remove('ready');
  syncUI();
});

function syncUI() {
  const n = state.items.length;
  const gallery = $('gallery');
  gallery.hidden = n === 0;
  $('galleryCount').textContent = n + ' фото';
  $('collageHint').hidden = !state.collage || n === 0;
  $('fileName').textContent = n ? `Выбрано: ${n}` : 'Файлы не выбраны';

  $('download').disabled = n === 0;
  // ZIP имеет смысл только в режиме «Плашка» (в коллаже результат один)
  $('downloadZip').hidden = state.collage;
  $('downloadZip').disabled = n < 1;
  $('downloadZip').textContent = n > 1 ? `📦 Скачать все (${n}) в ZIP` : '📦 Скачать (ZIP)';

  const thumbs = $('thumbs');
  thumbs.innerHTML = '';
  state.items.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'thumb' + (!state.collage && i === state.current ? ' active' : '');
    const badge = state.collage ? `<span class="ord">${i + 1}</span>` : '';
    el.innerHTML = `<img src="${it.url}" alt="">${badge}<button class="rm" title="Убрать">×</button>`;
    el.querySelector('img').addEventListener('click', () => { state.current = i; syncUI(); render(); });
    el.querySelector('.rm').addEventListener('click', (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(it.url);
      state.items.splice(i, 1);
      if (state.current >= state.items.length) state.current = state.items.length - 1;
      if (state.items.length === 0) canvas.classList.remove('ready');
      syncUI(); render();
    });
    thumbs.appendChild(el);
  });
}

/* ================= Палитра из «Было» ================= */
function extractPalette(img) {
  const s = 40;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, s, s);
  const data = cx.getImageData(0, 0, s, s).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    if (!(x < 4 || y < 4 || x > s - 5 || y > s - 5)) continue;
    const i = (y * s + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  const [h, sat, l] = rgbToHsl(r, g, b);
  return {
    light: hslToCss(h, Math.min(sat + 8, 90), Math.min(l + 12, 62)),
    dark: hslToCss(h, Math.min(sat + 14, 92), Math.max(l - 18, 20)),
    hue: h,
  };
}

/* ================= Композиция ================= */
/* Источник вставки: { drawable, w, h, palette, id }.
   В режиме «Плашка» — выбранное фото; в режиме «Коллаж» — собранный холст. */
function getSource() {
  if (state.collage) {
    const cv = buildCollage();
    if (!cv) return null;
    return { drawable: cv, w: cv.width, h: cv.height, palette: extractPalette(cv), id: 7 };
  }
  const item = state.items[state.current];
  if (!item) return null;
  return { drawable: item.img, w: item.img.width, h: item.img.height, palette: item.palette, id: item.id };
}

/* Собирает коллаж из загруженных фото в отдельный холст. */
function buildCollage() {
  if (!state.items.length) return null;
  const cells = LAYOUTS[$('collageLayout').value] || LAYOUTS['4g'];
  const [aw, ah] = $('collageAspect').value.split(':').map(Number);
  const LONG = 1600;
  let W, H;
  if (aw >= ah) { W = LONG; H = Math.round(LONG * ah / aw); }
  else { H = LONG; W = Math.round(LONG * aw / ah); }

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const minside = Math.min(W, H);
  const gap = (+$('collageGap').value / 100) * minside;
  const radius = (+$('collageRadius').value / 100) * minside;

  c.fillStyle = $('collageGapColor').value;
  c.fillRect(0, 0, W, H);

  cells.forEach((cell, i) => {
    const x = cell[0] * W + gap / 2, y = cell[1] * H + gap / 2;
    const w = cell[2] * W - gap, h = cell[3] * H - gap;
    if (w <= 0 || h <= 0) return;
    c.save();
    roundRect(c, x, y, w, h, radius);
    c.clip();
    const img = state.items[i] && state.items[i].img;
    if (img) {
      const k = Math.max(w / img.width, h / img.height); // cover
      const dw = img.width * k, dh = img.height * k;
      c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(x, y, w, h);
    }
    c.restore();
  });
  return cv;
}

/* Рисует готовую плашку в переданный контекст. Чистая функция от настроек. */
function compose(c2d, W, H, src) {
  drawBackground(c2d, W, H, src);
  drawImageInside(c2d, W, H, src.drawable, src.w, src.h);
  drawText(c2d, W, H);
}

function render() {
  const W = clampInt($('plateW').value, 200, 4000, 1000);
  const H = clampInt($('plateH').value, 200, 4000, 675);
  $('dims').textContent = `${W} × ${H}`;
  canvas.width = W; canvas.height = H;
  const src = getSource();
  if (!src) { canvas.classList.remove('ready'); return; }
  canvas.classList.add('ready');
  compose(ctx, W, H, src);
}

function drawBackground(c2d, W, H, src) {
  const mode = state.mode;
  if (mode === 'solid') {
    c2d.fillStyle = $('solidColor').value;
    c2d.fillRect(0, 0, W, H);
  } else if (mode === 'blur') {
    drawBlurBackground(c2d, W, H, src.drawable, src.w, src.h);
  } else {
    let c1, c2;
    if (mode === 'adaptive' && src.palette) { c1 = src.palette.light; c2 = src.palette.dark; }
    else { const hue = +$('presetHue').value; c1 = hslToCss(hue - 8, 70, 46); c2 = hslToCss(hue + 40, 78, 30); }
    const g = c2d.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    c2d.fillStyle = g; c2d.fillRect(0, 0, W, H);
    const glow = c2d.createRadialGradient(W * 0.32, -H * 0.15, 0, W * 0.32, -H * 0.15, H * 0.9);
    glow.addColorStop(0, 'rgba(255,255,240,0.35)');
    glow.addColorStop(1, 'rgba(255,255,240,0)');
    c2d.fillStyle = glow; c2d.fillRect(0, 0, W, H);
  }
  // декор поверх фона (детерминированный шум по размеру + id источника)
  const seed = (W * 73856093) ^ (H * 19349663) ^ ((src.id || 1) * 83492791);
  drawDecor(c2d, W, H, mulberry32(seed >>> 0));
}

function drawBlurBackground(c2d, W, H, img, iw, ih) {
  const blur = +$('blurAmount').value;
  const dark = +$('blurDark').value / 100;
  const k = Math.max(W / iw, H / ih) * 1.15;
  const dw = iw * k, dh = ih * k;
  c2d.save();
  c2d.filter = `blur(${blur}px)`;
  c2d.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  c2d.restore();
  c2d.fillStyle = `rgba(0,0,0,${dark})`;
  c2d.fillRect(0, 0, W, H);
}

function drawImageInside(c2d, W, H, img, iw, ih) {
  const scale = +$('scale').value / 100;
  const borderW = $('borderOn').checked ? +$('borderW').value : 0;
  const radius = +$('radius').value;
  const k = Math.min((W * scale) / iw, (H * scale) / ih);
  const dw = iw * k, dh = ih * k;
  const dx = (W - dw) / 2, dy = (H - dh) / 2;

  if ($('shadow').checked) {
    c2d.save();
    c2d.shadowColor = 'rgba(0,0,0,0.45)';
    c2d.shadowBlur = Math.max(W, H) * 0.03;
    c2d.shadowOffsetY = H * 0.012;
    roundRect(c2d, dx - borderW, dy - borderW, dw + borderW * 2, dh + borderW * 2, radius + borderW);
    c2d.fillStyle = '#000'; c2d.fill();
    c2d.restore();
  }
  if (borderW > 0) {
    roundRect(c2d, dx - borderW, dy - borderW, dw + borderW * 2, dh + borderW * 2, radius + borderW);
    c2d.fillStyle = $('borderColor').value; c2d.fill();
  }
  c2d.save();
  roundRect(c2d, dx, dy, dw, dh, radius);
  c2d.clip();
  c2d.drawImage(img, dx, dy, dw, dh);
  c2d.restore();
}

/* ================= Декор фона ================= */
function drawDecor(c2d, W, H, rnd) {
  const style = $('decor').value;
  const d = +$('density').value / 100;       // 0..1
  const color = $('decorColor').value;
  const area = W * H;
  const base = Math.sqrt(area) / 40;          // масштаб под размер плашки

  const styles = style === 'bokehSparkle' ? ['bokeh', 'sparkle'] : [style];
  for (const s of styles) DECOR[s]?.(c2d, W, H, rnd, d, color, base);
}

const DECOR = {
  none() {},

  bokeh(c2d, W, H, rnd, d, color, base) {
    const n = Math.round((8 + 40 * d));
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H * 0.7;
      const rad = base * (2 + rnd() * 10);
      const a = 0.04 + rnd() * 0.16;
      const rg = c2d.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      rg.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c2d.fillStyle = rg;
      c2d.beginPath(); c2d.arc(x, y, rad, 0, Math.PI * 2); c2d.fill();
    }
  },

  bubbles(c2d, W, H, rnd, d, color, base) {
    const n = Math.round(10 + 60 * d);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      const rad = base * (0.4 + rnd() * 2.2);
      c2d.beginPath(); c2d.arc(x, y, rad, 0, Math.PI * 2);
      c2d.strokeStyle = `rgba(${r},${g},${b},${0.1 + rnd() * 0.22})`;
      c2d.lineWidth = Math.max(1, base * 0.12);
      c2d.stroke();
    }
  },

  sparkle(c2d, W, H, rnd, d, color, base) {
    const n = Math.round(8 + 46 * d);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      const sz = base * (0.6 + rnd() * 2.4);
      const a = 0.35 + rnd() * 0.55;
      drawStar4(c2d, x, y, sz, `rgba(${r},${g},${b},${a})`);
    }
  },

  stars(c2d, W, H, rnd, d, color, base) {
    const n = Math.round(20 + 120 * d);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      const rad = Math.max(0.6, base * rnd() * 0.5);
      c2d.beginPath(); c2d.arc(x, y, rad, 0, Math.PI * 2);
      c2d.fillStyle = `rgba(${r},${g},${b},${0.2 + rnd() * 0.7})`;
      c2d.fill();
    }
  },

  confetti(c2d, W, H, rnd, d, color, base) {
    const n = Math.round(12 + 80 * d);
    const palette = ['#ff5d73', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff', '#ff9f1c'];
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      const w = base * (0.5 + rnd() * 1.1), h = w * (0.4 + rnd() * 0.6);
      c2d.save();
      c2d.translate(x, y); c2d.rotate(rnd() * Math.PI);
      c2d.globalAlpha = 0.55 + rnd() * 0.4;
      c2d.fillStyle = palette[(rnd() * palette.length) | 0];
      c2d.fillRect(-w / 2, -h / 2, w, h);
      c2d.restore();
    }
    c2d.globalAlpha = 1;
  },

  snow(c2d, W, H, rnd, d, color, base) {
    const n = Math.round(20 + 90 * d);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      const rad = base * (0.25 + rnd() * 1.1);
      c2d.beginPath(); c2d.arc(x, y, rad, 0, Math.PI * 2);
      c2d.fillStyle = `rgba(${r},${g},${b},${0.35 + rnd() * 0.5})`;
      c2d.fill();
    }
  },

  dots(c2d, W, H, rnd, d, color, base) {
    const step = base * (7 - 4 * d);           // плотнее при большем d
    const [r, g, b] = hexToRgb(color);
    c2d.fillStyle = `rgba(${r},${g},${b},0.18)`;
    for (let y = step; y < H; y += step)
      for (let x = step; x < W; x += step) {
        c2d.beginPath(); c2d.arc(x, y, Math.max(1, base * 0.14), 0, Math.PI * 2); c2d.fill();
      }
  },

  rays(c2d, W, H, rnd, d, color, base) {
    const n = Math.round(6 + 14 * d);
    const [r, g, b] = hexToRgb(color);
    const ox = W * 0.2, oy = -H * 0.1;
    c2d.save();
    for (let i = 0; i < n; i++) {
      const a0 = (Math.PI / n) * i + rnd() * 0.1;
      const spread = 0.04 + rnd() * 0.05;
      const len = Math.hypot(W, H) * 1.3;
      c2d.beginPath();
      c2d.moveTo(ox, oy);
      c2d.lineTo(ox + Math.cos(a0 - spread) * len, oy + Math.sin(a0 - spread) * len);
      c2d.lineTo(ox + Math.cos(a0 + spread) * len, oy + Math.sin(a0 + spread) * len);
      c2d.closePath();
      c2d.fillStyle = `rgba(${r},${g},${b},${0.03 + rnd() * 0.05})`;
      c2d.fill();
    }
    c2d.restore();
  },
};

function drawStar4(c2d, x, y, s, fill) {
  c2d.save();
  c2d.translate(x, y);
  c2d.fillStyle = fill;
  // блик
  const rg = c2d.createRadialGradient(0, 0, 0, 0, 0, s * 1.4);
  rg.addColorStop(0, fill);
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  c2d.fillStyle = rg;
  c2d.beginPath(); c2d.arc(0, 0, s * 1.4, 0, Math.PI * 2); c2d.fill();
  // четырёхлучевая звезда
  c2d.fillStyle = fill;
  c2d.beginPath();
  c2d.moveTo(0, -s); c2d.quadraticCurveTo(0, 0, s, 0);
  c2d.quadraticCurveTo(0, 0, 0, s); c2d.quadraticCurveTo(0, 0, -s, 0);
  c2d.quadraticCurveTo(0, 0, 0, -s);
  c2d.fill();
  c2d.restore();
}

/* ================= Текст поверх ================= */
function drawText(c2d, W, H) {
  if (!$('textOn').checked) return;
  const text = $('textValue').value.trim();
  if (!text) return;

  const size = (+$('textSize').value / 100) * H;
  const bold = $('textBold').checked ? '700' : '400';
  const font = $('textFont').value;
  const pos = $('textPos').value;
  const style = $('textStyle').value;
  const color = $('textColor').value;
  const pad = W * 0.04;

  c2d.save();
  c2d.font = `${bold} ${size}px ${font}`;
  c2d.textBaseline = 'middle';
  const lines = text.split('\n');
  const lineH = size * 1.2;
  const blockH = lineH * lines.length;

  const vert = pos[0]; // t/m/b
  const horiz = pos[1]; // l/c/r
  c2d.textAlign = horiz === 'l' ? 'left' : horiz === 'r' ? 'right' : 'center';
  const x = horiz === 'l' ? pad : horiz === 'r' ? W - pad : W / 2;
  let yTop = vert === 't' ? pad : vert === 'b' ? H - pad - blockH : (H - blockH) / 2;

  // подложка-плашка на всю ширину строки текста
  if (style === 'strip') {
    let maxW = 0;
    lines.forEach((l) => { maxW = Math.max(maxW, c2d.measureText(l).width); });
    const bx = horiz === 'l' ? pad - size * 0.4
      : horiz === 'r' ? W - pad - maxW - size * 0.4 : (W - maxW) / 2 - size * 0.4;
    c2d.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(c2d, bx, yTop - size * 0.35, maxW + size * 0.8, blockH + size * 0.1, size * 0.25);
    c2d.fill();
  }

  lines.forEach((line, i) => {
    const y = yTop + lineH * i + lineH / 2;
    if (style === 'shadow') {
      c2d.shadowColor = 'rgba(0,0,0,0.6)';
      c2d.shadowBlur = size * 0.25; c2d.shadowOffsetY = size * 0.05;
    }
    if (style === 'outline') {
      c2d.lineWidth = size * 0.12; c2d.strokeStyle = 'rgba(0,0,0,0.7)';
      c2d.lineJoin = 'round'; c2d.strokeText(line, x, y);
    }
    c2d.fillStyle = color;
    c2d.fillText(line, x, y);
    c2d.shadowColor = 'transparent'; c2d.shadowBlur = 0; c2d.shadowOffsetY = 0;
  });
  c2d.restore();
}

/* ================= Экспорт ================= */
function renderSrcToBlob(src, W, H, type, q) {
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  compose(off.getContext('2d'), W, H, src);
  return new Promise((res) => off.toBlob(res, type, q));
}
function plateSize() {
  return [clampInt($('plateW').value, 200, 4000, 1000), clampInt($('plateH').value, 200, 4000, 675)];
}

$('download').addEventListener('click', async () => {
  const src = getSource();
  if (!src) return;
  const { type, q, ext } = exportOpts();
  const [W, H] = plateSize();
  const blob = await renderSrcToBlob(src, W, H, type, q);
  const name = state.collage ? outName('коллаж', ext) : outName(state.items[state.current].name, ext);
  saveBlob(blob, name);
});

$('downloadZip').addEventListener('click', async () => {
  if (!state.items.length) return;                 // ZIP — только в режиме «Плашка»
  const btn = $('downloadZip');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Готовим архив…';
  const { type, q, ext } = exportOpts();
  const [W, H] = plateSize();
  const files = [];
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    const src = { drawable: it.img, w: it.img.width, h: it.img.height, palette: it.palette, id: it.id };
    const blob = await renderSrcToBlob(src, W, H, type, q);
    const buf = new Uint8Array(await blob.arrayBuffer());
    files.push({ name: outName(it.name, ext, i + 1), data: buf });
  }
  const zip = createZip(files);
  saveBlob(zip, 'Стало.zip');
  btn.disabled = false; btn.textContent = label;
});

function exportOpts() {
  const type = $('format').value;
  return { type, q: +$('quality').value / 100, ext: type === 'image/png' ? 'png' : 'jpg' };
}
function outName(orig, ext, idx) {
  const stem = (orig || 'image').replace(/\.[^.]+$/, '');
  const num = idx ? `_${String(idx).padStart(2, '0')}` : '';
  return `Стало_${stem}${num}.${ext}`;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================= Пресеты настроек (localStorage) ================= */
const PRESET_KEY = 'bylo_stalo_presets_v1';
const SETTING_IDS = ['plateW','plateH','presetHue','blurAmount','blurDark','solidColor',
  'decor','density','decorColor','scale','radius','shadow','borderOn','borderColor','borderW',
  'textOn','textValue','textPos','textStyle','textFont','textColor','textSize','textBold',
  'collageLayout','collageAspect','collageGap','collageRadius','collageGapColor',
  'format','quality'];

function collectSettings() {
  const o = { mode: state.mode, collage: state.collage };
  SETTING_IDS.forEach((id) => {
    const el = $(id);
    o[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return o;
}
function applySettings(o) {
  if (o.mode) setMode(o.mode);
  if ('collage' in o) setCollage(o.collage);
  SETTING_IDS.forEach((id) => {
    if (!(id in o)) return;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = o[id]; else el.value = o[id];
  });
  refreshLabels(); updateSubControls(); updateDecorUI(); render();
}
function loadPresets() { try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || {}; } catch { return {}; } }
function savePresets(p) { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); }
function refreshPresetSelect(sel) {
  const p = loadPresets();
  const s = $('presetSelect');
  s.innerHTML = '<option value="">— выбрать пресет —</option>';
  Object.keys(p).forEach((name) => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    s.appendChild(o);
  });
  if (sel) s.value = sel;
}
$('savePreset').addEventListener('click', () => {
  const name = prompt('Название пресета:');
  if (!name) return;
  const p = loadPresets();
  p[name] = collectSettings();
  savePresets(p); refreshPresetSelect(name);
});
$('deletePreset').addEventListener('click', () => {
  const name = $('presetSelect').value;
  if (!name) return;
  const p = loadPresets(); delete p[name];
  savePresets(p); refreshPresetSelect();
});
$('presetSelect').addEventListener('change', (e) => {
  const p = loadPresets();
  if (p[e.target.value]) applySettings(p[e.target.value]);
});

/* ================= Утилиты ================= */
function roundRect(c2d, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c2d.beginPath();
  c2d.moveTo(x + r, y);
  c2d.arcTo(x + w, y, x + w, y + h, r);
  c2d.arcTo(x + w, y + h, x, y + h, r);
  c2d.arcTo(x, y + h, x, y, r);
  c2d.arcTo(x, y, x + w, y, r);
  c2d.closePath();
}
function clampInt(v, min, max, def) {
  v = parseInt(v, 10);
  return isNaN(v) ? def : Math.max(min, Math.min(max, v));
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const dd = max - min;
    s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    switch (max) {
      case r: h = (g - b) / dd + (g < b ? 6 : 0); break;
      case g: h = (b - r) / dd + 2; break;
      default: h = (r - g) / dd + 4;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function hslToCss(h, s, l) {
  h = ((h % 360) + 360) % 360;
  return `hsl(${h}, ${Math.max(0, Math.min(100, s))}%, ${Math.max(0, Math.min(100, l))}%)`;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================= Привязка контролов ================= */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#bgMode .seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  updateSubControls();
}
document.querySelectorAll('#bgMode .seg').forEach((btn) => {
  btn.addEventListener('click', () => { setMode(btn.dataset.mode); render(); });
});
function updateSubControls() {
  document.querySelectorAll('.sub-controls[data-for]').forEach((el) => {
    el.classList.toggle('show', el.dataset.for.split(' ').includes(state.mode));
  });
}
updateSubControls();

// переключатель режима: Плашка ↔ Коллаж
function setCollage(on) {
  state.collage = !!on;
  document.querySelectorAll('#modeToggle .seg').forEach((b) =>
    b.classList.toggle('active', (b.dataset.collage === '1') === state.collage));
  $('collageGroup').hidden = !state.collage;
  syncUI();
}
document.querySelectorAll('#modeToggle .seg').forEach((btn) => {
  btn.addEventListener('click', () => { setCollage(btn.dataset.collage === '1'); render(); });
});

// текстовый блок показываем по чекбоксу
function updateTextUI() { $('textControls').classList.toggle('show', $('textOn').checked); }
$('textOn').addEventListener('change', updateTextUI);
updateTextUI();

// цвет декора не нужен для конфетти (мультицвет)
function updateDecorUI() {
  $('decorColorRow').style.display = $('decor').value === 'confetti' ? 'none' : 'flex';
}
$('decor').addEventListener('change', updateDecorUI);
updateDecorUI();

// пресеты размеров
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $('plateW').value = chip.dataset.w; $('plateH').value = chip.dataset.h; render();
  });
});

// живые подписи
const LABELS = [
  ['scale', (v) => v + '%', 'scaleVal'],
  ['radius', (v) => v + ' px', 'radiusVal'],
  ['borderW', (v) => v + ' px', 'borderWVal'],
  ['quality', (v) => v + '%', 'qVal'],
  ['density', (v) => v + '%', 'densityVal'],
  ['textSize', (v) => v + '%', 'textSizeVal'],
  ['collageGap', (v) => v + '%', 'collageGapVal'],
  ['collageRadius', (v) => v + '%', 'collageRadiusVal'],
];
function refreshLabels() { LABELS.forEach(([id, fmt, out]) => { $(out).textContent = fmt($(id).value); }); }
LABELS.forEach(([id, fmt, out]) => {
  $(id).addEventListener('input', () => { $(out).textContent = fmt($(id).value); render(); });
});

// все прочие контролы → перерисовка
['plateW','plateH','presetHue','blurAmount','blurDark','solidColor','decor','decorColor',
 'shadow','borderOn','borderColor','format',
 'textOn','textValue','textPos','textStyle','textFont','textColor','textBold',
 'collageLayout','collageAspect','collageGapColor']
  .forEach((id) => {
    const el = $(id);
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

// старт
refreshLabels();
refreshPresetSelect();

// регистрация service worker (офлайн-режим), не критично при ошибке
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
