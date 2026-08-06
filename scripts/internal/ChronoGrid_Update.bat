@echo off
chcp 65001 >nul
title ChronoGrid Dokumentupdate

echo.
echo ==========================================
echo  ChronoGrid Dokumentupdate
echo ==========================================
echo.

set DRIVE_DOCS=G:\Meine Ablage\ChronoGrid\Alle-Wichtig
set REPO=C:\Users\bauer\OneDrive\Desktop\chronogrid-impl
set REPO_DOCS=C:\Users\bauer\OneDrive\Desktop\chronogrid-impl\ChronoGrid-docs

:: Google Drive pruefen
if not exist "%DRIVE_DOCS%" (
    echo FEHLER: Google Drive nicht gefunden: %DRIVE_DOCS%
    pause
    exit /b 1
)

:: Zielordner anlegen falls nicht vorhanden
if not exist "%REPO_DOCS%" mkdir "%REPO_DOCS%"

:: Schritt 1: Alle Dateien aus /200426 kopieren
echo [ 1/3 ] Dateien von Google Drive kopieren...
set count=0
for %%f in ("%DRIVE_DOCS%\*.*") do (
    copy /Y "%%f" "%REPO_DOCS%\%%~nxf" >nul
    echo   OK: %%~nxf
    set /a count+=1
)
echo   Fertig - Dateien kopiert.
echo.

:: Schritt 2: git pull
echo [ 2/3 ] git pull...
cd /d "%REPO%"
git pull origin main
echo.

:: Schritt 3: git commit und push
echo [ 3/3 ] Git commit und push...
git add "ChronoGrid-docs/"

git diff --cached --quiet
if %errorlevel% neq 0 (
    for /f "tokens=2 delims==" %%d in ('wmic os get localdatetime /value') do set dt=%%d
    set datum=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%
    git commit -m "docs: Sync from Google Drive (%datum%)"
    git push origin main
    echo.
    echo ==========================================
    echo  Fertig! GitHub ist aktuell.
    echo ==========================================
) else (
    echo Keine Aenderungen. GitHub bereits aktuell.
)

echo.
pause
