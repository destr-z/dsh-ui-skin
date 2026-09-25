/**
 * 标记对照页：把三张皮肤卡上的标记（源码版位图 vs 插件矢量）画成一张 HTML。
 *
 * 为什么需要：皮肤卡片上到底长什么样，靠"看文件名猜"或"看别人截图"都不可靠
 * （本机没有浏览器驱动）。生成一个静态 HTML，用系统默认浏览器打开就能并排对比；
 * 同时把矢量标记载进 Node 打印成 ASCII，让 agent 也能判断像不像。
 *
 * 用法（在插件根目录）：
 *   node scripts/make-mark-preview.mjs
 *   node scripts/make-mark-preview.mjs --assets "C:\path\to\skins" --open
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    out[a.slice(2)] = argv[i + 1]?.startsWith('--') === false ? argv[++i] : true
  }
  return out
}
const args = parseArgs(process.argv.slice(2))

const defaultAssets = [
  'D:\\001\\ai\\deepseek-harness\\apps\\web\\public\\skins',
  join(process.env.LOCALAPPDATA ?? '', 'DSH-Web', 'skins'),
].find(p => existsSync(p))
const assetsDir = String(args.assets ?? defaultAssets ?? '')

/** 三张卡的真实配置（与 SkinRow 保持一致）。 */
const CARDS = [
  { name: 'DeepSeek', asset: 'deepseek-mascot.png', w: 563, h: 700, card: 106, kind: 'whale' },
  { name: 'Codex', asset: 'codex-icon.png', w: 64, h: 64, card: 80, kind: 'cloud' },
  { name: 'Claude Code', asset: 'claude-icon.png', w: 58, h: 64, card: 81, kind: 'crab' },
]

/** 把源码里的矢量标记当 HTML 片段抓出来（它们是纯 <svg>...</svg>）。 */
function extractSvg(file) {
  const src = readFileSync(join(pluginRoot, 'src', 'client', 'marks', file), 'utf8')
  const start = src.indexOf('<svg')
  const end = src.lastIndexOf('</svg>') + '</svg>'.length
  if (start < 0 || end < 0) throw new Error(`${file} 里找不到 <svg>`)
  return src.slice(start, end)
    .replace(/\s+className=\{[^}]*\}/g, '')
    .replace(/\s+width=\{size[^}]*\}/g, ' width="100%"')
    .replace(/\s+height=\{[^}]*\}/g, ' height="100%"')
    .replace(/aria-hidden="true"/g, '')
}

const svgs = {
  whale: extractSvg('WhaleGirlMark.tsx'),
  cloud: extractSvg('CloudMark.tsx'),
  crab: extractSvg('CrabMark.tsx'),
}

const dataUri = (file) => {
  const p = join(assetsDir, file)
  if (!existsSync(p)) return null
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`
}

const cards = CARDS.map((card) => {
  const raster = dataUri(card.asset)
  const box = (inner, label, style = '') => `
      <figure class="cell">
        <div class="box" style="width:${card.card}px;height:84px;${style}">${inner}</div>
        <figcaption>${label}</figcaption>
      </figure>`
  return `
    <section class="card">
      <h2>${card.name}</h2>
      <div class="row">
        ${raster
          ? box(`<img src="${raster}" style="width:${Math.round((38 * card.w) / card.h)}px" alt="">`, '源码版（位图）')
          : box('<span class="missing">素材不在本机</span>', '源码版（位图）')}
        ${box(svgs[card.kind], '插件矢量（缺图时的兜底）')}
      </div>
      <p class="meta">素材：<code>${card.asset}</code> · 原始 ${card.w}×${card.h} · 卡片高 38px 时显示宽 ${Math.round((38 * card.w) / card.h)}px</p>
    </section>`
}).join('\n')

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>皮肤卡标记对照：源码版位图 vs 插件矢量</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.6 system-ui, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 32px; max-width: 900px; }
  h1 { font-size: 18px; }
  .card { border: 1px solid #8884; border-radius: 12px; padding: 16px 20px; margin: 16px 0; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .row { display: flex; gap: 32px; align-items: flex-start; }
  .cell { margin: 0; text-align: center; }
  .box { display: flex; align-items: center; justify-content: center; }
  figcaption { font-size: 12px; opacity: .7; margin-top: 6px; }
  .meta { font-size: 12px; opacity: .65; margin: 12px 0 0; }
  code { background: #8882; padding: 1px 5px; border-radius: 4px; }
  .missing { font-size: 12px; opacity: .5; }
</style>
</head>
<body>
  <h1>皮肤卡标记对照</h1>
  <p>素材目录：<code>${assetsDir || '(没找到)'}</code></p>
  <p>左边是源码版实际显示的位图，右边是插件在没有素材文件时用的矢量兜底。两者应当观感接近。</p>
  ${cards}
</body>
</html>
`

const outPath = join(pluginRoot, 'mark-preview.html')
writeFileSync(outPath, html, 'utf8')
console.log(`已生成：${outPath}`)
console.log(`素材目录：${assetsDir || '(没找到，位图那侧会显示"素材不在本机")'}`)

if (args.open) {
  const { spawn } = await import('node:child_process')
  spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref()
  console.log('已用默认浏览器打开。')
}
