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

if (isWatch) {
  const [extCtx, webCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
}
