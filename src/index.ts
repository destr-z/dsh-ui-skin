/**
 * @dsh-external/dsh-ui-skin —— 宿主半边。
 *
 * 三件事，都不碰皮肤的实际渲染（那在浏览器半边）：
 *
 *   1. **注册 settings 命名空间 `dsh-ui-skin`** —— 浏览器半边用
 *      `ctx.settingsScope.bind({ namespace: 'dsh-ui-skin' })` 读写的只是这个服务的一面
 *      镜子；宿主不注册，客户端就无处可写，表现是"填了目录没反应"。
 *      （命名空间刻意**不叫** `ui-skin`：那是树内皮肤的命名空间，同一个命名空间被
 *      两个宿主插件注册会冲突。）
 *   2. **注册资产路由** —— 把"本地素材目录"里的图喂给浏览器（见 asset-serve.ts）。
 *      仓库里不带任何图片，这是"个人素材不再分发"的落点。
 *   3. **启动日志** —— 打印生效的素材目录与实际命中的图，让"图为什么没生效"
 *      一眼可查（否则只能靠猜）。
 *
 * 刻意**不 import 任何 @deepseek-ai 深路径**（只 import 类型）：外部插件的加载期
 * 依赖越少越好，schema 用 schemastery 兼容的最小实现就地写 —— 与
 * @dsh-external/dsh-self-plugins 同一套做法。
 *
 * @module @dsh-external/dsh-ui-skin
 */

/**
 * Settings 命名空间，必须与浏览器半边一致。
 *
 * 真相源在 asset-serve.ts（那边决定"从哪个目录读素材"，命名空间是它的一部分）；
 * 这里只是转出去给调用方。**不要在这里再写一份字面量** —— 之前就因为这个，
 * 留下了两份同名字面量、其中一份是过期值。
 */
export { SKIN_SETTINGS_NAMESPACE } from './asset-serve.ts'

/** 设置里承载"素材目录"的字段名。 */
export const ASSETS_DIR_FIELD = 'assetsDir'

/** 本插件资产路由的挂载前缀。 */
export const ASSETS_ROUTE_PREFIX = '/dsh-ui-skin/assets'

export {
  SKIN_ASSET_NAMES, assetFilePath, defaultAssetsDir, describeAssetsDir, isSkinAssetName,
  lookupAsset, openAsset, resolveAssetsDir,
  type SkinAssetName, type UiSkinSettings,
} from './asset-serve.ts'

import {
  ASSETS_ROUTE_PREFIX as ROUTE_PREFIX,
  SKIN_ASSET_NAMES,
  SKIN_SETTINGS_NAMESPACE,
  describeAssetsDir,
  lookupAsset,
  openAsset,
} from './asset-serve.ts'

import z from '@deepseek-ai/schemastery'

import { DEFAULT_SKIN, SKIN_IDS, type SkinId } from './skin-settings.ts'

/** 本插件设置的值形状（Config 校验并填默认值后的有效值）。 */
type SkinConfig = {
  skin?: SkinId
  assetsDir?: string
}

/**
 * 设置命名空间声明（0.1.7 声明式模型）。
 *
 * `.volatile()` = 字段出现在设置面、可被客户端表单写入；写入持久化到 profile
 * 的 cordis patch，条目重载后 apply() 带新 config 再跑一次。旧的
 * `settings.register(ns, schema, { applies: 'live' })` 与 `settings.get(ns)`
 * 在 0.1.7 均已不存在。
 *
 * ⚠️ 必须是**真的** schemastery：设置描述面会调 `schema.toJSON()`、解析会调
 * `schema(value)`；手写"长得像 schema"的对象少了这些就抛错（表现为设置里
 * 写不进去）。
 */
export const Config = z.object({
  skin: z.union([...SKIN_IDS]).default(DEFAULT_SKIN).volatile(),
  assetsDir: z.string().default('').volatile(),
})

/**
 * 0.1.7 设置宿主（行为契约最小面）。
 * 没有 `register()` / `get()`：命名空间由导出的 Config 声明，读值走 apply 的
 * config 参数，写入走 `update()`。
 */
interface SettingsLike {
  /** 自带设置行的插件用它关掉自动生成的表单；返回 disposer。 */
  configure: (presentation: { auto?: boolean }, owner: unknown) => () => void
  update: (namespace: string, patch: object) => Promise<void>
}

/** 只声明我们用到的宿主服务，避免把整个 dsh 类型面拖进编译。 */
interface HostContext {
  get: (name: string) => unknown
  inject: (names: string[], callback: (ctx: HostContext) => void) => void
  effect: (callback: () => (() => void) | void, label?: string) => void
  /** 本插件的 fiber（settings.configure 的 owner 参数）。 */
  fiber: unknown
  webServer?: WebServerLike
}

