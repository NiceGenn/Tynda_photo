(function () {
  const $ = (id) => document.getElementById(id);
  const action = $('pdtAction');
  const fileInput = $('pdtFiles');
  const pagesGroup = $('pdtPagesGroup');
  const rotateGroup = $('pdtRotateGroup');
  const orderGroup = $('pdtOrderGroup');
  const fileHint = $('pdtFileHint');
  const status = $('pdtStatus');
  let libraryPromise;

  function syncControls() {
    const mode = action.value;
    pagesGroup.hidden = !['extract', 'delete'].includes(mode);
    rotateGroup.hidden = mode !== 'rotate';
    orderGroup.hidden = mode !== 'reorder';
    fileInput.multiple = mode === 'merge';
    fileHint.textContent = mode === 'merge'
      ? 'Выберите два или больше файла для объединения.'
      : 'Выберите один PDF-файл.';
    status.textContent = 'Файлы обрабатываются в браузере и никуда не отправляются. При первом запуске инструмент загружается из сети.';
  }

  function loadLibrary() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('Не удалось загрузить библиотеку PDF.'));
        script.onerror = () => reject(new Error('Не удалось загрузить инструменты PDF. Проверьте подключение к интернету.'));
        document.head.appendChild(script);
      });
    }
    return libraryPromise;
  }

  function parsePages(value, count) {
    const result = [];
    const seen = new Set();
    const pieces = value.split(',').map((part) => part.trim());
    if (!value.trim() || pieces.some((part) => !part)) throw new Error('Укажите номера страниц.');
    for (const piece of pieces) {
      const match = piece.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error('Используйте формат страниц вроде 1, 3-5.');
      const first = Number(match[1]);
      const last = Number(match[2] || match[1]);
      if (first < 1 || last < first || last > count) throw new Error('Номер страницы вне диапазона 1–' + count + '.');
      for (let page = first; page <= last; page++) {
        if (seen.has(page)) throw new Error('Страница ' + page + ' указана несколько раз.');
        seen.add(page);
        result.push(page - 1);
      }
    }
    return result;
  }

  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function process() {
    const files = Array.from(fileInput.files || []);
    if (!files.length) throw new Error('Сначала выберите PDF-файл.');
    const mode = action.value;
    if (mode === 'merge' && files.length < 2) throw new Error('Для объединения выберите минимум два PDF-файла.');
    if (mode !== 'merge' && files.length !== 1) throw new Error('Для этого действия выберите один PDF-файл.');

    const { PDFDocument, degrees } = await loadLibrary();
    const source = await PDFDocument.load(await files[0].arrayBuffer());
    const count = source.getPageCount();
    if (!count) throw new Error('В документе нет страниц.');
    let output;

    if (mode === 'merge') {
      output = await PDFDocument.create();
      for (const file of files) {
        const doc = await PDFDocument.load(await file.arrayBuffer());
        const copied = await output.copyPages(doc, doc.getPageIndices());
        copied.forEach((page) => output.addPage(page));
      }
    } else if (mode === 'extract') {
      const selected = parsePages($('pdtPages').value, count);
      output = await PDFDocument.create();
      const copied = await output.copyPages(source, selected);
      copied.forEach((page) => output.addPage(page));
    } else if (mode === 'delete') {
      output = source;
      const removed = new Set(parsePages($('pdtPages').value, count));
      if (removed.size === count) throw new Error('Нельзя удалить все страницы документа.');
      Array.from(removed).sort((a, b) => b - a).forEach((index) => output.removePage(index));
    } else if (mode === 'rotate') {
      output = source;
      const turn = Number($('pdtRotation').value);
      output.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + turn) % 360)));
    } else {
      const order = parsePages($('pdtOrder').value, count);
      if (order.length !== count) throw new Error('Перечислите все ' + count + ' страниц.');
      output = await PDFDocument.create();
      const copied = await output.copyPages(source, order);
      copied.forEach((page) => output.addPage(page));
    }

    const result = await output.save();
    const base = files[0].name.replace(/\.pdf$/i, '') || 'document';
    const suffix = { merge: 'merged', extract: 'pages', delete: 'edited', rotate: 'rotated', reorder: 'reordered' }[mode];
    download(result, base + '-' + suffix + '.pdf');
    status.textContent = 'Готово: ' + output.getPageCount() + ' стр. Файл скачан.';
  }

  action.addEventListener('change', syncControls);
  $('pdtRun').addEventListener('click', async () => {
    const button = $('pdtRun');
    button.disabled = true;
    status.textContent = 'Обрабатываю PDF…';
    try {
      await process();
    } catch (error) {
      status.textContent = error.message || 'Не удалось обработать PDF.';
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener('tabshow', (event) => {
    if (event.detail === 'pdfTools') syncControls();
  });
  syncControls();
})();