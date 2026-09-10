/* Вкладка «До / После»: два снимка в одной картинке — пополам,
   по вертикали, по горизонтали или по диагонали, с подписями. */

(function () {
  const $ = (id) => document.getElementById(id);
  const st = { a: null, b: null, layout: 'v' };

  /* ---------- Загрузка ---------- */
  function hookDrop(dropId, inputId, nameId, slot) {
    const dz = $(dropId), input = $(inputId);
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      load(e.dataTransfer.files[0], slot, nameId);
    });
    input.addEventListener('change', (e) => { load(e.target.files[0], slot, nameId); input.value = ''; });
  }

  function load(file, slot, nameId) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (st[slot] && st[slot].url) URL.revokeObjectURL(st[slot].url);
      st[slot] = { img, url, name: file.name };
      $(nameId).textContent = file.name;
      sync();
    };
    img.src = url;
  }

  hookDrop('baDropA', 'baFileA', 'baNameA', 'a');
  hookDrop('baDropB', 'baFileB', 'baNameB', 'b');

  $('baSwap').addEventListener('click', () => {
    const t = st.a; st.a = st.b; st.b = t;
    $('baNameA').textContent = st.a ? st.a.name : 'не выбрано';
    $('baNameB').textContent = st.b ? st.b.name : 'не выбрано';
    sync();
  });

  /* ---------- Отрисовка ---------- */
  /* Вписывает картинку в прямоугольник по принципу cover */
  function cover(ctx, img, x, y, w, h) {
    const k = Math.max(w / img.width, h / img.height);
    const dw = img.width * k, dh = img.height * k;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function draw() {
    const cv = $('baCanvas');
    const W = clamp($('baW').value, 200, 4000, 1200);
    const H = clamp($('baH').value, 200, 4000, 800);
    cv.width = W; cv.height = H;
    $('baDims').textContent = `${W} × ${H}`;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    if (!st.a || !st.b) { cv.classList.remove('ready'); return; }
    cv.classList.add('ready');

    const split = +$('baSplit').value / 100;
    const line = +$('baLine').value;
    const L = st.layout;

    // обе картинки рисуем на полный кадр, вторую обрезаем по границе —
    // так они «продолжают» друг друга, а не сжимаются в половинки
    if (L === 'h') {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * split, H); ctx.clip();
      cover(ctx, st.a.img, 0, 0, W, H); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(W * split, 0, W - W * split, H); ctx.clip();
      cover(ctx, st.b.img, 0, 0, W, H); ctx.restore();
    } else if (L === 'v') {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H * split); ctx.clip();
      cover(ctx, st.a.img, 0, 0, W, H); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, H * split, W, H - H * split); ctx.clip();
      cover(ctx, st.b.img, 0, 0, W, H); ctx.restore();
    } else {
      const off = (split - 0.5) * W * 2;
      ctx.save(); ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(W * 0.5 + off, 0); ctx.lineTo(W * 0.5 + off - W, H); ctx.lineTo(0, H);
      ctx.closePath(); ctx.clip();
      cover(ctx, st.a.img, 0, 0, W, H); ctx.restore();
      ctx.save(); ctx.beginPath();
      ctx.moveTo(W * 0.5 + off, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.5 + off - W, H);
      ctx.closePath(); ctx.clip();
      cover(ctx, st.b.img, 0, 0, W, H); ctx.restore();
    }

    if (line > 0) {
      ctx.strokeStyle = $('baLineColor').value;
      ctx.lineWidth = line;
      ctx.beginPath();
      if (L === 'h') { ctx.moveTo(W * split, 0); ctx.lineTo(W * split, H); }
      else if (L === 'v') { ctx.moveTo(0, H * split); ctx.lineTo(W, H * split); }
      else {
        const off = (split - 0.5) * W * 2;
        ctx.moveTo(W * 0.5 + off, 0); ctx.lineTo(W * 0.5 + off - W, H);
      }
      ctx.stroke();
    }

    if ($('baLabels').checked) drawLabels(ctx, W, H, L, split);
  }

  function drawLabels(ctx, W, H, L, split) {
    const size = (+$('baLabelSize').value / 100) * Math.min(W, H);
    const pad = size * 0.45;
    ctx.font = `700 ${size}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    const put = (text, x, y, align) => {
      if (!text) return;
      ctx.textAlign = align;
      const w = ctx.measureText(text).width;
      const bx = align === 'left' ? x : x - w;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const r = size * 0.25;
      const bw = w + pad * 1.4, bh = size * 1.35;
      roundRect(ctx, bx - pad * 0.7, y - bh / 2, bw, bh, r);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y);
    };

    const A = $('baLabelA').value, B = $('baLabelB').value;
    if (L === 'v') {
      put(A, pad * 1.4, pad * 1.6, 'left');
      put(B, pad * 1.4, H - pad * 1.6, 'left');
    } else {
      put(A, pad * 1.4, H - pad * 1.6, 'left');
      put(B, W - pad * 1.4, H - pad * 1.6, 'right');
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const clamp = (v, min, max, def) => {
    v = parseInt(v, 10);
    return isNaN(v) ? def : Math.max(min, Math.min(max, v));
  };

  function sync() {
    $('baDownload').disabled = !(st.a && st.b);
    draw();
  }

  /* ---------- Контролы ---------- */
  document.querySelectorAll('#baLayout .seg').forEach((b) => {
    b.addEventListener('click', () => {
      st.layout = b.dataset.l;
      document.querySelectorAll('#baLayout .seg').forEach((x) => x.classList.toggle('active', x === b));
      draw();
    });
  });
  document.querySelectorAll('.ba-size').forEach((c) => {
    c.addEventListener('click', () => { $('baW').value = c.dataset.w; $('baH').value = c.dataset.h; draw(); });
  });
  [['baSplit', 'baSplitVal', (v) => v + '%'], ['baLine', 'baLineVal', (v) => v + ' px'],
   ['baLabelSize', 'baLabelSizeVal', (v) => v + '%']].forEach(([id, out, f]) => {
    $(id).addEventListener('input', () => { $(out).textContent = f($(id).value); draw(); });
  });
  ['baW', 'baH', 'baLineColor', 'baLabels', 'baLabelA', 'baLabelB'].forEach((id) => {
    $(id).addEventListener('input', draw);
    $(id).addEventListener('change', draw);
  });

  $('baDownload').addEventListener('click', () => {
    $('baCanvas').toBlob((blob) => {
      if (blob) saveBlob(blob, outName('jpg'));
    }, 'image/jpeg', 0.92);
  });

  document.addEventListener('tabshow', (e) => { if (e.detail === 'ba') draw(); });
})();
