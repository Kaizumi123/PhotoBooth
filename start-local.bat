@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'http://127.0.0.1:8000/'; & '%~dp0serve-local.ps1'"
pause
