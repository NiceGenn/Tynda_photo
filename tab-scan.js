/* Вкладка «Сканер документов»: отмечаем четыре угла листа, снятого под
   углом, и выпрямляем его перспективным преобразованием. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { img: null, url: null, name: '', pts: null, drag: -1, result: null, mode: 'photo' };

  /* ---------- Загрузка ---------- */
  const dz = $('scDrop'), input = $('scFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); load(e.dataTransfer.files[0]); });
  input.addEventListener('change', (e) => { load(e.target.files[0]); input.value = ''; });

  function load(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (st.url) URL.revokeObjectURL(st.url);
      st.img = img; st.url = url; st.name = file.name;
      st.result = null;
      resetPoints();
      $('scName').textContent = file.name;
      $('scApply').disabled = false;
      $('scDownload').disabled = true;
      $('scStage').textContent = 'Отметьте углы листа';
      draw();
    };
    img.src = url;
  }

  function resetPoints() {
    // ставим углы с небольшим отступом от краёв — так их сразу видно
    st.pts = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    st.result = null;
    $('scDownload').disabled = true;
  }
  $('scReset').addEventListener('click', () => { resetPoints(); $('scStage').textContent = 'Отметьте углы листа'; draw(); });

  /* ---------- Отрисовка разметки ---------- */
  function draw() {
    const cv = $('scCanvas');
    if (!st.img) { cv.classList.remove('ready'); return; }
    cv.classList.add('ready');

    if (st.result) {
      cv.width = st.result.width; cv.height = st.result.height;
      cv.getContext('2d').drawImage(st.result, 0, 0);
      $('scDims').textContent = `${st.result.width} × ${st.result.height}`;
      return;
    }

    const maxSide = 1400;
    const k = Math.min(1, maxSide / Math.max(st.img.width, st.img.height));
    const W = Math.round(st.img.width * k), H = Math.round(st.img.height * k);
    cv.width = W; cv.height = H;
    $('scDims').textContent = `${st.img.width} × ${st.img.height}`;
    const ctx = cv.getContext('2d');
    ctx.drawImage(st.img, 0, 0, W, H);

    const p = st.pts.map((q) => ({ x: q.x * W, y: q.y * H }));
    // затемняем всё, кроме выделенного четырёхугольника
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 3; i >= 1; i--) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,10,20,0.55)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.strokeStyle = '#2aa79b';
    ctx.lineWidth = Math.max(2, Math.min(W, H) / 300);
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
    ctx.stroke();

    const r = Math.max(7, Math.min(W, H) / 90);
    p.forEach((q, i) => {
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fillStyle = st.drag === i ? '#fff' : '#2aa79b';
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    });
  }

  /* ---------- Перетаскивание углов ---------- */
  function pt(e) {
    const cv = $('scCanvas');
    const b = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {
      x: Math.max(0, Math.min(1, (p.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (p.clientY - b.top) / b.height)),
    };
  }
  const cv = $('scCanvas');
  cv.addEventListener('mousedown', down);
  cv.addEventListener('touchstart', down, { passive: false });
  function down(e) {
    if (!st.img || st.result) return;
    const p = pt(e);
    let best = -1, bestD = 0.05;
    st.pts.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) { st.drag = best; draw(); e.preventDefault(); }
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  function move(e) {
    if (st.drag < 0) return;
    st.pts[st.drag] = pt(e);
    draw();
    e.preventDefault();
  }
  window.addEventListener('mouseup', () => { if (st.drag >= 0) { st.drag = -1; draw(); } });
  window.addEventListener('touchend', () => { if (st.drag >= 0) { st.drag = -1; draw(); } });

  /* ---------- Гомография ---------- */
  /* Решает систему 8×8 методом Гаусса */
  function solve(A, b) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]];
      [b[i], b[piv]] = [b[piv], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }

  /* Матрица перевода прямоугольника назначения в исходный четырёхугольник */
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = dst[i], { x: u, y: v } = src[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    const h = solve(A, b);
    return h ? [...h, 1] : null;
  }

  /* ---------- Выпрямление ---------- */
  function warp() {
    const iw = st.img.width, ih = st.img.height;
    const src = st.pts.map((p) => ({ x: p.x * iw, y: p.y * ih }));

    // размер результата: по средней длине сторон четырёхугольника
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    let W = Math.round((dist(src[0], src[1]) + dist(src[3], src[2])) / 2);
    let H = Math.round((dist(src[0], src[3]) + dist(src[1], src[2])) / 2);
    const ratio = +$('scRatio').value;
    if (ratio > 0) H = Math.round(W / ratio);
    const cap = 2000;
    if (Math.max(W, H) > cap) {
      const k = cap / Math.max(W, H);
      W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
    }

    const h = homography([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], src);
    if (!h) return null;

    // читаем исходник целиком и отображаем попиксельно с билинейной выборкой
    const sc = document.createElement('canvas');
    sc.width = iw; sc.height = ih;
    sc.getContext('2d').drawImage(st.img, 0, 0);
    const sd = sc.getContext('2d').getImageData(0, 0, iw, ih).data;

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const od = octx.createImageData(W, H);
    const dd = od.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const den = h[6] * x + h[7] * y + h[8];
        const u = (h[0] * x + h[1] * y + h[2]) / den;
        const v = (h[3] * x + h[4] * y + h[5]) / den;
        const o = (y * W + x) * 4;
        if (u < 0 || v < 0 || u >= iw - 1 || v >= ih - 1) { dd[o + 3] = 255; continue; }
        const x0 = u | 0, y0 = v | 0;
        const fx = u - x0, fy = v - y0;
        const i00 = (y0 * iw + x0) * 4, i10 = i00 + 4;
        const i01 = i00 + iw * 4, i11 = i01 + 4;
        for (let c = 0; c < 3; c++) {
          const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
          const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
          dd[o + c] = top * (1 - fy) + bot * fy;
        }
        dd[o + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return enhance(out);
  }

  /* Режимы «бумага» и «чёрно-белый» */
  function enhance(cv) {
    if (st.mode === 'photo') return cv;
    const ctx = cv.getContext('2d');
    const im = ctx.getImageData(0, 0, cv.width, cv.height);
    const d = im.data;

    // ищем уровень белого по яркому концу гистограммы
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
    }
    const total = cv.width * cv.height;
    let acc = 0, white = 255;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.08) { white = i; break; } }
    acc = 0; let black = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { black = i; break; } }
    const range = Math.max(20, white - black);

    for (let i = 0; i < d.length; i += 4) {
      if (st.mode === 'bw') {
        const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = (g - black) / range > 0.55 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        for (let c = 0; c < 3; c++) {
          d[i + c] = Math.max(0, Math.min(255, ((d[i + c] - black) * 255) / range));
        }
      }
    }
    ctx.putImageData(im, 0, 0);
    return cv;
  }

  $('scApply').addEventListener('click', () => {
    if (!st.img) return;
    $('scStage').textContent = 'Выпрямляем…';
    setTimeout(() => {
      const r = warp();
      if (!r) { $('scStage').textContent = 'Не вышло — углы стоят на одной линии'; return; }
      st.result = r;
      $('scStage').textContent = 'Готово';
      $('scDownload').disabled = false;
      draw();
    }, 30);
  });

  document.querySelectorAll('#scMode .seg').forEach((b) => b.addEventListener('click', () => {
    st.mode = b.dataset.m;
    document.querySelectorAll('#scMode .seg').forEach((x) => x.classList.toggle('active', x === b));
    if (st.result) { st.result = null; $('scApply').click(); }
  }));
  $('scRatio').addEventListener('change', () => {
    if (st.result) { st.result = null; $('scApply').click(); }
  });

  $('scDownload').addEventListener('click', () => {
    if (!st.result) return;
    st.result.toBlob((b) => { if (b) saveBlob(b, outName('jpg')); }, 'image/jpeg', 0.92);
  });
})();
