/**
 * 皮肤素材（图片）的客户端侧：URL 组装 + 可用性清单。
 *
 * ## 素材从哪来
 *
 * 插件仓库里**一张图都不带**——那几张识别标记（Codex 云、Claude Code 蟹、
 * deepseek娘 头像/全身）是个人素材，不适合再分发。图放在**用户自己机器上的目录**里
 * （默认 `%LOCALAPPDATA%\DSH-Web\skins\`，可在设置里改），由宿主半边把目录内容
 * 通过 `/dsh-ui-skin/assets/<名字>` 喂给浏览器。
 *
 * ## 为什么先问 manifest
 *
 * 目录里可能一张图都没有（比如别人刚装插件）。若直接 `img.src = ...`，每张都会
 * 先 404 再回退——界面能用，但控制台会多一串噪声，图也会闪一下。所以先取一次
 * `manifest.json` 拿到"实际存在哪几张"，再决定哪些位图值得请求；不在清单里的
 * **直接渲染矢量标记**，一个失败请求都不发。
 */

/** 宿主半边挂载的素材路由前缀（必须与 asset-serve.ts 一致）。 */
export const ASSETS_URL_PREFIX = '/dsh-ui-skin/assets'

/** 素材清单：目录路径 + 实际存在的文件名。 */
export interface SkinAssetManifest {
  /** 生效的素材目录（绝对路径），用于在设置行里提示"图从哪读的"。 */
  dir: string
  /** 该目录里实际存在的素材名。 */
  assets: string[]
}

/** manifest 拉取结果的三种状态。 */
export type AssetsState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: SkinAssetManifest }
  | { status: 'error'; reason: string }

/** 组装一张素材的完整 URL。 */
export function assetUrl(name: string): string {
  return `${ASSETS_URL_PREFIX}/${name}`
}

/**
 * 拉一次素材清单。失败不抛错——素材是可选增强，拿不到就该安静地退回矢量标记。
 * @param signal - 可选中止信号（组件卸载时取消）。
 * @returns 清单或错误说明。
 */
export async function fetchAssetManifest(signal?: AbortSignal): Promise<AssetsState> {
  try {
    const response = await fetch(assetUrl('manifest.json'), {
      signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      return { status: 'error', reason: `manifest ${response.status}` }
    }
    const data = await response.json() as Partial<SkinAssetManifest>
    return {
      status: 'ready',
      manifest: {
        dir: typeof data.dir === 'string' ? data.dir : '',
        assets: Array.isArray(data.assets) ? data.assets.filter((x): x is string => typeof x === 'string') : [],
      },
    }
  } catch (error) {
    return { status: 'error', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 素材清单是否包含某张图。
 * @param state - 当前清单状态。
 * @param name - 素材文件名。
 * @returns 有就 true（loading 与 error 都算没有 → 直接用矢量标记）。
 */
export function hasAsset(state: AssetsState, name: string): boolean {
  return state.status === 'ready' && state.manifest.assets.includes(name)
}
