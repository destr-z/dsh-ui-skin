/**
 * 皮肤设置行的状态容器，以及给组件用的 React 选择器钩子。
 *
 * ## 引擎用官方的 `@deepseek-ai/dsh-client-store`
 *
 * 0.1.5 时代这个包**不在装载器的基线模块表里**：用它就得额外声明 `dsh.client.external`
 * 并指望有供给方，为几行状态代码引入装配风险不划算，所以当时用了本地 40 行容器。
 *
 * **0.1.7 它已经在基线表里**（`packages/client/web/src/seed.ts`），而且 `dsh.client.external`
 * 对静态表名不产生图边（`packages/client/modules/src/index.ts`：external 要么是包行、
 * 要么是静态表名）—— 装配风险为零。所以现在直接用官方 `createSnapshotStore`：
 *   · 顺带拿到 **`persist`**（localStorage 持久化，皮肤 id 的首屏镜像要用它）；
 *   · 状态引擎（zustand + immer）与官方插件一致，不再是"另一套"。
 *
 * 本地只保留官方没有的两点便利：`set(patch)` 的**浅比较短路**（无变化不发通知）与
 * `makeUseStoreHook`（把 store 变成组件渲染期可调用的选择器钩子）。组件只依赖
 * `get` / `subscribe`，所以换引擎对它们透明。
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

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
 * 创建一个 store（官方引擎 + 本地便利层）。
 * @param initial - 初始状态。
 * @param options - 给了 `persist` 就用它作 localStorage 键持久化整个快照。
 * @returns store 句柄。
 */
export function createStore<T extends object>(
  initial: T,
  options?: { persist?: string },
): Store<T> {
  const store = options?.persist === undefined
    ? createSnapshotStore<T>(initial)
    : createSnapshotStore<T>(initial, { persist: { name: options.persist } })

  return {
    get: () => store.getSnapshot(),
    subscribe: store.subscribe,
    set: (patch) => {
      const current = store.getSnapshot()
      // 浅比较短路：官方 store 的 set/update 总是通知，这里保留旧语义，
      // 避免同值写入触发整行重渲染。
      const changed = (Object.keys(patch) as (keyof T)[])
        .some(key => patch[key] !== current[key])
      if (!changed) return
      store.update((draft) => { Object.assign(draft, patch) })
    },
  }
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
