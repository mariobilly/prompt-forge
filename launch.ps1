# Starts the PromptForge server in the background (if it isn't already running)
# and opens the app in its own browser window. Needs Node.js (npm) on your PATH and `npm install` done once.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 3777
$url = "http://127.0.0.1:$port"

function Show-Message($text) {
    (New-Object -ComObject WScript.Shell).Popup($text, 0, "PromptForge", 48) | Out-Null
}

function Test-Up {
    try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false }
}

if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Show-Message "PromptForge needs Node.js. Install it from https://nodejs.org and try again."; exit 1 }
    if (-not (Test-Path (Join-Path $root "node_modules"))) { Show-Message "Run 'npm install' in the PromptForge folder once, then start it again."; exit 1 }
    # The server log goes next to your PromptForge data, not into the app's folder.
    $dataDir = if ($env:PROMPTFORGE_DATA_DIR) { $env:PROMPTFORGE_DATA_DIR } else { Join-Path $env:LOCALAPPDATA "PromptForge" }
    New-Item -ItemType Directory -Force $dataDir | Out-Null
    $log = Join-Path $dataDir "server.log"
    $env:NEXT_TELEMETRY_DISABLED = "1"   # no anonymous Next.js usage data
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -- --port $port > `"$log`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden
    for ($i = 0; $i -lt 90 -and -not (Test-Up); $i++) { Start-Sleep -Seconds 1 }
}

# Open as a standalone app window (Edge or Chrome app mode), falling back to the default browser.
$browsers = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) { Start-Process $browser "--app=$url --window-size=1400,900" } else { Start-Process $url }
