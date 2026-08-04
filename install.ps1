# CGV IMAX 모니터 원클릭 설치 스크립트
# C:\side_PJT\CGV 에 설치 → .env 설정 → 텔레그램 테스트 → 스케줄러 등록 → 즉시 가동
#
# 사용법 (관리자 PowerShell):
#   irm https://raw.githubusercontent.com/Henryshin/cgv-imax-monitor/main/install.ps1 | iex
# 또는 저장소를 받은 뒤:
#   powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$installDir = "C:\side_PJT\CGV"
$repoUrl = "https://github.com/Henryshin/cgv-imax-monitor.git"

Write-Host "`n=== CGV IMAX 모니터 설치 ===" -ForegroundColor Cyan

# ── 0) 관리자 권한 확인 (스케줄러 등록에 필요) ──
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "❌ 관리자 권한이 필요합니다. PowerShell을 '관리자 권한으로 실행'한 뒤 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

# ── 1) Node.js 확인 ──
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

# ── 2) 저장소 설치/업데이트 ──
if (Test-Path (Join-Path $installDir ".git")) {
    Write-Host "기존 설치 발견 — 최신 버전으로 업데이트합니다..." -ForegroundColor Yellow
    git -C $installDir pull --ff-only
} elseif (Test-Path $installDir) {
    Write-Host "✓ $installDir 폴더가 이미 존재합니다 (git 저장소 아님) — 그대로 사용합니다." -ForegroundColor Yellow
} else {
    try {
        git --version | Out-Null
        Write-Host "저장소를 클론합니다..." -ForegroundColor Yellow
        git clone $repoUrl $installDir
    } catch {
        Write-Host "git이 없어 ZIP으로 다운로드합니다..." -ForegroundColor Yellow
        $zipPath = "$env:TEMP\cgv-imax-monitor.zip"
        Invoke-WebRequest "https://github.com/Henryshin/cgv-imax-monitor/archive/refs/heads/main.zip" -OutFile $zipPath
        Expand-Archive $zipPath -DestinationPath "$env:TEMP\cgv-extract" -Force
        New-Item -ItemType Directory -Path (Split-Path $installDir) -Force | Out-Null
        Move-Item "$env:TEMP\cgv-extract\cgv-imax-monitor-main" $installDir
        Remove-Item $zipPath, "$env:TEMP\cgv-extract" -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Set-Location $installDir
Write-Host "✓ 설치 경로: $installDir" -ForegroundColor Green

# ── 3) .env 설정 ──
$envPath = Join-Path $installDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "`n텔레그램 봇 정보를 입력해주세요 (BotFather에서 발급):" -ForegroundColor Cyan
    $botToken = Read-Host "  TELEGRAM_BOT_TOKEN"
    $chatId = Read-Host "  TELEGRAM_CHAT_ID"
    @(
        "TELEGRAM_BOT_TOKEN=$botToken"
        "TELEGRAM_CHAT_ID=$chatId"
        "SITE_NO=0013"
        "SCREEN_KEYWORD=IMAX"
        "CHECK_INTERVAL_MINUTES=5"
    ) | Set-Content -Path $envPath -Encoding UTF8
    Write-Host "✓ .env 생성 완료" -ForegroundColor Green
} else {
    Write-Host "✓ 기존 .env 사용" -ForegroundColor Green
}

# ── 4) 텔레그램 연결 테스트 ──
Write-Host "`n텔레그램 연결을 테스트합니다..." -ForegroundColor Yellow
node test-telegram.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 텔레그램 테스트 실패. .env의 토큰/chat_id를 확인한 뒤 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

# ── 5) 모니터 1회 실행 (기준선 생성) ──
Write-Host "`nCGV 조회를 1회 실행합니다 (기준선 생성)..." -ForegroundColor Yellow
node monitor.js

# ── 6) 스케줄러 등록 ──
Write-Host "`n작업 스케줄러를 등록합니다..." -ForegroundColor Yellow
& (Join-Path $installDir "setup_task.ps1")

# ── 7) 즉시 가동 ──
Start-ScheduledTask -TaskName "CGV-IMAX-Monitor"
Write-Host "`n✅ 설치 및 가동 완료! 5분마다 자동으로 CGV IMAX 예매를 감시하고, 매일 09:00 현황을 보고합니다." -ForegroundColor Green
Write-Host "   (PC가 켜져 있을 때만 동작합니다)"
