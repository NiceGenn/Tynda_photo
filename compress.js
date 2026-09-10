/* Вкладка «Сжатие фото».
   Уменьшает вес снимков без заметной потери качества: поворот, аккуратное
   пошаговое уменьшение размера, перекодирование, подбор качества под
   заданный вес. Всё считается в браузере. */

(function () {
  const $ = (id) => document.getElementById(id);

  const cState = { items: [], busy: false, dirty: false };
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

  function markCustom() {
    document.querySelectorAll('#cPreset .seg').forEach((b) =>
      b.classList.toggle('active', b.dataset.preset === 'custom'));
    $('cPresetHint').textContent = PRESETS.custom.hint;
  }

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
      setGoal('quality');
    }
    scheduleProcess();
  }

  document.querySelectorAll('#cPreset .seg').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  /* Что задаём: качество или конечный вес */
  function setGoal(goal) {
    document.querySelectorAll('#cGoal .seg').forEach((b) =>
      b.classList.toggle('active', b.dataset.goal === goal));
    document.querySelectorAll('.goal-part').forEach((el) => {
      el.hidden = el.dataset.goal !== goal;
    });
  }
  document.querySelectorAll('#cGoal .seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      setGoal(btn.dataset.goal);
      if (btn.dataset.goal === 'size') markCustom();
      scheduleProcess();
    });
  });
  function currentGoal() {
    const active = document.querySelector('#cGoal .seg.active');
    return active ? active.dataset.goal : 'quality';
  }

  document.querySelectorAll('.c-kb').forEach((chip) => {
    chip.addEventListener('click', () => { $('cTargetKb').value = chip.dataset.kb; scheduleProcess(); });
  });

  ['cMaxSide', 'cFormat', 'cQuality', 'cNeverBigger', 'cTargetKb'].forEach((id) => {
    $(id).addEventListener('input', () => {
      if (id === 'cQuality') $('cQualityVal').textContent = $('cQuality').value + '%';
      markCustom();
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

  /* Вставка из буфера обмена — удобно для скриншотов */
  document.addEventListener('paste', (e) => {
    if ($('tabCompress').hidden) return;
    const files = [...(e.clipboardData?.items || [])]
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  function addFiles(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    let pending = files.length;
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        cState.items.push({
          id: ++cUid, name: file.name || 'clipboard.png', file, img, url,
          origSize: file.size, origType: file.type,
          rot: 0, flip: false,
          out: null, outSize: 0, outExt: '', sig: '',
        });
        if (--pending === 0) { renderList(); scheduleProcess(); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); if (--pending === 0) { renderList(); scheduleProcess(); } };
      img.src = url;
    });
  }

  $('cClear').addEventListener('click', () => {
    cState.items.forEach((it) => { URL.revokeObjectURL(it.url); if (it.outUrl) URL.revokeObjectURL(it.outUrl); });
    cState.items = [];
    renderList();
  });

  /* ---------- Поворот ---------- */
  function rotate(it, deg) {
    it.rot = (((it.rot + deg) % 360) + 360) % 360;
    it.sig = '';                       // пересчитать только этот файл
    renderList(); scheduleProcess();
  }
  function mirror(it) {
    it.flip = !it.flip;
    it.sig = '';
    renderList(); scheduleProcess();
  }
  $('cRotAllL').addEventListener('click', () => { cState.items.forEach((it) => { it.rot = (it.rot + 270) % 360; it.sig = ''; }); renderList(); scheduleProcess(); });
  $('cRotAllR').addEventListener('click', () => { cState.items.forEach((it) => { it.rot = (it.rot + 90) % 360; it.sig = ''; }); renderList(); scheduleProcess(); });
  $('cFlipAll').addEventListener('click', () => { cState.items.forEach((it) => { it.flip = !it.flip; it.sig = ''; }); renderList(); scheduleProcess(); });

  /* ---------- Сжатие ---------- */
  function readOpts() {
    return {
      maxSide: +$('cMaxSide').value || 0,
      quality: +$('cQuality').value / 100,
      format: $('cFormat').value,
      neverBigger: $('cNeverBigger').checked,
      goal: currentGoal(),
      targetBytes: Math.max(20, +$('cTargetKb').value || 500) * 1024,
    };
  }
  const optsSig = (o) => [o.maxSide, o.quality, o.format, o.neverBigger, o.goal, o.targetBytes].join('|');

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

  /* Поворот на 90/180/270 и зеркало */
  function applyTransform(src, rot, flip) {
    if (!rot && !flip) return src;
    const swap = rot === 90 || rot === 270;
    const c = document.createElement('canvas');
    c.width = swap ? src.height : src.width;
    c.height = swap ? src.width : src.height;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2);
    x.rotate(rot * Math.PI / 180);
    if (flip) x.scale(-1, 1);
    x.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }

  const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
  const toBlob = (cv, type, q) => new Promise((r) => cv.toBlob(r, type, q));

  /* Подбор максимального качества, укладывающегося в заданный вес */
  async function encodeToTarget(cv, type, targetBytes) {
    let lo = 0.3, hi = 0.96, best = null;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const blob = await toBlob(cv, type, mid);
      if (blob && blob.size <= targetBytes) { best = blob; lo = mid; } else { hi = mid; }
    }
    // даже на минимальном качестве не влезли — уменьшаем картинку и пробуем снова
    let cur = cv;
    for (let step = 0; !best && step < 5; step++) {
      cur = drawScaled(cur, Math.max(1, Math.round(cur.width * 0.8)), Math.max(1, Math.round(cur.height * 0.8)));
      lo = 0.3; hi = 0.96;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const blob = await toBlob(cur, type, mid);
        if (blob && blob.size <= targetBytes) { best = blob; lo = mid; } else { hi = mid; }
      }
    }
    return { blob: best || await toBlob(cur, type, 0.3), canvas: cur };
  }

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
    // у PNG нет параметра качества — под заданный вес он не подстраивается
    if (opts.goal === 'size' && type === 'image/png') type = 'image/webp';

    let w = it.img.width, h = it.img.height;
    if (opts.maxSide && Math.max(w, h) > opts.maxSide) {
      const k = opts.maxSide / Math.max(w, h);
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    let cv = applyTransform(drawScaled(it.img, w, h), it.rot, it.flip);

    let blob;
    if (opts.goal === 'size') {
      const r = await encodeToTarget(cv, type, opts.targetBytes);
      blob = r.blob; cv = r.canvas;
    } else {
      blob = await toBlob(cv, type, opts.quality);
    }
    if (!blob) { blob = await toBlob(cv, 'image/jpeg', opts.quality || 0.9); type = 'image/jpeg'; }

    // если сжатие не помогло — отдаём оригинал как есть (но только если фото не крутили)
    if (opts.neverBigger && blob.size >= it.origSize && !it.rot && !it.flip) {
      it.out = it.file; it.outSize = it.origSize;
      it.outExt = (it.name.split('.').pop() || 'jpg').toLowerCase();
      it.outW = it.img.width; it.outH = it.img.height;
      it.kept = true;
    } else {
      it.out = blob; it.outSize = blob.size;
      it.outExt = EXT[blob.type] || EXT[type] || 'jpg';
      it.outW = cv.width; it.outH = cv.height;
      it.kept = false;
    }
    if (it.outUrl) URL.revokeObjectURL(it.outUrl);
    it.outUrl = URL.createObjectURL(it.out);
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
    const opts = readOpts();
    const sig = optsSig(opts);
    const todo = cState.items.filter((it) => it.sig !== sig);
    let done = 0;
    for (const it of todo) {
      $('cTotal').textContent = `Считаем… ${++done} из ${todo.length}`;
      try { await compressOne(it, opts); it.sig = sig; it.error = null; }
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
      list.innerHTML = '<div class="empty-hint">Загрузите фото или вставьте из буфера (Ctrl+V), чтобы посмотреть, насколько их получится сжать</div>';
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
      const tf = `rotate(${it.rot}deg)${it.flip ? ' scaleX(-1)' : ''}`;
      row.innerHTML = `
        <img class="c-thumb" src="${it.url}" alt="" style="transform:${tf}">
        <div class="c-info">
          <div class="c-name" title="${it.name}">${it.name}</div>
          <div class="c-meta">
            ${it.img.width}×${it.img.height}${it.outW && (it.outW !== it.img.width || it.outH !== it.img.height) ? ` → ${it.outW}×${it.outH}` : ''}
            · ${fmtSize(it.origSize)} → <b>${it.outSize ? fmtSize(it.outSize) : '…'}</b>
          </div>
        </div>
        ${badge}
        <button class="c-btn c-rl" title="Повернуть влево">↺</button>
        <button class="c-btn c-rr" title="Повернуть вправо">↻</button>
        <button class="c-btn c-fl" title="Отразить зеркально">⇋</button>
        <button class="c-btn c-cmp" title="Сравнить с оригиналом">👁</button>
        <button class="c-btn c-dl" title="Скачать">⬇</button>
        <button class="c-btn c-rm" title="Убрать">×</button>`;
      row.querySelector('.c-rl').addEventListener('click', () => rotate(it, -90));
      row.querySelector('.c-rr').addEventListener('click', () => rotate(it, 90));
      row.querySelector('.c-fl').addEventListener('click', () => mirror(it));
      row.querySelector('.c-cmp').addEventListener('click', () => openCompare(it));
      row.querySelector('.c-dl').addEventListener('click', () => downloadOne(it));
      row.querySelector('.c-rm').addEventListener('click', () => {
        URL.revokeObjectURL(it.url);
        if (it.outUrl) URL.revokeObjectURL(it.outUrl);
        cState.items.splice(i, 1);
        renderList();
      });
      list.appendChild(row);
    });

    const pct = was ? Math.round((1 - now / was) * 100) : 0;
    $('cTotal').textContent = `${fmtSize(was)} → ${fmtSize(now)} (−${pct}%)`;
  }

  /* ---------- Сравнение «оригинал / сжатое» ---------- */
  let cmpPan = { x: 0, y: 0, drag: false, sx: 0, sy: 0 };

  function openCompare(it) {
    if (!it.out || !it.outUrl) return;
    const tf = `rotate(${it.rot}deg)${it.flip ? ' scaleX(-1)' : ''}`;
    $('cmpBefore').src = it.url;
    $('cmpBefore').style.transform = tf;      // оригинал показываем в той же ориентации
    $('cmpAfter').src = it.outUrl;
    $('cmpTitle').textContent = it.name;
    $('cmpFoot').textContent =
      `${fmtSize(it.origSize)} → ${fmtSize(it.outSize)} · показано 1:1, тяните мышкой, чтобы подвигать`;
    cmpPan = { x: 0, y: 0, drag: false, sx: 0, sy: 0 };
    applyPan();
    $('cmpSlider').value = 50;
    setClip(50);
    $('cmpModal').hidden = false;
  }
  function setClip(v) {
    $('cmpClip').style.clipPath = `inset(0 ${100 - v}% 0 0)`;
    $('cmpLine').style.left = v + '%';
  }
  function applyPan() {
    $('cmpView').querySelectorAll('img').forEach((im) => {
      im.style.marginLeft = cmpPan.x + 'px';
      im.style.marginTop = cmpPan.y + 'px';
    });
  }
  $('cmpSlider').addEventListener('input', (e) => setClip(e.target.value));
  $('cmpClose').addEventListener('click', () => { $('cmpModal').hidden = true; });
  $('cmpModal').addEventListener('click', (e) => { if (e.target === $('cmpModal')) $('cmpModal').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('cmpModal').hidden = true; });
  const view = $('cmpView');
  view.addEventListener('mousedown', (e) => { cmpPan.drag = true; cmpPan.sx = e.clientX - cmpPan.x; cmpPan.sy = e.clientY - cmpPan.y; e.preventDefault(); });
  window.addEventListener('mouseup', () => { cmpPan.drag = false; });
  window.addEventListener('mousemove', (e) => {
    if (!cmpPan.drag) return;
    cmpPan.x = e.clientX - cmpPan.sx; cmpPan.y = e.clientY - cmpPan.sy;
    applyPan();
  });

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
