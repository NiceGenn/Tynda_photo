/* Вкладка «PDF»: несколько фото → один документ, по странице на снимок. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { items: [], orient: 'p', dragFrom: -1 };

  const dz = $('pdDrop'), input = $('pdFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { add(e.target.files); input.value = ''; });
  $('pdClear').addEventListener('click', () => {
    st.items.forEach((i) => URL.revokeObjectURL(i.url));
    st.items = []; render();
  });

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

  function render() {
    const n = st.items.length;
    $('pdGallery').hidden = n === 0;
    $('pdCount').textContent = n + ' фото';
    $('pdName').textContent = n ? `Выбрано: ${n}` : 'Файлы не выбраны';
    $('pdDownload').disabled = n === 0;
    $('pdDims').textContent = n ? `${n} стр.` : '—';

    const box = $('pdThumbs');
    box.innerHTML = '';
    st.items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'thumb';
      el.draggable = true;
      el.innerHTML = `<img src="${it.url}" draggable="false" alt=""><span class="ord">${i + 1}</span><button class="rm">×</button>`;
      el.querySelector('.rm').addEventListener('click', () => {
        URL.revokeObjectURL(it.url); st.items.splice(i, 1); render();
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
        render();
      });
      box.appendChild(el);
    });

    const list = $('pdList');
    if (!n) {
      list.innerHTML = '<div class="empty-hint">Загрузите фото — каждое станет отдельной страницей</div>';
      $('pdInfo').textContent = '';
      return;
    }
    list.innerHTML = '';
    st.items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'tr-card picked';
      el.innerHTML = `<img src="${it.url}" alt="">
        <div class="tr-foot"><span class="tr-name">${it.name}</span><span class="tr-score">стр. ${i + 1}</span></div>`;
      list.appendChild(el);
    });
  }

  /* ---------- Сборка ---------- */
  function prepare(img, maxSide, q) {
    let w = img.width, h = img.height;
    if (maxSide && Math.max(w, h) > maxSide) {
      const k = maxSide / Math.max(w, h);
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';                  // JPEG не хранит прозрачность
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((res) => cv.toBlob((b) => res({ blob: b, w, h }), 'image/jpeg', q));
  }

  $('pdDownload').addEventListener('click', async () => {
    if (!st.items.length) return;
    const btn = $('pdDownload');
    const label = btn.textContent;
    btn.disabled = true;
    const size = $('pdSize').value;
    const maxSide = +$('pdMaxSide').value || 0;
    const q = +$('pdQ').value / 100;
    const margin = +$('pdMargin').value;

    const pages = [];
    for (let i = 0; i < st.items.length; i++) {
      btn.textContent = `⏳ Страница ${i + 1} из ${st.items.length}…`;
      const { blob, w, h } = await prepare(st.items[i].img, maxSide, q);
      if (!blob) continue;
      const landscape = st.orient === 'l' || (st.orient === 'auto' && w > h);
      const box = PdfWriter.fitBox(w, h, size, landscape, margin);
      pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w, h, box });
    }
    const pdf = PdfWriter.createPdf(pages, { title: 'Фото' });
    saveBlob(pdf, outName('pdf'));
    $('pdInfo').textContent = `Готово: ${pages.length} стр., ${(pdf.size / 1048576).toFixed(1)} МБ`;
    btn.disabled = false; btn.textContent = label;
  });

  document.querySelectorAll('#pdOrient .seg').forEach((b) => b.addEventListener('click', () => {
    st.orient = b.dataset.o;
    document.querySelectorAll('#pdOrient .seg').forEach((x) => x.classList.toggle('active', x === b));
  }));
  $('pdMargin').addEventListener('input', () => { $('pdMarginVal').textContent = $('pdMargin').value + ' мм'; });
  $('pdQ').addEventListener('input', () => { $('pdQVal').textContent = $('pdQ').value + '%'; });
})();
