# CGV 모니터 Windows Task Scheduler 등록 스크립트
# 관리자 권한이 필요합니다.

$monitorTaskName = "CGV-IMAX-Monitor"
$reportTaskName = "CGV-IMAX-DailyReport"
$scriptPath = "C:\side_PJT\CGV\monitor.js"
$workingDir = "C:\side_PJT\CGV"

# 관리자 권한 확인
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "❌ 관리자 권한이 필요합니다. 관리자 권한으로 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# ── 1) 5분마다 신규 회차 모니터링 ──
Write-Host "기존 작업 확인 중..." -ForegroundColor Yellow
$existingMonitor = Get-ScheduledTask -TaskName $monitorTaskName -ErrorAction SilentlyContinue
if ($existingMonitor) {
    Write-Host "기존 '$monitorTaskName' 작업을 제거합니다..."
    Unregister-ScheduledTask -TaskName $monitorTaskName -Confirm:$false
}

$monitorAction = New-ScheduledTaskAction `
    -Execute "node.exe" `
    -Argument $scriptPath `
    -WorkingDirectory $workingDir

# 매일 자정에 시작해 하루 내내 5분마다 반복.
# '-Once -At (지금)' 방식은 반복 지속시간이 지정되지 않아 Windows가 하루 뒤
# 작업을 만료시켜 버리는 문제가 있었다 (모니터 작업만 조용히 사라짐).
$monitorTrigger = New-ScheduledTaskTrigger -Daily -At "00:00"
$monitorTrigger.Repetition = (New-ScheduledTaskTrigger `
    -Once -At "00:00" `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 1)).Repetition

Register-ScheduledTask `
    -TaskName $monitorTaskName `
    -Action $monitorAction `
    -Trigger $monitorTrigger `
    -Settings $settings `
    -Description "CGV 용산아이파크몰 IMAX 예매 오픈 모니터링 (5분마다)" `
    -RunLevel Highest | Out-Null

# ── 2) 매일 09:00 현황 보고 ──
$existingReport = Get-ScheduledTask -TaskName $reportTaskName -ErrorAction SilentlyContinue
if ($existingReport) {
    Write-Host "기존 '$reportTaskName' 작업을 제거합니다..."
    Unregister-ScheduledTask -TaskName $reportTaskName -Confirm:$false
}

$reportAction = New-ScheduledTaskAction `
    -Execute "node.exe" `
    -Argument "$scriptPath report" `
    -WorkingDirectory $workingDir

$reportTrigger = New-ScheduledTaskTrigger -Daily -At "09:00"

Register-ScheduledTask `
    -TaskName $reportTaskName `
    -Action $reportAction `
    -Trigger $reportTrigger `
    -Settings $settings `
    -Description "CGV 용산아이파크몰 IMAX 일일 현황 보고 (매일 09:00)" `
    -RunLevel Highest | Out-Null

# ── 3) 등록 검증 — 다음 실행 시각이 잡혀야 정상 ──
Write-Host "`n등록 결과 확인:" -ForegroundColor Yellow
foreach ($name in @($monitorTaskName, $reportTaskName)) {
    $info = Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue
    if ($info -and $info.NextRunTime) {
        Write-Host "  ✓ $name — 다음 실행: $($info.NextRunTime)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $name — 다음 실행 시각이 없습니다! 등록에 실패했습니다." -ForegroundColor Red
    }
}

Write-Host "`n✅ 작업 등록 완료!" -ForegroundColor Green
Write-Host "`n작업 정보:"
Write-Host "  1) $monitorTaskName - 5분마다 신규 회차 탐지"
Write-Host "  2) $reportTaskName - 매일 09:00 현황 보고"
Write-Host "  실행 PC: $env:COMPUTERNAME / 계정: $env:USERNAME"
Write-Host "  경로: $scriptPath"
Write-Host "`n💡 작업을 즉시 실행하려면:"
Write-Host "   Start-ScheduledTask -TaskName '$monitorTaskName'"
Write-Host "   Start-ScheduledTask -TaskName '$reportTaskName'"
