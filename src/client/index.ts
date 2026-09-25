/**
 * 浏览器半边：皮肤服务。
 *
 * 皮肤是叠在「浅色/深色/跟随系统」之上的**表现层**：
 *   · 选中的皮肤 id 存在**设置**里（跟随 profile，可导出/多端一致）；另存一份
 *     localStorage 镜像只为首屏不闪，跨标签页同步由设置镜像负责；
 *   · 皮肤层通过 `ThemeRuntime.overrideTokens` 叠加（主题仍是明暗的唯一主人，
 *     换皮肤不动明暗偏好，换明暗则同一皮肤层按新模式重新合成）；
 *   · `body[data-dsh-ui-skin]` 发布当前皮肤（本插件自己的属性名，不与树内皮肤共用）；
 *   · （原先还会替换页面 favicon，已删除：去掉反而更好，也少一张要往目录里放的图）；
 *   · 素材目录通过 `ctx.configForms.get(SKIN_ENTRY_ID)`（0.1.7 的表单服务，
 *     id = profile 条目 id = `external-ui-skin`；0.1.5 时代是
 *     `ctx.settingsScope.bind({ namespace })`）读写 —— 宿主半边读同一个
 *     设置来决定从哪个目录服务图片。
 *
 * 与树内那份的区别（外部插件形态）：
 *   1. 去掉启动期注入（boot script）—— 外部插件在首屏后才挂载，本版不做；
 *   2. 去掉对 `dsh-client-store` / `ui-primitives` 的依赖（两者都不在装载器的
 *      基线模块表里，用它们就得再声明 external 供给方），改用包内的极小 store
 *      与自带的鲸鱼矢量图；
 *   3. 位图素材改从 `/dsh-ui-skin/assets/` 读，且**先问清单**再决定用哪几张，
 *      缺图直接渲染矢量标记（一个失败请求都不发）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
// 仅类型：configForms（设置表单）/ locale / renderer 的 Context 合并。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SkinRow, type SkinRowInjected } from './SkinRow.tsx'
import { createSkinRowStore, type SkinRowStore } from './skin-row-store.ts'
import { createStore, makeUseStoreHook } from './store.ts'
import { en, zh, type SkinKey } from './locales.ts'
import { assetUrl, fetchAssetManifest, hasAsset } from './assets.ts'
import {
  ASSETS_DIR_FIELD, DEFAULT_SKIN, isSkinId, SKIN_ATTRIBUTE, SKIN_ENTRY_ID,
  SKIN_FIELD, SKIN_STORAGE_KEY, type SkinId,
} from '../skin-settings.ts'
import { skinById } from '../skins.ts'

export type { SkinRowComponentProps, SkinRowInjected } from './SkinRow.tsx'
export type { SkinRowState } from './skin-row-store.ts'
export type { SkinKey } from './locales.ts'
export type { SkinId, SkinSettings } from '../skin-settings.ts'
export type { SkinDefinition } from '../skins.ts'
export {
  DEFAULT_SKIN, isSkinId, SKIN_ATTRIBUTE, SKIN_ENTRY_ID, SKIN_FIELD, SKIN_IDS,
  SKIN_STORAGE_KEY,
} from '../skin-settings.ts'
export { SKINS, skinById } from '../skins.ts'
export { ASSETS_URL_PREFIX, assetUrl, type SkinAssetManifest } from './assets.ts'

/**
 * 本特性设置行文案的命名空间。
 *
 * 用 `settings.dshUiSkin` 而不是树内的 `settings.skin` —— locale 注册表同样按
 * 命名空间唯一，两个皮肤插件都注册 `settings.skin` 会撞（与 `provide` 同一类问题）。
 */
export const SETTINGS_NS = 'settings.dshUiSkin'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 皮肤设置行的文案。 */
    'settings.dshUiSkin': SkinKey
  }
}

/** 每次变更发布的不可变皮肤状态。 */
export interface SkinSnapshot {
  /** 当前皮肤 id（一定是内置注册表成员）。 */
  id: SkinId
  /** 单调递增的变更计数。 */
  revision: number
}

