/* Вкладка «QR-код»: ссылка, телефон, почта или Wi-Fi в виде картинки. */

(function () {
  const $ = (id) => document.getElementById(id);
  let libPromise = null;

  function loadLib() {
    if (window.qrcode) return Promise.resolve();
    if (!libPromise) {
      libPromise = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'vendor/qrcode.js';
        s.onload = res;
        s.onerror = () => { libPromise = null; rej(new Error('не удалось загрузить генератор')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  const TEMPLATES = {
    url: 'https://',
    tel: 'tel:+7',
    mail: 'mailto:pochta@example.ru',
    wifi: 'WIFI:T:WPA;S:ИмяСети;P:пароль;;',
  };
  document.querySelectorAll('.qr-tpl').forEach((b) => b.addEventListener('click', () => {
    $('qrText').value = TEMPLATES[b.dataset.tpl] || '';
    $('qrText').focus();
    build();
  }));

  async function build() {
    const text = $('qrText').value.trim();
    const cv = $('qrCanvas');
    if (!text) {
      cv.classList.remove('ready');
      $('qrHint').textContent = 'Введите текст или ссылку';
      $('qrDims').textContent = '—';
      return;
    }
    try { await loadLib(); }
    catch (e) { $('qrHint').textContent = String(e.message || e); return; }

    let qr;
    try {
      qr = window.qrcode(0, $('qrEc').value);   // 0 = версия подбирается сама
      qr.addData(text);
      qr.make();
    } catch (e) {
      cv.classList.remove('ready');
      $('qrHint').textContent = 'Слишком много текста для одного кода — сократите или снизьте запас прочности';
      return;
    }

    const count = qr.getModuleCount();
    const quiet = +$('qrQuiet').value;
    const size = +$('qrSize').value;
    const cell = Math.max(1, Math.floor(size / (count + quiet * 2)));
    const side = cell * (count + quiet * 2);

    const caption = $('qrCaption').value.trim();
    const capH = caption ? Math.round(side * 0.11) : 0;

    cv.classList.add('ready');
    cv.width = side; cv.height = side + capH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = $('qrBg').value;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = $('qrFg').value;

    const round = $('qrRound').checked;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!qr.isDark(r, c)) continue;
        const x = (c + quiet) * cell, y = (r + quiet) * cell;
        if (round) {
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }

    if (caption) {
      ctx.fillStyle = $('qrFg').value;
      ctx.font = `600 ${Math.round(capH * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, side / 2, side + capH * 0.45, side * 0.92);
    }

    $('qrDims').textContent = `${cv.width} × ${cv.height} · ${count}×${count} модулей`;
  }

  ['qrText', 'qrFg', 'qrBg', 'qrEc', 'qrCaption', 'qrRound'].forEach((id) => {
    $(id).addEventListener('input', build);
    $(id).addEventListener('change', build);
  });
  $('qrSize').addEventListener('input', () => { $('qrSizeVal').textContent = $('qrSize').value + ' px'; build(); });
  $('qrQuiet').addEventListener('input', () => { $('qrQuietVal').textContent = $('qrQuiet').value; build(); });

  $('qrDownload').addEventListener('click', () => {
    const cv = $('qrCanvas');
    if (!cv.classList.contains('ready')) return;
    cv.toBlob((b) => { if (b) saveBlob(b, outName('png')); }, 'image/png');
  });

  document.addEventListener('tabshow', (e) => { if (e.detail === 'qr') build(); });
})();
