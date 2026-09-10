/* Разбор EXIF из JPEG (сегмент APP1 → TIFF). Без внешних библиотек.
   Возвращает поля съёмки, координаты и ориентацию. */

(function (global) {
  const TAGS = {
    0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
    0x0131: 'Software', 0x0132: 'DateTime',
    0x8769: 'ExifIFD', 0x8825: 'GpsIFD',
    0x829A: 'ExposureTime', 0x829D: 'FNumber', 0x8827: 'ISO',
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
    0x920A: 'FocalLength', 0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension',
    0xA434: 'LensModel', 0x9209: 'Flash', 0xA405: 'FocalLength35',
  };
  const GPS_TAGS = {
    0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude',
    0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude',
    0x0007: 'GPSTimeStamp', 0x001D: 'GPSDateStamp',
  };
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  function readValue(dv, off, type, count, le, tiffStart) {
    const size = SIZES[type] || 1;
    const total = size * count;
    let p = off;
    if (total > 4) p = tiffStart + dv.getUint32(off, le);
    if (p + total > dv.byteLength) return null;

    const one = (i) => {
      const q = p + i * size;
      switch (type) {
        case 1: case 7: return dv.getUint8(q);
        case 2: return dv.getUint8(q);
        case 3: return dv.getUint16(q, le);
        case 4: return dv.getUint32(q, le);
        case 5: return dv.getUint32(q, le) / (dv.getUint32(q + 4, le) || 1);
        case 6: return dv.getInt8(q);
        case 8: return dv.getInt16(q, le);
        case 9: return dv.getInt32(q, le);
        case 10: return dv.getInt32(q, le) / (dv.getInt32(q + 4, le) || 1);
        case 11: return dv.getFloat32(q, le);
        case 12: return dv.getFloat64(q, le);
        default: return null;
      }
    };

    if (type === 2) {                       // строка
      let s = '';
      for (let i = 0; i < count; i++) {
        const ch = dv.getUint8(p + i);
        if (!ch) break;
        s += String.fromCharCode(ch);
      }
      return s.trim();
    }
    if (count === 1) return one(0);
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(one(i));
    return arr;
  }

  function readIFD(dv, start, tiffStart, le, dict, out) {
    if (start + 2 > dv.byteLength) return;
    const n = dv.getUint16(start, le);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > dv.byteLength) return;
      const tag = dv.getUint16(e, le);
      const type = dv.getUint16(e + 2, le);
      const count = dv.getUint32(e + 4, le);
      const name = dict[tag];
      if (!name) continue;
      const v = readValue(dv, e + 8, type, count, le, tiffStart);
      if (v !== null) out[name] = v;
    }
  }

  /* Находит сегмент APP1 с меткой Exif и разбирает его */
  function parseJpeg(buf) {
    const dv = new DataView(buf);
    if (dv.getUint16(0) !== 0xFFD8) return null;      // не JPEG
    let off = 2;
    while (off + 4 < dv.byteLength) {
      if (dv.getUint8(off) !== 0xFF) break;
      const marker = dv.getUint8(off + 1);
      const len = dv.getUint16(off + 2);
      if (marker === 0xE1) {
        const sig = off + 4;
        const txt = String.fromCharCode(dv.getUint8(sig), dv.getUint8(sig + 1),
          dv.getUint8(sig + 2), dv.getUint8(sig + 3));
        if (txt === 'Exif') return parseTiff(dv, sig + 6);
      }
      if (marker === 0xDA) break;                      // начались данные картинки
      off += 2 + len;
    }
    return null;
  }

  function parseTiff(dv, tiffStart) {
    if (tiffStart + 8 > dv.byteLength) return null;
    const bom = dv.getUint16(tiffStart);
    const le = bom === 0x4949;
    if (!le && bom !== 0x4D4D) return null;
    if (dv.getUint16(tiffStart + 2, le) !== 42) return null;
    const ifd0 = tiffStart + dv.getUint32(tiffStart + 4, le);

    const out = {};
    readIFD(dv, ifd0, tiffStart, le, TAGS, out);
    if (out.ExifIFD) readIFD(dv, tiffStart + out.ExifIFD, tiffStart, le, TAGS, out);
    if (out.GpsIFD) readIFD(dv, tiffStart + out.GpsIFD, tiffStart, le, GPS_TAGS, out);
    delete out.ExifIFD; delete out.GpsIFD;
    return out;
  }

  const dms = (a, ref) => {
    if (!Array.isArray(a) || a.length < 3) return null;
    let v = a[0] + a[1] / 60 + a[2] / 3600;
    if (ref === 'S' || ref === 'W') v = -v;
    return v;
  };

  /* Приводит сырые теги к удобному виду */
  function normalize(raw) {
    if (!raw) return null;
    const r = { raw };
    r.make = raw.Make || null;
    r.model = raw.Model || null;
    r.lens = raw.LensModel || null;
    r.software = raw.Software || null;
    r.orientation = raw.Orientation || 1;

    const d = raw.DateTimeOriginal || raw.DateTime || raw.DateTimeDigitized;
    if (d && /^\d{4}:\d{2}:\d{2}/.test(d)) {
      const [date, time] = d.split(' ');
      r.shotAt = date.replace(/:/g, '-') + (time ? ' ' + time : '');
      const iso = date.replace(/:/g, '-') + 'T' + (time || '00:00:00');
      const dt = new Date(iso);
      r.shotDate = isNaN(dt) ? null : dt;
    }

    if (raw.ExposureTime) {
      r.exposure = raw.ExposureTime >= 1
        ? raw.ExposureTime.toFixed(1) + ' с'
        : '1/' + Math.round(1 / raw.ExposureTime) + ' с';
    }
    if (raw.FNumber) r.aperture = 'f/' + (+raw.FNumber).toFixed(1);
    if (raw.ISO) r.iso = 'ISO ' + raw.ISO;
    if (raw.FocalLength) r.focal = Math.round(raw.FocalLength) + ' мм';

    const lat = dms(raw.GPSLatitude, raw.GPSLatitudeRef);
    const lon = dms(raw.GPSLongitude, raw.GPSLongitudeRef);
    if (lat !== null && lon !== null && (lat || lon)) {
      r.lat = lat; r.lon = lon;
      if (typeof raw.GPSAltitude === 'number') {
        r.alt = Math.round(raw.GPSAltitude) * (raw.GPSAltitudeRef === 1 ? -1 : 1);
      }
    }
    return r;
  }

  async function read(file) {
    try {
      const head = await file.slice(0, 256 * 1024).arrayBuffer();
      return normalize(parseJpeg(head));
    } catch { return null; }
  }

  /* Матрица разворота по тегу Orientation (1..8) */
  function orientationTransform(o, w, h) {
    switch (o) {
      case 2: return { w, h, t: [-1, 0, 0, 1, w, 0] };
      case 3: return { w, h, t: [-1, 0, 0, -1, w, h] };
      case 4: return { w, h, t: [1, 0, 0, -1, 0, h] };
      case 5: return { w: h, h: w, t: [0, 1, 1, 0, 0, 0] };
      case 6: return { w: h, h: w, t: [0, 1, -1, 0, h, 0] };
      case 7: return { w: h, h: w, t: [0, -1, -1, 0, h, w] };
      case 8: return { w: h, h: w, t: [0, -1, 1, 0, 0, w] };
      default: return null;
    }
  }

  global.ExifReader = { read, parseJpeg, normalize, orientationTransform };
})(window);
