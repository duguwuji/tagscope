@echo off
cd /d %~dp0
rem Wait for the bridge to start listening before opening the browser.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server.js
pause
