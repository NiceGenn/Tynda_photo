/* Вкладка «Сжатие фото».
   Уменьшает вес снимков без заметной потери качества: аккуратное
   пошаговое уменьшение размера + перекодирование. Всё в браузере. */

(function () {
  const $ = (id) => document.getElementById(id);

  const cState = {
    items: [],      // [{ id, name, file, img, url, origSize, out, outSize, outExt }]
    busy: false,
    dirty: false,
  };
  let cUid = 0;

  /* ---------- Пресеты ---------- */
  const PRESETS = {
    safe: { maxSide: 0, quality: 92, format: 'auto',
      hint: 'Размер не меняется, качество 92% — на глаз отличий нет. Самый безопасный вариант.' },
    balanced: { maxSide: 2560, quality: 85, format: 'auto',
      hint: 'До 2560 px, качество 85% — обычно в 5–10 раз легче, для новостей и соцсетей в самый раз.' },
    max: { maxSide: 1920, quality: 75, format: 'image/webp',
      hint: 'До 1920 px, WebP 75% — минимальный вес. Проверьте результат, если фото пойдёт в печать.' },
    custom: { hint: 'Ручные настройки — крутите параметры ниже.' },
  };

  function applyPreset(name) {
    document.querySelectorAll('#cPreset .seg').forEach((b) =>
      b.classList.toggle('active', b.dataset.preset === name));
    const p = PRESETS[name];
    $('cPresetHint').textContent = p.hint;
    if (name !== 'custom') {
      $('cMaxSide').value = String(p.maxSide);
      $('cQuality').value = String(p.quality);
      $('cFormat').value = p.format;
      $('cQualityVal').textContent = p.quality + '%';
    }
    scheduleProcess();
  }

  document.querySelectorAll('#cPreset .seg').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // ручное изменение параметров переводит в режим «Свои»
  ['cMaxSide', 'cFormat', 'cQuality', 'cNeverBigger'].forEach((id) => {
    $(id).addEventListener('input', () => {
      if (id === 'cQuality') $('cQualityVal').textContent = $('cQuality').value + '%';
      document.querySelectorAll('#cPreset .seg').forEach((b) =>
        b.classList.toggle('active', b.dataset.preset === 'custom'));
      $('cPresetHint').textContent = PRESETS.custom.hint;
      scheduleProcess();
    });
  });

  /* ---------- Загрузка файлов ---------- */
  const dz = $('cDropzone');
  const fi = $('cFileInput');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); addFiles(e.dataTransfer.files); });
  fi.addEventListener('change', (e) => { addFiles(e.target.files); fi.value = ''; });

  function addFiles(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    let pending = files.length;
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        cState.items.push({
          id: ++cUid, name: file.name, file, img, url,
          origSize: file.size, origType: file.type,
          out: null, outSize: 0, outExt: '',
        });
        if (--pending === 0) { renderList(); scheduleProcess(); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); if (--pending === 0) { renderList(); scheduleProcess(); } };
      img.src = url;
    });
  }

  $('cClear').addEventListener('click', () => {
    cState.items.forEach((it) => URL.revokeObjectURL(it.url));
    cState.items = [];
    renderList();
  });

  /* ---------- Сжатие ---------- */
  function readOpts() {
    const fmt = $('cFormat').value;
    return {
      maxSide: +$('cMaxSide').value || 0,
      quality: +$('cQuality').value / 100,
      format: fmt,
      neverBigger: $('cNeverBigger').checked,
    };
  }

  /* Пошаговое уменьшение вдвое — так меньше «лесенки», чем при одном drawImage */
  function drawScaled(img, w, h) {
    let src = img, cw = img.width, ch = img.height;
    while (cw / 2 >= w && ch / 2 >= h) {
      cw = Math.max(w, Math.round(cw / 2));
      ch = Math.max(h, Math.round(ch / 2));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, cw, ch);
      src = c;
    }
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ox = out.getContext('2d');
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(src, 0, 0, w, h);
    return out;
  }

  const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

  async function compressOne(it, opts) {
    let type;
    if (opts.format === 'auto') {
      // JPEG остаётся JPEG; PNG и прочее → WebP: он и прозрачность держит, и весит куда меньше
      type = it.origType === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    } else if (opts.format === 'keep') {
      type = it.origType || 'image/jpeg';
    } else {
      type = opts.format;
    }
    if (!EXT[type]) type = 'image/jpeg';                 // например HEIC → JPG

    let w = it.img.width, h = it.img.height;
    if (opts.maxSide && Math.max(w, h) > opts.maxSide) {
      const k = opts.maxSide / Math.max(w, h);
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    const cv = drawScaled(it.img, w, h);   // без уменьшения просто перерисуем 1:1 и перекодируем
    let blob = await new Promise((r) => cv.toBlob(r, type, opts.quality));
    if (!blob) blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', opts.quality));

    // если сжатие не помогло — отдаём оригинал как есть
    if (opts.neverBigger && blob.size >= it.origSize) {
      it.out = it.file; it.outSize = it.origSize;
      it.outExt = (it.name.split('.').pop() || 'jpg').toLowerCase();
      it.outW = it.img.width; it.outH = it.img.height;
      it.kept = true;
      return;
    }
    it.out = blob; it.outSize = blob.size;
    it.outExt = EXT[blob.type] || EXT[type] || 'jpg';
    it.outW = w; it.outH = h;
    it.kept = false;
  }

  let processTimer = null;
  function scheduleProcess() {
    clearTimeout(processTimer);
    processTimer = setTimeout(processAll, 180);
  }

  async function processAll() {
    if (!cState.items.length) { renderList(); return; }
    if (cState.busy) { cState.dirty = true; return; }
    cState.busy = true;
    $('cTotal').textContent = 'Считаем…';
    const opts = readOpts();
    for (const it of cState.items) {
      try { await compressOne(it, opts); }
      catch (e) { it.out = null; it.outSize = 0; it.error = String(e); }
    }
    cState.busy = false;
    renderList();
    if (cState.dirty) { cState.dirty = false; scheduleProcess(); }
  }

  /* ---------- Вывод списка ---------- */
  function fmtSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' МБ';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' КБ';
    return bytes + ' Б';
  }

  function renderList() {
    const list = $('cList');
    const n = cState.items.length;
    $('cDownloadZip').disabled = n === 0;
    $('cDownloadZip').textContent = n > 1 ? `📦 Скачать все (${n}) в ZIP` : '📦 Скачать (ZIP)';
    $('cFileName').textContent = n ? `Выбрано: ${n}` : 'Файлы не выбраны';

    if (!n) {
      list.innerHTML = '<div class="empty-hint">Загрузите фото, чтобы посмотреть, насколько их получится сжать</div>';
      $('cTotal').textContent = '—';
      return;
    }

    let was = 0, now = 0;
    list.innerHTML = '';
    cState.items.forEach((it, i) => {
      was += it.origSize;
      now += it.outSize || it.origSize;
      const saved = it.outSize ? Math.round((1 - it.outSize / it.origSize) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'c-row';
      const badge = it.kept
        ? '<span class="c-badge keep">оригинал легче</span>'
        : `<span class="c-badge${saved > 0 ? '' : ' keep'}">−${saved}%</span>`;
      row.innerHTML = `
        <img class="c-thumb" src="${it.url}" alt="">
        <div class="c-info">
          <div class="c-name" title="${it.name}">${it.name}</div>
          <div class="c-meta">
            ${it.img.width}×${it.img.height}${it.outW && it.outW !== it.img.width ? ` → ${it.outW}×${it.outH}` : ''}
            · ${fmtSize(it.origSize)} → <b>${it.outSize ? fmtSize(it.outSize) : '…'}</b>
          </div>
        </div>
        ${badge}
        <button class="c-dl" title="Скачать">⬇</button>
        <button class="c-rm" title="Убрать">×</button>`;
      row.querySelector('.c-dl').addEventListener('click', () => downloadOne(it));
      row.querySelector('.c-rm').addEventListener('click', () => {
        URL.revokeObjectURL(it.url);
        cState.items.splice(i, 1);
        renderList();
      });
      list.appendChild(row);
    });

    const pct = was ? Math.round((1 - now / was) * 100) : 0;
    $('cTotal').textContent = `${fmtSize(was)} → ${fmtSize(now)} (−${pct}%)`;
  }

  /* ---------- Скачивание ---------- */
  function downloadOne(it) {
    if (!it.out) return;
    saveBlob(it.out, outName(it.outExt));
  }

  $('cDownloadZip').addEventListener('click', async () => {
    if (!cState.items.length) return;
    const btn = $('cDownloadZip');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Готовим архив…';
    const used = new Set();
    const files = [];
    for (const it of cState.items) {
      if (!it.out) continue;
      const buf = new Uint8Array(await it.out.arrayBuffer());
      files.push({ name: outName(it.outExt, used), data: buf });
    }
    if (files.length) saveBlob(createZip(files), outName('zip'));
    btn.disabled = false; btn.textContent = label;
  });

  /* ---------- Вкладки ---------- */
  document.querySelectorAll('#tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tab;
      document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
      $('tabPlates').hidden = t !== 'plates';
      $('tabCompress').hidden = t !== 'compress';
    });
  });

  applyPreset('safe');
})();
