/**
 * 皮肤设置行：注册进「设置 ▸ 通用」的项目槽，紧跟「外观」行下面。
 *
 * 三块内容：
 *   1. 三张皮肤卡（DeepSeek / Codex / Claude Code），各带自己的识别标记；
 *   2. **素材目录**表单 —— 输入框 + 「用默认」按钮 + 当前生效目录；
 *   3. 缺图提示 —— 当前目录里哪几张没有，一眼知道该往哪儿放。
 *
 * 输入框刻意**照抄官方 Input 的 token**（`bg-layer-1` 底 + `border-l4` 0.5px 边 +
 * 32px 高 + 聚焦时换 brand-primary）。之前用透明底 + 细边，在设置页里几乎看不见，
 * 会被当成一行说明文字而不是可以填的地方。
 *
 * 标记的可用性由素材清单决定（见 assets.ts）：目录里没图 → 每张卡渲染矢量标记，
 * 一个失败请求都不发。
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { RasterIcon } from './marks/RasterIcon.tsx'
import { WhaleGirlMark } from './marks/WhaleGirlMark.tsx'
import { hasAsset, type AssetsState } from './assets.ts'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkinId } from '../skin-settings.ts'
import type { SkinKey } from './locales.ts'
import type { SkinRowState } from './skin-row-store.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** 注入的业务面：皮肤写入 + 素材目录读写 + 状态订阅钩子。 */
export interface SkinRowInjected {
  /** 切换皮肤。 */
  setSkin: (id: SkinId) => void
  /** 读当前生效的素材目录（默认或设置指定的那个）。 */
  getAssetsDir: () => string
  /** 写素材目录；空串 = 回到默认目录。 */
  setAssetsDir: (dir: string) => void
  /** 生效目录是不是默认值。 */
  isDefaultAssetsDir: () => boolean
  /**
   * 状态订阅钩子（由插件用 `useSyncExternalStore` 造好）。
   * 必须由组件在渲染期调用 —— 所以它以钩子形式注入，而不是直接给 store 对象。
   */
  useStore: <S>(selector: (state: SkinRowState) => S) => S
}

/** 组件完整 props：运行时份额 + 文案席位 + 注入面。 */
export type SkinRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings.dshUiSkin'> & SkinRowInjected

/** 卡片顺序、文案键与识别标记（DeepSeek 在首位：默认皮肤）。 */
const CARDS: readonly { id: SkinId; labelKey: SkinKey; mark: 'whaleGirl' | 'codex' | 'claude' }[] = [
  { id: 'deepseek', labelKey: 'skin.deepseek', mark: 'whaleGirl' },
  { id: 'codex', labelKey: 'skin.codex', mark: 'codex' },
  { id: 'claude-code', labelKey: 'skin.claudeCode', mark: 'claude' },
]

/**
 * 本插件需要用户放进素材目录的图 —— **就三张，一张不多**（与宿主半边的白名单一致）。
 * 缺哪张就在设置行里提示哪张；缺的卡显示内置矢量标记。
 */
const TRACKED_ASSETS = ['deepseek-mascot.png', 'codex-icon.png', 'claude-icon.png'] as const

// ── 样式：全部用官方 alias token，自动跟随明暗与皮肤 ──
const S = {
  group: {
    display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0',
    borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
  } as CSSProperties,
  title: { fontSize: '14px', fontWeight: 400, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' } as CSSProperties,
  cardRow: { display: 'flex', alignItems: 'stretch', gap: '8px', flexWrap: 'wrap' } as CSSProperties,
  card: {
    boxSizing: 'border-box', flex: '1 1 140px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '12px 16px',
    border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: '16px', background: 'transparent',
    font: 'inherit', fontSize: '14px', lineHeight: '22px', color: 'var(--dsw-alias-label-primary)',
    cursor: 'pointer',
  } as CSSProperties,
  cardSelected: {
    background: 'var(--dsw-alias-bg-module-platform)',
    borderColor: 'var(--dsw-static-neutral-bluish-400)',
  } as CSSProperties,
  mark: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '38px' } as CSSProperties,
  label: { fontWeight: 500, whiteSpace: 'nowrap' } as CSSProperties,

  // 素材目录表单
  fieldBlock: {
    display: 'flex', flexDirection: 'column', gap: '6px',
    marginTop: '4px', paddingTop: '12px', borderTop: '0.5px solid var(--dsw-alias-border-l1)',
  } as CSSProperties,
  fieldLabel: { fontSize: '13px', fontWeight: 500, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' } as CSSProperties,
  fieldRow: { display: 'flex', alignItems: 'center', gap: '8px' } as CSSProperties,
  // 照抄官方 Input：height 32 / bg-layer-1 / border-l4 0.5px / 圆角 8
  inputWrap: {
    flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '6px',
    height: '32px', padding: '0 10px', boxSizing: 'border-box',
    border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: '8px',
    background: 'var(--dsw-alias-bg-layer-1)',
  } as CSSProperties,
  input: {
    flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
    font: 'inherit', fontSize: '13px', lineHeight: '22px', color: 'var(--dsw-alias-label-primary)',
  } as CSSProperties,
  button: {
    flex: '0 0 auto', height: '32px', padding: '0 12px', boxSizing: 'border-box',
    border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: '8px', background: 'transparent',
    font: 'inherit', fontSize: '13px', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
  } as CSSProperties,
  buttonDisabled: { color: 'var(--dsw-alias-label-dimmed)', cursor: 'default' } as CSSProperties,
  hint: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } as CSSProperties,
  hintStrong: { color: 'var(--dsw-alias-label-primary)' } as CSSProperties,
} as const

