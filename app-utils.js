/* Общие ограничения и доступность интерфейса. */
(function () {
  const LIMITS = {
    image: { count: 80, each: 50 * 1024 * 1024, total: 250 * 1024 * 1024 },
    pdf: { count: 20, each: 100 * 1024 * 1024, total: 300 * 1024 * 1024 },
  };

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + ' КБ';
    return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' МБ';
  }

  function announce(message, isError = false) {
    const region = document.getElementById('appNotice');
    if (!region) return;
    region.textContent = message;
    region.classList.toggle('error', isError);
    region.hidden = false;
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => { region.hidden = true; }, 7000);
  }

  function validateFiles(fileCollection, kind = 'image') {
    const files = Array.from(fileCollection || []);
    const limit = LIMITS[kind] || LIMITS.image;
    if (files.length > limit.count) {
      announce(`Слишком много файлов: максимум ${limit.count} за один раз.`, true);
      return false;
    }
    const oversized = files.find((file) => file.size > limit.each);
    if (oversized) {
      announce(`${oversized.name}: размер больше ${formatSize(limit.each)}.`, true);
      return false;
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > limit.total) {
      announce(`Общий размер выбранных файлов больше ${formatSize(limit.total)}. Разделите их на несколько партий.`, true);
      return false;
    }
    return true;
  }

  function setupDialog(dialog) {
    let returnFocus = null;
    const observer = new MutationObserver(() => {
      if (!dialog.hidden) {
        returnFocus = document.activeElement;
        requestAnimationFrame(() => dialog.querySelector('button, input, select, textarea, [tabindex="0"]')?.focus());
      } else if (returnFocus?.isConnected) {
        returnFocus.focus();
        returnFocus = null;
      }
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[role="dialog"]').forEach(setupDialog);
  });

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const kind = input.accept.includes('pdf') ? 'pdf' : 'image';
    if (!validateFiles(input.files, kind)) {
      event.stopImmediatePropagation();
      input.value = '';
    }
  }, true);

  document.addEventListener('drop', (event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    const kind = event.target.closest('[data-panel="pdfTools"]') ? 'pdf' : 'image';
    if (!validateFiles(files, kind)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.AppUtils = { LIMITS, announce, formatSize, validateFiles };
})();