interface WebServerLike {
  register: (route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: HttpRequestLike, res: HttpResponseLike) => void | Promise<void>
  }) => () => void
}

interface HttpRequestLike {
  url?: string
}

interface HttpResponseLike {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string | Buffer) => void
  once: (event: string, listener: () => void) => void
  pipe?: (source: NodeJS.ReadableStream) => void
}

export const name = 'ui-skin'

/** settings 与 webServer 都是硬依赖：前者存目录，后者发图片。 */
export const inject = ['settings', 'webServer']

/**
 * 把请求路径尾部的资产名取出来。
 * @param url - 请求的原始 url（可含查询串）。
 * @param prefix - 路由前缀。
 * @returns 资产名（可能是空串或含斜杠的非法值，交给白名单挡掉）。
 */
function assetNameFromUrl(url: string | undefined, prefix: string): string {
  const path = (url ?? '').split('?')[0] ?? ''
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  return decodeURIComponent(rest.replace(/^\/+/, ''))
}

/**
 * 列出目录里**实际存在**的资产名。客户端先问这个，再决定哪几张图用位图 ——
 * 免得每次加载都甩一串 404（404 不致命，但会在控制台留噪声、也不好看）。
 * @param dir - 素材目录。
 * @returns 存在的资产名数组。
 */
async function listAvailable(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const assetName of SKIN_ASSET_NAMES) {
    const hit = await lookupAsset(dir, assetName)
    if (hit.ok) found.push(assetName)
  }
  return found
}

/**
 * 注册资产路由。两条：
 *   · `GET <prefix>/manifest.json` → `{ dir, assets: [...] }`（客户端用它决定用哪几张图）
 *   · `GET <prefix>/<name>`        → 文件；不在白名单/目录里没有 → 404
 * @param ctx - 宿主上下文（需已拿到 webServer）。
 * @param getConfiguredDir - 取当前设置的素材目录（每次请求都读，设置改动即时生效）。
 */
function registerAssetRoutes(ctx: HostContext, getConfiguredDir: () => unknown): void {
  const server = ctx.webServer
  if (server === undefined) {
    console.warn('[ui-skin] 没有 webServer 服务，素材路由未注册（皮肤将只用内置矢量标记）')
    return
  }

  const handler = async (req: HttpRequestLike, res: HttpResponseLike): Promise<void> => {
    const configured = getConfiguredDir()
    const { dir } = describeAssetsDir(configured)
    const assetName = assetNameFromUrl(req.url, ROUTE_PREFIX)

    if (assetName === 'manifest.json') {
      const assets = await listAvailable(dir)
      const body = JSON.stringify({ dir, assets })
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      // manifest 必须每次新鲜：用户放图/删图后刷新页面就该看到变化
      res.setHeader('cache-control', 'no-store')
      res.end(body)
      return
    }

    const hit = await lookupAsset(dir, assetName)
    if (!hit.ok) {
      res.statusCode = hit.status
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(hit.reason)
      return
    }
    res.statusCode = 200
    res.setHeader('content-type', hit.contentType)
    // 单张图的内容不会变（名字固定）——让它长缓存，省掉重复读取
    res.setHeader('cache-control', 'public, max-age=86400')
    if (typeof res.pipe === 'function') {
      res.once('close', () => { /* 客户端断开，读流会自行结束 */ })
      res.pipe(openAsset(hit.path))
      return
    }
    res.end()
  }

  ctx.effect(() => server.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }), 'ui-skin: asset route')
}

/**
 * 插件主体。
 * @param ctx - 宿主上下文。
 */
export function apply(ctx: HostContext, config: SkinConfig): void {
  // settings 只是"持久化出口"：命名空间由导出的 Config 声明，无需注册。
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.get('settings') as SettingsLike | undefined
    if (settings === undefined) return
    // 本插件自带设置行（settings.general.item），关掉自动生成的表单。
    ctx.effect(
      () => settings.configure({ auto: false }, ctx.fiber),
      'ui-skin: settings presentation',
    )
    const { dir, isDefault } = describeAssetsDir(config?.assetsDir)
    console.info(`[ui-skin] 素材目录：${dir}${isDefault ? '（默认）' : '（设置指定）'}`)
    console.info('[ui-skin] 把 codex-icon.png / claude-icon.png 等放进该目录即可显示位图；缺图自动回退内置矢量标记。')
  })

  // 路由每次请求都读当前 config；设置写入后条目重载，闭包随之更新。
  registerAssetRoutes(ctx, () => config?.assetsDir)
}
