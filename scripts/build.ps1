<#
  @dsh-external/dsh-ui-skin 构建脚本（Windows / PowerShell）

  两步：
    1) host 半边 —— 用 dsh checkout 自带的 tsc 编译 src/ → lib/
    2) client 半边 —— 借用 checkout 里的 tsdown 打成 lib/client.js

  设计要点：
    · **完全离线**：不跑 pnpm/npm install（本机不通 registry）。
      依赖只用 junction 指向 checkout 里已有的副本，与 dsh-persona-switcher 同法。
    · **借 tsdown 而不是装它**：直接 node <checkout>/node_modules/tsdown/dist/run.mjs，
      所以插件目录里不需要 node_modules/tsdown。

  用法：
      pwsh -File scripts/build.ps1
      pwsh -File scripts/build.ps1 -Checkout D:\path\to\deepseek-harness
#>
[CmdletBinding()]
param(
  [string]$Checkout = $env:DSH_CHECKOUT
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$PluginId = '@dsh-external/dsh-ui-skin'
Set-Location $Root

# ── 找 checkout ────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($Checkout)) {
  foreach ($c in @('D:\001\ai\deepseek-harness', "$HOME\dsh-harness", "$HOME\dsh", "$HOME\.dsh\dsh-harness")) {
    if (Test-Path (Join-Path $c 'packages')) { $Checkout = $c; break }
  }
}
if ([string]::IsNullOrWhiteSpace($Checkout) -or -not (Test-Path (Join-Path $Checkout 'packages'))) {
  throw "找不到 dsh checkout，请用 -Checkout 指定（当前：'$Checkout'）"
}
Write-Host "checkout: $Checkout" -ForegroundColor Cyan

# ── 工具定位 ───────────────────────────────────────────────────────────────
$Tsc = Join-Path $Checkout 'node_modules\.bin\tsc.cmd'
if (-not (Test-Path $Tsc)) { $Tsc = Join-Path $Checkout 'node_modules\.bin\tsc' }
if (-not (Test-Path $Tsc)) { throw "找不到 tsc：$Tsc" }

$TsdownRun = Join-Path $Checkout 'node_modules\tsdown\dist\run.mjs'
if (-not (Test-Path $TsdownRun)) { throw "找不到 tsdown：$TsdownRun" }

# ── junction：把 checkout 里已有的依赖挂进来（不下载任何东西）───────────────
function New-Junction($LinkRelative, $TargetAbsolute) {
  $link = Join-Path $Root $LinkRelative
  if (-not (Test-Path $TargetAbsolute)) { throw "依赖目标不存在：$TargetAbsolute" }
  if (Test-Path $link) { return }        # 已存在就不动它
  $parent = Split-Path -Parent $link
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  New-Item -ItemType Junction -Path $link -Target $TargetAbsolute | Out-Null
  Write-Host "  junction  $LinkRelative  ->  $TargetAbsolute" -ForegroundColor DarkGray
}

Write-Host '=== 链接构建依赖（只用 checkout 里已有的副本，不联网）===' -ForegroundColor Cyan
New-Junction 'node_modules\cordis'        (Join-Path $Checkout 'vendor\cordis')
New-Junction 'node_modules\@types\node'   (Join-Path $Checkout 'node_modules\@types\node')

# schemastery：宿主半边注册设置命名空间时要用它写 schema。
# ⚠️ 必须是**真的** schemastery，不能手写一个「长得像 schema」的对象：
#    settings.describe() 会调 `schema.toJSON()`，resolve 会调 `schema(value)`，
#    手写的对象少了 toJSON 就抛错 → 浏览器侧读不到值、写入也失败
#    （表现是「设置里勾不上」，人家踩过）。
# 它在 checkout 的 vendor/ 下，属于仓库自带的运行时依赖，不是第三方下载。
New-Junction 'node_modules\@deepseek-ai\schemastery' (Join-Path $Checkout 'vendor\schemastery')

# React 与 @types/react 在 pnpm 虚拟店里，不在 node_modules 顶层，要按实际路径找。
# pnpm store 的结构是：.pnpm/<pkg>@<ver>[_<peer>]/node_modules/<pkg>
# 所以要再拼一层包名才是包本体——不能只取到 node_modules 就算。
function Find-PnpmPackageDir([string]$Pattern, [string]$PackageRel) {
  $store = Join-Path $Checkout 'node_modules\.pnpm'
  $hit = Get-ChildItem $store -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $Pattern } |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if (-not $hit) { return $null }
  $candidate = Join-Path (Join-Path $hit.FullName 'node_modules') $PackageRel
  if (Test-Path $candidate) { return $candidate }
  return $null
}
$reactDir = Find-PnpmPackageDir 'react@*' 'react'
if ($reactDir) {
  New-Junction 'node_modules\react' $reactDir
  $reactDomDir = Find-PnpmPackageDir 'react-dom@*' 'react-dom'
  if ($reactDomDir) { New-Junction 'node_modules\react-dom' $reactDomDir }
} else {
  Write-Host '  ⚠ pnpm store 里没找到 react —— client 类型检查会报错，但打包不受影响' -ForegroundColor Yellow
}
$typesReact = Find-PnpmPackageDir '@types+react@*' '@types\react'
if ($typesReact) { New-Junction 'node_modules\@types\react' $typesReact }

