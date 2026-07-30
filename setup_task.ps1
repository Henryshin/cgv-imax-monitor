# CGV 모니터 Windows Task Scheduler 등록 스크립트
# 관리자 권한이 필요합니다.

$taskName = "CGV-IMAX-Monitor"
$scriptPath = "C:\side_PJT\CGV\monitor.js"
$workingDir = "C:\side_PJT\CGV"

# 관리자 권한 확인
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "❌ 관리자 권한이 필요합니다. 관리자 권한으로 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

# 기존 작업 제거
Write-Host "기존 작업 확인 중..." -ForegroundColor Yellow
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "기존 '$taskName' 작업을 제거합니다..."
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# 작업 생성
Write-Host "새 작업을 등록 중..." -ForegroundColor Yellow

$action = New-ScheduledTaskAction `
    -Execute "node.exe" `
    -Argument $scriptPath `
    -WorkingDirectory $workingDir

$trigger = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -Once `
    -At (Get-Date)

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "CGV 용산아이파크몰 IMAX 예매 오픈 모니터링" `
    -RunLevel Highest | Out-Null

Write-Host "`n✅ 작업 등록 완료!" -ForegroundColor Green
Write-Host "`n작업 정보:"
Write-Host "  이름: $taskName"
Write-Host "  실행: 5분마다"
Write-Host "  경로: $scriptPath"
Write-Host "`n💡 작업을 즉시 실행하려면:"
Write-Host "   Start-ScheduledTask -TaskName '$taskName'"
