# ChronoGrid - Doku-Verknuepfungen sicherstellen (docs + Zusatzdokumente)
# Terminal: .\update_chronogrid_docs-alt.ps1
#
# ChronoGrid-docs und ChronoGrid-wichtige Zusatzdokumente sind Windows-
# Verzeichnis-Junctions auf die Google-Drive-Quellen (kein Kopierziel
# mehr) und werden NICHT in Git versioniert (siehe .gitignore). Dieses
# Skript kopiert nichts mehr und committet nichts - es stellt nur
# sicher, dass beide Junctions existieren und korrekt zeigen.

$DRIVE_DOCS   = "C:\Users\bauer\Meine Ablage\ChronoGrid\Alle-Wichtig"
$DRIVE_ZUSATZ = "C:\Users\bauer\Meine Ablage\ChronoGrid\Wichtige Zusatzdokumente"

$REPO         = "C:\Users\bauer\OneDrive\Desktop\chronogrid-impl"
$REPO_DOCS    = Join-Path $REPO "ChronoGrid-docs"
$REPO_ZUSATZ  = Join-Path $REPO "ChronoGrid-wichtige Zusatzdokumente"

Write-Host ""
Write-Host "ChronoGrid Doku-Verknuepfungen" -ForegroundColor Cyan
Write-Host "======================================="
Write-Host ""

function Ensure-Junction {
    param(
        [string]$Name,
        [string]$RepoPath,
        [string]$DrivePath
    )

    if (-not (Test-Path $DrivePath)) {
        Write-Host "FEHLER: Quelle nicht gefunden: $DrivePath" -ForegroundColor Red
        return $false
    }

    $item = Get-Item -Path $RepoPath -ErrorAction SilentlyContinue
    if (-not $item) {
        Write-Host "Erstelle Junction $Name ..." -ForegroundColor Yellow
        New-Item -ItemType Junction -Path $RepoPath -Target $DrivePath | Out-Null
        Write-Host "OK: Junction erstellt." -ForegroundColor Green
    } elseif ($item.LinkType -ne "Junction") {
        Write-Host "WARNUNG: $RepoPath existiert, ist aber KEINE Junction." -ForegroundColor Red
        Write-Host "Bitte manuell pruefen, bevor hier weitergemacht wird." -ForegroundColor Red
        return $false
    } else {
        Write-Host "$Name vorhanden und verknuepft mit:" -ForegroundColor Green
        Write-Host "  $($item.Target)" -ForegroundColor Green
    }
    return $true
}

Write-Host "[ 1/2 ] ChronoGrid-docs" -ForegroundColor Yellow
$okDocs = Ensure-Junction -Name "ChronoGrid-docs" -RepoPath $REPO_DOCS -DrivePath $DRIVE_DOCS

Write-Host ""
Write-Host "[ 2/2 ] ChronoGrid-wichtige Zusatzdokumente" -ForegroundColor Yellow
$okZusatz = Ensure-Junction -Name "ChronoGrid-wichtige Zusatzdokumente" -RepoPath $REPO_ZUSATZ -DrivePath $DRIVE_ZUSATZ

if (-not ($okDocs -and $okZusatz)) {
    exit 1
}

Write-Host ""
Write-Host "Hinweis: Inhalte kommen live aus Google Drive, kein Kopier-" -ForegroundColor DarkGray
Write-Host "oder Commit-Schritt mehr noetig." -ForegroundColor DarkGray
Write-Host ""
Read-Host "Druecke Enter zum Schliessen"
