@echo off
chcp 65001 >nul
title ChronoGrid Doku-Verknuepfung pruefen

echo.
echo ==========================================
echo  ChronoGrid Doku-Verknuepfung (Junction)
echo ==========================================
echo.

set DRIVE_DOCS=C:\Users\bauer\Meine Ablage\ChronoGrid\Alle-Wichtig
set REPO=C:\Users\bauer\OneDrive\Desktop\chronogrid-impl
set REPO_DOCS=%REPO%\ChronoGrid-docs

:: Google Drive Quelle pruefen
if not exist "%DRIVE_DOCS%" (
    echo FEHLER: Quelle nicht gefunden: %DRIVE_DOCS%
    pause
    exit /b 1
)

:: Junction sicherstellen ^(ChronoGrid-docs ist KEIN Kopierziel mehr,
:: sondern eine Windows-Verzeichnis-Junction auf die Google-Drive-Quelle.
:: Wird nicht mehr in Git versioniert, siehe .gitignore.^)
if not exist "%REPO_DOCS%" (
    echo Erstelle Junction ChronoGrid-docs ...
    mklink /J "%REPO_DOCS%" "%DRIVE_DOCS%"
    if errorlevel 1 (
        echo FEHLER: Junction konnte nicht erstellt werden.
        pause
        exit /b 1
    )
    echo OK: Junction erstellt.
) else (
    fsutil reparsepoint query "%REPO_DOCS%" >nul 2>&1
    if errorlevel 1 (
        echo FEHLER: %REPO_DOCS% existiert, ist aber KEINE Junction.
        echo Bitte manuell pruefen, bevor hier weitergemacht wird.
        pause
        exit /b 1
    )
    echo ChronoGrid-docs vorhanden - OK.
)

echo.
echo Fertig. Inhalte kommen live aus Google Drive, kein manueller
echo Kopier- oder Commit-Schritt mehr noetig.
echo.
pause
