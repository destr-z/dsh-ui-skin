// 位图标记 + 矢量回退：素材目录里有这张图就渲染它，没有就渲染传入的回退元素。
// 用在设置页的皮肤选择卡上（Codex 的云、Claude Code 的蟹）。
//
// 可用性由**素材清单**决定（见 assets.ts），所以缺图时**不会发失败请求** ——
// 之前的做法是"先请求、onError 再回退"，会在控制台留下一串 404。

import { useState, type CSSProperties, type ReactNode } from 'react'
import { assetUrl } from '../assets.ts'

/** RasterIcon 的 props。 */
export interface RasterIconProps {
  /** 素材文件名（如 `codex-icon.png`）。 */
  name: string
  /** 素材的原始像素宽（用于保持比例）。 */
  width: number
  /** 素材的原始像素高。 */
  height: number
  /** 显示高度（px）；宽度按素材比例缩放。 */
  size: number
  /** 素材清单说"目录里有这张图"时才请求。 */
  available: boolean
  /** 缺图时渲染的回退元素（矢量标记）。 */
  fallback: ReactNode
  /** 额外样式。 */
  style?: CSSProperties | undefined
}

/**
 * 渲染位图或回退元素。
 * @param props - 素材名、原始尺寸、显示尺寸、可用性与回退节点。
 * @returns img 或回退节点。
 */
export function RasterIcon({ name, width, height, size, available, fallback, style }: RasterIconProps) {
  const [failed, setFailed] = useState(false)
  if (!available || failed) return <>{fallback}</>
  return (
    <img
      src={assetUrl(name)}
      alt=""
      width={(size * width) / height}
      height={size}
      style={style}
      draggable={false}
      onError={() => { setFailed(true) }}
    />
  )
}
