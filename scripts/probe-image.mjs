/**
 * 图片素材探针：把 PNG 解成 ASCII 缩略图 + 主色统计。
 *
 * 为什么需要：皮肤卡片上的三个标记到底长什么样，靠"看文件名猜"是不可靠的
 * （仓库里既没有浏览器驱动、也不能靠肉眼看回复里的图）。这个脚本只依赖
 * node:zlib（内置），把 PNG 解出来打印成文字图 —— 一眼能看出形状与配色，
 * 也方便把"源码版素材"和"包内矢量标记"并排比对。
 *
 * 用法（在插件根目录）：
 *   node scripts/probe-image.mjs <图片路径> [宽度]
 *   node scripts/probe-image.mjs D:\...\apps\web\public\skins\codex-icon.png
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const path = process.argv[2]
if (!path) {
  console.error('用法：node scripts/probe-image.mjs <png 路径> [宽度]')
  process.exit(2)
}
const targetWidth = Number(process.argv[3] ?? 40)

const buf = readFileSync(path)
if (buf.readUInt32BE(0) !== 0x89504e47) {
  console.error('不是 PNG')
  process.exit(2)
}

// ── 解析 IHDR ──
let offset = 8
let width = 0
let height = 0
let bitDepth = 0
let colorType = 0
const idat = []
while (offset < buf.length) {
  const length = buf.readUInt32BE(offset)
  const type = buf.toString('ascii', offset + 4, offset + 8)
  const data = buf.subarray(offset + 8, offset + 8 + length)
  if (type === 'IHDR') {
    width = data.readUInt32BE(0)
    height = data.readUInt32BE(4)
    bitDepth = data[8]
    colorType = data[9]
  } else if (type === 'IDAT') {
    idat.push(data)
  } else if (type === 'IEND') {
    break
  }
  offset += 12 + length
}
if (bitDepth !== 8) {
  console.error(`只支持 8 位深（实际 ${bitDepth}）`)
  process.exit(2)
}
const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
if (!channels) {
  console.error(`不支持的 colorType=${colorType}`)
  process.exit(2)
}

const raw = inflateSync(Buffer.concat(idat))
const stride = width * channels
const pixels = Buffer.alloc(height * stride)

// ── 反 PNG 滤波 ──
let pos = 0
for (let y = 0; y < height; y++) {
  const filter = raw[pos++]
  const line = raw.subarray(pos, pos + stride)
  pos += stride
  const out = pixels.subarray(y * stride, (y + 1) * stride)
  const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? out[x - channels] : 0
    const b = prior[x]
    const c = x >= channels ? prior[x - channels] : 0
    const v = line[x]
    out[x] = filter === 0 ? v
      : filter === 1 ? (v + a) & 0xff
        : filter === 2 ? (v + b) & 0xff
          : filter === 3 ? (v + ((a + b) >> 1)) & 0xff
            : (v + paeth(a, b, c)) & 0xff
  }
}
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

const getPixel = (x, y) => {
  const i = y * stride + x * channels
  if (channels === 1 || channels === 2) { const g = pixels[i]; return [g, g, g, channels === 2 ? pixels[i + 1] : 255] }
  return [pixels[i], pixels[i + 1], pixels[i + 2], channels === 4 ? pixels[i + 3] : 255]
}

// ── 缩略图 + 主色 ──
const map = ' .:-=+*#%@'
const scale = Math.max(1, Math.round(width / targetWidth))
const rows = []
for (let y = 0; y < height; y += scale * 2) {
  let line = ''
  for (let x = 0; x < width; x += scale) {
    const [r, g, b, a] = getPixel(x, y)
    if (a < 40) { line += ' '; continue }
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    line += map[Math.min(map.length - 1, Math.round((1 - lum) * (map.length - 1)))]
  }
  rows.push(line)
}

const buckets = new Map()
for (let y = 0; y < height; y += 2) {
  for (let x = 0; x < width; x += 2) {
    const [r, g, b, a] = getPixel(x, y)
    if (a < 128) continue
    const key = `${r >> 5 << 5},${g >> 5 << 5},${b >> 5 << 5}`
    const hit = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    hit.n++; hit.r += r; hit.g += g; hit.b += b
    buckets.set(key, hit)
  }
}
const total = [...buckets.values()].reduce((n, v) => n + v.n, 0) || 1
const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 6)

console.log(`文件：${path}`)
console.log(`尺寸：${width}x${height}  色彩类型：${colorType}  通道：${channels}`)
console.log('\n---- ASCII 缩略图（越暗字符越密）----')
for (const line of rows) console.log('  ' + line)
console.log('\n---- 主色（按占比）----')
for (const v of top) {
  const rgb = `rgb(${Math.round(v.r / v.n)}, ${Math.round(v.g / v.n)}, ${Math.round(v.b / v.n)})`
  console.log(`  ${(v.n / total * 100).toFixed(1).padStart(5)}%  ${rgb}`)
}
