/**
 * 界面验证：用真实浏览器打开隔离实例，检查设置页里到底渲染出了什么。
 * ============================================================
 * 这个脚本补上"HTTP 层验证"看不到的那一段：插件装配成功 ≠ 设置页里能看到东西。
 * 它会：
 *   1. 起一个隔离实例（和 test-instance.ps1 同一套做法，含关掉树内皮肤）
 *   2. 用 CDP 驱动无头 Chrome 打开它
 *   3. 展开设置面板 → 遍历 DOM，报告「皮肤」一行里出现了什么：
 *        · 三张皮肤卡的文字
 *        · **素材目录输入框在不在**（这是本轮要验证的重点）
 *        · 卡片上的标记是位图还是矢量
 *   4. 截图存盘（人可以打开看）
 *
 * 用法（在插件根目录）：
 *   node scripts/verify-ui.mjs
 *   node scripts/verify-ui.mjs --port 3099 --keep     # 保留实例与截图路径
 */
import { spawn } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './lib/cdp.mjs'

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
const port = Number(args.port ?? 3099)
const exe = String(args.exe ?? 'D:\\001\\ai\\deepseek\\portable\\DSH-Web\\程序\\deepseek-harness.exe')
const cdpPort = Number(args.cdpPort ?? 9333)

