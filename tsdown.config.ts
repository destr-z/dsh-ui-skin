import type { UserConfig } from 'tsdown'

/** 插件 id：必须与 package.json 的 name 完全一致（模块加载器按它注册）。 */
const PLUGIN_ID = '@dsh-external/dsh-ui-skin'

/**
 * 由宿主浏览器运行时提供、不能打进包里的模块。
 *
 * 装载器给工厂的 `require` 只认「基线模块表 → 已物化记录 → boot graph 行 →
 * 已注册工厂」。**0.1.7 的基线模块表**（packages/client/web/src/seed.ts）里有：
 *   react、react/jsx-runtime、react-dom、react-dom/client、@deepseek-ai/cordis、
 *   dsh-client-store、dsh-client-ui-slots、dsh-client-ui-primitives、dsh-client-ui-dockkit。
 *
 * 所以客户端半边的规矩是：
 *   · 服务（slots / locale / theme / configForms）经插件 `inject` 由宿主注入；
 *   · 基线表里的**库**（例如 dsh-client-store）走 `require`，并在 package.json 的
 *     `dsh.client.external` 里声明 —— 静态表名不产生图边，零装配风险；
 *   · 类型 import 在编译期被抹掉。
 *
 * （0.1.5 时代 dsh-client-store / ui-primitives 都不在基线表里，所以当时改成了包内
 * 实现；0.1.7 它们都进表了，那条限制不再成立。）
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-store',
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
