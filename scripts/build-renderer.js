// Bundles the renderer (browser-side) ESM modules into a single IIFE that
// index.html loads via a plain <script> tag. The renderer runs in Electron's
// Chromium context with contextIsolation on, so it only touches window globals
// (e.g. window.electronAPI from preload) — never Node APIs. Pass --watch for a
// rebuild-on-change dev loop.
const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [path.join(__dirname, '..', 'src', 'renderer', 'renderer.js')],
  outfile: path.join(__dirname, '..', 'src', 'renderer', 'dist', 'renderer.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  // Electron 38 ships Chromium 138 — target it directly.
  target: 'chrome138',
  sourcemap: true,
  logLevel: 'info'
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('esbuild: watching renderer for changes...');
  } else {
    await esbuild.build(options);
    console.log('esbuild: renderer bundle built.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
