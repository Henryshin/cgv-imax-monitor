# CGV IMAX 모니터 업데이트 스크립트
# 기존 설치(C:\side_PJT\CGV)를 최신 main 코드로 업데이트하고, state.json을 보존한 채
# 모니터를 1회 실행해 밀린 알림을 발송합니다. 관리자 권한 불필요.
#
# 사용법 (홈 PC PowerShell에서 한 줄):
#   irm https://raw.githubusercontent.com/Henryshin/cgv-imax-monitor/main/update.ps1 | iex

$installDir = "C:\side_PJT\CGV"

try {
    Write-Host "`n=== CGV IMAX 모니터 업데이트 ===" -ForegroundColor Cyan

    if (-not (Test-Path (Join-Path $installDir ".git"))) {
        Write-Host "❌ $installDir 에 설치본이 없습니다. install.ps1로 먼저 설치해주세요." -ForegroundColor Red
        Read-Host "Enter 키를 누르면 닫힙니다" | Out-Null
        return
    }
    Set-Location $installDir

    # 1) 실행 중 기록(state.json) 백업 — 이게 날아가면 과거 회차 전체가 재알림됨
    if (Test-Path "state.json") {
        Copy-Item "state.json" "state.backup.json" -Force
        Write-Host "✓ state.json 백업 완료" -ForegroundColor Green
    }

    # 2) 로컬 변경 정리 후 최신 main 코드로 전환
    git checkout -- . 2>$null
    git fetch origin main
    git checkout main 2>$null
    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw "git pull 실패 — 인터넷 연결을 확인해주세요." }
    Write-Host "✓ 최신 코드 적용: $(git log -1 --format='%h %s')" -ForegroundColor Green

    # 3) state.json 복원 (최신 코드에서는 git이 이 파일을 건드리지 않음)
    if (Test-Path "state.backup.json") {
        Copy-Item "state.backup.json" "state.json" -Force
        Write-Host "✓ state.json 복원 완료" -ForegroundColor Green
    }

    # 4) 모니터 1회 실행 — 그동안 유실됐던 신규 회차 알림이 텔레그램으로 발송됨
    Write-Host "`n모니터를 1회 실행합니다 (밀린 알림 발송)..." -ForegroundColor Yellow
    node monitor.js

    Write-Host "`n✅ 업데이트 완료! 스케줄러는 다음 주기부터 자동으로 새 코드로 실행됩니다." -ForegroundColor Green
}
catch {
    Write-Host "`n❌ 업데이트 중 오류:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host "`nEnter 키를 누르면 닫힙니다" | Out-Null
