/* Вкладка «Размытие лиц и номеров»: выделяем области мышкой,
   закрываем их размытием, пикселями или заливкой. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { img: null, url: null, name: '', regions: [], mode: 'blur', shape: 'rect', drawing: null };

  /* ---------- Загрузка ---------- */
  const dz = $('blDrop'), input = $('blFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); load(e.dataTransfer.files[0]); });
  input.addEventListener('change', (e) => { load(e.target.files[0]); input.value = ''; });

  document.addEventListener('paste', (e) => {
    if ($('tabBlur').hidden) return;
    const f = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())[0];
    if (f) { e.preventDefault(); load(f); }
  });

  function load(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (st.url) URL.revokeObjectURL(st.url);
      st.img = img; st.url = url; st.name = file.name;
      st.regions = [];
      $('blName').textContent = file.name;
      $('blDownload').disabled = false;
      $('blDims').textContent = `${img.width} × ${img.height}`;
      draw();
    };
    img.src = url;
  }

  /* ---------- Отрисовка ---------- */
  /* Возвращает холст с закрытыми областями (в полном разрешении) */
  function compose() {
    const img = st.img;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const strength = +$('blStrength').value;
    for (const r of st.regions) {
      const x = r.x * img.width, y = r.y * img.height;
      const w = r.w * img.width, h = r.h * img.height;
      if (w < 2 || h < 2) continue;
      ctx.save();
      ctx.beginPath();
      if (r.shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      ctx.clip();

      if (r.mode === 'fill') {
        ctx.fillStyle = $('blColor').value;
        ctx.fillRect(x, y, w, h);
      } else if (r.mode === 'pixel') {
        // уменьшаем кусок и растягиваем обратно без сглаживания
        const px = Math.max(2, Math.round(Math.min(w, h) / (strength / 4)));
        const tw = Math.max(1, Math.round(w / px)), th = Math.max(1, Math.round(h / px));
        const tmp = document.createElement('canvas');
        tmp.width = tw; tmp.height = th;
        tmp.getContext('2d').drawImage(img, x, y, w, h, 0, 0, tw, th);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.filter = `blur(${Math.max(2, strength / 100 * Math.min(w, h) / 4)}px)`;
        // рисуем с запасом, чтобы у краёв не просвечивал фон
        ctx.drawImage(img, x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6,
          x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6);
        ctx.filter = 'none';
      }
      ctx.restore();
    }
    return cv;
  }

  function draw() {
    const cv = $('blCanvas');
    if (!st.img) { cv.classList.remove('ready'); return; }
    cv.classList.add('ready');
    const out = compose();
    cv.width = out.width; cv.height = out.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(out, 0, 0);

    // контуры готовых областей + текущая рамка
    const line = Math.max(2, Math.min(cv.width, cv.height) / 300);
    ctx.strokeStyle = 'rgba(42,167,155,0.9)';
    ctx.lineWidth = line;
    for (const r of st.regions) outline(ctx, r, cv);
    if (st.drawing) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.setLineDash([line * 3, line * 2]);
      outline(ctx, norm(st.drawing), cv);
      ctx.setLineDash([]);
    }
    $('blCount').textContent = st.regions.length;
  }

  function outline(ctx, r, cv) {
    const x = r.x * cv.width, y = r.y * cv.height;
    const w = r.w * cv.width, h = r.h * cv.height;
    ctx.beginPath();
    if (r.shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(x, y, w, h);
    ctx.stroke();
  }

  const norm = (d) => ({
    x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0),
    mode: st.mode, shape: st.shape,
  });

  /* ---------- Мышь ---------- */
  function pt(e) {
    const cv = $('blCanvas');
    const b = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: Math.max(0, Math.min(1, (p.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (p.clientY - b.top) / b.height)),
    };
  }

  const cv = $('blCanvas');
  cv.addEventListener('mousedown', start);
  cv.addEventListener('touchstart', start, { passive: false });
  function start(e) {
    if (!st.img) return;
    const p = pt(e);
    // клик по существующей области — убрать её
    const hitIdx = st.regions.findIndex((r) =>
      p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (hitIdx >= 0 && e.type === 'mousedown' && !e.shiftKey) {
      const before = st.regions.length;
      st.regions.splice(hitIdx, 1);
      if (before !== st.regions.length) { draw(); e.preventDefault(); return; }
    }
    st.drawing = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    e.preventDefault();
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  function move(e) {
    if (!st.drawing) return;
    const p = pt(e);
    st.drawing.x1 = p.x; st.drawing.y1 = p.y;
    draw();
    e.preventDefault();
  }
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
  function end() {
    if (!st.drawing) return;
    const r = norm(st.drawing);
    st.drawing = null;
    if (r.w > 0.01 && r.h > 0.01) st.regions.push(r);
    draw();
  }

  /* ---------- Контролы ---------- */
  document.querySelectorAll('#blMode .seg').forEach((b) => b.addEventListener('click', () => {
    st.mode = b.dataset.m;
    document.querySelectorAll('#blMode .seg').forEach((x) => x.classList.toggle('active', x === b));
    $('blColorRow').hidden = st.mode !== 'fill';
  }));
  document.querySelectorAll('#blShape .seg').forEach((b) => b.addEventListener('click', () => {
    st.shape = b.dataset.s;
    document.querySelectorAll('#blShape .seg').forEach((x) => x.classList.toggle('active', x === b));
  }));
  $('blStrength').addEventListener('input', () => {
    $('blStrengthVal').textContent = $('blStrength').value;
    draw();
  });
  $('blColor').addEventListener('input', draw);
  $('blUndo').addEventListener('click', () => { st.regions.pop(); draw(); });
  $('blClear').addEventListener('click', () => { st.regions = []; draw(); });

  $('blDownload').addEventListener('click', () => {
    if (!st.img) return;
    compose().toBlob((blob) => { if (blob) saveBlob(blob, outName('jpg')); }, 'image/jpeg', 0.92);
  });
})();
