# Сторонние библиотеки

## libheif-bundle.js

Декодер HEIC/HEIF (снимки с айфонов) — сборка **libheif** под WebAssembly.

- Источник: [libheif-js](https://github.com/catdad-experiments/libheif-js) v1.23.2
  (сборка апстрим-проекта [libheif](https://github.com/strukturag/libheif))
- Лицензия: **LGPL-3.0** — полный текст в `libheif.LICENSE`
- WebAssembly вшит в сам файл, отдельных запросов не делает

Файл подключается **лениво** — только когда пользователь добавил HEIC-снимок,
поэтому обычная загрузка страницы его не тянет.

Согласно LGPL исходный код библиотеки доступен по ссылкам выше; здесь лежит
только скомпилированная сборка без изменений.

## qrcode.js

Генератор QR-кодов.

- Источник: [qrcode-generator](https://www.npmjs.com/package/qrcode-generator) v2.0.4
  (Kazuhiko Arase)
- Лицензия: **MIT** — текст лицензии в шапке самого файла
- Размер ~57 КБ, подключается лениво, только на вкладке «QR-код»

## PDF.js и pdf-lib

Инструменты просмотра и правки PDF хранятся локально, чтобы вкладка работала
офлайн и не зависела от сторонних CDN.

- `pdf.min.js`, `pdf.worker.min.js` — PDF.js 3.11.174, Apache-2.0;
  лицензия в `pdfjs.LICENSE`
- `pdf-lib.min.js` — pdf-lib 1.17.1, MIT;
  лицензия в `pdf-lib.LICENSE.md`

Версии зафиксированы; обновлять файлы и сведения о лицензиях следует вместе.
