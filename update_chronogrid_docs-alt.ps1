# ChronoGrid - Dokumentupdate Script
# Terminal: .\update_chronogrid_docs.ps1

# Google Drive Quellen
$DRIVE_DOCS   = "G:\Meine Ablage\ChronoGrid\Alle-Wichtig"
$DRIVE_ZUSATZ = "G:\Meine Ablage\ChronoGrid\wichtige Zusatzdokumente"

# Git-Repo Ziele
$REPO         = "C:\Users\bauer\OneDrive\Desktop\chronogrid-impl"
$REPO_DOCS    = "C:\Users\bauer\OneDrive\Desktop\chronogrid-impl\ChronoGrid-docs"


$BRANCH = "main"
$DATE   = Get-Date -Format "yyyy-MM-dd"
$MSG    = "docs: Sync from Google Drive ($DATE)"

Write-Host ""
Write-Host "ChronoGrid Dokumentupdate" -ForegroundColor Cyan
Write-Host "======================================="
Write-Host ""

# Pruefen ob Google Drive erreichbar
if (-not (Test-Path $DRIVE_DOCS)) {
    Write-Host "FEHLER: Google Drive nicht gefunden: $DRIVE_DOCS" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $DRIVE_ZUSATZ)) {
    Write-Host "FEHLER: Google Drive nicht gefunden: $DRIVE_ZUSATZ" -ForegroundColor Red
    exit 1
}

# Zielordner anlegen falls nicht vorhanden
if (-not (Test-Path $REPO_DOCS))   { New-Item -ItemType Directory -Path $REPO_DOCS   | Out-Null }
if (-not (Test-Path $REPO_ZUSATZ)) { New-Item -ItemType Directory -Path $REPO_ZUSATZ | Out-Null }

# Schritt 1: ChronoGrid-docs synchronisieren
Write-Host "[ 1/4 ] ChronoGrid-docs von Google Drive kopieren..." -ForegroundColor Yellow
$files = Get-ChildItem -Path $DRIVE_DOCS -Filter "*.docx"
$count = 0
foreach ($file in $files) {
    Copy-Item $file.FullName (Join-Path $REPO_DOCS $file.Name) -Force
    Write-Host "  OK: $($file.Name)" -ForegroundColor Green
    $count++
}
Write-Host "  $count Dateien kopiert." -ForegroundColor Cyan

# Schritt 2: wichtige Zusatzdokumente synchronisieren
Write-Host ""
Write-Host "[ 2/4 ] Wichtige Zusatzdokumente von Google Drive kopieren..." -ForegroundColor Yellow
$files2 = Get-ChildItem -Path $DRIVE_ZUSATZ
$count2 = 0
foreach ($file in $files2) {
    Copy-Item $file.FullName (Join-Path $REPO_ZUSATZ $file.Name) -Force
    Write-Host "  OK: $($file.Name)" -ForegroundColor Green
    $count2++
}
Write-Host "  $count2 Dateien kopiert." -ForegroundColor Cyan

# Schritt 3: git pull
Write-Host ""
Write-Host "[ 3/4 ] git pull..." -ForegroundColor Yellow
Set-Location $REPO
git pull origin $BRANCH

# Schritt 4: git add / commit / push
Write-Host ""
Write-Host "[ 4/4 ] Git commit und push..." -ForegroundColor Yellow
git add "ChronoGrid-docs/"
git add "ChronoGrid-wichtige Zusatzdokumente/"

$changes = git status --porcelain
if ($changes -ne $null) {
    git commit -m $MSG
    git push origin $BRANCH
    Write-Host ""
    Write-Host "======================================="
    Write-Host " Fertig! GitHub ist aktuell." -ForegroundColor Green
    Write-Host "======================================="
} else {
    Write-Host "Keine Aenderungen. GitHub bereits aktuell." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Druecke Enter zum Schliessen"
