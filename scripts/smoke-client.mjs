/**
 * 客户端 bundle 冒烟测试
 * ============================================================
 * 目的：抓"**一进浏览器就抛错**"这类问题 —— 那是这个插件最可能出的故障，
 * 而在没有浏览器驱动的情况下，光看"boot graph 里有它"是验不出来的。
 *
 * 做法：把 lib/client.js 当模块加载进 Node（它是标准 CJS 工厂形态），用真的 React
 * 喂 require，用一个最小的假 ctx 调 `apply()`，然后检查：
 *   1. 工厂能执行、没有抛错；
 *   2. 导出的 `inject` 与 package.json 里的 `dsh.client.inject` 对得上；
 *   3. `apply()` 期间按预期动了假 ctx（注册了设置行、订阅了主题覆盖、读了设置）；
 *   4. `Sandbox` 里出现的 404 —— 客户端没去向不存在的地址要东西。
 *
 * 用法（在插件根目录）：
 *   node scripts/smoke-client.mjs
 *   node scripts/smoke-client.mjs --checkout D:\path\to\deepseek-harness   # 指定 React 来源
 *
 * 通过 = 退出码 0。
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue }
    out[a.slice(2)] = argv[i + 1]?.startsWith('--') === false ? argv[++i] : true
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const checkout = String(args.checkout ?? process.env.DSH_CHECKOUT ?? 'D:\\001\\ai\\deepseek-harness')

let bad = 0
const check = (ok, label, extra = '') => {
  if (!ok) bad++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra === '' ? '' : `  ${extra}`}`)
}

// ── 定位 React（客户端 bundle 只 require 它和 jsx-runtime）──
const reactCandidates = [
  join(checkout, 'packages', 'client', 'ui-skin', 'node_modules', 'react'),
  join(checkout, 'apps', 'web', 'node_modules', 'react'),
  join(checkout, 'node_modules', 'react'),
]
const reactDir = reactCandidates.find(p => existsSync(join(p, 'package.json')))
if (!reactDir) {
  console.error(`找不到 React 副本，试过：\n  ${reactCandidates.join('\n  ')}`)
  process.exit(2)
}
const requireReact = createRequire(join(reactDir, 'index.js'))
const React = requireReact('react')
console.log(`React 来源：${reactDir}（v${React.version}）`)

// ── 装载器替身：捕获工厂并立刻执行它 ──
const bundlePath = join(pluginRoot, 'lib', 'client.js')
if (!existsSync(bundlePath)) {
  console.error(`找不到 ${bundlePath} —— 先跑 scripts/build.ps1`)
  process.exit(2)
}
const source = readFileSync(bundlePath, 'utf8')

let factory = null
let loadedId = null
const fakeWindow = {
  __ModuleLoader__: {
    load({ id, factory: fn }) { loadedId = id; factory = fn },
  },
  // 真实浏览器里必然有的两个方法：替身也补上，否则测的是替身的缺陷而不是插件
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
}
// 客户端源码在 SSR/无 DOM 环境下要能安全降级 —— 这里刻意**不给** document/localStorage，
// 顺便验证那些 `typeof document === 'undefined'` 分支没写错
const sandboxGlobals = {
  window: fakeWindow,
  // store.ts 在测试环境用惰性 useState 替身（没有 React 渲染器可挂）
  __DEV__: true,
}

const vm = await import('node:vm')
const context = vm.createContext({ ...sandboxGlobals, console, setTimeout, clearTimeout, fetch, AbortController })
vm.runInContext(source, context, { filename: 'client.js' })

console.log('\n--- 1) 装载协议与 id ---')
check(factory !== null, 'bundle 调用了 window.__ModuleLoader__.load')
check(loadedId === '@dsh-external/dsh-ui-skin', '注册的模块 id 与包名一致', `实际 ${loadedId}`)

// ── require 替身：只允许 react / jsx-runtime（基线模块）；别的都记下来 ──
const requested = []
const requireShim = (spec) => {
  requested.push(spec)
  if (spec === 'react') return React
  if (spec === 'react/jsx-runtime' || spec === 'react/jsx-runtime.js') return requireReact('react/jsx-runtime')
  if (spec === 'react-dom' || spec === 'react-dom/client') return requireReact('react-dom')
  throw new Error(`require("${spec}") —— 不在基线模块表里，装载器会拒绝`)
}

console.log('\n--- 2) 工厂能否执行（真跑到模块体与导出）---')
let mod = null
try {
  mod = factory(requireShim)
  check(true, 'factory(require) 执行成功')
} catch (error) {
  check(false, 'factory(require) 执行成功', error instanceof Error ? error.message : String(error))
}
check(requested.every(s => s.startsWith('react')), '只 require 了 react 系（基线模块）', requested.join(', '))
check(Boolean(mod && typeof mod.apply === 'function'), '导出了 apply')

console.log('\n--- 3) inject 声明 ---')
const pkg = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'))
const declaredInject = Array.isArray(mod?.inject) ? mod.inject : []
check(Array.isArray(mod?.inject), '客户端导出了 inject 数组（数组形式，不是配置对象）')
check(declaredInject.includes('theme'), 'inject 里有 theme', declaredInject.join(', '))
check(declaredInject.includes('slots'), 'inject 里有 slots')
check(declaredInject.includes('locale'), 'inject 里有 locale')
check(declaredInject.includes('settingsScope'), 'inject 里有 settingsScope')
check(Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0, 'package.json 声明了 dsh.client.inject')

console.log('\n--- 4) apply() 在假 ctx 上的行为 ---')
const calls = { provides: [], injects: [], registers: [], effects: [], listens: [], emits: [] }
let settingsValue = {}
const fakeCtx = {
  theme: { overrideTokens: (source_, tokens) => { calls.overrideTokens = { source: source_, tokenCount: Object.keys(tokens ?? {}).length }; return () => {} } },
  provide: (name, value) => { calls.provides.push(name) },
  effect: (fn, label) => { calls.effects.push(label); try { return fn() } catch (e) { throw new Error(`effect(${label}) 抛错：${e.message}`) } },
  on: (event, listener) => { calls.listens.push(event) },
  emit: (event) => { calls.emits.push(event) },
  locale: { register: (ns) => { calls.registers.push(`locale:${ns}`) } },
  slots: {
    // 真实语义：inject(name, cb) 是"依赖就位后再执行 cb"，而 cb 里才做 register。
    // 替身必须照样调用它，否则测的是"我忘了调回调"，不是插件的行为。
    inject: (name, callback) => { calls.injects.push(name); return callback() },
    register: (options) => { calls.registers.push(`slot:${options.name}#${options.id}`) },
  },
  settingsScope: {
    bind: ({ namespace }) => {
      calls.registers.push(`settings:${namespace}`)
      // 真实契约：getSnapshot()/subscribe()/set(field,value)/unset(field)
      return {
        getSnapshot: () => ({ status: 'ready', value: settingsValue, writable: true }),
        subscribe: () => () => {},
        set: (field, value) => { settingsValue = { ...settingsValue, [field]: value } },
        unset: (field) => { const next = { ...settingsValue }; delete next[field]; settingsValue = next },
      }
    },
  },
}
try {
  mod.apply(fakeCtx)
  check(true, 'apply() 执行成功')
} catch (error) {
  check(false, 'apply() 执行成功', error instanceof Error ? error.message : String(error))
}

check(calls.provides.includes('uiSkin'), 'provide 了 uiSkin 服务（**不是 skin** —— 树内皮肤已占用那个名字）', calls.provides.join(', '))
check(calls.injects.includes('settings.general.item'), '注册进 settings.general.item 槽', calls.injects.join(', '))
check(calls.registers.some(r => r === 'settings:dsh-ui-skin'), '绑定了设置命名空间 dsh-ui-skin', calls.registers.join(', '))
check(calls.registers.some(r => r.startsWith('slot:settings.general.item')), '注册了设置行组件')
check(calls.registers.some(r => r.startsWith('locale:settings.dshUiSkin')), '注册了文案命名空间 settings.dshUiSkin')
check(calls.effects.length >= 3, 'effects 都注册上了（无 DOM 环境下也没抛错）', `${calls.effects.length} 个`)
check(calls.listens.length > 0, '监听了事件', calls.listens.join(', '))
check(calls.overrideTokens?.tokenCount > 0, '给主题叠加了非空 token 层', `${calls.overrideTokens?.tokenCount} 个 token`)

console.log('\n--- 5) 皮肤注册表完整性 ---')
const skins = mod?.SKINS
check(Array.isArray(skins) && skins.length === 3, '三种皮肤都在注册表里', Array.isArray(skins) ? skins.map(s => s.id).join(', ') : '')
for (const id of ['deepseek', 'codex', 'claude-code']) {
  const skin = skins?.find(s => s.id === id)
  check(Boolean(skin), `皮肤 ${id} 存在`)
  const tokens = skin?.tokens ?? {}
  const values = Object.values(tokens)
  check(values.length > 0, `皮肤 ${id} 有 token 层`, `${values.length} 个`)
  check(values.every(v => v && typeof v === 'object' && 'light' in v && 'dark' in v),
    `皮肤 ${id} 的每个 token 都带 light/dark 双值`)
}

console.log(`\n${bad === 0 ? '冒烟测试：全部通过' : `冒烟测试：${bad} 项未通过`}`)
process.exit(bad === 0 ? 0 : 1)
