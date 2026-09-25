/**
 * Built-in skin registry: one token override layer per skin, applied over
 * the light/dark base palette through ThemeRuntime.overrideTokens (every
 * value carries both palette modes, as the override contract requires).
 *
 * - `deepseek`: the product default. Its layer is EMPTY — the base
 *   stylesheets already carry the official DeepSeek look, and the skin's
 *   accent set (blue #4D6BFE brand/business/primary-action) lives in
 *   `src/styles/skin.css` as stylesheet rules keyed off
 *   `body[data-ds-skin='deepseek']` so the light/dark cascade keeps working
 *   through the `data-ds-dark-theme` attribute alone (the theme contract
 *   pin in apps/web tests; inline variables would freeze at boot values).
 * - `codex`: OpenAI Codex/ChatGPT monochrome surfaces — near-black chrome
 *   with the product's GREEN accent #53B559 (brand/primary-action/business).
 * - `claude-code`: Anthropic Claude Code cream #FAF9F5 / charcoal #262624
 *   with the Claude orange #D97757 (CTAs #CC785C) and cream-orange states.
 *
 * The app chrome keeps one unified brand across skins (whale-girl mark,
 * DeepSeek Harness wordmark, whale-girl favicon) — skins only recolor.
 */
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import { DEFAULT_SKIN, type SkinId } from './skin-settings.ts'

/** One selectable skin: id and its both-mode token layer. */
export interface SkinDefinition {
  /** Skin id (the setSkin argument). */
  id: SkinId
  /** Alias-token override layer; every value carries { light, dark }. */
  tokens: ThemeTokenOverrides
}

/**
 * DeepSeek 官方蓝：作为**普通 token 层**下发。
 *
 * 树内那份刻意留空、把这些值写成 `body[data-ds-skin='deepseek']` 的样式表规则，
 * 理由是"启动期内联变量会冻在 boot 值上"。插件形态没有启动期内联（本版不做
 * boot 注入），`overrideTokens` 本身就是按 light/dark 双值分发的，所以直接做成
 * 与另外两个皮肤同构的 token 层 —— 三者一致，也省掉一份样式表文件。
 */
const DEEPSEEK_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-brand-primary': { light: 'rgb(77, 107, 254)', dark: 'rgb(107, 135, 255)' },
  '--dsw-alias-brand-text': { light: 'rgb(77, 107, 254)', dark: 'rgb(107, 135, 255)' },
  '--dsw-alias-brand-primary-invert': { light: 'rgb(255, 255, 255)', dark: 'rgb(33, 35, 39)' },
  '--dsw-alias-button-primary-fill': { light: 'rgb(77, 107, 254)', dark: 'rgb(77, 107, 254)' },
  '--dsw-alias-button-primary-hover': { light: 'rgb(107, 135, 255)', dark: 'rgb(107, 135, 255)' },
  '--dsw-alias-button-primary-dimmed': { light: 'rgb(237, 244, 255)', dark: 'rgb(49, 52, 58)' },
  '--dsw-alias-button-info-fill': { light: 'rgb(77, 107, 254)', dark: 'rgb(77, 107, 254)' },
  '--dsw-alias-button-info-hover': { light: 'rgb(107, 135, 255)', dark: 'rgb(107, 135, 255)' },
  '--dsw-alias-button-ghost-active-fill': { light: 'rgb(237, 244, 255)', dark: 'rgb(49, 52, 58)' },
  '--dsw-alias-button-ghost-active-hover': { light: 'rgb(228, 236, 255)', dark: 'rgb(55, 59, 66)' },
  '--dsw-alias-button-ghost-active-border': { light: 'rgb(77, 107, 254)', dark: 'rgb(107, 135, 255)' },
  '--dsw-alias-state-business-primary': { light: 'rgb(77, 107, 254)', dark: 'rgb(107, 135, 255)' },
  '--dsw-alias-state-business-tertiary': { light: 'rgb(237, 244, 255)', dark: 'rgb(46, 52, 64)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(77, 107, 254, 0.12)', dark: 'rgba(107, 135, 255, 0.24)' },
}

