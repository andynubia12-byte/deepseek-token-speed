import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const definition = JSON.parse(await readFile('tokenizer.json', 'utf8'));
const { vocab, merges, ...modelOptions } = definition.model;
const pipeline = [definition.normalizer, definition.pre_tokenizer, definition.post_processor,
  definition.decoder, modelOptions];

await mkdir('dist', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['src/update.js'],
    bundle: true,
    outfile: 'dist/update.js',
    define: { TOKENIZER_PIPELINE: JSON.stringify(JSON.stringify(pipeline)) },
  }),
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
