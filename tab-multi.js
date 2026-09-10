/* Вкладка «Мультиэкспорт»: одно фото → сразу все нужные размеры,
   одним архивом. */

(function () {
  const $ = (id) => document.getElementById(id);

  const SIZES = [
    { id: 'site', label: 'Сайт · 1920×1080', w: 1920, h: 1080, on: true },
    { id: 'news', label: 'Плашка новости · 1000×675', w: 1000, h: 675, on: true },
    { id: 'vkpost', label: 'ВК, пост · 1280×720', w: 1280, h: 720, on: true },
    { id: 'vkcover', label: 'ВК, обложка · 1590×400', w: 1590, h: 400, on: false },
    { id: 'tg', label: 'Telegram · 1280×1280', w: 1280, h: 1280, on: false },
    { id: 'square', label: 'Квадрат · 1080×1080', w: 1080, h: 1080, on: true },
    { id: 'stories', label: 'Сторис · 1080×1920', w: 1080, h: 1920, on: true },
    { id: 'yt', label: 'Превью видео · 1280×720', w: 1280, h: 720, on: false },
    { id: 'avatar', label: 'Аватар · 400×400', w: 400, h: 400, on: false },
    { id: 'thumb', label: 'Миниатюра · 300×200', w: 300, h: 200, on: false },
  ];

  const st = { items: [], fit: 'cover' };

  /* ---------- Список размеров ---------- */
  const box = $('mxSizes');
  SIZES.forEach((s) => {
    const l = document.createElement('label');
    l.className = 'switch';
    l.innerHTML = `<input type="checkbox" data-size="${s.id}"${s.on ? ' checked' : ''}> ${s.label}`;
    l.querySelector('input').addEventListener('change', render);
    box.appendChild(l);
  });
  const chosen = () => SIZES.filter((s) => $('mxSizes').querySelector(`[data-size="${s.id}"]`).checked);
  $('mxAll').addEventListener('click', () => { box.querySelectorAll('input').forEach((i) => i.checked = true); render(); });
  $('mxNone').addEventListener('click', () => { box.querySelectorAll('input').forEach((i) => i.checked = false); render(); });

  /* ---------- Загрузка ---------- */
  const dz = $('mxDrop'), input = $('mxFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { add(e.target.files); input.value = ''; });

  function add(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/'));
    let pending = files.length;
    if (!pending) return;
    files.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => { st.items.push({ img, url, name: f.name }); if (--pending === 0) render(); };
      img.onerror = () => { if (--pending === 0) render(); };
      img.src = url;
    });
  }

  /* ---------- Отрисовка одного размера ---------- */
  function renderSize(img, s) {
    const cv = document.createElement('canvas');
    cv.width = s.w; cv.height = s.h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (st.fit === 'contain') {
      ctx.fillStyle = $('mxBg').value;
      ctx.fillRect(0, 0, s.w, s.h);
      const k = Math.min(s.w / img.width, s.h / img.height);
      const dw = img.width * k, dh = img.height * k;
      ctx.drawImage(img, (s.w - dw) / 2, (s.h - dh) / 2, dw, dh);
    } else {
      const k = Math.max(s.w / img.width, s.h / img.height);
      const dw = img.width * k, dh = img.height * k;
      ctx.drawImage(img, (s.w - dw) / 2, (s.h - dh) / 2, dw, dh);
    }
    return cv;
  }

  function render() {
    const list = $('mxList');
    const n = st.items.length, sizes = chosen();
    $('mxName').textContent = n ? `Выбрано: ${n}` : 'Файлы не выбраны';
    $('mxDownload').disabled = !n || !sizes.length;
    $('mxTotal').textContent = n && sizes.length ? `${n} × ${sizes.length} = ${n * sizes.length} файлов` : '—';
    $('mxDownload').textContent = n && sizes.length
      ? `📦 Скачать ${n * sizes.length} файлов (ZIP)` : '📦 Скачать все (ZIP)';

    if (!n || !sizes.length) {
      list.innerHTML = '<div class="empty-hint">Загрузите фото и отметьте нужные размеры</div>';
      return;
    }
    list.innerHTML = '';
    // показываем превью для первого фото — чтобы было видно, как ляжет кадр
    const img = st.items[0].img;
    sizes.forEach((s) => {
      const cv = renderSize(img, { ...s, w: Math.min(s.w, 320), h: Math.round(Math.min(s.w, 320) * s.h / s.w) });
      const row = document.createElement('div');
      row.className = 'c-row';
      row.innerHTML = `<div class="mx-prev"></div>
        <div class="c-info"><div class="c-name">${s.label}</div>
        <div class="c-meta">${s.w} × ${s.h} px</div></div>`;
      row.querySelector('.mx-prev').appendChild(cv);
      list.appendChild(row);
    });
  }

  /* ---------- Контролы ---------- */
  document.querySelectorAll('#mxFit .seg').forEach((b) => b.addEventListener('click', () => {
    st.fit = b.dataset.f;
    document.querySelectorAll('#mxFit .seg').forEach((x) => x.classList.toggle('active', x === b));
    $('mxBgRow').hidden = st.fit !== 'contain';
    render();
  }));
  $('mxBg').addEventListener('input', render);
  $('mxQ').addEventListener('input', () => { $('mxQVal').textContent = $('mxQ').value + '%'; });

  $('mxDownload').addEventListener('click', async () => {
    const sizes = chosen();
    if (!st.items.length || !sizes.length) return;
    const btn = $('mxDownload');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Готовим архив…';
    const q = +$('mxQ').value / 100;
    const used = new Set();
    const files = [];
    for (let i = 0; i < st.items.length; i++) {
      for (const s of sizes) {
        const cv = renderSize(st.items[i].img, s);
        const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
        if (!blob) continue;
        const buf = new Uint8Array(await blob.arrayBuffer());
        // к имени добавляем размер, чтобы было понятно, что для чего
        let name = outName('jpg', used).replace(/\.jpg$/, `_${s.id}_${s.w}x${s.h}.jpg`);
        files.push({ name, data: buf });
      }
      btn.textContent = `⏳ ${i + 1} из ${st.items.length}…`;
    }
    if (files.length) saveBlob(createZip(files), outName('zip'));
    btn.disabled = false; btn.textContent = label;
  });

  render();
})();
