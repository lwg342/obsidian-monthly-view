import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

await mkdir('.preview', { recursive: true });
await build({
  entryPoints: ['tests/preview-entry.ts'], outfile: '.preview/preview.js', bundle: true,
  format: 'esm', platform: 'browser', target: 'es2022',
  alias: { obsidian: resolve('tests/obsidian-mock.ts') }, loader: { '.md': 'text' },
});
const routes = new Map([
  ['/', ['tests/preview.html', 'text/html; charset=utf-8']],
  ['/host.css', ['tests/host.css', 'text/css']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/preview.js', ['.preview/preview.js', 'text/javascript']],
]);
const server = createServer(async (request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404); response.end(); return; }
  try { response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' }); response.end(await readFile(route[0])); }
  catch { response.writeHead(500); response.end(); }
});
server.listen(5187, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:5187 (simulated host; no vault access).'));
