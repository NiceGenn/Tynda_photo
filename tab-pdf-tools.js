(function () {
  const $ = (id) => document.getElementById(id);
  const action = $('pdtAction');
  const fileInput = $('pdtFiles');
  const pagesGroup = $('pdtPagesGroup');
  const rotateGroup = $('pdtRotateGroup');
  const orderGroup = $('pdtOrderGroup');
  const fileHint = $('pdtFileHint');
  const fileList = $('pdtFileList');
  const status = $('pdtStatus');
  const preview = $('pdtPreview');
  const previewName = $('pdtPreviewName');
  const previewInfo = $('pdtPreviewInfo');
  const previewEmpty = $('pdtPreviewEmpty');
  const previewPageStatus = $('pdtPageStatus');
  const previewPrev = $('pdtPrev');
  const previewNext = $('pdtNext');
  let libraryPromise;
  let viewerPromise;
  let previewDocument;
  let previewPageNumber = 1;
  let previewRequest = 0;
  let renderTask;

  function clearPreview() {
    previewRequest++;
    if (renderTask) renderTask.cancel();
    renderTask = null;
    previewDocument = null;
    preview.hidden = true;
    preview.width = 0;
    preview.height = 0;
    previewPageStatus.textContent = '—';
    previewPrev.disabled = true;
    previewNext.disabled = true;
    previewEmpty.hidden = false;
    previewName.textContent = 'Предпросмотр документа';
    previewInfo.textContent = 'PDF';
  }

  async function loadViewer() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (!viewerPromise) {
      viewerPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          const viewer = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
          if (!viewer) {
            reject(new Error('Библиотека предпросмотра PDF загрузилась некорректно.'));
            return;
          }
          viewer.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(viewer);
        };
        script.onerror = () => reject(new Error('Не удалось загрузить предпросмотр PDF. Проверьте подключение к интернету.'));
        document.head.appendChild(script);
      }).catch((error) => {
        viewerPromise = null;
        throw error;
      });
    }
    return viewerPromise;
  }

  async function loadLibrary() {
    if (window.PDFLib) return window.PDFLib;
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        script.onload = () => window.PDFLib
          ? resolve(window.PDFLib)
          : reject(new Error('Библиотека редактирования PDF загрузилась некорректно.'));
        script.onerror = () => reject(new Error('Не удалось загрузить обработчик PDF. Проверьте подключение к интернету.'));
        document.head.appendChild(script);
      }).catch((error) => {
        libraryPromise = null;
        throw error;
      });
    }
    return libraryPromise;
  }

  async function renderPreview(bytes, name) {
    const request = ++previewRequest;
    if (renderTask) renderTask.cancel();
    previewDocument = null;
    previewEmpty.hidden = true;
    preview.hidden = false;
    previewName.textContent = name;
    previewInfo.textContent = 'Загружаю страницы…';
    try {
      const viewer = await loadViewer();
      const documentProxy = await viewer.getDocument({ data: bytes }).promise;
      if (request !== previewRequest) {
        await documentProxy.destroy();
        return;
      }
      previewDocument = documentProxy;
      previewPageNumber = 1;
      previewInfo.textContent = documentProxy.numPages + ' стр.';
      await renderPreviewPage();
    } catch (error) {
      if (request !== previewRequest) return;
      preview.hidden = true;
      previewEmpty.hidden = false;
      previewEmpty.textContent = 'Не удалось показать PDF: ' + (error.message || 'ошибка чтения файла');
      previewInfo.textContent = 'Ошибка';
      throw error;
    }
  }

  async function renderPreviewPage() {
    if (!previewDocument) return;
    if (renderTask) renderTask.cancel();
    const page = await previewDocument.getPage(previewPageNumber);
    const base = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(240, preview.parentElement.clientWidth - 32);
    const scale = Math.min(1.5, availableWidth / base.width);
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = preview.getContext('2d');
    preview.width = Math.floor(viewport.width * outputScale);
    preview.height = Math.floor(viewport.height * outputScale);
    preview.style.width = Math.floor(viewport.width) + 'px';
    preview.style.height = Math.floor(viewport.height) + 'px';
    previewPageStatus.textContent = previewPageNumber + ' / ' + previewDocument.numPages;
    previewPrev.disabled = previewPageNumber <= 1;
    previewNext.disabled = previewPageNumber >= previewDocument.numPages;
    renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    });
    try {
      await renderTask.promise;
    } catch (error) {
      if (error.name !== 'RenderingCancelledException') throw error;
    } finally {
      renderTask = null;
    }
  }

  function syncControls(resetFiles) {
    const mode = action.value;
    pagesGroup.hidden = !['extract', 'delete'].includes(mode);
    rotateGroup.hidden = mode !== 'rotate';
    orderGroup.hidden = mode !== 'reorder';
    fileInput.multiple = mode === 'merge';
    fileHint.textContent = mode === 'merge'
      ? 'Выберите два или больше файла для объединения.'
      : 'Выберите один PDF-файл.';
    if (resetFiles) {
      fileInput.value = '';
      fileList.textContent = 'Файлы не выбраны.';
      clearPreview();
    }
    status.textContent = 'Обработка выполняется в браузере. PDF не отправляются на сервер; библиотеки для просмотра и правки загружаются из сети.';
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
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first || last > count) {
        throw new Error('Номер страницы вне диапазона 1–' + count + '.');
      }
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
    const pageCount = source.getPageCount();
    if (!pageCount) throw new Error('В документе нет страниц.');
    let output;

    if (mode === 'merge') {
      output = await PDFDocument.create();
      for (const file of files) {
        const document = file === files[0] ? source : await PDFDocument.load(await file.arrayBuffer());
        const pages = await output.copyPages(document, document.getPageIndices());
        pages.forEach((page) => output.addPage(page));
      }
    } else if (mode === 'extract') {
      const selected = parsePages($('pdtPages').value, pageCount);
      output = await PDFDocument.create();
      const pages = await output.copyPages(source, selected);
      pages.forEach((page) => output.addPage(page));
    } else if (mode === 'delete') {
      output = source;
      const removed = new Set(parsePages($('pdtPages').value, pageCount));
      if (removed.size === pageCount) throw new Error('Нельзя удалить все страницы документа.');
      Array.from(removed).sort((a, b) => b - a).forEach((index) => output.removePage(index));
    } else if (mode === 'rotate') {
      output = source;
      const turn = Number($('pdtRotation').value);
      output.getPages().forEach((page) => {
        const angle = page.getRotation().angle;
        page.setRotation(degrees(((angle + turn) % 360 + 360) % 360));
      });
    } else {
      const order = parsePages($('pdtOrder').value, pageCount);
      if (order.length !== pageCount) throw new Error('Перечислите все ' + pageCount + ' страниц ровно по одному разу.');
      output = await PDFDocument.create();
      const pages = await output.copyPages(source, order);
      pages.forEach((page) => output.addPage(page));
    }

    if (!output.getPageCount()) throw new Error('Результат не содержит страниц.');
    const bytes = await output.save();
    const base = files[0].name.replace(/\.pdf$/i, '') || 'document';
    const suffix = { merge: 'merged', extract: 'pages', delete: 'edited', rotate: 'rotated', reorder: 'reordered' }[mode];
    const resultName = base + '-' + suffix + '.pdf';
    download(bytes, resultName);
    status.textContent = 'Готово: ' + output.getPageCount() + ' страниц. Результат скачан; предпросмотр обновляется…';
    await renderPreview(bytes, 'Результат: ' + resultName);
    status.textContent = 'Готово: ' + output.getPageCount() + ' страниц. Результат скачан и открыт в предпросмотре.';
  }

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) {
      fileList.textContent = 'Файлы не выбраны.';
      clearPreview();
      return;
    }
    fileList.textContent = files.map((file, index) => (index + 1) + '. ' + file.name).join(' · ');
    status.textContent = files.length === 1
      ? 'Исходный PDF загружается в предпросмотр справа.'
      : 'Порядок объединения совпадает с порядком файлов выше. Загружаю первый PDF в предпросмотр.';
    try {
      const bytes = new Uint8Array(await files[0].arrayBuffer());
      await renderPreview(bytes, files.length === 1 ? files[0].name : files.length + ' файла; показан первый');
      status.textContent = files.length === 1
        ? 'Исходный PDF открыт справа. Выберите действие и нажмите «Обработать PDF».'
        : 'Порядок объединения совпадает с порядком файлов выше. Просмотрен первый PDF.';
    } catch (error) {
      status.textContent = error.message || 'Не удалось показать предпросмотр PDF.';
    }
  });

  previewPrev.addEventListener('click', async () => {
    if (!previewDocument || previewPageNumber <= 1) return;
    previewPageNumber--;
    try { await renderPreviewPage(); } catch (error) { status.textContent = error.message; }
  });
  previewNext.addEventListener('click', async () => {
    if (!previewDocument || previewPageNumber >= previewDocument.numPages) return;
    previewPageNumber++;
    try { await renderPreviewPage(); } catch (error) { status.textContent = error.message; }
  });
  action.addEventListener('change', () => syncControls(true));
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
    if (event.detail === 'pdfTools') syncControls(false);
  });
  syncControls(false);
})();