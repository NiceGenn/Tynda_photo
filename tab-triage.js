/* Вкладка «Отбраковка»: считает резкость каждого снимка и находит повторы,
   чтобы быстро разобрать пачку фото с мероприятия. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { items: [], sort: 'sharp' };

  /* ---------- Резкость: дисперсия лапласиана ---------- */
  function sharpness(img) {
    const S = 220;
    const k = Math.min(1, S / Math.max(img.width, img.height));
    const w = Math.max(8, Math.round(img.width * k));
    const h = Math.max(8, Math.round(img.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;

    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      g[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const lap = 4 * g[p] - g[p - 1] - g[p + 1] - g[p - w] - g[p + w];
        sum += lap; sum2 += lap * lap; n++;
      }
    }
    if (!n) return 0;
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  }

  /* ---------- Отпечаток для поиска повторов (dHash 8×8) ---------- */
  function dhash(img) {
    const w = 9, h = 8;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const bits = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = (y * w + x) * 4, b = (y * w + x + 1) * 4;
        const ga = d[a] * 0.299 + d[a + 1] * 0.587 + d[a + 2] * 0.114;
        const gb = d[b] * 0.299 + d[b + 1] * 0.587 + d[b + 2] * 0.114;
        bits.push(gb > ga ? 1 : 0);
      }
    }
    return bits;
  }
  const hamming = (a, b) => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);

  /* ---------- Загрузка ---------- */
  const dz = $('trDrop'), input = $('trFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { add(e.target.files); input.value = ''; });
  $('trClear').addEventListener('click', () => {
    st.items.forEach((i) => URL.revokeObjectURL(i.url));
    st.items = []; render();
  });

  async function add(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    let done = 0;
    for (const f of files) {
      $('trName').textContent = `Считаем… ${++done} из ${files.length}`;
      const url = URL.createObjectURL(f);
      const img = await new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = () => res(null);
        im.src = url;
      });
      if (!img) { URL.revokeObjectURL(url); continue; }
      st.items.push({
        file: f, img, url, name: f.name,
        sharp: sharpness(img), hash: dhash(img), pick: true, dup: 0,
      });
      // даём браузеру вдохнуть, чтобы интерфейс не подвисал на больших пачках
      await new Promise((r) => setTimeout(r, 0));
    }
    markDuplicates();
    render();
  }

  /* Повторы помечаем номером группы */
  function markDuplicates() {
    st.items.forEach((i) => { i.dup = 0; });
    if (!$('trDup').checked) return;
    let group = 0;
    for (let i = 0; i < st.items.length; i++) {
      if (st.items[i].dup) continue;
      let found = false;
      for (let j = i + 1; j < st.items.length; j++) {
        if (st.items[j].dup) continue;
        // кроме похожего отпечатка требуем и близкие пропорции — меньше ложных срабатываний
        const ra = st.items[i].img.width / st.items[i].img.height;
        const rb = st.items[j].img.width / st.items[j].img.height;
        if (Math.abs(ra - rb) / ra > 0.05) continue;
        if (hamming(st.items[i].hash, st.items[j].hash) <= 6) {
          if (!found) { group++; st.items[i].dup = group; found = true; }
          st.items[j].dup = group;
        }
      }
    }
  }

  /* ---------- Вывод ---------- */
  const threshold = () => +$('trTh').value;

  function sorted() {
    const a = [...st.items];
    if (st.sort === 'sharp') a.sort((x, y) => y.sharp - x.sharp);
    else if (st.sort === 'blurry') a.sort((x, y) => x.sharp - y.sharp);
    else a.sort((x, y) => x.name.localeCompare(y.name, 'ru'));
    return a;
  }

  function render() {
    const grid = $('trGrid');
    const n = st.items.length;
    $('trCount').textContent = n ? `${n} фото` : '—';
    $('trName').textContent = n ? `Выбрано: ${n}` : 'Файлы не выбраны';
    const picked = st.items.filter((i) => i.pick).length;
    $('trDownload').disabled = !picked;
    $('trDownload').textContent = picked ? `📦 Скачать отмеченные (${picked})` : '📦 Скачать отмеченные (ZIP)';

    if (!n) {
      grid.innerHTML = '<div class="empty-hint">Загрузите фото с мероприятия — покажу, что резкое, а что нет</div>';
      $('trStats').innerHTML = '<div class="ex-row"><span>Пока пусто</span></div>';
      return;
    }

    const th = threshold();
    const blurry = st.items.filter((i) => i.sharp < th).length;
    const dups = new Set(st.items.filter((i) => i.dup).map((i) => i.dup)).size;
    $('trStats').innerHTML =
      `<div class="ex-row"><span>Всего</span><b>${n}</b></div>` +
      `<div class="ex-row"><span>Смазанных</span><b>${blurry}</b></div>` +
      `<div class="ex-row"><span>Групп повторов</span><b>${dups}</b></div>` +
      `<div class="ex-row"><span>Отмечено</span><b>${picked}</b></div>`;

    grid.innerHTML = '';
    sorted().forEach((it) => {
      const bad = it.sharp < th;
      const el = document.createElement('div');
      el.className = 'tr-card' + (it.pick ? ' picked' : '');
      el.innerHTML = `
        <img src="${it.url}" alt="">
        <div class="tr-badges">
          ${bad ? '<span class="tr-b warn">смазано</span>' : '<span class="tr-b ok">чёткое</span>'}
          ${it.dup ? `<span class="tr-b dup">повтор ${it.dup}</span>` : ''}
        </div>
        <div class="tr-foot">
          <span class="tr-name" title="${it.name}">${it.name}</span>
          <span class="tr-score">${Math.round(it.sharp)}</span>
        </div>`;
      el.addEventListener('click', () => { it.pick = !it.pick; render(); });
      grid.appendChild(el);
    });
  }

  /* ---------- Контролы ---------- */
  document.querySelectorAll('#trSort .seg').forEach((b) => b.addEventListener('click', () => {
    st.sort = b.dataset.s;
    document.querySelectorAll('#trSort .seg').forEach((x) => x.classList.toggle('active', x === b));
    render();
  }));
  $('trTh').addEventListener('input', () => { $('trThVal').textContent = $('trTh').value; render(); });
  $('trDup').addEventListener('change', () => { markDuplicates(); render(); });
  // отмечаем только по резкости — повторы не трогаем, чтобы ничего не пропало молча
  $('trPickGood').addEventListener('click', () => {
    const th = threshold();
    st.items.forEach((i) => { i.pick = i.sharp >= th; });
    render();
  });

  // отдельным действием снимаем повторы, оставляя в каждой группе самый резкий кадр
  $('trDropDup').addEventListener('click', () => {
    const kept = new Set();
    [...st.items].sort((a, b) => b.sharp - a.sharp).forEach((i) => {
      if (!i.dup || !i.pick) return;
      if (kept.has(i.dup)) i.pick = false; else kept.add(i.dup);
    });
    render();
  });

  $('trDownload').addEventListener('click', async () => {
    const picked = st.items.filter((i) => i.pick);
    if (!picked.length) return;
    const btn = $('trDownload');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Готовим архив…';
    const used = new Set();
    const files = [];
    for (const it of picked) {
      const ext = (it.name.split('.').pop() || 'jpg').toLowerCase();
      files.push({ name: outName(ext, used), data: new Uint8Array(await it.file.arrayBuffer()) });
    }
    saveBlob(createZip(files), outName('zip'));
    btn.disabled = false; btn.textContent = label;
  });

  // при сортировке «сначала чёткие» самые резкие идут первыми — из группы
  // повторов проще выбрать лучший кадр
})();
