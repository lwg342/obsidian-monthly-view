import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  outfile: 'main.js',
  banner: { js: '/* Monthly Markdown Calendar — local files only. */' },
};
if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
  const destination = 'dist/monthly-markdown-calendar';
  await mkdir(destination, { recursive: true });
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    await copyFile(file, `${destination}/${file}`);
  }
  console.log(`Built ${destination} (no runtime dependencies).`);
}
