import { build } from 'esbuild';
import { resolve } from 'node:path';

export async function loadPlugin(): Promise<any> {
  const result = await build({
    entryPoints: ['tests/subject.ts'], bundle: true, write: false,
    format: 'cjs', platform: 'node', target: 'es2020',
    alias: { obsidian: resolve('tests/obsidian-mock.ts') },
  });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  return module.exports;
}