/** OpenAI Codex: monochrome surfaces + the product's green accent. */
const CODEX_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-bg-base': { light: 'rgb(255,255,255)', dark: 'rgb(14,15,18)' },
  '--dsw-alias-bg-layer-1': { light: 'rgb(247,247,248)', dark: 'rgb(32,33,35)' },
  '--dsw-alias-bg-layer-2': { light: 'rgb(255,255,255)', dark: 'rgb(38,39,41)' },
  '--dsw-alias-bg-layer-3': { light: 'rgb(242,242,243)', dark: 'rgb(45,46,49)' },
  '--dsw-alias-bg-overlay': { light: 'rgb(255,255,255)', dark: 'rgb(36,37,40)' },
  '--dsw-alias-bg-module-platform': { light: 'rgb(245,247,250)', dark: 'rgb(38,39,41)' },
  '--dsw-alias-bg-multi-select': { light: 'rgb(245,247,250)', dark: 'rgb(38,39,41)' },
  '--dsw-alias-border-l1': { light: 'rgba(13,13,13,0.06)', dark: 'rgba(255,255,255,0.08)' },
  '--dsw-alias-border-l2': { light: 'rgba(13,13,13,0.12)', dark: 'rgba(255,255,255,0.14)' },
  '--dsw-alias-border-l3': { light: 'rgba(13,13,13,0.16)', dark: 'rgba(255,255,255,0.20)' },
  '--dsw-alias-brand-primary': { light: 'rgb(83,181,89)', dark: 'rgb(95,194,107)' },
  '--dsw-alias-brand-text': { light: 'rgb(83,181,89)', dark: 'rgb(95,194,107)' },
  '--dsw-alias-brand-primary-invert': { light: 'rgb(255,255,255)', dark: 'rgb(14,15,18)' },
  '--dsw-alias-button-primary-fill': { light: 'rgb(83,181,89)', dark: 'rgb(83,181,89)' },
  '--dsw-alias-button-primary-hover': { light: 'rgb(71,158,77)', dark: 'rgb(115,205,126)' },
  '--dsw-alias-button-primary-dimmed': { light: 'rgb(233,246,234)', dark: 'rgb(38,45,39)' },
  '--dsw-alias-button-contrast-fill': { light: 'rgb(38,38,38)', dark: 'rgb(227,227,227)' },
  '--dsw-alias-button-info-fill': { light: 'rgb(83,181,89)', dark: 'rgb(83,181,89)' },
  '--dsw-alias-button-info-hover': { light: 'rgb(71,158,77)', dark: 'rgb(115,205,126)' },
  '--dsw-alias-button-elevated-fill': { light: 'rgb(255,255,255)', dark: 'rgb(35,35,35)' },
  '--dsw-alias-button-floating-fill': { light: 'rgb(255,255,255)', dark: 'rgb(42,42,42)' },
  '--dsw-alias-button-floating-hover': { light: 'rgb(242,242,243)', dark: 'rgb(48,48,48)' },
  '--dsw-alias-button-ghost-active-fill': { light: 'rgb(233,246,234)', dark: 'rgb(42,49,43)' },
  '--dsw-alias-button-ghost-active-hover': { light: 'rgb(224,242,226)', dark: 'rgb(48,55,49)' },
  '--dsw-alias-button-ghost-active-border': { light: 'rgb(83,181,89)', dark: 'rgb(95,194,107)' },
  '--dsw-alias-label-primary': { light: 'rgb(13,13,13)', dark: 'rgb(245,247,250)' },
  '--dsw-alias-label-secondary': { light: 'rgb(95,95,95)', dark: 'rgb(158,161,170)' },
  '--dsw-alias-label-tertiary': { light: 'rgb(110,110,115)', dark: 'rgb(128,132,140)' },
  '--dsw-alias-label-caption': { light: 'rgb(158,161,170)', dark: 'rgb(110,113,120)' },
  '--dsw-alias-state-business-primary': { light: 'rgb(83,181,89)', dark: 'rgb(95,194,107)' },
  '--dsw-alias-state-business-tertiary': { light: 'rgb(233,246,234)', dark: 'rgb(36,44,38)' },
  '--dsw-specific-sidebar-fill': { light: 'rgb(247,247,248)', dark: 'rgb(19,20,22)' },
  '--dsw-specific-sidebar-nav-item-active': { light: 'rgb(237,237,238)', dark: 'rgb(45,46,49)' },
  '--dsw-specific-sidebar-nav-item-hover': { light: 'rgb(242,242,243)', dark: 'rgb(38,39,41)' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: 'rgb(231,231,232)', dark: 'rgb(51,52,56)' },
  '--dsw-specific-bubble': { light: 'rgb(247,247,248)', dark: 'rgb(32,33,35)' },
  '--dsw-specific-bubble-highlight': { light: 'rgb(237,237,238)', dark: 'rgb(45,46,49)' },
  '--dsw-alias-markdown-code-block': { light: 'rgb(245,245,246)', dark: 'rgb(32,32,32)' },
  '--dsw-alias-markdown-code-block-banner': { light: 'rgb(250,250,250)', dark: 'rgb(28,28,28)' },
  '--dsw-alias-markdown-inline-code': { light: 'rgb(242,242,243)', dark: 'rgb(42,42,42)' },
  '--dsw-alias-markdown-citation': { light: 'rgb(237,237,238)', dark: 'rgb(38,38,38)' },
  '--dsw-alias-markdown-tag': { light: 'rgb(242,242,243)', dark: 'rgb(42,42,42)' },
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(13,13,13,0.05)', dark: 'rgba(255,255,255,0.07)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(13,13,13,0.08)', dark: 'rgba(255,255,255,0.12)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: 'rgb(242,242,243)', dark: 'rgb(42,42,42)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(83,181,89,0.16)', dark: 'rgba(95,194,107,0.24)' },
  '--dsw-alias-toast-bg': { light: 'rgb(38,38,38)', dark: 'rgb(51,51,51)' },
  '--dsw-alias-tooltip-bg': { light: 'rgb(38,38,38)', dark: 'rgb(51,51,51)' },
  '--dsw-alias-scrollbar-bg-l1': { light: 'rgb(228,228,229)', dark: 'rgb(51,51,54)' },
  '--dsw-alias-scrollbar-bg-l2': { light: 'rgb(228,228,229)', dark: 'rgb(51,51,54)' },
  '--dsw-alias-scrollbar-hover-l1': { light: 'rgb(212,212,213)', dark: 'rgb(72,72,76)' },
  '--dsw-alias-scrollbar-hover-l2': { light: 'rgb(212,212,213)', dark: 'rgb(72,72,76)' },
}

