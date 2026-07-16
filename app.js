/* Было → Стало — генератор плашек.
   Вся обработка изображения выполняется в браузере на <canvas>. */

const $ = (id) => document.getElementById(id);

const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const state = {
  img: null,            // загруженное «Было»
  palette: null,        // подобранные цвета для адаптивного фона
  mode: 'preset',
};

/* ---------- Загрузка файла ---------- */
const dropzone = $('dropzone');
const fileInput = $('fileInput');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); });

function loadFile(file) {
  if (!file.type.startsWith('image/')) { alert('Выберите файл изображения'); return; }
  $('fileName').textContent = file.name;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.img = img;
    state.palette = extractPalette(img);
    $('download').disabled = false;
    canvas.classList.add('ready');
    render();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => alert('Не удалось открыть изображение');
  img.src = url;
}

/* ---------- Извлечение палитры из «Было» ---------- */
function extractPalette(img) {
  const s = 40; // уменьшенная копия для анализа
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, s, s);
  const data = cx.getImageData(0, 0, s, s).data;

  let r = 0, g = 0, b = 0, n = 0;
  // средний цвет по краям (рамка/фон коллажа обычно на периферии)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const edge = x < 4 || y < 4 || x > s - 5 || y > s - 5;
      if (!edge) continue;
      const i = (y * s + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  const [h, sat, l] = rgbToHsl(r, g, b);
  return {
    light: hslToCss(h, Math.min(sat + 8, 90), Math.min(l + 12, 62)),
    dark:  hslToCss(h, Math.min(sat + 14, 92), Math.max(l - 18, 20)),
    hue: h,
  };
}

/* ---------- Отрисовка ---------- */
function render() {
  if (!state.img) return;

  const W = clampInt($('plateW').value, 200, 4000, 1000);
  const H = clampInt($('plateH').value, 200, 4000, 675);
  canvas.width = W;
  canvas.height = H;
  $('dims').textContent = `${W} × ${H}`;

  // 1. Фон
  drawBackground(W, H);

  // 2. Картинка внутри
  const scale = +$('scale').value / 100;
  const borderW = $('borderOn').checked ? +$('borderW').value : 0;
  const radius = +$('radius').value;

  const img = state.img;
  const availW = W * scale;
  const availH = H * scale;
  const k = Math.min(availW / img.width, availH / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  // тень
  if ($('shadow').checked) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(W, H) * 0.03;
    ctx.shadowOffsetY = H * 0.012;
    roundRect(ctx, dx - borderW, dy - borderW, dw + borderW * 2, dh + borderW * 2, radius + borderW);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  // рамка
  if (borderW > 0) {
    roundRect(ctx, dx - borderW, dy - borderW, dw + borderW * 2, dh + borderW * 2, radius + borderW);
    ctx.fillStyle = $('borderColor').value;
    ctx.fill();
  }

  // само изображение со скруглением
  ctx.save();
  roundRect(ctx, dx, dy, dw, dh, radius);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawBackground(W, H) {
  const mode = state.mode;

  if (mode === 'solid') {
    ctx.fillStyle = $('solidColor').value;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  if (mode === 'blur') {
    drawBlurBackground(W, H);
    if ($('bokeh').checked) drawBokeh(W, H);
    return;
  }

  // preset / adaptive — диагональный градиент
  let c1, c2;
  if (mode === 'adaptive' && state.palette) {
    c1 = state.palette.light;
    c2 = state.palette.dark;
  } else {
    const hue = +$('presetHue').value;
    c1 = hslToCss(hue - 8, 70, 46);
    c2 = hslToCss(hue + 40, 78, 30);
  }
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // мягкий свет в верхнем углу
  const glow = ctx.createRadialGradient(W * 0.32, -H * 0.15, 0, W * 0.32, -H * 0.15, H * 0.9);
  glow.addColorStop(0, 'rgba(255,255,240,0.35)');
  glow.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if ($('bokeh').checked) drawBokeh(W, H);
}

function drawBlurBackground(W, H) {
  const img = state.img;
  const blur = +$('blurAmount').value;
  const dark = +$('blurDark').value / 100;

  // заполняем плашку увеличенной копией (cover)
  const k = Math.max(W / img.width, H / img.height) * 1.15;
  const dw = img.width * k, dh = img.height * k;
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();

  ctx.fillStyle = `rgba(0,0,0,${dark})`;
  ctx.fillRect(0, 0, W, H);
}

/* Боке (мягкие пятна света) + пузырьки */
function drawBokeh(W, H) {
  const rnd = mulberry32(0x9e37 + W * 7 + H * 13); // детерминированный шум по размеру
  ctx.save();
  // светящиеся пятна
  for (let i = 0; i < 14; i++) {
    const x = rnd() * W;
    const y = rnd() * H * 0.6;
    const r = 8 + rnd() * 46;
    const a = 0.05 + rnd() * 0.18;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${a})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // пузырьки-контуры
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 2 + rnd() * 9;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.2})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- Экспорт ---------- */
$('download').addEventListener('click', () => {
  if (!state.img) return;
  const type = $('format').value;
  const q = +$('quality').value / 100;
  const url = canvas.toDataURL(type, q);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Стало.' + (type === 'image/png' ? 'png' : 'jpg');
  a.click();
});

/* ---------- Утилиты ---------- */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clampInt(v, min, max, def) {
  v = parseInt(v, 10);
  if (isNaN(v)) return def;
  return Math.max(min, Math.min(max, v));
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
function hslToCss(h, s, l) {
  h = ((h % 360) + 360) % 360;
  return `hsl(${h}, ${Math.max(0, Math.min(100, s))}%, ${Math.max(0, Math.min(100, l))}%)`;
}

/* Детерминированный ГПСЧ, чтобы превью совпадало с сохранённым файлом */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Привязка контролов ---------- */
// сегменты режима фона
document.querySelectorAll('.seg').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    updateSubControls();
    render();
  });
});
function updateSubControls() {
  document.querySelectorAll('.sub-controls').forEach((el) => {
    el.classList.toggle('show', el.dataset.for.split(' ').includes(state.mode));
  });
}
updateSubControls();

// пресеты размеров
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $('plateW').value = chip.dataset.w;
    $('plateH').value = chip.dataset.h;
    render();
  });
});

// живые подписи значений
const bind = (id, fmt, out) => {
  const el = $(id);
  el.addEventListener('input', () => { if (out) $(out).textContent = fmt(el.value); render(); });
};
bind('scale', v => v + '%', 'scaleVal');
bind('radius', v => v + ' px', 'radiusVal');
bind('borderW', v => v + ' px', 'borderWVal');
bind('quality', v => v + '%', 'qVal');

// остальные — просто перерисовка
['plateW','plateH','presetHue','blurAmount','blurDark','solidColor',
 'bokeh','shadow','borderOn','borderColor','format']
  .forEach((id) => {
    const el = $(id);
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
