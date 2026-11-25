@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion
title Watchparty 1-Click Stream Controller
color 0E

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:MENU
cls
echo =========================================================
echo    WATCHPARTY 1-CLICK STREAM CONTROLLER
echo =========================================================
echo.
echo  [1] Instant Test Stream (Play sample video now)
echo  [2] 1-Time iWant Login (Save credentials safely)
echo  [3] Schedule a Stream (Enter showtime e.g. 20:30)
echo  [4] Stream Custom URL Now
echo  [5] Exit
echo.
echo =========================================================
set "choice="
set /p choice="Select an option (1-5): "

if "%choice%"=="1" goto TEST_STREAM
if "%choice%"=="2" goto LOGIN_IWANT
if "%choice%"=="3" goto SCHEDULE_STREAM
if "%choice%"=="4" goto STREAM_NOW
if "%choice%"=="5" goto EXIT
goto MENU

:TEST_STREAM
cls
echo [Launching Instant Test Stream...]
node tools\autoStream.js --test
echo.
echo Press any key to return to menu...
pause >nul
goto MENU

:LOGIN_IWANT
cls
echo =========================================================
echo    1-TIME IWANT LOGIN SETUP
echo =========================================================
echo.
echo A dedicated browser window will open to iWantTFC.
echo Please log into your account.
echo.
echo Your login session and Widevine DRM keys will be
echo safely remembered for future automated watchparties.
echo.
echo Once logged in, simply close the browser window.
echo =========================================================
echo.
node tools\autoStream.js --login
echo.
echo Setup finished! Press any key to return to menu...
pause >nul
goto MENU

:SCHEDULE_STREAM
cls
echo =========================================================
echo    SCHEDULE A WATCHPARTY STREAM
echo =========================================================
echo.
set "stream_url="
set "show_time="
set /p stream_url="Enter Stream URL (or press Enter for test stream): "
set /p show_time="Enter Showtime in 24-hr format (e.g. 20:30): "

if "%show_time%"=="" (
    echo [ERROR] Showtime cannot be empty!
    pause
    goto SCHEDULE_STREAM
)

echo.
echo Keeping PC awake and waiting for showtime...
if "%stream_url%"=="" (
    node tools\autoStream.js --test --time %show_time%
) else (
    node tools\autoStream.js --url "%stream_url%" --time %show_time%
)
echo.
pause
goto MENU

:STREAM_NOW
cls
echo =========================================================
echo    PLAY STREAM IMMEDIATELY
echo =========================================================
echo.
set "stream_url="
set /p stream_url="Enter Stream URL: "
if "%stream_url%"=="" (
    node tools\autoStream.js --test
) else (
    node tools\autoStream.js --url "%stream_url%" --now
)
echo.
pause
goto MENU

:EXIT
cls
echo Goodbye!
timeout /t 1 >nul
exit /b 0