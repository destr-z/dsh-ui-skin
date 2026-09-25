/**
 * 皮肤设置行的槽位 store：皮肤服务快照 + 素材清单的浏览器镜像。
 * 写入方只有插件的 `skin/change` 监听与素材拉取；行组件通过 props.useStore 读。
 */
import { createStore, type Store } from './store.ts'
import { DEFAULT_SKIN, type SkinId } from '../skin-settings.ts'
import type { AssetsState } from './assets.ts'

/** store 状态。 */
export interface SkinRowState {
  /** 当前皮肤 id（选中态读它，绝不直接读 localStorage）。 */
  skin: SkinId
  /** 服务 revision；首同步前为 -1，好让 revision 0 算作一次变更。 */
  revision: number
  /** 素材清单状态（决定位图还是矢量）。 */
  assets: AssetsState
  /** 设置里填的素材目录（空 = 默认）。 */
  assetsDir: string
}

/** 行 store 的句柄类型。 */
export type SkinRowStore = Store<SkinRowState>

/**
 * 建一个皮肤设置行的 store。
 * @returns store 句柄。
 */
export function createSkinRowStore(): SkinRowStore {
  return createStore<SkinRowState>({
    skin: DEFAULT_SKIN,
    revision: -1,
    assets: { status: 'loading' },
    assetsDir: '',
  })
}
