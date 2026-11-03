@echo off
rem Order Plaza saytini kompyuterda ochish: Vite server ishga tushadi va brauzer ochiladi (Node.js kerak)
cd /d "%~dp0"
if not exist node_modules call npm install
start "Order Plaza server" /min cmd /c npm run dev
timeout /t 4 >nul
start "" http://localhost:8765/