let bad = 0
const check = (ok, label, extra = '') => {
  if (!ok) bad++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra === '' ? '' : `  ${extra}`}`)
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const section = (t) => console.log(`\n--- ${t} ---`)

if (!existsSync(exe)) { console.error(`找不到 exe：${exe}`); process.exit(2) }
if (!existsSync(join(pluginRoot, 'lib', 'client.js'))) { console.error('插件未构建'); process.exit(2) }

const sandbox = join(tmpdir(), `dsh-ui-skin-ui-${Date.now().toString(36)}`)
const testHome = join(sandbox, 'home')
const profileDir = join(testHome, 'profiles', 'web')
const pluginStage = join(sandbox, 'plugin')
const logOut = join(sandbox, 'out.log')
const logErr = join(sandbox, 'err.log')
let instance = null
let browser = null

const readLog = () => {
  let text = ''
  for (const f of [logOut, logErr]) {
    try { text += readFileSync(f, 'utf8') } catch { }
  }
  return text
}

try {
  mkdirSync(profileDir, { recursive: true })
  mkdirSync(pluginStage, { recursive: true })

  // 摆插件 + 登记 + 关树内皮肤（与 test-instance.ps1 同款）
  const { copyFileSync, cpSync } = await import('node:fs')
  copyFileSync(join(pluginRoot, 'cordis.patch.yml'), join(pluginStage, 'cordis.patch.yml'))
  copyFileSync(join(pluginRoot, 'package.json'), join(pluginStage, 'package.json'))
  cpSync(join(pluginRoot, 'lib'), join(pluginStage, 'lib'), { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web', version: '0.0.0', private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@dsh-external/dsh-ui-skin'], patchReload: 'live' } },
  }, null, 2), 'utf8')
  writeFileSync(join(profileDir, 'cordis.patch.yml'),
    '# profile 补丁层：在所有 bundle 层之后应用。\n- id: ui-skin\n  disabled: true\n', 'utf8')
  mkdirSync(join(profileDir, 'node_modules', '@dsh-external'), { recursive: true })
  const { symlinkSync } = await import('node:fs')
  symlinkSync(pluginStage, join(profileDir, 'node_modules', '@dsh-external', 'dsh-ui-skin'), 'junction')

  // 素材目录：用真实的默认目录（用户已经把源码版素材放进去了）
  const env = { ...process.env, DSH_HOME: testHome, LOCALAPPDATA: join(sandbox, 'localappdata') }
  mkdirSync(join(env.LOCALAPPDATA, 'DSH-Web', 'skins'), { recursive: true })
  const realAssets = join(process.env.LOCALAPPDATA ?? '', 'DSH-Web', 'skins')
  if (existsSync(realAssets)) {
    for (const f of readdirSync(realAssets)) {
      copyFileSync(join(realAssets, f), join(env.LOCALAPPDATA, 'DSH-Web', 'skins', f))
    }
  }

  section(`启动隔离实例（端口 ${port}）`)
  const { openSync } = await import('node:fs')
  instance = spawn(exe, ['web', '--port', String(port), '--no-open'], {
    env,
    stdio: ['ignore', openSync(logOut, 'a'), openSync(logErr, 'a')],
    windowsHide: true,
    // .cmd/.bat wrappers cannot be spawned on Windows without a shell (EINVAL).
    shell: /\.(cmd|bat)$/i.test(exe),
  })
  let url = null
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const text = readLog()
      const m = text.match(/dsh web:\s*(http:\/\/\S+)/)
      if (m) { url = m[1]; break }
    } catch { }
    if (instance.exitCode !== null) break
    await sleep(400)
  }
  if (!url) {
    console.error('实例没起来：')
    console.error(readLog().split('\n').slice(-25).join('\n'))
    process.exit(1)
  }
  console.log(`  就绪：${url}`)

  section('浏览器：打开并展开设置')
  browser = await launch({ port: cdpPort })
  console.log(`  浏览器：${browser.version.Browser}`)
  const page = await browser.openPage('about:blank')
  await page.goto(url)

  // 等 React 挂载
  await page.evaluate(() => new Promise((res) => {
    const t0 = Date.now()
    const tick = () => (document.body && document.body.innerText.trim().length > 0) || Date.now() - t0 > 20000
      ? res(true) : setTimeout(tick, 200)
    tick()
  }))
  await sleep(2500)

  // 首启可能有「内测声明」之类的弹窗挡着整个界面 —— 先点掉，否则截图全是弹窗
  const dismissed = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('button, [role="button"]')]
      .find(n => /^(继续|我知道了|确定|知道了|好的|OK|Continue|Got it)$/.test((n.innerText ?? '').trim()))
    if (hit) { hit.click(); return (hit.innerText ?? '').trim() }
    return null
  })
  if (dismissed) { console.log(`  已关掉首启弹窗：${dismissed}`); await sleep(1200) }

  // 打开设置：按可见文字找触发器（不同版本按钮文案可能不同，逐个试）
  const opened = await page.evaluate(() => {
    const wanted = ['设置', 'Settings']
    const nodes = [...document.querySelectorAll('button, [role="button"], a')]
    for (const label of wanted) {
      const hit = nodes.find(n => (n.innerText ?? '').trim() === label || (n.getAttribute('aria-label') ?? '').includes(label))
      if (hit) { hit.click(); return label }
    }
    return null
  })
  console.log(`  设置触发器：${opened ?? '没找到（继续，可能已展开）'}`)
  await sleep(2000)

  // 有的版本设置是侧栏里的一个「通用设置」项
  await page.evaluate(() => {
    const hit = [...document.querySelectorAll('button, [role="button"], a, li, div')]
      .find(n => /通用设置|通用|General/.test((n.innerText ?? '').trim()) && (n.innerText ?? '').trim().length < 12)
    if (hit) hit.click()
  })
  await sleep(1500)

  section('A) 设置面板里有没有「皮肤」这一节')
  // 先在页面里问一次素材清单：位图不生效时，这一步能直接指出是**路由/清单**的问题
  // 还是**客户端逻辑**的问题（否则只能看到"没有 img"，无从下手）。
  const manifestProbe = await page.evaluate(async () => {
    try {
      const r = await fetch('/dsh-ui-skin/assets/manifest.json', { headers: { accept: 'application/json' } })
      const text = await r.text()
      return { status: r.status, body: text.slice(0, 400) }
    } catch (error) {
      return { status: -1, body: String(error) }
    }
  })
  console.log(`  页面内请求 manifest：HTTP ${manifestProbe.status}  ${manifestProbe.body}`)
  // 把卡片上每个标记的 DOM 结构与尺寸打出来：位图是 <img>，矢量是 <svg>。
  // 光看"有没有 img"不够 —— 还要看它挂在哪、多大，才能判断是不是回退成了矢量。
  const markDump = await page.evaluate(() => {
    const title = [...document.querySelectorAll('*')].find(n => (n.innerText ?? '').trim() === '皮肤')
    let box = title
    for (let i = 0; i < 3 && box?.parentElement; i++) box = box.parentElement
    if (!box) return []
    return [...box.querySelectorAll('button, [role="button"]')].map((card) => {
      const markBox = card.querySelector('span')
      const img = card.querySelector('img')
      const svg = card.querySelector('svg')
      return {
        label: (card.innerText ?? '').trim().split('\n')[0],
        markTag: img ? 'img' : svg ? 'svg' : 'none',
        imgSrc: img?.getAttribute('src') ?? null,
        imgLoaded: img ? img.naturalWidth > 0 : null,
        svgPaths: svg ? svg.querySelectorAll('path').length : 0,
        markHtml: (markBox?.innerHTML ?? '').slice(0, 120).replace(/\s+/g, ' '),
      }
    })
  })
  console.log('  三张卡的标记实际渲染：')
  for (const m of markDump) console.log(`     ${JSON.stringify(m)}`)

  const skinSection = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')]
    const title = all.find(n => (n.innerText ?? '').trim() === '皮肤' || (n.innerText ?? '').trim() === 'Skin')
    if (!title) return { found: false }
    // 从标题往上找两三层当作卡片容器
    let box = title
    for (let i = 0; i < 3 && box.parentElement; i++) box = box.parentElement
    return {
      found: true,
      text: (box.innerText ?? '').slice(0, 600),
      count: all.filter(n => (n.innerText ?? '').trim() === '皮肤').length,
      hasInput: box.querySelectorAll('input[type="text"]').length,
      placeholder: [...box.querySelectorAll('input[type="text"]')].map(i => i.placeholder).join(' | '),
      images: [...box.querySelectorAll('img')].map(i => i.getAttribute('src')?.slice(0, 60)),
      svgs: box.querySelectorAll('svg').length,
    }
  })

  if (!skinSection.found) {
    check(false, '设置面板里找到「皮肤」标题')
    console.log('  —— 面板全文（前 800 字）——')
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 800))
    console.log(dump.split('\n').map(l => '     ' + l).join('\n'))
  } else {
    check(true, '设置面板里找到「皮肤」标题')
    check(skinSection.count === 1, '「皮肤」只出现一次（树内那份已关掉）', `实际 ${skinSection.count} 次`)
    check(skinSection.hasInput > 0, '**素材目录输入框已渲染**', `${skinSection.hasInput} 个 input`)
    if (skinSection.placeholder) console.log(`     输入框 placeholder：${skinSection.placeholder}`)
    check(skinSection.text.includes('图片素材目录'), '有「图片素材目录」标签')
    check(/当前读取/.test(skinSection.text), '有「当前读取」提示')
    for (const name of ['DeepSeek', 'Codex', 'Claude Code']) {
      check(skinSection.text.includes(name), `卡片「${name}」在`)
    }
    console.log(`     位图 img：${skinSection.images.length} 个  ${skinSection.images.join(', ')}`)
    console.log(`     矢量 svg：${skinSection.svgs} 个`)
    // 位图有没有真的加载出来（0 个 img 说明素材没被清单认到）
    const imgState = await page.evaluate(() => {
      const title = [...document.querySelectorAll('*')].find(n => (n.innerText ?? '').trim() === '皮肤')
      let box = title
      for (let i = 0; i < 3 && box?.parentElement; i++) box = box.parentElement
      const imgs = box ? [...box.querySelectorAll('img')] : []
      return {
        total: imgs.length,
        loaded: imgs.filter(i => i.naturalWidth > 0).length,
        srcs: imgs.map(i => i.getAttribute('src')),
      }
    })
    check(imgState.total > 0, '卡片标记用的是**位图**（素材目录已被清单认到）',
      imgState.total === 0 ? '一个 img 都没有 → 清单没列出素材' : `${imgState.loaded}/${imgState.total} 张已加载`)
    if (imgState.srcs.length) console.log(`     img src：${imgState.srcs.join(', ')}`)
    console.log('     —— 这一节渲染出的文字 ——')
    console.log(skinSection.text.split('\n').map(l => '       ' + l).join('\n'))
  }

  section('B) 控制台有没有报错')
  const errors = page.collectConsoleErrors()
  check(errors.length === 0, '没有控制台 error', errors.slice(0, 3).join(' | '))
  // 插件自己留的诊断行：位图不生效时，这行能指出是清单没拿到还是客户端没用它
  const notes = page.collectConsoleLogs().filter(l => l.includes('[dsh-ui-skin]'))
  for (const line of notes) console.log(`     console: ${line}`)
  check(notes.some(l => l.includes('素材清单')), '客户端拿到了素材清单')

  section('C) 截图')
  // 只截「皮肤」那一节：整屏截图会被弹窗/滚动位置干扰，看不清细节
  const clip = await page.evaluate(() => {
    const title = [...document.querySelectorAll('*')].find(n => (n.innerText ?? '').trim() === '皮肤')
    if (!title) return null
    let box = title
    for (let i = 0; i < 3 && box.parentElement; i++) box = box.parentElement
    const r = box.getBoundingClientRect()
    return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.width + 24, height: r.height + 24 }
  })
  const shot = join(pluginRoot, 'ui-verify-settings.png')
  if (clip) {
    const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } })
    writeFileSync(shot, Buffer.from(r.data, 'base64'))
    console.log(`  已存（皮肤那一节的放大图）：${shot}`)
  } else {
    await page.screenshot(shot)
    console.log(`  已存（整屏，没定位到皮肤那一节）：${shot}`)
  }

  console.log(`\n${bad === 0 ? '界面验证：全部通过' : `界面验证：${bad} 项未通过`}`)
} catch (error) {
  console.error(`\n脚本抛错：${error?.stack ?? error}`)
  bad++
} finally {
  if (browser) await browser.close()
  if (instance && instance.exitCode === null) { try { instance.kill() } catch { } }
  await sleep(300)
  if (!args.keep) {
    try {
      const { rmSync } = await import('node:fs')
      rmSync(sandbox, { recursive: true, force: true })
    } catch { }
  } else {
    console.log(`沙箱保留在：${sandbox}`)
  }
}
process.exit(bad === 0 ? 0 : 1)
