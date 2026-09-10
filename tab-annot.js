/* Вкладка «Разметка»: стрелки, рамки, номера, текст, маркер и размытие
   поверх скриншота или фото. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { img: null, url: null, objs: [], tool: 'arrow', drawing: null };

  /* ---------- Загрузка ---------- */
  const dz = $('anDrop'), input = $('anFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); load(e.dataTransfer.files[0]); });
  input.addEventListener('change', (e) => { load(e.target.files[0]); input.value = ''; });
  document.addEventListener('paste', (e) => {
    if ($('tabAnnot').hidden) return;
    const f = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())[0];
    if (f) { e.preventDefault(); load(f); }
  });

  function load(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (st.url) URL.revokeObjectURL(st.url);
      st.img = img; st.url = url; st.objs = [];
      $('anName').textContent = file.name || 'из буфера';
      $('anDims').textContent = `${img.width} × ${img.height}`;
      $('anDownload').disabled = false;
      $('anCounter').value = 1;
      draw();
    };
    img.src = url;
  }

  /* ---------- Рисование объектов ---------- */
  function paint(ctx, o, W, H) {
    const x0 = o.x0 * W, y0 = o.y0 * H, x1 = o.x1 * W, y1 = o.y1 * H;
    const scale = Math.min(W, H) / 700;      // толщина в пропорции к кадру
    const lw = Math.max(1, o.width * scale);
    ctx.save();
    if (o.shadow && o.type !== 'blur' && o.type !== 'mark') {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = lw * 2;
    }
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (o.type === 'rect') {
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    } else if (o.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (o.type === 'line') {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else if (o.type === 'arrow') {
      const a = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.max(lw * 3.2, 10 * scale);
      const bx = x1 - Math.cos(a) * head * 0.9, by = y1 - Math.sin(a) * head * 0.9;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.42) * head, y1 - Math.sin(a - 0.42) * head);
      ctx.lineTo(x1 - Math.cos(a + 0.42) * head, y1 - Math.sin(a + 0.42) * head);
      ctx.closePath(); ctx.fill();
    } else if (o.type === 'mark') {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (o.type === 'num') {
      const r = Math.max(o.font * scale * 0.7, 12 * scale);
      ctx.beginPath(); ctx.arc(x0, y0, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${r * 1.25}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(o.num), x0, y0 + r * 0.05);
    } else if (o.type === 'text') {
      const size = o.font * scale;
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const lines = String(o.text).split('\n');
      lines.forEach((l, i) => ctx.fillText(l, x0, y0 + i * size * 1.2));
    }
    ctx.restore();
  }

  /* Размытые области рисуем до всего остального, чтобы поверх легли пометки */
  function paintBlur(ctx, o, W, H, img) {
    const x = Math.min(o.x0, o.x1) * W, y = Math.min(o.y0, o.y1) * H;
    const w = Math.abs(o.x1 - o.x0) * W, h = Math.abs(o.y1 - o.y0) * H;
    if (w < 2 || h < 2) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.filter = `blur(${Math.max(3, Math.min(w, h) / 8)}px)`;
    ctx.drawImage(img, x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6,
      x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6);
    ctx.restore();
  }

  function compose() {
    const img = st.img;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    st.objs.filter((o) => o.type === 'blur').forEach((o) => paintBlur(ctx, o, cv.width, cv.height, img));
    st.objs.filter((o) => o.type !== 'blur').forEach((o) => paint(ctx, o, cv.width, cv.height));
    return cv;
  }

  function draw() {
    const cv = $('anCanvas');
    if (!st.img) { cv.classList.remove('ready'); return; }
    cv.classList.add('ready');
    const out = compose();
    cv.width = out.width; cv.height = out.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(out, 0, 0);
    if (st.drawing) {
      if (st.drawing.type === 'blur') paintBlur(ctx, st.drawing, cv.width, cv.height, st.img);
      else paint(ctx, st.drawing, cv.width, cv.height);
    }
    $('anCount').textContent = st.objs.length;
  }

  /* ---------- Мышь ---------- */
  function pt(e) {
    const cv = $('anCanvas');
    const b = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: Math.max(0, Math.min(1, (p.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (p.clientY - b.top) / b.height)),
    };
  }
  const near = (o, p) => {
    const inBox = p.x >= Math.min(o.x0, o.x1) - 0.01 && p.x <= Math.max(o.x0, o.x1) + 0.01
      && p.y >= Math.min(o.y0, o.y1) - 0.01 && p.y <= Math.max(o.y0, o.y1) + 0.01;
    if (o.type === 'num' || o.type === 'text') return Math.hypot(o.x0 - p.x, o.y0 - p.y) < 0.05;
    return inBox;
  };

  const cv = $('anCanvas');
  cv.addEventListener('mousedown', down);
  cv.addEventListener('touchstart', down, { passive: false });
  function down(e) {
    if (!st.img) return;
    const p = pt(e);
    // клик по готовому объекту удаляет его
    const hit = [...st.objs].reverse().find((o) => near(o, p));
    if (hit && st.tool !== 'text') {
      st.objs.splice(st.objs.indexOf(hit), 1);
      draw(); e.preventDefault(); return;
    }
    const base = {
      type: st.tool, color: $('anColor').value,
      width: +$('anWidth').value, font: +$('anFont').value,
      shadow: $('anShadow').checked,
      x0: p.x, y0: p.y, x1: p.x, y1: p.y,
    };
    if (st.tool === 'num') {
      base.num = +$('anCounter').value || 1;
      st.objs.push(base);
      $('anCounter').value = base.num + 1;
      draw(); e.preventDefault(); return;
    }
    if (st.tool === 'text') {
      const t = prompt('Текст подписи:');
      if (t) { base.text = t; st.objs.push(base); draw(); }
      e.preventDefault(); return;
    }
    st.drawing = base;
    e.preventDefault();
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  function move(e) {
    if (!st.drawing) return;
    const p = pt(e);
    st.drawing.x1 = p.x; st.drawing.y1 = p.y;
    draw(); e.preventDefault();
  }
  window.addEventListener('mouseup', up);
  window.addEventListener('touchend', up);
  function up() {
    if (!st.drawing) return;
    const d = st.drawing;
    st.drawing = null;
    if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 0.01) st.objs.push(d);
    draw();
  }

  /* ---------- Контролы ---------- */
  document.querySelectorAll('#anTool .tool').forEach((b) => b.addEventListener('click', () => {
    st.tool = b.dataset.t;
    document.querySelectorAll('#anTool .tool').forEach((x) => x.classList.toggle('active', x === b));
  }));
  $('anWidth').addEventListener('input', () => { $('anWidthVal').textContent = $('anWidth').value; });
  $('anFont').addEventListener('input', () => { $('anFontVal').textContent = $('anFont').value; });
  $('anUndo').addEventListener('click', () => { st.objs.pop(); draw(); });
  $('anClear').addEventListener('click', () => { st.objs = []; $('anCounter').value = 1; draw(); });
  $('anDownload').addEventListener('click', () => {
    if (!st.img) return;
    compose().toBlob((b) => { if (b) saveBlob(b, outName('jpg')); }, 'image/jpeg', 0.93);
  });
})();
