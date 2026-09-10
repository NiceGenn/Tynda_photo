/* Вкладка «Паспорт фото»: что зашито в снимке — когда, чем и где снят.
   Помогает проверять фотографии, присланные читателями. */

(function () {
  const $ = (id) => document.getElementById(id);
  const items = [];

  const dz = $('exDrop'), input = $('exFile');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); });
  input.addEventListener('change', (e) => { add(e.target.files); input.value = ''; });
  $('exClear').addEventListener('click', () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    items.length = 0;
    render();
  });

  async function add(list) {
    const files = [...list].filter((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name));
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const exif = await ExifReader.read(file);
      const dim = await dimensions(url);
      items.push({ file, url, exif, dim });
      render();
    }
  }

  const dimensions = (url) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res(null);
    im.src = url;
  });

  const fmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ'
    : b >= 1024 ? Math.round(b / 1024) + ' КБ' : b + ' Б';

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function humanDate(d) {
    if (!d) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function ago(d) {
    if (!d) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 0) return 'дата в будущем — это странно';
    if (days === 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 30) return `${days} дн. назад`;
    if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
    const y = Math.floor(days / 365);
    return `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'} назад`;
  }

  function render() {
    const list = $('exList');
    $('exCount').textContent = items.length ? `${items.length} фото` : '—';
    $('exName').textContent = items.length ? `Выбрано: ${items.length}` : 'Файлы не выбраны';
    if (!items.length) {
      list.innerHTML = '<div class="empty-hint">Загрузите фото, чтобы посмотреть его данные</div>';
      return;
    }
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const e = it.exif;
      const card = document.createElement('div');
      card.className = 'ex-card';

      const rows = [];
      const push = (k, v, cls) => { if (v) rows.push(`<div class="ex-row${cls ? ' ' + cls : ''}"><span>${k}</span><b>${v}</b></div>`); };

      if (e && e.shotDate) {
        push('Снято', `${humanDate(e.shotDate)} <i>(${ago(e.shotDate)})</i>`, 'key');
      } else if (e && e.shotAt) {
        push('Снято', e.shotAt, 'key');
      }
      const cam = [e && e.make, e && e.model].filter(Boolean).join(' ');
      push('Камера', cam);
      push('Объектив', e && e.lens);
      const shoot = [e && e.exposure, e && e.aperture, e && e.iso, e && e.focal].filter(Boolean).join(' · ');
      push('Параметры', shoot);
      push('Обработано в', e && e.software);
      push('Размер', it.dim ? `${it.dim.w} × ${it.dim.h} px · ${fmtSize(it.file.size)}` : fmtSize(it.file.size));

      let mapBtn = '';
      if (e && e.lat != null) {
        const lat = e.lat.toFixed(6), lon = e.lon.toFixed(6);
        push('Координаты', `${lat}, ${lon}${e.alt ? ` · ${e.alt} м` : ''}`, 'key');
        mapBtn = `<a class="btn ghost ex-map" target="_blank" rel="noopener"
          href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}">🗺 Открыть на карте</a>`;
      }

      let note = '';
      if (!e) {
        note = `<div class="ex-note warn">Данных съёмки нет. Обычно так бывает у скриншотов,
          у картинок из мессенджеров и у фото, пересохранённых в редакторе. Это не значит,
          что снимок поддельный, — но подтвердить дату и место по нему нельзя.</div>`;
      } else if (e.lat == null) {
        note = `<div class="ex-note">Координат в файле нет — геометка была выключена
          или её удалили при пересылке.</div>`;
      }

      card.innerHTML = `
        <img class="ex-thumb" src="${it.url}" alt="">
        <div class="ex-body">
          <div class="ex-name">${it.file.name}</div>
          <div class="ex-rows">${rows.join('') || '<div class="ex-row"><span>Ничего не нашлось</span></div>'}</div>
          ${note}
          ${mapBtn}
        </div>
        <button class="c-btn ex-rm" title="Убрать">×</button>`;
      card.querySelector('.ex-rm').addEventListener('click', () => {
        URL.revokeObjectURL(it.url);
        items.splice(idx, 1);
        render();
      });
      list.appendChild(card);
    });
  }
})();
