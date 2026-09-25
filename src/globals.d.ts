/**
 * 全局编译期常量的类型声明。
 *
 * `__DEV__` 由宿主/打包器注入：
 *   · 浏览器里由装载器或构建 define 提供（未定义时取 undefined，代码里用
 *     `typeof __DEV__ !== 'undefined'` 判断，所以不会被 ReferenceError 打到）；
 *   · 冒烟测试（scripts/smoke-client.mjs）在 Node 沙箱里显式传 `true`，
 *     让 store 的选择器钩子走惰性 `useState` 替身 —— 没有 React 渲染器也能
 *     把整份 bundle 执行一遍，验证"加载即抛错"这类问题。
 */
declare const __DEV__: boolean | undefined
