# CGV IMAX 모니터 원클릭 설치 스크립트
# C:\side_PJT\CGV 에 설치 → .env 설정 → 텔레그램 테스트 → 스케줄러 등록 → 즉시 가동
#
# 사용법 (일반 PowerShell에서도 됨 — 관리자 창을 자동으로 띄웁니다):
#   irm https://raw.githubusercontent.com/Henryshin/cgv-imax-monitor/claude/cgv-imax-monitor-olw5td/install.ps1 | iex

$installDir = "C:\side_PJT\CGV"
$repoUrl = "https://github.com/Henryshin/cgv-imax-monitor.git"
$branch = "claude/cgv-imax-monitor-olw5td"
$rawUrl = "https://raw.githubusercontent.com/Henryshin/cgv-imax-monitor/$branch/install.ps1"

function Wait-Exit($code) {
    Write-Host ""
    Read-Host "Enter 키를 누르면 창이 닫힙니다" | Out-Null
    exit $code
}

# ── 0) 관리자 권한 확인 — 아니면 관리자 창을 새로 띄움 ──
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "관리자 권한이 필요합니다. 관리자 PowerShell 창을 새로 엽니다 (UAC 창에서 '예'를 눌러주세요)..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "irm '$rawUrl' | iex"
    return
}

try {
    Write-Host "`n=== CGV IMAX 모니터 설치 ===" -ForegroundColor Cyan

    # ── 1) Node.js 확인 ──
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "❌ Node.js가 설치되어 있지 않습니다." -ForegroundColor Red
        Write-Host "   https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 스크립트를 다시 실행해주세요."
        Wait-Exit 1
    }
    Write-Host "✓ Node.js $(node --version)" -ForegroundColor Green

    # ── 2) 저장소 설치/업데이트 ──
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (Test-Path (Join-Path $installDir ".git")) {
        Write-Host "기존 설치 발견 — 최신 버전으로 업데이트합니다..." -ForegroundColor Yellow
        git -C $installDir fetch origin $branch
        git -C $installDir checkout $branch
        git -C $installDir pull --ff-only origin $branch
    } elseif (Test-Path (Join-Path $installDir "monitor.js")) {
        Write-Host "✓ $installDir 에 기존 파일이 있습니다 — 그대로 사용합니다." -ForegroundColor Yellow
    } elseif ($gitCmd) {
        Write-Host "저장소를 클론합니다..." -ForegroundColor Yellow
        git clone -b $branch $repoUrl $installDir
        if ($LASTEXITCODE -ne 0) { throw "git clone 실패" }
    } else {
        Write-Host "git이 없어 ZIP으로 다운로드합니다..." -ForegroundColor Yellow
        $zipPath = "$env:TEMP\cgv-imax-monitor.zip"
        $zipBranch = $branch -replace '/', '-'
        Invoke-WebRequest "https://github.com/Henryshin/cgv-imax-monitor/archive/refs/heads/$branch.zip" -OutFile $zipPath
        Expand-Archive $zipPath -DestinationPath "$env:TEMP\cgv-extract" -Force
        New-Item -ItemType Directory -Path (Split-Path $installDir) -Force | Out-Null
        $extracted = Get-ChildItem "$env:TEMP\cgv-extract" -Directory | Select-Object -First 1
        Move-Item $extracted.FullName $installDir
        Remove-Item $zipPath, "$env:TEMP\cgv-extract" -Recurse -Force -ErrorAction SilentlyContinue
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
        Write-Host "   (.env 파일 위치: $envPath)"
        Wait-Exit 1
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
    Wait-Exit 0
}
catch {
    Write-Host "`n❌ 설치 중 오류가 발생했습니다:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Wait-Exit 1
}
