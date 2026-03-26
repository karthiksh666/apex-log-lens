import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const baseConfig = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  external: ['vscode'],
  platform: 'node',
  target: 'node20',
  logLevel: 'info',
};

// Extension host bundle
const extensionConfig = {
  ...baseConfig,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
};

// WebView UI bundle (runs in browser context, not Node)
const webviewConfig = {
  ...baseConfig,
  entryPoints: ['src/webview/ui/main.ts'],
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  external: [], // no externals for browser bundle
};

// Home sidebar WebView bundle
const homeConfig = {
  ...baseConfig,
  entryPoints: ['src/webview/ui/home.ts'],
  outfile: 'dist/home.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  external: [],
};

if (isWatch) {
  const [extCtx, webCtx, homeCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
    esbuild.context(homeConfig),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch(), homeCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
    esbuild.build(homeConfig),
  ]);
}
