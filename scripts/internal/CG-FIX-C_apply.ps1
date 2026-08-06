param(
    [switch]$WhatIf,
    [string]$MonorepoRoot = 'C:\Users\bauer\OneDrive\Desktop\chronogrid-impl\monorepo'
)

$ErrorActionPreference = 'Stop'
$CGUAS_MAX_OLD = '435116774400000000000000'
$CGUAS_MAX_NEW = '435494880000000000000000000'
$BACKUP_DIR    = Join-Path $MonorepoRoot ("CG-FIX-C_backup_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))

function Find-File {
    param([string]$Root, [string]$Pattern)
    Get-ChildItem -Path $Root -Recurse -Filter $Pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|build' } |
        Select-Object -First 1
}

function Edit-File {
    param([string]$Path, [hashtable]$Replacements, [string]$Label)
    $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    $anyFound = $false
    foreach ($old in $Replacements.Keys) {
        $new = $Replacements[$old]
        if ($content.Contains($old)) {
            $count = ([regex]::Matches($content, [regex]::Escape($old))).Count
            Write-Host "  [$Label] GEFUNDEN ($count x):" -ForegroundColor Yellow
            Write-Host "    ALT: $old" -ForegroundColor Red
            Write-Host "    NEU: $new" -ForegroundColor Green
            if (-not $WhatIf) {
                $content = $content.Replace($old, $new)
                $anyFound = $true
            }
        } else {
            Write-Host "  [$Label] nicht gefunden: $($old.Substring(0,[Math]::Min(60,$old.Length)))" -ForegroundColor Magenta
        }
    }
    if ($anyFound) {
        [System.IO.File]::WriteAllText($Path, $content, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "  [$Label] Datei geschrieben." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  CG-FIX Gruppe C  --  CGUAS_MAX 79-Bit -> 89-Bit" -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "  MODUS: DRY-RUN (keine Datei wird geaendert)" -ForegroundColor Yellow
} else {
    Write-Host "  MODUS: LIVE (Dateien werden geaendert)" -ForegroundColor Green
}
Write-Host "  Alt: $CGUAS_MAX_OLD  (79 Bit, ~13.8 Mio. Jahre)" -ForegroundColor Red
Write-Host "  Neu: $CGUAS_MAX_NEW (89 Bit, ~13.8 Mrd. Jahre)" -ForegroundColor Green
Write-Host "  Berechnung: 13.8e9 Jahre x 31557600 s/Jahr x 1e9 ns/s" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# --- Dateien suchen ---

Write-Host "Suche Dateien..." -ForegroundColor Cyan

$cguasFile = Get-ChildItem -Path $MonorepoRoot -Recurse -Filter 'cguas.ts' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'node_modules|\.git' } |
    Select-Object -First 1

if ($cguasFile) {
    Write-Host "  cguas.ts      : $($cguasFile.FullName)" -ForegroundColor Green
} else {
    Write-Host "  cguas.ts      : NICHT GEFUNDEN" -ForegroundColor Red
}

$cosmicFile = Get-ChildItem -Path $MonorepoRoot -Recurse -Filter '*.json' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'node_modules|\.git' } |
    Where-Object { (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue) -match 'cosmic|999999999999999' } |
    Select-Object -First 1

if ($cosmicFile) {
    Write-Host "  Cosmic-Domain : $($cosmicFile.FullName)" -ForegroundColor Green
} else {
    Write-Host "  Cosmic-Domain : nicht gefunden (extent.max wird uebersprungen)" -ForegroundColor Yellow
}

Write-Host ""

# --- Backup ---

if (-not $WhatIf) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    if ($cguasFile)  { Copy-Item $cguasFile.FullName  (Join-Path $BACKUP_DIR $cguasFile.Name) }
    if ($cosmicFile) { Copy-Item $cosmicFile.FullName (Join-Path $BACKUP_DIR $cosmicFile.Name) }
    Write-Host "Backup: $BACKUP_DIR" -ForegroundColor Cyan
    Write-Host ""
}

# --- Edit 1: cguas.ts ---

Write-Host "-- Edit 1: cguas.ts CGUAS_MAX --" -ForegroundColor Cyan
if ($cguasFile) {
    $r1 = @{ "'$CGUAS_MAX_OLD'" = "'$CGUAS_MAX_NEW'" }
    Edit-File -Path $cguasFile.FullName -Replacements $r1 -Label 'cguas.ts'
    # Fallback ohne Quotes
    $r1b = @{ $CGUAS_MAX_OLD = $CGUAS_MAX_NEW }
    Edit-File -Path $cguasFile.FullName -Replacements $r1b -Label 'cguas.ts-bare'
} else {
    Write-Host "  Uebersprungen." -ForegroundColor Yellow
}

# --- Edit 2: Cosmic-Domain extent.max ---

Write-Host ""
Write-Host "-- Edit 2: Cosmic-Domain extent.max --" -ForegroundColor Cyan
if ($cosmicFile) {
    $r2 = @{
        '"999999999999999"'  = "`"$CGUAS_MAX_NEW`""
        "'999999999999999'"  = "'$CGUAS_MAX_NEW'"
        "`"$CGUAS_MAX_OLD`"" = "`"$CGUAS_MAX_NEW`""
        "'$CGUAS_MAX_OLD'"   = "'$CGUAS_MAX_NEW'"
    }
    Edit-File -Path $cosmicFile.FullName -Replacements $r2 -Label 'Cosmic-Domain'
} else {
    Write-Host "  Uebersprungen (nicht gefunden)." -ForegroundColor Yellow
}

# --- Tests ---

if (-not $WhatIf) {
    Write-Host ""
    Write-Host "-- cg-testkit Level 3 --" -ForegroundColor Cyan
    Push-Location $MonorepoRoot
    try {
        node --import tsx/esm packages/cg-testkit/src/cli.ts --level 3 2>&1 | ForEach-Object { Write-Host "  $_" }
    } finally { Pop-Location }

    Write-Host ""
    Write-Host "-- Vitest --" -ForegroundColor Cyan
    Push-Location $MonorepoRoot
    try {
        npx vitest run --globals 2>&1 | Select-Object -Last 10 | ForEach-Object { Write-Host "  $_" }
    } finally { Pop-Location }
}

# --- Summary ---

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "  DRY-RUN fertig -- keine Datei geaendert." -ForegroundColor Yellow
    Write-Host "  Ohne -WhatIf ausfuehren um Aenderungen anzuwenden." -ForegroundColor Yellow
} else {
    Write-Host "  Gruppe C Code-Edits abgeschlossen." -ForegroundColor Green
    Write-Host "  Naechster Schritt: Tests gruen? -> Docs 79->89 Bit anpassen." -ForegroundColor Cyan
}
Write-Host "  CGUAS_MAX neu : $CGUAS_MAX_NEW" -ForegroundColor Green
Write-Host "  Bits          : 89 (war 79)" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
