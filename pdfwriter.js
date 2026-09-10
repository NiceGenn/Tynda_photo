/* Сборка PDF из JPEG-кадров. Байты JPEG кладутся в документ как есть
   (фильтр DCTDecode), поэтому ни сжатия, ни внешних библиотек не нужно. */

(function (global) {
  const enc = new TextEncoder();
  const bytes = (s) => enc.encode(s);

  /* pages: [{ jpeg: Uint8Array, w, h }] — размеры страниц в пунктах (1/72 дюйма) */
  function createPdf(pages, opts = {}) {
    const chunks = [];
    let len = 0;
    const push = (data) => {
      const b = data instanceof Uint8Array ? data : bytes(data);
      chunks.push(b); len += b.length;
    };

    const offsets = [];                      // offsets[номер объекта] = позиция
    const objCount = 2 + pages.length * 3;   // каталог, дерево страниц, и по 3 объекта на страницу
    const startObj = (n) => { offsets[n] = len; push(`${n} 0 obj\n`); };
    const endObj = () => push('endobj\n');

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    // 1 — каталог, 2 — дерево страниц
    startObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\n');
    endObj();

    const pageIds = pages.map((_, i) => 3 + i * 3);
    startObj(2);
    push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\n`);
    endObj();

    pages.forEach((p, i) => {
      const pageId = 3 + i * 3, contentId = pageId + 1, imgId = pageId + 2;
      const { pw, ph, x, y, w, h } = p.box;

      startObj(pageId);
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\n`);
      endObj();

      // матрица размещения: масштаб и сдвиг картинки на странице
      const stream = `q\n${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
      startObj(contentId);
      push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream\n`);
      endObj();

      startObj(imgId);
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream\n');
      endObj();
    });

    const xrefPos = len;
    let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= objCount; n++) {
      xref += String(offsets[n] || 0).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref);
    push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R${opts.title ? ` /Info << /Title (${esc(opts.title)}) >>` : ''} >>\n`);
    push(`startxref\n${xrefPos}\n%%EOF\n`);

    return new Blob(chunks, { type: 'application/pdf' });
  }

  const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c);

  /* Размеры листов в пунктах */
  const PAGE_SIZES = {
    a4: [595.28, 841.89],
    a5: [419.53, 595.28],
    letter: [612, 792],
  };

  /* Считает, куда поместить картинку на листе с полями */
  function fitBox(imgW, imgH, pageName, landscape, marginMm) {
    if (pageName === 'auto') {
      // страница по размеру картинки: 96 dpi → пункты
      const pw = imgW * 0.75, ph = imgH * 0.75;
      return { pw, ph, x: 0, y: 0, w: pw, h: ph };
    }
    let [pw, ph] = PAGE_SIZES[pageName] || PAGE_SIZES.a4;
    if (landscape) [pw, ph] = [ph, pw];
    const m = (marginMm || 0) * 2.8346;      // мм → пункты
    const availW = Math.max(1, pw - m * 2), availH = Math.max(1, ph - m * 2);
    const k = Math.min(availW / imgW, availH / imgH);
    const w = imgW * k, h = imgH * k;
    return { pw, ph, x: (pw - w) / 2, y: (ph - h) / 2, w, h };
  }

  global.PdfWriter = { createPdf, fitBox, PAGE_SIZES };
})(window);
