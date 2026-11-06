import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/hook.js'], bundle: true, outfile: 'dist/hook.js' }),
  build({
    entryPoints: ['src/panel.js'],
    bundle: true,
    loader: { '.json': 'text' },
    minify: true,
    charset: 'utf8',
    outfile: 'dist/panel.js',
  }),
  ...['manifest.json', 'LICENSE-DeepSeek.txt', 'LICENSE-HuggingFace.txt']
    .map(file => copyFile(file, `dist/${file}`)),
]);
