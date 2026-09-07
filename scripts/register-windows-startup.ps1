# ============================================================
#  Hotel Management - Windows Auto-Start Registration
#  Two methods are supported:
#
#  METHOD 1 — Startup Folder (NO admin required, starts at logon)
#    Copies start-hotel-silent.vbs to shell:startup.
#    Works for the logged-in user automatically.
#
#  METHOD 2 — Scheduled Task (admin required, starts at boot)
#    Creates a SYSTEM-level scheduled task via schtasks /Create.
#    Starts the server at true system boot (before user login).
#
#  Usage (run as normal user):
#    powershell -ExecutionPolicy Bypass -File scripts\register-windows-startup.ps1
#
#  Usage (run as admin):
#    powershell -ExecutionPolicy Bypass -File scripts\register-windows-startup.ps1 -Method Task
#
#  To REMOVE auto-start later:
#    powershell -ExecutionPolicy Bypass -File scripts\register-windows-startup.ps1 -Remove
# ============================================================

param(
    [ValidateSet("Folder","Task")]
    [string]$Method = "Folder",
    [switch]$Remove
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BatchScript = Join-Path $ScriptDir "start-hotel-windows.bat"
$SilentLauncher = Join-Path $ScriptDir "start-hotel-silent.vbs"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$TaskName = "HotelManagementServer"

Write-Host ""
Write-Host "Hotel Management - Auto-Start Setup" -ForegroundColor Cyan
Write-Host "===================================="
Write-Host ""

# ---------- REMOVE MODE ----------
if ($Remove) {
    $removed = $false

    # Remove from Startup folder
    $vbsInStartup = Join-Path $StartupFolder "HotelManagement.vbs"
    if (Test-Path $vbsInStartup) {
        Remove-Item $vbsInStartup -Force
        Write-Host "[OK] Removed from Startup folder" -ForegroundColor Green
        $removed = $true
    }

    # Remove scheduled task
    $taskExists = schtasks /Query /TN $TaskName 2>$null
    if ($LASTEXITCODE -eq 0) {
        schtasks /Delete /TN $TaskName /F | Out-Null
        Write-Host "[OK] Removed scheduled task: $TaskName" -ForegroundColor Green
        $removed = $true
    }

    if (-not $removed) { Write-Host "Nothing to remove." -ForegroundColor Yellow }
    return
}

# ---------- INSTALL MODE ----------
Write-Host "Method : $Method"
Write-Host "Project: $ProjectRoot"
Write-Host ""

if (-not (Test-Path $BatchScript)) {
    Write-Host "ERROR: Launcher not found: $BatchScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $SilentLauncher)) {
    Write-Host "ERROR: Silent launcher not found: $SilentLauncher" -ForegroundColor Red
    exit 1
}

if ($Method -eq "Folder") {

    Copy-Item -LiteralPath $SilentLauncher -Destination (Join-Path $StartupFolder "HotelManagement.vbs") -Force
    $dest = Join-Path $StartupFolder "HotelManagement.vbs"
    if (Test-Path $dest) {
        Write-Host "[OK] Installed to Startup folder:" -ForegroundColor Green
        Write-Host "    $dest"
    } else {
        Write-Host "ERROR: Failed to copy to Startup folder" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "The server will now start automatically at next login." -ForegroundColor Cyan
    Write-Host "No reboot needed — just log off and log back in." -ForegroundColor Cyan

} elseif ($Method -eq "Task") {

    # Needs admin for scheduled task
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "ERROR: Scheduled Task method requires Administrator." -ForegroundColor Red
        Write-Host "       Run PowerShell as Administrator and try again." -ForegroundColor Red
        Write-Host "       Or use: -Method Folder (works without admin)" -ForegroundColor Yellow
        exit 1
    }

    # Build XML
    $xmlContent = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal>
      <LogonType>ServiceAccount</LogonType>
      <RunLevel>HighestPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <Enabled>true</Enabled>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions>
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c &quot;$BatchScript&quot;</Arguments>
    </Exec>
  </Actions>
</Task>
"@

    $xmlPath = Join-Path $env:TEMP "hoteltask.xml"
    $xmlContent | Out-File -FilePath $xmlPath -Encoding Unicode

    schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
    schtasks /Create /TN $TaskName /XML $xmlPath /F | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create scheduled task." -ForegroundColor Red
        exit 1
    }

    Write-Host "[OK] Scheduled task created: $TaskName" -ForegroundColor Green
    Write-Host "     The server will start at system boot (before login)." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Gray
Write-Host "  Start now  : Start-Process cmd -ArgumentList '/c start-hotel-windows.bat' -WindowStyle Hidden"
Write-Host "  Stop       : taskkill /F /IM node.exe"
Write-Host "  Remove     : scripts\register-windows-startup.ps1 -Remove"