# DSH 客户端的 slots 包：直接用 checkout 里的源码包（它自带 lib/types）。
# 链上它之后，client 的类型检查就能解析 import，不需要在 tsconfig 里写 paths。
$slotsPkg = Join-Path $Checkout 'packages\client\ui-slots'
if (Test-Path (Join-Path $slotsPkg 'lib\types')) {
  New-Junction 'node_modules\@deepseek-ai\dsh-client-ui-slots' $slotsPkg
} else {
  Write-Host '  ⚠ 找不到 ui-slots 的 lib/types —— client 类型检查会缺 slots 的类型' -ForegroundColor Yellow
}

# ── 1) host 半边：tsc 真正产出 lib/index.js + lib/types ───────────────────
Write-Host '=== 编译 host 半边：src → lib ===' -ForegroundColor Cyan
& $Tsc -p tsconfig.json
if ($LASTEXITCODE -ne 0) { throw "tsc 失败（exit $LASTEXITCODE）" }

# ── 1b) client 半边：只做类型检查（不产出，打包交给 tsdown）───────────────
Write-Host '=== 类型检查 client 半边（不产出文件）===' -ForegroundColor Cyan
& $Tsc -p tsconfig.client.json
if ($LASTEXITCODE -ne 0) {
  Write-Host '  ⚠ client 类型检查有错（不阻断打包，但建议修）' -ForegroundColor Yellow
}

# ── 2) client 半边：tsdown ────────────────────────────────────────────────
Write-Host '=== 打包 client 半边：src/client → lib/client.js ===' -ForegroundColor Cyan
& node $TsdownRun
if ($LASTEXITCODE -ne 0) { throw "tsdown 失败（exit $LASTEXITCODE）" }

# ── 校验产物 ──────────────────────────────────────────────────────────────
# 这一节是防呆：client 半边的装载协议一旦写坏，**浏览器里会静默不加载**，
# 排查起来很痛苦。所以每次构建都当场断言，别等到界面上什么都看不见。
Write-Host '=== 校验产物 ===' -ForegroundColor Cyan
$hostEntry = Join-Path $Root 'lib\index.js'
$client = Join-Path $Root 'lib\client.js'
if (-not (Test-Path $hostEntry)) { throw '缺少 lib/index.js' }
if (-not (Test-Path $client)) { throw '缺少 lib/client.js' }

# 注意：PowerShell 里 -Raw 与 -TotalCount 不能同时用（会抛参数冲突），所以整体读。
$c = [System.IO.File]::ReadAllText($client)
# 断言收口前先剥掉末尾的 sourceMappingURL 注释（它不是代码）。
$body = ($c -replace '(?m)//#\s*sourceMappingURL=.*$', '').TrimEnd()

$checks = [ordered]@{
  '带 __ModuleLoader__ 装载协议' = ($c -match '__ModuleLoader__')
  '模块 id 与包名一致'           = ($c -match [regex]::Escape('"' + $PluginId + '"'))
  'react 已外部化（require）'    = ($c -match 'require\(["'']react["'']\)')
  'jsx-runtime 已外部化'         = ($c -match 'require\(["'']react/jsx-runtime["'']\)')
  '没把 react 打进 bundle'       = (-not ($c -match 'react\.production\.min\.js'))
  '结尾以 }); 收口'              = ($body -match '\}\);\s*$')
}
$failed = @()
foreach ($k in $checks.Keys) {
  if ($checks[$k]) {
    Write-Host "  ✅ $k" -ForegroundColor Green
  } else {
    Write-Host "  ❌ $k" -ForegroundColor Red
    $failed += $k
  }
}
if ($failed.Count -gt 0) {
  throw ("client 产物校验失败：" + ($failed -join '；') + " —— 检查 tsdown.config.ts 的 banner/footer 与 outputOptions")
}

Write-Host ''
Write-Host '=== 构建完成 ===' -ForegroundColor Green
Get-ChildItem (Join-Path $Root 'lib') -Recurse -File | ForEach-Object {
  '  {0,9}  {1}' -f $_.Length, $_.FullName.Substring($Root.Length + 1)
}
