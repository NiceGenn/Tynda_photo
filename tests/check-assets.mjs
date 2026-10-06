import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sw = await readFile(resolve(root, 'sw.js'), 'utf8');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));

const assets = [...sw.matchAll(/^\s*'\.\/([^']*)',?$/gm)].map((match) => match[1] || 'index.html');
const documentAssets = [...html.matchAll(/(?:src|href)="(?!https?:|#)([^"?]+)"/g)].map((match) => match[1]);
const missing = [];
for (const asset of new Set([...assets, ...documentAssets])) {
  try { await access(resolve(root, asset)); } catch { missing.push(asset); }
}

if (missing.length) throw new Error(`Не найдены локальные ресурсы: ${missing.join(', ')}`);
if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons)) {
  throw new Error('manifest.webmanifest не содержит обязательные поля PWA');
}
if (/https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/.test(await readFile(resolve(root, 'tab-pdf-tools.js'), 'utf8'))) {
  throw new Error('PDF-инструменты снова зависят от внешнего CDN');
}
console.log(`Проверено ресурсов: ${new Set([...assets, ...documentAssets]).size}`);
