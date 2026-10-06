import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const port = 4173;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
    } catch {}
    if (attempt === 29) throw new Error('Локальный сервер не запустился');
    await delay(100);
  }

  const executablePath = existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
  browser = await chromium.launch({ headless: true, executablePath, args: executablePath ? ['--no-sandbox'] : [] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const response = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  if (response.status() !== 200) throw new Error(`Главная страница ответила ${response.status()}`);
  if (await page.title() !== 'Было → Стало · Генератор плашек') throw new Error('Неверный заголовок страницы');
  if (await page.locator('[role="tab"]').count() !== 13) throw new Error('Не найдены все вкладки');
  if (await page.locator('canvas').count() < 1) throw new Error('Не найден рабочий canvas');

  await page.getByRole('tab', { name: /Правка PDF/ }).click();
  if (await page.getByRole('tab', { name: /Правка PDF/ }).getAttribute('aria-selected') !== 'true') {
    throw new Error('ARIA-состояние вкладки не обновилось');
  }
  const vendorResponses = await Promise.all([
    page.request.get(`http://127.0.0.1:${port}/vendor/pdf.min.js`),
    page.request.get(`http://127.0.0.1:${port}/vendor/pdf.worker.min.js`),
    page.request.get(`http://127.0.0.1:${port}/vendor/pdf-lib.min.js`),
  ]);
  if (vendorResponses.some((item) => !item.ok())) throw new Error('Локальные PDF-библиотеки недоступны');
  const libraries = await page.evaluate(async () => {
    const load = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    await load('vendor/pdf.min.js');
    await load('vendor/pdf-lib.min.js');
    return { pdfjs: Boolean(window.pdfjsLib), pdfLib: Boolean(window.PDFLib) };
  });
  if (!libraries.pdfjs || !libraries.pdfLib) throw new Error('Локальные PDF-библиотеки не инициализировались');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  if (errors.length) throw new Error(`Ошибки браузера:\n${errors.join('\n')}`);
  console.log('Smoke-тест Chromium пройден');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
