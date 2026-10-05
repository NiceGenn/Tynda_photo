(function () {
  const $ = (id) => document.getElementById(id);
  const action = $('pdtAction');
  const fileInput = $('pdtFiles');
  const dropzone = $('pdtDropzone');
  const fileList = $('pdtFileList');
  const fileHint = $('pdtFileHint');
  const actionHint = $('pdtActionHint');
  const pagesGroup = $('pdtPagesGroup');
  const pageGrid = $('pdtPageGrid');
  const selectionCount = $('pdtSelectionCount');
  const orderGroup = $('pdtOrderGroup');
  const orderList = $('pdtOrderList');
  const rotateGroup = $('pdtRotateGroup');
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
  let selectedFiles = [];
  let sourcePreviewDocument;
  let previewDocument;
  let previewPageNumber = 1;
  let previewRequest = 0;
  let fileSelectionRequest = 0;
  let renderTask;
  let pageOrder = [];
  let selectedPages = new Set();
  let thumbnails = [];
  let thumbnailDocument;
  let thumbnailPromise;
  let thumbnailRequest = 0;
  let pageToolsRequest = 0;

  function setStatus(message) {
    status.textContent = message;
  }

  function loadViewer() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
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

  function loadLibrary() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        script.onload = () => window.PDFLib
          ? resolve(window.PDFLib)
          : reject(new Error('Библиотека правки PDF загрузилась некорректно.'));
        script.onerror = () => reject(new Error('Не удалось загрузить инструменты PDF. Проверьте подключение к интернету.'));
        document.head.appendChild(script);
      }).catch((error) => {
        libraryPromise = null;
        throw error;
      });
    }
    return libraryPromise;
  }

  function clearPreview() {
    previewRequest++;
    fileSelectionRequest++;
    if (renderTask) renderTask.cancel();
    renderTask = null;
    const documents = new Set([previewDocument, sourcePreviewDocument].filter(Boolean));
    documents.forEach((documentProxy) => documentProxy.destroy().catch(() => {}));
    previewDocument = null;
    sourcePreviewDocument = null;
    preview.hidden = true;
    preview.width = 0;
    preview.height = 0;
    previewPageStatus.textContent = '—';
    previewPrev.disabled = true;
    previewNext.disabled = true;
    previewEmpty.hidden = false;
    previewEmpty.textContent = 'Выберите PDF, чтобы просмотреть его страницы.';
    previewName.textContent = 'Предпросмотр документа';
    previewInfo.textContent = 'PDF';
    pageOrder = [];
    selectedPages = new Set();
    thumbnails = [];
    thumbnailDocument = null;
    thumbnailRequest++;
    renderPageTools();
  }

  async function renderPreview(bytes, name, isSource) {
    const request = ++previewRequest;
    if (renderTask) renderTask.cancel();
    renderTask = null;
    previewDocument = null;
    previewEmpty.hidden = true;
    preview.hidden = false;
    previewName.textContent = name;
    previewInfo.textContent = 'Загружаю…';
    try {
      const viewer = await loadViewer();
      const documentProxy = await viewer.getDocument({ data: bytes }).promise;
      if (request !== previewRequest) {
        await documentProxy.destroy();
        return;
      }
      const previousPreview = previewDocument;
      const previousSource = sourcePreviewDocument;
      if (previousPreview && previousPreview !== previousSource) previousPreview.destroy().catch(() => {});
      if (isSource && previousSource && previousSource !== previousPreview) previousSource.destroy().catch(() => {});
      previewDocument = documentProxy;
      if (isSource) {
        sourcePreviewDocument = documentProxy;
        selectedPages = new Set();
        pageOrder = Array.from({ length: documentProxy.numPages }, (_, index) => index);
        thumbnails = [];
        thumbnailDocument = null;
        thumbnailRequest++;
        await renderPageTools();
      }
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
    const documentProxy = previewDocument;
    const pageNumber = previewPageNumber;
    const page = await documentProxy.getPage(pageNumber);
    if (documentProxy !== previewDocument || pageNumber !== previewPageNumber) return;
    const base = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(220, preview.parentElement.clientWidth - 32);
    const scale = Math.min(1.5, availableWidth / base.width);
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = preview.getContext('2d');
    preview.width = Math.ceil(viewport.width * outputScale);
    preview.height = Math.ceil(viewport.height * outputScale);
    preview.style.width = Math.floor(viewport.width) + 'px';
    preview.style.height = Math.floor(viewport.height) + 'px';
    previewPageStatus.textContent = pageNumber + ' / ' + documentProxy.numPages;
    previewPrev.disabled = pageNumber <= 1;
    previewNext.disabled = pageNumber >= documentProxy.numPages;
    const task = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    });
    renderTask = task;
    try {
      await task.promise;
    } catch (error) {
      if (error.name !== 'RenderingCancelledException') throw error;
    } finally {
      if (renderTask === task) renderTask = null;
    }
  }

  async function renderThumbnail(documentProxy, pageNumber) {
    const page = await documentProxy.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(0.28, 64 / base.width, 82 / base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    await task.promise;
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  async function ensureThumbnails(documentProxy) {
    if (thumbnailDocument === documentProxy && thumbnails.length === documentProxy.numPages) return;
    if (thumbnailPromise && thumbnailDocument === documentProxy) return thumbnailPromise;
    const request = ++thumbnailRequest;
    thumbnailDocument = documentProxy;
    thumbnails = new Array(documentProxy.numPages);
    thumbnailPromise = (async () => {
      for (let page = 1; page <= documentProxy.numPages; page++) {
        if (request !== thumbnailRequest || sourcePreviewDocument !== documentProxy) return;
        thumbnails[page - 1] = await renderThumbnail(documentProxy, page);
      }
    })();
    try {
      await thumbnailPromise;
    } finally {
      if (request === thumbnailRequest) thumbnailPromise = null;
    }
  }

  function updateSelectionCount() {
    const count = selectedPages.size;
    selectionCount.textContent = count ? 'Выбрано: ' + count : 'Ничего не выбрано';
  }

  function pageImage(index) {
    if (thumbnails[index]) {
      const image = document.createElement('img');
      image.className = 'pdf-page-thumb';
      image.src = thumbnails[index];
      image.alt = 'Миниатюра страницы ' + (index + 1);
      return image;
    }
    const placeholder = document.createElement('span');
    placeholder.className = 'pdf-page-placeholder';
    placeholder.textContent = 'PDF';
    return placeholder;
  }

  function emptyPageMessage() {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = 'Сначала выберите PDF.';
    return empty;
  }

  async function renderPageTools() {
    const request = ++pageToolsRequest;
    const mode = action.value;
    pagesGroup.hidden = !['extract', 'delete'].includes(mode);
    orderGroup.hidden = mode !== 'reorder';
    const documentProxy = sourcePreviewDocument;
    if (!documentProxy || !(['extract', 'delete', 'reorder'].includes(mode))) {
      pageGrid.replaceChildren();
      orderList.replaceChildren();
      if (!documentProxy && ['extract', 'delete'].includes(mode)) pageGrid.append(emptyPageMessage());
      if (!documentProxy && mode === 'reorder') orderList.append(emptyPageMessage());
      updateSelectionCount();
      return;
    }
    pageGrid.replaceChildren();
    orderList.replaceChildren();
    const message = document.createElement('div');
    message.className = 'empty-hint';
    message.textContent = 'Готовлю миниатюры страниц…';
    if (mode === 'reorder') orderList.append(message);
    else pageGrid.append(message);
    try {
      await ensureThumbnails(documentProxy);
    } catch (error) {
      if (request === pageToolsRequest) {
        message.textContent = 'Не удалось подготовить миниатюры: ' + error.message;
      }
      return;
    }
    if (request !== pageToolsRequest || documentProxy !== sourcePreviewDocument || mode !== action.value) return;
    pageGrid.replaceChildren();
    orderList.replaceChildren();
    if (mode === 'reorder') {
      pageOrder.forEach((pageIndex, position) => {
        const row = document.createElement('div');
        row.className = 'pdf-order-item';
        row.draggable = true;
        row.dataset.position = String(position);
        row.append(pageImage(pageIndex));
        const label = document.createElement('span');
        label.textContent = 'Место ' + (position + 1) + ' · страница ' + (pageIndex + 1);
        row.append(label);
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'pdf-order-move';
        up.textContent = '↑';
        up.title = 'Переместить выше';
        up.disabled = position === 0;
        up.addEventListener('click', () => movePage(position, -1));
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'pdf-order-move';
        down.textContent = '↓';
        down.title = 'Переместить ниже';
        down.disabled = position === pageOrder.length - 1;
        down.addEventListener('click', () => movePage(position, 1));
        row.append(up, down);
        row.addEventListener('dragstart', (event) => {
          row.classList.add('dragging');
          event.dataTransfer.setData('text/plain', String(position));
        });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', (event) => {
          event.preventDefault();
          row.classList.add('drop-target');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          row.classList.remove('drop-target');
          const from = Number(event.dataTransfer.getData('text/plain'));
          reorderPage(from, position);
        });
        orderList.append(row);
      });
      return;
    }
    for (let index = 0; index < documentProxy.numPages; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pdf-page-option' + (selectedPages.has(index) ? ' selected' : '');
      button.setAttribute('aria-pressed', selectedPages.has(index) ? 'true' : 'false');
      button.append(pageImage(index));
      const label = document.createElement('span');
      label.textContent = 'Страница ' + (index + 1);
      button.append(label);
      button.addEventListener('click', () => {
        if (selectedPages.has(index)) selectedPages.delete(index);
        else selectedPages.add(index);
        button.classList.toggle('selected', selectedPages.has(index));
        button.setAttribute('aria-pressed', selectedPages.has(index) ? 'true' : 'false');
        updateSelectionCount();
      });
      pageGrid.append(button);
    }
    updateSelectionCount();
  }

  function movePage(position, offset) {
    const target = position + offset;
    if (target < 0 || target >= pageOrder.length) return;
    reorderPage(position, target);
  }

  function reorderPage(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
        from >= pageOrder.length || to >= pageOrder.length || from === to) return;
    const [page] = pageOrder.splice(from, 1);
    pageOrder.splice(to, 0, page);
    renderPageTools();
  }

  function updateActionHint() {
    const mode = action.value;
    updateActionHint();
  }

  function updateAction() {
    const mode = action.value;
    pagesGroup.hidden = !['extract', 'delete'].includes(mode);
    rotateGroup.hidden = mode !== 'rotate';
    orderGroup.hidden = mode !== 'reorder';
    fileInput.multiple = mode === 'merge';
    fileHint.textContent = mode === 'merge'
      ? 'Перетащите файлы или выберите несколько сразу.'
      : 'Перетащите PDF или выберите один файл.';
    actionHint.textContent = {
      merge: selectedFiles.length < 2
        ? 'Объединение: добавьте минимум два PDF. Выбранный сейчас файл уже считается первым. Потом нажмите «Создать PDF».'
        : 'Объединение: файлы пойдут в итоговый PDF в порядке списка. Нажмите «Создать PDF».',
      extract: 'Сохранить отмеченные страницы в новый PDF. Выберите миниатюры, затем нажмите «Создать PDF».',
      delete: 'Удалить отмеченные страницы из копии документа. Оригинал не изменится. Затем нажмите «Создать PDF».',
      rotate: 'Повернуть все страницы в выбранном направлении. Оригинал не изменится. Затем нажмите «Создать PDF».',
      reorder: 'Измените порядок страниц стрелками или перетаскиванием. Затем нажмите «Создать PDF».',
    }[mode];
    $('pdtRun').textContent = mode === 'merge' ? 'Создать объединённый PDF' : 'Создать PDF';
    if (mode !== 'merge' && selectedFiles.length > 1) {
      selectedFiles = selectedFiles.slice(0, 1);
      renderFileList();
    }
    renderPageTools();
  }

  function renderFileList() {
    updateActionHint();
    fileList.replaceChildren();
    selectedFiles.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'pdf-file-row';
      const name = document.createElement('span');
      name.className = 'pdf-file-name';
      name.textContent = selectedFiles.length > 1 ? (index + 1) + '. ' + file.name : file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'pdf-file-remove';
      remove.textContent = '×';
      remove.title = 'Убрать ' + file.name;
      remove.setAttribute('aria-label', 'Убрать ' + file.name);
      remove.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        renderFileList();
        if (index === 0) loadSelectedPreview();
        else if (!selectedFiles.length) clearPreview();
      });
      row.append(name, remove);
      fileList.append(row);
    });
    if (!selectedFiles.length) {
      const empty = document.createElement('small');
      empty.className = 'hint';
      empty.textContent = 'Пока ничего не выбрано';
      fileList.append(empty);
    }
  }

  function isPdf(file) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  function addFiles(fileCollection) {
    const files = Array.from(fileCollection || []).filter(isPdf);
    if (!files.length) {
      setStatus('Выберите файл с расширением PDF.');
      return;
    }
    if (action.value === 'merge') {
      const known = new Set(selectedFiles.map((file) => file.name + ':' + file.size + ':' + file.lastModified));
      selectedFiles.push(...files.filter((file) => {
        const key = file.name + ':' + file.size + ':' + file.lastModified;
        if (known.has(key)) return false;
        known.add(key);
        return true;
      }));
    } else {
      selectedFiles = [files[0]];
    }
    fileInput.value = '';
    renderFileList();
    loadSelectedPreview();
  }

  async function loadSelectedPreview() {
    const file = selectedFiles[0];
    if (!file) {
      clearPreview();
      return;
    }
    clearPreview();
    const request = fileSelectionRequest;
    previewEmpty.hidden = true;
    preview.hidden = false;
    previewName.textContent = file.name;
    previewInfo.textContent = 'Загружаю…';
    setStatus('Открываю PDF в предпросмотре…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request !== fileSelectionRequest) return;
      await renderPreview(bytes, file.name, true);
      if (request === fileSelectionRequest) setStatus('Выберите страницы или действие. Исходный документ открыт справа.');
    } catch (error) {
      setStatus(error.message || 'Не удалось открыть PDF.');
    }
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
    const files = selectedFiles.slice();
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
        const documentProxy = file === files[0] ? source : await PDFDocument.load(await file.arrayBuffer());
        const pages = await output.copyPages(documentProxy, documentProxy.getPageIndices());
        pages.forEach((page) => output.addPage(page));
      }
    } else if (mode === 'extract') {
      const selected = Array.from(selectedPages).sort((a, b) => a - b);
      if (!selected.length) throw new Error('Отметьте страницы, которые нужно сохранить.');
      output = await PDFDocument.create();
      const pages = await output.copyPages(source, selected);
      pages.forEach((page) => output.addPage(page));
    } else if (mode === 'delete') {
      output = source;
      const removed = new Set(selectedPages);
      if (!removed.size) throw new Error('Отметьте страницы, которые нужно удалить.');
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
      if (pageOrder.length !== pageCount) throw new Error('Не удалось прочитать порядок страниц документа.');
      output = await PDFDocument.create();
      const pages = await output.copyPages(source, pageOrder);
      pages.forEach((page) => output.addPage(page));
    }

    if (!output.getPageCount()) throw new Error('Результат не содержит страниц.');
    const bytes = await output.save();
    const base = files[0].name.replace(/\.pdf$/i, '') || 'document';
    const suffix = { merge: 'merged', extract: 'pages', delete: 'edited', rotate: 'rotated', reorder: 'reordered' }[mode];
    const resultName = base + '-' + suffix + '.pdf';
    download(bytes, resultName);
    setStatus('Готово: ' + output.getPageCount() + ' страниц. Открываю результат…');
    await renderPreview(new Uint8Array(bytes), 'Результат: ' + resultName, false);
    setStatus('Готово: ' + output.getPageCount() + ' страниц. Файл скачан и показан справа.');
  }

  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  $('pdtChoose').addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput.click();
  });
  dropzone.addEventListener('click', (event) => {
    if (!event.target.closest('button')) fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', (event) => {
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('drag');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('drag');
    addFiles(event.dataTransfer.files);
  });
  $('pdtSelectAll').addEventListener('click', () => {
    if (!sourcePreviewDocument) return;
    selectedPages = new Set(Array.from({ length: sourcePreviewDocument.numPages }, (_, index) => index));
    renderPageTools();
  });
  $('pdtClearSelection').addEventListener('click', () => {
    selectedPages.clear();
    renderPageTools();
  });
  previewPrev.addEventListener('click', async () => {
    if (!previewDocument || previewPageNumber <= 1) return;
    previewPageNumber--;
    try { await renderPreviewPage(); } catch (error) { setStatus(error.message); }
  });
  previewNext.addEventListener('click', async () => {
    if (!previewDocument || previewPageNumber >= previewDocument.numPages) return;
    previewPageNumber++;
    try { await renderPreviewPage(); } catch (error) { setStatus(error.message); }
  });
  action.addEventListener('change', updateAction);
  $('pdtRun').addEventListener('click', async () => {
    const button = $('pdtRun');
    button.disabled = true;
    setStatus('Обрабатываю PDF…');
    try {
      await process();
    } catch (error) {
      setStatus(error.message || 'Не удалось обработать PDF.');
    } finally {
      button.disabled = false;
    }
  });
  document.addEventListener('tabshow', (event) => {
    if (event.detail === 'pdfTools') updateAction();
  });
  updateAction();
})();