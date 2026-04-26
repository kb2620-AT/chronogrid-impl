@echo off
chcp 65001 >nul 2>&1
echo.
echo  ChronoGrid Hashprotokoll
echo  =========================
echo.
pushd "%~dp0"
python cg-hash.py .
echo.
popd
pause
