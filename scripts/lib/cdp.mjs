/**
 * 极小的 CDP（Chrome DevTools Protocol）客户端。
 *
 * 为什么不装 playwright/puppeteer：本机装不了（离线），而验证"设置页里到底渲染出
 * 什么"又必须有真实浏览器。Node 22+ 自带 WebSocket，Chrome/Edge 自带
 * --remote-debugging-port，两者一接就够了 —— 零依赖。
 *
 * 用法：
 *   const browser = await launch({ port: 9222 })
 *   const page = await browser.openPage(url)
 *   const text = await page.evaluate(() => document.body.innerText)
 *   await page.screenshot('shot.png')
 *   await browser.close()
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * 启动一个无头浏览器并连上它的 DevTools。
 * @param options.port - 远程调试端口（默认 9222）。
 * @param options.executable - 指定浏览器可执行文件。
 * @returns 浏览器句柄：openPage / close。
 */
export async function launch({ port = 9222, executable } = {}) {
  const exe = executable ?? CHROME_CANDIDATES.find(p => existsSync(p))
  if (!exe) throw new Error('找不到 Chrome/Edge')

  const profileDir = join(tmpdir(), `dsh-cdp-${Date.now().toString(36)}`)
  mkdirSync(profileDir, { recursive: true })

  const child = spawn(exe, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1600,1000',
    'about:blank',
  ], { stdio: 'ignore', detached: false })

  // 等 /json/version 可用
  let version = null
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) { version = await r.json(); break }
    } catch { /* 还没起来 */ }
    await sleep(250)
  }
  if (!version) {
    try { child.kill() } catch { }
    throw new Error(`浏览器没在 ${port} 上开始监听`)
  }

  const openPage = async (url) => {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', () => rej(new Error('CDP WebSocket 连接失败')), { once: true })
    })
    return new CdpPage(ws)
  }

  return {
    version,
    openPage,
    async close() {
      try { child.kill() } catch { }
      await sleep(200)
    },
  }
}

/** 一个页面会话：命令/响应 + 简易事件等待。 */
class CdpPage {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          msg.error ? p.rej(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`)) : p.res(msg.result)
        }
      } else {
        this.events.push(msg)
      }
    })
  }

  /** 发一条 CDP 命令。 */
  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) rej(new Error(`CDP ${method} 超时`))
      }, 30_000)
    })
  }

  /** 等某个事件出现（可选超时，超时返回 null 而不是抛错）。 */
  async waitEvent(method, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const hit = this.events.find(e => e.method === method)
      if (hit) return hit
      await sleep(100)
    }
    return null
  }

  /**
   * 在页面里执行一段函数并取回结果（JSON 可序列化）。
   * @param fn - 在浏览器里执行的函数（会被字符串化）。
   * @param args - 传给函数的参数（同样会被字符串化）。
   */
  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) {
      throw new Error(`页面内执行抛错：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    }
    return r.result.value
  }

  /** 导航并等 load 事件。 */
  async goto(url, { timeoutMs = 30_000 } = {}) {
    this.events.length = 0
    await this.send('Page.enable')
    await this.send('Page.navigate', { url })
    const loaded = await this.waitEvent('Page.loadEventFired', timeoutMs)
    if (!loaded) throw new Error(`导航到 ${url} 后没等到 loadEventFired`)
    return this
  }

  /** 截图并存成 PNG。 */
  async screenshot(path) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(path, Buffer.from(r.data, 'base64'))
    return path
  }

  /** 收集控制台所有日志文本（info/log/warn/error 都算）。 */
  collectConsoleLogs() {
    return this.events
      .filter(e => e.method === 'Runtime.consoleAPICalled')
      .map(e => e.params.args.map(a => a.value ?? a.description ?? '').join(' '))
  }

  /** 收集控制台错误（装配期的运行时报错会出现在这里）。 */
  collectConsoleErrors() {
    return this.events
      .filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map(e => e.params.args.map(a => a.value ?? a.description ?? '').join(' '))
  }

  close() { try { this.ws.close() } catch { } }
}
