# ============================================================
#  dsh-ui-skin 实测脚本（隔离实例，不碰正在使用的会话）
#  ------------------------------------------------------------
#  做法：
#    1. 在 %TEMP% 下造一个独立的 DSH_HOME（profiles/web + 临时插件目录）
#    2. 把插件"打包好的形态"（cordis.patch.yml + lib/）拷进去并登记进 bundles
#    3. **写 profile 补丁关掉树内那份 ui-skin**（见下方说明）
#    4. 用便携版的 exe 在 3099 端口起一个实例（dev 常占 3080，不动它）
#    5. 验证：资产路由 / manifest / 路径穿越防护 / boot graph / 树内是否已关 / 启动日志
#    6. 收尾：杀进程、删临时目录
#
#  为什么要关树内那份：官方源码或自制 fork 构建的实例里，web-app bundle 自带一条
#  id=ui-skin 的皮肤（packages/client/ui-skin）。它与本插件互不相干但抢同一个设置
#  槽位，表现是"皮肤"标题出现两次、旧那份盖住新的那份（旧那份没有素材目录输入框）。
#  profile 的补丁层在全部 bundle 层之后应用，所以能按 id 把树内那条 disabled。
#
#  用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-instance.ps1
# ============================================================
[CmdletBinding()]
param(
  [int]$Port = 3099,
  [string]$PluginDir = '',
  [string]$Exe = 'D:\001\ai\deepseek\portable\DSH-Web\程序\deepseek-harness.exe'
)

$ErrorActionPreference = 'Stop'

# 默认值在 param 块外解析：param 默认值的求值时机早于 $PSScriptRoot 可用
if ([string]::IsNullOrWhiteSpace($PluginDir)) {
  $PluginDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
}