/**
 * 本插件注册的服务与事件**必须避开树内皮肤用的名字**。
 *
 * 树内皮肤（`@deepseek-ai/dsh-client-ui-skin`）注册的是服务 `skin`、事件 `skin/change`。
 * cordis 的 `provide` **不能重复注册**：第二次注册不是"覆盖"，而是直接抛错 ——
 *   `service "skin" has been registered at <this>`
 * 而条目的 apply 抛错会让**整个插件加载失败**，界面只剩一页
 * `Failed to load plugins`（实测踩过，用户侧白屏就是这个）。
 *
 * 所以这里用 `uiSkin` / `uiSkin/change`：与树内那份完全分开，两者可以同时存在。
 * 若想在设置里只留一份，另外靠 profile 补丁把树内的那条 disable（见便携版启动器）。
 *
 * 注：`declare module` 的合并是**全局**的 —— 双方都在给 `Context` / `Events` 加成员，
 * 所以两边都会看到 `skin`、`uiSkin` 两个成员，这没有副作用：真正跑起来时用哪个
 * 由各自的实现决定，另一个只是"声明上存在"。
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 本插件提供的皮肤服务（与树内皮肤的 `skin` 分开，避免重复注册冲突）。 */
    uiSkin: SkinRuntime
  }
  interface Events {
    /**
     * 皮肤状态变化（切换选中，或另一标签页持久化了一个）。
     * @param snapshot - 当前不可变快照。
     * @mode emit
     */
    'uiSkin/change'(snapshot: SkinSnapshot): void
  }
}

/**
 * 客户端设置面的最小接口。
 *
 * 契约来自 `@deepseek-ai/dsh-client-ui-settings` 的表单服务（0.1.7 起服务名是
 * `configForms`、类型是 `ConfigForm<T>`；0.1.5 时代叫 `settingsScope`）：
 *   · 读：`getSnapshot()` → `{ status, value, writable, … }`（**没有 `get()`**）
 *   · 订阅：`subscribe(listener)`
 *   · 写：`set(field, value)` / `unset(field)` —— **按字段**写，不是 `set(整段对象)`
 *
 * 一开始我按 `get()` / `set(object)` 写，结果插件在浏览器里直接加载失败
 * （`scope?.get is not a function`），设置页整块出不来。这类错误 HTTP 层验证抓不到，
 * `scripts/verify-ui.mjs` 用真实浏览器一跑就现形了。
 */
interface SettingsScopeSnapshot {
  /** `loading` 直到首次收到 section；`unavailable` 表示这个客户端没被暴露该命名空间。 */
  status: 'loading' | 'ready' | 'unavailable'
  /** 最近一次被接受的分段值；首次接受前是 undefined。 */
  value: unknown
  /**
   * 宿主文档里的**用户层**原始值（没有覆盖时为空）。
   * 用来区分"用户选过"与"只是 schema 默认值"：只有前者才应当覆盖本地镜像。
   */
  user?: unknown
  /** 宿主文档是否接受写入。 */
  writable: boolean
}

interface SettingsScope {
  getSnapshot: () => SettingsScopeSnapshot
  subscribe: (listener: () => void) => () => void
  set: (field: string, value: unknown) => Promise<void> | void
  unset: (field: string) => Promise<void> | void
}

/** 浏览器上下文（只声明用到的服务，避免把整个客户端服务面拖进编译）。 */
interface ClientContext {
  theme?: ThemeRuntime
  /** 0.1.7 的表单服务：按 profile 条目 id 取该插件的设置表单（取代 settingsScope）。 */
  configForms?: { get: (entryId: string) => SettingsScope }
  slots?: {
    inject: (name: string, callback: () => unknown) => void
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  locale?: { register: (namespace: string, dictionaries: Record<string, unknown>) => unknown }
  effect?: (callback: () => void | (() => void), label?: string) => void
  on: (event: string, listener: (...args: never[]) => void) => unknown
  emit: (event: string, payload: unknown) => void
  provide?: (name: string, value: unknown) => void
}

/**
 * 把一个跨边界的值收窄成合法皮肤 id。
 * @param value - 来自设置快照或本地镜像的值。
 * @returns 合法 id；否则 undefined（由调用方决定回落什么）。
 */
function narrowSkin(value: unknown): SkinId | undefined {
  return isSkinId(value) ? value : undefined
}

/** 写入皮肤 id：同时更新本地镜像与设置（由 apply 注入，见那边的注释）。 */
type PersistSkin = (id: SkinId) => void

/** 把皮肤 id 发布到 body 上（品牌面 CSS 的选举依据）。 */
function applyBodyAttribute(id: SkinId): void {
  if (typeof document === 'undefined') return
  document.body.setAttribute(SKIN_ATTRIBUTE, id)
}

/** 皮肤服务：注册表与偏好的拥有者。 */
export class SkinRuntime {
  private readonly ctx: ClientContext
  private readonly theme: ThemeRuntime
  private readonly store: SkinRowStore
  private readonly persist: PersistSkin
  private id: SkinId
  private revision = 0
  private snapshot: SkinSnapshot
  private disposer: (() => void) | undefined

