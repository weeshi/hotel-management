' ============================================================
' Hotel Management - Silent Launcher (no console window)
' Runs start-hotel-windows.bat in the background.
' Place this file in the Startup folder:
'   shell:startup  (current user)
' ============================================================
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""D:\ERP-Projects\hotel-management\scripts\start-hotel-windows.bat""", 0, False