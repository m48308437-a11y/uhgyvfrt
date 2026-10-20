// بیلد فرانت‌اند: esbuild (باندل + code splitting) + Tailwind + فشرده‌سازی gzip/brotli
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'); const out = path.join(root, 'web/dist'); const assets = path.join(out, 'assets');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(assets, { recursive: true });
const r = await build({ entryPoints: [path.join(root, 'web/src/main.jsx')], bundle: true, splitting: true, format: 'esm', minify: true, outdir: assets, entryNames: 'app-[hash]', chunkNames: 'chunk-[hash]', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, metafile: true, target: ['es2020', 'safari14'], legalComments: 'none' });
const entry = Object.keys(r.metafile.outputs).find((f) => r.metafile.outputs[f].entryPoint);
execSync(`node ${path.join(root, "node_modules/tailwindcss/lib/cli.js")} -c web/tailwind.config.cjs -i web/src/styles.css -o web/dist/assets/tmp.css --minify`, { cwd: root, stdio: 'inherit' });
const css = fs.readFileSync(path.join(assets, 'tmp.css')); const cssName = `app-${crypto.createHash('md5').update(css).digest('hex').slice(0, 8)}.css`;
fs.renameSync(path.join(assets, 'tmp.css'), path.join(assets, cssName));
fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(root, 'web/index.html'), 'utf8').replace('%CSS%', `/assets/${cssName}`).replace('%JS%', '/' + path.relative(out, path.join(root, entry))));
for (const f of fs.readdirSync(assets).map((x) => path.join(assets, x)).concat(path.join(out, 'index.html'))) { const b = fs.readFileSync(f); fs.writeFileSync(f + '.gz', zlib.gzipSync(b, { level: 9 })); fs.writeFileSync(f + '.br', zlib.brotliCompressSync(b)); }
console.log('✔ build done:', fs.readdirSync(assets).filter((x) => !/\.(gz|br)$/.test(x)).map((x) => `${x} ${(fs.statSync(path.join(assets, x)).size / 1024).toFixed(0)}KB`).join(', '));