  /**
   * @param ctx - 所属上下文（change 事件在它上面发出）。
   * @param theme - 承载皮肤覆盖层的主题服务。
   * @param store - 设置行的 store（记录素材清单状态）。
   * @param options - 初始 id（来自本地镜像）与写入持久化的回调。
   */
  constructor(
    ctx: ClientContext,
    theme: ThemeRuntime,
    store: SkinRowStore,
    options: { initial: SkinId; persist: PersistSkin },
  ) {
    this.ctx = ctx
    this.theme = theme
    this.store = store
    this.persist = options.persist
    this.id = options.initial
    this.snapshot = Object.freeze({ id: this.id, revision: this.revision })
    this.applyLayer(this.id)
    // 跨标签页同步**不再靠 `storage` 事件**：皮肤 id 的权威值在设置里，而设置镜像
    // 本身会把宿主文档的变更推给每个客户端（见 apply 里的 scope 订阅）。
  }

  /**
   * 读当前不可变快照。
   * @returns 当前快照（下次变更前引用稳定）。
   */
  getSkin(): SkinSnapshot {
    return this.snapshot
  }

  /**
   * 切换皮肤 —— 用户偏好的唯一写入入口。
   * @param id - 内置皮肤 id；未知值抛错。
   */
  setSkin(id: SkinId): void {
    if (!isSkinId(id)) throw new Error(`skin "${String(id)}" is not a built-in skin`)
    if (this.id === id) return
    this.persist(id) // 本地镜像 + 设置一起写
    this.adopt(id)
  }

  /**
   * 采纳设置里的权威值（**不写回**，避免与设置形成写回环）。
   * 其他标签页改了皮肤时，设置镜像会把新值推到这里，跨标签页同步即由此完成。
   * @param id - 设置快照里的皮肤 id。
   */
  adoptFromSettings(id: SkinId): void {
    if (this.id !== id) this.adopt(id)
  }

  /** 采纳一个已持久化的 id，不写回。 */
  private adopt(id: SkinId): void {
    this.id = id
    this.applyLayer(id)
    this.publish()
  }

  /** 重新叠加覆盖层，并刷新 body 属性。 */
  private applyLayer(id: SkinId): void {
    this.disposer?.()
    this.disposer = this.theme.overrideTokens('dsh-ui-skin', skinById(id).tokens)
    applyBodyAttribute(id)
  }

  private publish(): void {
    this.revision += 1
    this.snapshot = Object.freeze({ id: this.id, revision: this.revision })
    this.ctx.emit('uiSkin/change', this.snapshot)
  }
}

/**
 * 必需服务：主题运行时（覆盖层的宿主）、槽位与文案（设置行）、设置面
 * （素材目录的读写通道）。
 */
export const inject = ['slots', 'locale', 'theme', 'configForms']

/**
 * 客户端插件主体。
 * @param ctx - 客户端 cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  const store = createSkinRowStore()

  // ── 皮肤 id：设置是权威值，本地镜像是"首屏就有一张脸"的快照 ──
  // 首屏设置快照还是 loading，所以先用镜像画；设置到齐后由下面的 scope 订阅采纳权威值。
  let scope: SettingsScope | undefined
  const mirror = createStore<{ skin: SkinId }>({ skin: DEFAULT_SKIN }, { persist: SKIN_STORAGE_KEY })
  const skin = new SkinRuntime(ctx, ctx.theme as ThemeRuntime, store, {
    initial: narrowSkin(mirror.get().skin) ?? DEFAULT_SKIN,
    persist: (id) => {
      mirror.set({ skin: id }) // 本地镜像（首屏用）
      void scope?.set(SKIN_FIELD, id) // 权威值：跟随 profile；跨标签页由设置镜像同步
    },
  })
  // 服务名仍用 uiSkin（0.1.7 已移除树内皮肤包，`skin` 这个名字空出来了，但
  // 改名没有必要，也会让既有引用失效）。
  ctx.provide?.('uiSkin', skin)

  ctx.effect?.(() => { ctx.locale?.register(SETTINGS_NS, { zh, en }) }, 'ui-skin: settings row dictionaries')

  // ── 设置：素材目录与皮肤 id 都从这一个 scope 读 ──
  // 契约要点：读走 `getSnapshot().value`（不是 `get()`），写走 `set(字段, 值)`
  // （不是 `set(整段对象)`）。值在首次同步前是 undefined。

  /** 从 scope 快照里取出 assetsDir（去空白；非字符串一律当空）。 */
  const dirFromSnapshot = (snapshot: SettingsScopeSnapshot | undefined): string => {
    const section = snapshot?.value
    const raw = section !== null && typeof section === 'object'
      ? (section as Record<string, unknown>)[ASSETS_DIR_FIELD]
      : undefined
    return typeof raw === 'string' ? raw.trim() : ''
  }

