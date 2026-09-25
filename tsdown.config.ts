import type { UserConfig } from 'tsdown'

/** 插件 id：必须与 package.json 的 name 完全一致（模块加载器按它注册）。 */
const PLUGIN_ID = '@dsh-external/dsh-ui-skin'

/**
 * 由宿主浏览器运行时提供的模块，不能打进包里：React 与 cordis。
 *
 * 装载器给工厂的 `require` 只认「基线模块表 → 已物化记录 → boot graph 行 →
 * 已注册工厂」；基线表里就是 React / ReactDOM / cordis 这些。所以客户端半边
 * 刻意**不 require 任何 @deepseek-ai 包**：
 *   · 服务（slots / locale / theme / settingsScope）经 `inject` 由宿主注入，
 *     不经过 require；
 *   · 类型 import 在编译期被抹掉；
 *   · 原本要用的 dsh-client-store / ui-primitives 换成包内实现（见 client/store.ts
 *     与 client/marks/WhaleGirlMark.tsx），免得为一条依赖去声明 external 供给方。
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
]

/**
 * 浏览器半边：tsdown 打成 CJS，外面套一层 `window.__ModuleLoader__.load`。
 * 这段 banner/footer 是 DSH 动态客户端模块的装载协议，不能改。
 */
const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
}

export default [clientBundle] satisfies UserConfig[]
