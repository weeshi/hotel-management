@echo off
REM ============================================================
REM  Hotel Management - Windows Auto-Start Launcher
REM  Starts the dev server (port 3210) in the background
REM  and logs output to dev-server.log.
REM  Used by the scheduled task (see register-windows-startup.ps1)
REM ============================================================
setlocal
cd /d "D:\ERP-Projects\hotel-management"

REM Redirect npm output to log file so the window stays clean
call npm run dev > dev-server.log 2>&1

endlocal