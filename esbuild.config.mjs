import { builtinModules } from 'node:module';
import process from 'node:process';

import esbuild from 'esbuild';

const production = process.argv[2] === 'production';

const shared = {
  banner: {
    js: `/*
由 esbuild 生成。源代码见：
https://github.com/LuoJiangYong/obsidian-dsh-workbench
*/`,
  },
  bundle: true,
  logLevel: 'info',
  minify: production,
  sourcemap: production ? false : 'inline',
  target: 'es2021',
  treeShaking: true,
};

const pluginContext = await esbuild.context({
  ...shared,
  entryPoints: ['src/main.ts'],
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ],
  format: 'cjs',
  outfile: 'main.js',
});

const bridgeContext = await esbuild.context({
  ...shared,
  entryPoints: ['src/obsidian-bridge.ts'],
  external: [
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ],
  format: 'esm',
  outfile: 'obsidian-bridge.mjs',
});

if (production) {
  await Promise.all([pluginContext.rebuild(), bridgeContext.rebuild()]);
  await Promise.all([pluginContext.dispose(), bridgeContext.dispose()]);
} else {
  await Promise.all([pluginContext.watch(), bridgeContext.watch()]);
}
