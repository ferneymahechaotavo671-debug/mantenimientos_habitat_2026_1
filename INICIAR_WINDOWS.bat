@echo off
chcp 65001 >nul
echo.
echo  ================================================
echo   HABITAT INTEGRAL PH - Sistema de Mantenimientos
echo  ================================================
echo.
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Node.js no esta instalado.
    echo  Descargue desde: https://nodejs.org  (version LTS)
    pause & exit /b 1
)
if not exist "node_modules" (
    echo  Instalando dependencias por primera vez...
    npm install
    echo.
)
echo  Abriendo navegador...
timeout /t 2 /nobreak >nul
start http://localhost:3000
echo.
echo  Sistema disponible en: http://localhost:3000
echo  Presione Ctrl+C para detener el servidor.
echo.
node server.js
pause
