# ChronoGrid - Doku-Verknuepfung sicherstellen
# Terminal: .\update_chronogrid_docs.ps1
#
# ChronoGrid-docs ist eine Windows-Verzeichnis-Junction auf die
# Google-Drive-Quelle (kein Kopierziel mehr) und wird NICHT in Git
# versioniert (siehe .gitignore). Dieses Skript kopiert nichts mehr
# und committet nichts - es stellt nur sicher, dass die Junction
# existiert und korrekt zeigt.

$DRIVE_DOCS = "C:\Users\bauer\Meine Ablage\ChronoGrid\Alle-Wichtig"
$REPO       = "C:\Users\bauer\OneDrive\Desktop\chronogrid-impl"
$REPO_DOCS  = Join-Path $REPO "ChronoGrid-docs"

Write-Host ""
Write-Host "ChronoGrid Doku-Verknuepfung" -ForegroundColor Cyan
Write-Host "======================================="
Write-Host ""

if (-not (Test-Path $DRIVE_DOCS)) {
    Write-Host "FEHLER: Quelle nicht gefunden: $DRIVE_DOCS" -ForegroundColor Red
    exit 1
}

$item = Get-Item -Path $REPO_DOCS -ErrorAction SilentlyContinue
if (-not $item) {
    Write-Host "Erstelle Junction ChronoGrid-docs ..." -ForegroundColor Yellow
    New-Item -ItemType Junction -Path $REPO_DOCS -Target $DRIVE_DOCS | Out-Null
    Write-Host "OK: Junction erstellt." -ForegroundColor Green
} elseif ($item.LinkType -ne "Junction") {
    Write-Host "WARNUNG: $REPO_DOCS existiert, ist aber KEINE Junction (Typ: $($item.GetType().Name))." -ForegroundColor Red
    Write-Host "Bitte manuell pruefen, bevor hier weitergemacht wird." -ForegroundColor Red
    exit 1
} else {
    Write-Host "ChronoGrid-docs vorhanden und verknuepft mit:" -ForegroundColor Green
    Write-Host "  $($item.Target)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Hinweis: Inhalte kommen live aus Google Drive, kein Kopier-" -ForegroundColor DarkGray
Write-Host "oder Commit-Schritt mehr noetig." -ForegroundColor DarkGray
Write-Host ""
Read-Host "Druecke Enter zum Schliessen"
