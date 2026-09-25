/**
 * 皮肤设置行的状态容器，以及给组件用的 React 选择器钩子。
 *
 * ## 为什么不用 `@deepseek-ai/dsh-client-store`
 *
 * 客户端槽位的"store 席位"（`PropsStore`）要求传入那个包的 `StoreHandle` 形状
 * （带 `create()` / `decl` 的完整引擎）。而 `dsh-client-store` **不在装载器的
 * 基线模块表里** —— 用它就得再声明一条 `dsh.client.external` 依赖并指定供给方，
 * 为几行状态代码引入装配风险不划算。所以这里用 40 行本地容器 + React 自带的
 * `useSyncExternalStore`（React 是基线模块，安全）。
 */

/** 一个可订阅的只读快照容器。 */
export interface Store<T> {
  /** 读当前快照（引用稳定，直到下一次真正变更）。 */
  get: () => T
  /** 订阅变更；返回取消订阅函数。 */
  subscribe: (listener: () => void) => () => void
  /**
   * 写入若干个字段；与当前值相同则不产生新快照、不通知订阅者。
   * @param patch - 要合并进去的字段。
   */
  set: (patch: Partial<T>) => void
}

/**
 * 创建一个 store。
 * @param initial - 初始状态。
 * @returns store 句柄。
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let snapshot: T = Object.freeze({ ...initial })
  const listeners = new Set<() => void>()

  const get = (): T => snapshot

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  const set = (patch: Partial<T>): void => {
    let changed = false
    for (const key of Object.keys(patch) as (keyof T)[]) {
      if (patch[key] !== snapshot[key]) { changed = true; break }
    }
    if (!changed) return
    snapshot = Object.freeze({ ...snapshot, ...patch })
    // 复制一份再遍历：监听器内部可能退订，直接遍历原集合会漏/跳
    for (const listener of [...listeners]) listener()
  }

  return { get, subscribe, set }
}

/** 选择器钩子的形状。 */
export type SelectorHook<T> = <S>(selector: (state: T) => S) => S

/**
 * 造一个"跟着组件渲染走"的选择器钩子。
 *
 * 两条纪律：
 *   1. **返回的必须是普通函数**，由**组件**在渲染期调用 —— 不能在插件 `apply()`
 *      里就把 `useState` 调掉（那不是 React 上下文，会直接报 Invalid hook call）。
 *      所以这里用闭包惰性持有真正的钩子，首次调用时才创建。
 *   2. 测试环境没有 React 渲染器：给一个惰性 `useState` 替身（首次取值后不再变），
 *      这样 bundle 能在 Node 里被完整执行以验证"加载不抛错"。
 * @param store - 目标容器。
 * @returns 选择器钩子（普通函数）。
 */
export function makeUseStoreHook<T extends object>(store: Store<T>): SelectorHook<T> {
  let hook: SelectorHook<T> | undefined
  return <S,>(selector: (state: T) => S): S => {
    if (hook === undefined) {
      hook = typeof __DEV__ !== 'undefined' && __DEV__ === true
        ? ((sel: (state: T) => unknown) => {
            // 测试替身：惰性求值一次即可
            const React = require('react') as typeof import('react')
            return React.useState(() => sel(store.get()))[0]
          }) as SelectorHook<T>
        : (() => {
            const React = require('react') as typeof import('react')
            return <V,>(sel: (state: T) => V): V =>
              React.useSyncExternalStore(store.subscribe, () => sel(store.get()))
          })() as SelectorHook<T>
    }
    return hook(selector)
  }
}