/**
 * 渲染一张卡的识别标记：缺图时**三张卡统一回退到同一个线条鲸鱼**。
 *
 * 为什么不用各自的专属矢量（原来 Codex 用云、Claude 用蟹）：那两个是从旧素材描摹的，
 * 观感不理想；而眼下没有更合适的图标，与其显示三个半成品，不如统一成同一个干净的
 * 鲸鱼 —— 观感一致、也不会有"这张卡怎么长得像那张卡"的困惑。
 *
 * 等有了正式图标（放进素材目录即可）再看要不要恢复各自的专属矢量。
 */
function CardMark({ mark, assets }: { mark: 'whaleGirl' | 'codex' | 'claude'; assets: AssetsState }) {
  if (mark === 'codex') {
    return (
      <RasterIcon
        name="codex-icon.png"
        width={64}
        height={64}
        size={26}
        available={hasAsset(assets, 'codex-icon.png')}
        fallback={<WhaleGirlMark forceVector size={38} assets={assets} />}
      />
    )
  }
  if (mark === 'claude') {
    return (
      <RasterIcon
        name="claude-icon.png"
        width={58}
        height={64}
        size={26}
        available={hasAsset(assets, 'claude-icon.png')}
        fallback={<WhaleGirlMark forceVector size={38} assets={assets} />}
      />
    )
  }
  return <WhaleGirlMark size={38} assets={assets} />
}

/**
 * 渲染皮肤设置行。
 * @param props - 组合后的槽位 props。
 * @returns 行元素树。
 */
export function SkinRow({
  t, setSkin, getAssetsDir, setAssetsDir, isDefaultAssetsDir, useStore,
}: SkinRowComponentProps) {
  const skin = useStore(s => s.skin)
  const assets = useStore(s => s.assets)
  const configuredDir = useStore(s => s.assetsDir)
  const [draft, setDraft] = useState(configuredDir)
  const [focused, setFocused] = useState(false)

  // 外部改动（另一标签页 / 设置面回填）时同步草稿
  useEffect(() => { setDraft(configuredDir) }, [configuredDir])

  const effectiveDir = assets.status === 'ready' ? assets.manifest.dir : getAssetsDir()
  const missing = assets.status === 'ready'
    ? TRACKED_ASSETS.filter(name => !assets.manifest.assets.includes(name))
    : []
  const isDefault = isDefaultAssetsDir()

  return (
    <div style={S.group}>
      <div style={S.title}>{t('skin.title')}</div>
      <div style={S.cardRow}>
        {CARDS.map(({ id, labelKey, mark }) => (
          <button
            key={id}
            type="button"
            style={skin === id ? { ...S.card, ...S.cardSelected } : S.card}
            aria-pressed={skin === id}
            onClick={() => { setSkin(id) }}
          >
            <span style={S.mark}>
              <CardMark mark={mark} assets={assets} />
            </span>
            <span style={S.label}>{t(labelKey)}</span>
          </button>
        ))}
      </div>

      <div style={S.fieldBlock}>
        <div style={S.fieldLabel}>{t('skin.assetsDirLabel')}</div>
        <div style={S.fieldRow}>
          <span style={focused ? { ...S.inputWrap, borderColor: 'var(--dsw-alias-brand-primary)' } : S.inputWrap}>
            <input
              style={S.input}
              type="text"
              value={draft}
              spellCheck={false}
              aria-label={t('skin.assetsDirLabel')}
              placeholder={t('skin.assetsDirPlaceholder')}
              onFocus={() => { setFocused(true) }}
              onBlur={() => { setFocused(false); setAssetsDir(draft.trim()) }}
              onChange={event => { setDraft(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') setAssetsDir(draft.trim()) }}
            />
          </span>
          <button
            type="button"
            style={isDefault ? { ...S.button, ...S.buttonDisabled } : S.button}
            disabled={isDefault}
            onClick={() => { setDraft(''); setAssetsDir('') }}
          >
            {t('skin.assetsDirReset')}
          </button>
        </div>
        <div style={S.hint}>
          {t('skin.assetsDirNow')}
          <span style={S.hintStrong}>{effectiveDir}</span>
          {isDefault ? t('skin.assetsDirIsDefault') : ''}
        </div>
        <div style={S.hint}>{t('skin.assetsHint')}</div>
        {assets.status === 'error' ? <div style={S.hint}>{t('skin.assetsError')}</div> : null}
        {missing.length > 0
          ? (
              <div style={S.hint}>
                {t('skin.assetsMissing')}
                <span style={S.hintStrong}>{missing.join('、')}</span>
              </div>
            )
          : null}
      </div>
    </div>
  )
}
