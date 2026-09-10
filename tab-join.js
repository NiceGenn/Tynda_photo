/* Вкладка «Склейка»: несколько фото в одну картинку —
   столбиком, в ряд или сеткой. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { items: [], dir: 'v', dragFrom: -1 };

  /* ---------- Загрузка ---------- */
  const dz = $('jnDrop'), input = $('jnFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { add(e.target.files); input.value = ''; });
  $('jnClear').addEventListener('click', () => {
    st.items.forEach((i) => URL.revokeObjectURL(i.url));
    st.items = []; sync();
  });

  function add(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/'));
    let pending = files.length;
    if (!pending) return;
    files.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => { st.items.push({ img, url, name: f.name }); if (--pending === 0) sync(); };
      img.onerror = () => { if (--pending === 0) sync(); };
      img.src = url;
    });
  }

  function sync() {
    const n = st.items.length;
    $('jnGallery').hidden = n === 0;
    $('jnCount').textContent = n + ' фото';
    $('jnName').textContent = n ? `Выбрано: ${n}` : 'Файлы не выбраны';
    $('jnDownload').disabled = n === 0;

    const box = $('jnThumbs');
    box.innerHTML = '';
    st.items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'thumb';
      el.draggable = true;
      el.innerHTML = `<img src="${it.url}" draggable="false" alt=""><span class="ord">${i + 1}</span><button class="rm">×</button>`;
      el.querySelector('.rm').addEventListener('click', () => {
        URL.revokeObjectURL(it.url); st.items.splice(i, 1); sync();
      });
      el.addEventListener('dragstart', () => { st.dragFrom = i; el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-target'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('drop-target');
        if (st.dragFrom < 0 || st.dragFrom === i) return;
        const [m] = st.items.splice(st.dragFrom, 1);
        st.items.splice(i, 0, m);
        sync();
      });
      box.appendChild(el);
    });
    draw();
  }

  /* ---------- Отрисовка ---------- */
  function layout() {
    const gap = +$('jnGap').value, pad = +$('jnPad').value;
    const W = +$('jnSize').value;
    const items = st.items;
    if (!items.length) return null;

    if (st.dir === 'v') {
      // общая ширина, высоты пропорциональные
      const w = W - pad * 2;
      let y = pad;
      const cells = items.map((it) => {
        const h = w * (it.img.height / it.img.width);
        const c = { x: pad, y, w, h, img: it.img };
        y += h + gap;
        return c;
      });
      return { W, H: Math.round(y - gap + pad), cells };
    }
    if (st.dir === 'h') {
      // общая высота: подбираем так, чтобы суммарная ширина совпала с W
      const inner = W - pad * 2 - gap * (items.length - 1);
      const sumRatio = items.reduce((s, it) => s + it.img.width / it.img.height, 0);
      const h = inner / sumRatio;
      let x = pad;
      const cells = items.map((it) => {
        const w = h * (it.img.width / it.img.height);
        const c = { x, y: pad, w, h, img: it.img };
        x += w + gap;
        return c;
      });
      return { W, H: Math.round(h + pad * 2), cells };
    }
    // сетка: одинаковые квадратные ячейки, картинки вписываются по cover
    const cols = +$('jnCols').value;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const rows = Math.ceil(items.length / cols);
    const cells = items.map((it, i) => ({
      x: pad + (i % cols) * (cw + gap),
      y: pad + Math.floor(i / cols) * (cw + gap),
      w: cw, h: cw, img: it.img, cover: true,
    }));
    return { W, H: Math.round(pad * 2 + rows * cw + (rows - 1) * gap), cells };
  }

  function draw() {
    const cv = $('jnCanvas');
    const L = layout();
    if (!L) { cv.classList.remove('ready'); $('jnDims').textContent = '—'; return; }
    cv.classList.add('ready');
    cv.width = L.W; cv.height = L.H;
    $('jnDims').textContent = `${L.W} × ${L.H}`;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = $('jnBg').value;
    ctx.fillRect(0, 0, L.W, L.H);
    for (const c of L.cells) {
      if (c.cover) {
        const k = Math.max(c.w / c.img.width, c.h / c.img.height);
        const dw = c.img.width * k, dh = c.img.height * k;
        ctx.save();
        ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
        ctx.drawImage(c.img, c.x + (c.w - dw) / 2, c.y + (c.h - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
      }
    }
  }

  /* ---------- Контролы ---------- */
  document.querySelectorAll('#jnDir .seg').forEach((b) => b.addEventListener('click', () => {
    st.dir = b.dataset.d;
    document.querySelectorAll('#jnDir .seg').forEach((x) => x.classList.toggle('active', x === b));
    $('jnColsRow').hidden = st.dir !== 'grid';
    draw();
  }));
  [['jnGap', 'jnGapVal', (v) => v + ' px'], ['jnPad', 'jnPadVal', (v) => v + ' px'],
   ['jnSize', 'jnSizeVal', (v) => v + ' px'], ['jnCols', 'jnColsVal', (v) => v]].forEach(([id, out, f]) => {
    $(id).addEventListener('input', () => { $(out).textContent = f($(id).value); draw(); });
  });
  $('jnBg').addEventListener('input', draw);

  $('jnDownload').addEventListener('click', () => {
    $('jnCanvas').toBlob((b) => { if (b) saveBlob(b, outName('jpg')); }, 'image/jpeg', 0.92);
  });
})();