  /** 设置里**用户显式写过**的皮肤 id（区别于 schema 默认值）。 */
  const userSkin = (snapshot: SettingsScopeSnapshot | undefined): SkinId | undefined => {
    const user = snapshot?.user
    if (user === null || typeof user !== 'object') return undefined
    return narrowSkin((user as Record<string, unknown>)[SKIN_FIELD])
  }

  const syncDir = (): string => {
    const dir = dirFromSnapshot(scope?.getSnapshot())
    store.set({ assetsDir: dir })
    return dir
  }

  const syncSkin = (): void => {
    // 只采纳"用户层有值"的情况：否则设置里的 schema 默认值会把用户眼前的皮肤改掉
    // （首屏来自镜像，那是更贴近用户上一次选择的值）。
    // ⚠️ 若将来要先发布"皮肤存在 localStorage"的版本、再升级到本版，这里必须补一次
    //    "把镜像值收养进设置"的写入；当前 ui-skin 从未发布，无需收养。
    const id = userSkin(scope?.getSnapshot())
    if (id !== undefined) skin.adoptFromSettings(id)
  }

  ctx.effect?.(() => {
    scope = ctx.configForms?.get(SKIN_ENTRY_ID)
    if (scope === undefined) return () => { }
    const stop = scope.subscribe(() => { syncDir(); syncSkin() })
    syncDir()
    syncSkin()
    return () => { stop(); scope = undefined }
  }, 'ui-skin: settings scope')

  /** 写入素材目录：空串 = 清掉字段（回到默认目录）。 */
  const writeDir = (dir: string): void => {
    try {
      if (dir === '') void scope?.unset(ASSETS_DIR_FIELD)
      else void scope?.set(ASSETS_DIR_FIELD, dir)
    } catch {
      /* 写入失败：界面仍按草稿显示，宿主下次启动才用新目录 */
    }
  }

  // ── 素材清单：先问一次"目录里有哪些图"，再决定卡片标记用位图还是矢量 ──
  // 顺带在 console 留一行诊断：位图没生效时，这行能直接说明是"清单没拿到"
  // 还是"拿到了但客户端没用"（UI 验证脚本会读它）。
  const loadManifest = (): void => {
    console.info('[dsh-ui-skin] loadManifest 开始')
    void fetchAssetManifest().then((state) => {
      store.set({ assets: state })
      if (state.status === 'ready') {
        console.info(`[dsh-ui-skin] 素材清单：${state.manifest.assets.length} 张，目录 ${state.manifest.dir}`)
      } else if (state.status === 'error') {
        console.warn(`[dsh-ui-skin] 素材清单读取失败：${state.reason}（标记将用内置矢量版）`)
      }
    })
  }
  ctx.effect?.(() => { loadManifest() }, 'ui-skin: asset manifest')

  // 目录变化 → 稍后重拉（防抖：用户敲路径时不要每个字符打一次请求）
  let lastFetchedDir = store.get().assetsDir
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = store.subscribe(() => {
    const dir = store.get().assetsDir
    if (dir === lastFetchedDir) return
    lastFetchedDir = dir
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(loadManifest, 250)
  })
  ctx.effect?.(() => () => {
    unsubscribe()
    if (timer !== undefined) clearTimeout(timer)
  }, 'ui-skin: assetsDir watcher')

  // ── 设置行 ──
  // 用注入钩子的方式提供状态订阅：槽位的 "store 席位" 要的是 dsh-client-store 的
  // StoreHandle 形状（一条非基线依赖），而这里只需要"能订阅的不可变快照"。
  const useStore = makeUseStoreHook(store)
  const syncStore = (snapshot: SkinSnapshot): void => {
    store.set({ skin: snapshot.id, revision: snapshot.revision })
  }
  ctx.on('uiSkin/change', syncStore)
  const injected = (): SkinRowInjected => ({
    setSkin: (id) => { skin.setSkin(id) },
    getAssetsDir: () => store.get().assetsDir,
    setAssetsDir: (dir) => {
      store.set({ assetsDir: dir })
      writeDir(dir)
      // 目录变了 → 立刻重拉一次清单（不等防抖），让用户马上看到效果
      lastFetchedDir = dir
      loadManifest()
    },
    isDefaultAssetsDir: () => store.get().assetsDir === '',
    useStore,
  })
  ctx.slots?.inject('settings.general.item', () => ctx.slots?.register({
    name: 'settings.general.item',
    id: 'dsh-ui-skin',
    order: 11,
    locale: SETTINGS_NS,
    inject: injected,
  }, SkinRow))
}