/** Claude Code: cream/charcoal surfaces with Claude orange accents. */
const CLAUDE_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-bg-base': { light: 'rgb(250,249,245)', dark: 'rgb(38,38,36)' },
  '--dsw-alias-bg-layer-1': { light: 'rgb(255,255,255)', dark: 'rgb(48,48,46)' },
  '--dsw-alias-bg-layer-2': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-bg-layer-3': { light: 'rgb(240,238,230)', dark: 'rgb(64,64,61)' },
  '--dsw-alias-bg-overlay': { light: 'rgb(245,242,234)', dark: 'rgb(46,46,44)' },
  '--dsw-alias-bg-module-platform': { light: 'rgb(244,241,233)', dark: 'rgb(51,51,48)' },
  '--dsw-alias-bg-multi-select': { light: 'rgb(244,241,233)', dark: 'rgb(51,51,48)' },
  '--dsw-alias-border-l1': { light: 'rgba(25,25,25,0.07)', dark: 'rgba(255,255,255,0.07)' },
  '--dsw-alias-border-l2': { light: 'rgba(25,25,25,0.14)', dark: 'rgba(255,255,255,0.13)' },
  '--dsw-alias-border-l3': { light: 'rgba(25,25,25,0.20)', dark: 'rgba(255,255,255,0.19)' },
  '--dsw-alias-brand-primary': { light: 'rgb(217,119,87)', dark: 'rgb(217,119,87)' },
  '--dsw-alias-brand-text': { light: 'rgb(25,25,25)', dark: 'rgb(237,237,237)' },
  '--dsw-alias-brand-primary-invert': { light: 'rgb(250,249,245)', dark: 'rgb(38,38,36)' },
  '--dsw-alias-button-primary-fill': { light: 'rgb(204,120,92)', dark: 'rgb(204,120,92)' },
  '--dsw-alias-button-primary-hover': { light: 'rgb(217,130,102)', dark: 'rgb(217,130,102)' },
  '--dsw-alias-button-primary-dimmed': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-button-contrast-fill': { light: 'rgb(38,38,36)', dark: 'rgb(240,238,230)' },
  '--dsw-alias-button-info-fill': { light: 'rgb(217,119,87)', dark: 'rgb(217,119,87)' },
  '--dsw-alias-button-info-hover': { light: 'rgb(193,95,60)', dark: 'rgb(193,95,60)' },
  '--dsw-alias-button-elevated-fill': { light: 'rgb(255,255,255)', dark: 'rgb(48,48,46)' },
  '--dsw-alias-button-floating-fill': { light: 'rgb(255,255,255)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-button-floating-hover': { light: 'rgb(240,238,230)', dark: 'rgb(64,64,61)' },
  '--dsw-alias-button-ghost-active-fill': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-button-ghost-active-hover': { light: 'rgb(232,228,216)', dark: 'rgb(64,64,61)' },
  '--dsw-alias-button-ghost-active-border': { light: 'rgb(110,109,107)', dark: 'rgb(164,163,161)' },
  '--dsw-alias-label-primary': { light: 'rgb(25,25,25)', dark: 'rgb(237,237,237)' },
  '--dsw-alias-label-secondary': { light: 'rgb(110,109,107)', dark: 'rgb(164,163,161)' },
  '--dsw-alias-label-tertiary': { light: 'rgb(131,129,125)', dark: 'rgb(131,129,125)' },
  '--dsw-alias-label-caption': { light: 'rgb(164,163,161)', dark: 'rgb(110,109,107)' },
  '--dsw-alias-state-business-primary': { light: 'rgb(217,119,87)', dark: 'rgb(217,119,87)' },
  '--dsw-alias-state-business-tertiary': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-specific-sidebar-fill': { light: 'rgb(240,238,230)', dark: 'rgb(31,31,30)' },
  '--dsw-specific-sidebar-nav-item-active': { light: 'rgb(232,228,216)', dark: 'rgb(58,57,54)' },
  '--dsw-specific-sidebar-nav-item-hover': { light: 'rgb(245,242,234)', dark: 'rgb(48,48,46)' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: 'rgb(224,218,204)', dark: 'rgb(64,64,61)' },
  '--dsw-specific-bubble': { light: 'rgb(240,238,230)', dark: 'rgb(48,48,46)' },
  '--dsw-specific-bubble-highlight': { light: 'rgb(232,228,216)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-markdown-code-block': { light: 'rgb(245,242,235)', dark: 'rgb(51,51,48)' },
  '--dsw-alias-markdown-code-block-banner': { light: 'rgb(250,248,242)', dark: 'rgb(46,46,44)' },
  '--dsw-alias-markdown-inline-code': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-markdown-citation': { light: 'rgb(237,234,224)', dark: 'rgb(51,51,48)' },
  '--dsw-alias-markdown-tag': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(25,25,25,0.05)', dark: 'rgba(255,255,255,0.07)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(25,25,25,0.09)', dark: 'rgba(255,255,255,0.12)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: 'rgb(240,238,230)', dark: 'rgb(58,57,54)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(217,119,87,0.16)', dark: 'rgba(217,119,87,0.28)' },
  '--dsw-alias-toast-bg': { light: 'rgb(38,38,36)', dark: 'rgb(31,31,30)' },
  '--dsw-alias-tooltip-bg': { light: 'rgb(38,38,36)', dark: 'rgb(31,31,30)' },
  '--dsw-alias-scrollbar-bg-l1': { light: 'rgb(221,216,202)', dark: 'rgb(74,73,69)' },
  '--dsw-alias-scrollbar-bg-l2': { light: 'rgb(221,216,202)', dark: 'rgb(74,73,69)' },
  '--dsw-alias-scrollbar-hover-l1': { light: 'rgb(207,201,184)', dark: 'rgb(90,89,84)' },
  '--dsw-alias-scrollbar-hover-l2': { light: 'rgb(207,201,184)', dark: 'rgb(90,89,84)' },
}

/** Built-in skins in registry order. */
export const SKINS: readonly SkinDefinition[] = Object.freeze([
  Object.freeze({ id: 'deepseek', tokens: DEEPSEEK_TOKENS }),
  Object.freeze({ id: 'codex', tokens: CODEX_TOKENS }),
  Object.freeze({ id: 'claude-code', tokens: CLAUDE_TOKENS }),
])

/**
 * Look up a built-in skin by id.
 * @param id - skin id.
 * @returns the skin definition (built-ins always resolve).
 */
export function skinById(id: SkinId): SkinDefinition {
  const skin = SKINS.find(entry => entry.id === id)
  /* v8 ignore next 2 -- SKINS covers every SKIN_IDS member */
  if (skin === undefined) return skinById(DEFAULT_SKIN)
  return skin
}