$bad = 0
function Check($ok, $label, $extra = '') {
  if (-not $ok) { $script:bad++ }
  Write-Host ("  {0}  {1}{2}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $label, $(if ($extra) { "  $extra" } else { '' }))
}
function Section($t) { Write-Host ''; Write-Host "--- $t ---" }

if (-not (Test-Path -LiteralPath $Exe)) { throw "找不到 exe：$Exe" }
if (-not (Test-Path -LiteralPath (Join-Path $PluginDir 'lib\client.js'))) { throw "插件未构建（缺 lib/client.js）：$PluginDir" }

# 端口上的残留实例先清掉，否则起不来（只动我们自己这种 exe）
$stale = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($conn in @($stale)) {
  $procInfo = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
  if ($procInfo -and $procInfo.ProcessName -like 'deepseek-harness*') {
    Write-Host "  端口 $Port 上有残留测试实例（PID $($conn.OwningProcess)），先停掉"
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
  }
}

$sandbox = Join-Path $env:TEMP ("dsh-ui-skin-test-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$testHome = Join-Path $sandbox 'home'
$profileDir = Join-Path $testHome 'profiles\web'
$pluginStage = Join-Path $sandbox 'plugin'
$logOut = Join-Path $sandbox 'out.log'
$logErr = Join-Path $sandbox 'err.log'
$proc = $null

try {
  Write-Host "沙箱：$sandbox"
  New-Item -ItemType Directory -Force -Path $profileDir, $pluginStage | Out-Null

  # ── 1. 摆插件（只拷运行时需要的：patch + lib + 清单）──
  Copy-Item (Join-Path $PluginDir 'cordis.patch.yml') $pluginStage -Force
  Copy-Item (Join-Path $PluginDir 'lib') $pluginStage -Recurse -Force
  Copy-Item (Join-Path $PluginDir 'package.json') $pluginStage -Force

  # ── 2. profile 清单登记 ──
  $manifest = @'
{
  "name": "dsh-profile-web",
  "version": "0.0.0",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@dsh-external/dsh-ui-skin"
      ],
      "patchReload": "live"
    }
  }
}
'@
  [System.IO.File]::WriteAllText((Join-Path $profileDir 'package.json'), $manifest, (New-Object System.Text.UTF8Encoding($false)))

  # ── 2b. profile 补丁：关掉树内那份同名皮肤 ──
  # 补丁内容优先取"**便携版启动器实际会写出的那份**"：启动器自己就有这套沙箱逻辑
  # （dsh-web-portable/scripts/test-plugin-sync.ps1），跑它一次、把生成的
  # profiles/web/cordis.patch.yml 抄过来。这样测的是用户真会得到的那份，不是
  # 测试自己另写的一份。取不到就退回本地等价内容。
  $patchText = $null
  $launcherSandbox = Join-Path $env:TEMP ("dsh-ui-skin-patchprobe-" + [guid]::NewGuid().ToString('N').Substring(0, 6))
  $seedPkg = Join-Path $launcherSandbox 'DSH-Web'
  $seedData = Join-Path $launcherSandbox 'data'
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $seedPkg '程序'), $seedData | Out-Null
    Set-Content -LiteralPath (Join-Path $seedPkg '程序\deepseek-harness.exe') -Value '@echo off' -Encoding ASCII
    Copy-Item 'D:\001\ai\deepseek\dsh-web-portable\assets\start-dsh-web.ps1' $seedPkg -Force -ErrorAction Stop
    $env:DSH_WEB_HOME = $seedData
    # 启动器最后会 Read-Host；喂空行让它走完。起不来也无所谓 —— 补丁在启动早期就写了。
    '' | & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $seedPkg 'start-dsh-web.ps1') 2>&1 | Out-Null
    $probePatch = Join-Path $seedData 'profiles\web\cordis.patch.yml'
    if (Test-Path -LiteralPath $probePatch) {
      $patchText = [System.IO.File]::ReadAllText($probePatch, [System.Text.Encoding]::UTF8)
      Write-Host '  profile 补丁取自便携版启动器的真实输出（复刻用户实际行为）'
    }
  } catch {
    Write-Host "  探测启动器补丁失败：$($_.Exception.Message)" -ForegroundColor DarkYellow
  } finally {
    if (Test-Path -LiteralPath $launcherSandbox) { cmd /c "rd /s /q `"$launcherSandbox`"" 2>&1 | Out-Null }
  }
  if (-not $patchText) {
    Write-Host '  退回本地等价补丁' -ForegroundColor DarkYellow
    $patchText = '# profile 补丁层：在所有 bundle 层之后应用。'
  }
  # 启动器目前会把这条写进它自己的模板（见其注释"关掉树内那条同名皮肤"）；
  # 如果那份补丁里还没有，就在这里补上，保证本测试始终在"树内已关"的前提下验证。
  if ($patchText -notmatch 'id:\s*ui-skin') {
    $patchText += "`r`n- id: ui-skin`r`n  disabled: true`r`n"
  }
  [System.IO.File]::WriteAllText((Join-Path $profileDir 'cordis.patch.yml'), $patchText, (New-Object System.Text.UTF8Encoding($false)))

  # ── 3. 挂进 profile 的 node_modules（@dsh-external/dsh-ui-skin）──
  $scopeDir = Join-Path $profileDir 'node_modules\@dsh-external'
  New-Item -ItemType Directory -Force -Path $scopeDir | Out-Null
  New-Item -ItemType Junction -Path (Join-Path $scopeDir 'dsh-ui-skin') -Target $pluginStage | Out-Null

  # ── 4. 起隔离实例 ──
  Section "启动隔离实例（端口 $Port，HOME=$testHome）"
  $env:DSH_HOME = $testHome
  $env:LOCALAPPDATA = Join-Path $sandbox 'localappdata'   # 让 defaultAssetsDir 落到沙箱
  $assetsDir = Join-Path $env:LOCALAPPDATA 'DSH-Web\skins'
  New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
  # 放一张假 PNG，验证 manifest 会列出它
  [System.IO.File]::WriteAllBytes((Join-Path $assetsDir 'codex-icon.png'), [byte[]](0x89, 0x50, 0x4E, 0x47))

  $proc = Start-Process -FilePath $Exe -ArgumentList @('web', '--port', "$Port", '--no-open') -NoNewWindow -PassThru `
    -RedirectStandardOutput $logOut -RedirectStandardError $logErr
  Write-Host "  PID $($proc.Id)，等待就绪……"

  # ── 5. 等就绪行，拿到带 token 的地址 ──
  $url = $null
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) { break }
    if (Test-Path -LiteralPath $logOut) {
      $hit = Select-String -LiteralPath $logOut -Pattern 'dsh web:\s*(http://\S+)' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $url = $hit.Matches[0].Groups[1].Value; break }
    }
    Start-Sleep -Milliseconds 400
  }
  if (-not $url) {
    Write-Host '  实例没起来，输出如下：' -ForegroundColor Red
    foreach ($f in @($logOut, $logErr)) {
      if (Test-Path -LiteralPath $f) {
        ([System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8) -split "`n") | Select-Object -Last 25 | ForEach-Object { "    $_" }
      }
    }
    throw '测试实例启动失败'
  }
  Write-Host "  就绪：$url"

  # ── 6. 验证 ──
  $origin = ([uri]$url).GetLeftPart([System.UriPartial]::Authority)

  Section 'A) 宿主半边：资产路由'
  $resp = Invoke-WebRequest -Uri "$origin/dsh-ui-skin/assets/manifest.json" -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
  Check ($resp.StatusCode -eq 200) 'manifest.json 返回 200' "实际 $($resp.StatusCode)"
  if ($resp.StatusCode -eq 200) {
    $body = $resp.Content | ConvertFrom-Json
    Check ($body.assets -contains 'codex-icon.png') 'manifest 列出了刚放的 codex-icon.png' "assets=$($body.assets -join ',')"
    Write-Host "     素材目录：$($body.dir)"
  }
  # 白名单 + 路径穿越：都不许成功
  try {
    $r404 = Invoke-WebRequest -Uri "$origin/dsh-ui-skin/assets/../out.log" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Check $false '路径穿越被拒绝' "意外返回 $($r404.StatusCode)"
  } catch {
    Check $true '路径穿越/白名单外的名字被拒绝'
  }

  Section 'B) 客户端半边：boot graph'
  $boot = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
  $m = [regex]::Match($boot.Content, 'globalThis\["__DSH_BOOT__"\]\s*=\s*(\{[\s\S]*?\})</script>')
  if (-not $m.Success) {
    Check $false '能从 index.html 里解析出 __DSH_BOOT__'
  } else {
    $bootJson = $m.Groups[1].Value
    Check ($bootJson -match 'dsh-ui-skin') '本插件进了 boot graph'
    # 判据用**完整包名**：'dsh-ui-skin' 是本插件名的子串，拿它当"树内还在"的证据会误判
    $inTree = $bootJson -match '@deepseek-ai/dsh-client-ui-skin'
    Check (-not $inTree) '树内 ui-skin 已被 profile 补丁关掉'
    if ($inTree) { Write-Host '     ↑ 它还在：两份皮肤会抢同一个设置槽位，界面会看到两个「皮肤」' -ForegroundColor Red }
  }

  Section 'C) 宿主启动日志'
  # 实例还活着时日志文件被独占打开：先停掉再读，否则 ReadAllText 报 sharing violation。
  # 读的时候必须按 UTF-8 —— Get-Content 默认 ANSI 解码会把中文读成乱码，断言会假失败。
  if ($null -ne $proc -and -not $proc.HasExited) {
    try { $proc.Kill(); $proc.WaitForExit(5000) | Out-Null } catch { }
    Start-Sleep -Milliseconds 300
  }
  $log = ''
  foreach ($f in @($logOut, $logErr)) {
    if (Test-Path -LiteralPath $f) { $log += [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8) }
  }
  if ($log -match '\[ui-skin\]') {
    Check $true '日志出现 [ui-skin] 的素材目录提示'
    [regex]::Matches($log, '\[ui-skin\][^\r\n]*') | Select-Object -First 2 | ForEach-Object { Write-Host "     $($_.Value.Trim())" }
    Check ($log -match '素材目录：') '日志里写明了生效的素材目录'
  } else {
    Write-Host '  [SKIP] 宿主未输出 [ui-skin] 日志（诊断信息缺失，不影响功能）' -ForegroundColor DarkYellow
  }

  # ── 场景 D：**树内皮肤不关掉**，本插件也必须能加载 ──
  # 这是用户实际踩到的场景：两份皮肤同时跑。最初服务/事件/命名空间都与树内同名，
  # 于是 provide 重复注册 → 插件加载失败 → 界面白屏 "Failed to load plugins"。
  # 所以这个场景必须每次验证 —— 上面 A/B/C 都是"树内已关"的前提下测的，
  # 覆盖不到这个失败模式（这就是当初漏掉的原因）。
  Section 'D) 树内皮肤**不关**时，本插件也必须能加载（共存场景）'
  if ($null -ne $proc -and -not $proc.HasExited) {
    try { $proc.Kill(); $proc.WaitForExit(5000) | Out-Null } catch { }
    Start-Sleep -Milliseconds 400
  }
  # 把 profile 补丁换成"只有目录选择器、不 disable 树内皮肤"
  [System.IO.File]::WriteAllText((Join-Path $profileDir 'cordis.patch.yml'),
    "# 故意不 disable 树内皮肤：验证两份皮肤共存`r`n- id: directory-picker`r`n  disabled: true`r`n",
    (New-Object System.Text.UTF8Encoding($false)))
  # 换一份新的日志文件，避免把上一轮的输出混进来
  $logOut2 = Join-Path $sandbox 'out2.log'
  $logErr2 = Join-Path $sandbox 'err2.log'
  $proc = Start-Process -FilePath $Exe -ArgumentList @('web', '--port', "$Port", '--no-open') -NoNewWindow -PassThru `
    -RedirectStandardOutput $logOut2 -RedirectStandardError $logErr2
  $url2 = $null
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) { break }
    if (Test-Path -LiteralPath $logOut2) {
      $hit = Select-String -LiteralPath $logOut2 -Pattern 'dsh web:\s*(http://\S+)' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $url2 = $hit.Matches[0].Groups[1].Value; break }
    }
    Start-Sleep -Milliseconds 400
  }
  if (-not $url2) {
    Check $false '树内皮肤共存时实例仍能启动'
    foreach ($f in @($logOut2, $logErr2)) {
      if (Test-Path -LiteralPath $f) {
        ([System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8) -split "`n") | Select-Object -Last 20 | ForEach-Object { "    $_" }
      }
    }
  } else {
    $boot2 = Invoke-WebRequest -Uri $url2 -UseBasicParsing -TimeoutSec 15
    Check ($boot2.Content -match 'dsh-ui-skin') '共存时本插件仍进了 boot graph'
    Check ($boot2.Content -match '@deepseek-ai/dsh-client-ui-skin') '共存时树内皮肤确实也在（这才叫共存）'
    # 关键的失败信号：白屏那一页会带这句
    Check ($boot2.Content -notmatch 'Failed to load plugins') 'index 里没有 "Failed to load plugins"'
    # 装配日志里不能有本插件的 apply 失败。
    # 日志文件在进程存活期间被独占打开，**必须先停掉再读**（C 段踩过同一个坑）。
    if ($null -ne $proc -and -not $proc.HasExited) {
      try { $proc.Kill(); $proc.WaitForExit(5000) | Out-Null } catch { }
      Start-Sleep -Milliseconds 300
    }
    $log2 = ''
    foreach ($f in @($logOut2, $logErr2)) {
      if (Test-Path -LiteralPath $f) { $log2 += [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8) }
    }
    Check (-not ($log2 -match 'failed to apply loader entry[^\r\n]*dsh-ui-skin')) '本插件的 loader 条目 apply 成功（没有失败行）'
    Check (-not ($log2 -match 'has been registered')) '没有服务/命名空间重复注册报错'
  }

  Write-Host ''
  Write-Host $(if ($bad -eq 0) { '实测：全部通过' } else { "实测：$bad 项未通过" })
} finally {
  if ($null -ne $proc -and -not $proc.HasExited) {
    try { $proc.Kill(); $proc.WaitForExit(5000) | Out-Null } catch { }
    Write-Host "`n已停止测试实例（PID $($proc.Id)）"
  }
  if (Test-Path -LiteralPath $sandbox) {
    foreach ($entry in (Get-ChildItem -LiteralPath $sandbox -Recurse -Force -Directory -ErrorAction SilentlyContinue)) {
      if ($entry.LinkType) { & cmd.exe /c rmdir "$($entry.FullName)" 2>&1 | Out-Null }
    }
    cmd /c "rd /s /q `"$sandbox`"" 2>&1 | Out-Null
    Write-Host "已清理沙箱：$sandbox"
  }
}
exit $(if ($bad -eq 0) { 0 } else { 1 })
