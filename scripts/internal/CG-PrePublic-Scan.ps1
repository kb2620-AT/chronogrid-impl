# CG-PrePublic-Scan.ps1
# Pre-Public Checklist Scanner fuer chronogrid-impl
# Ausfuehren: powershell -ExecutionPolicy Bypass -File CG-PrePublic-Scan.ps1
# Ausgabe: CG-PrePublic-Report.txt im selben Verzeichnis

$RepoRoot = "C:\Users\bauer\OneDrive\Desktop\chronogrid-impl"
$ReportFile = "$PSScriptRoot\CG-PrePublic-Report.txt"
$Findings = @()
$Warnings = @()
$OK = @()

function Add-Finding($cat, $sev, $msg, $file) {
    $Findings += [PSCustomObject]@{ Category=$cat; Severity=$sev; Message=$msg; File=$file }
}

Write-Host "ChronoGrid Pre-Public Scanner gestartet..." -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ""

# ---------------------------------------------------------------
# 1. PERSOENLICHE DATEN / SECRETS
# ---------------------------------------------------------------
Write-Host "[1/7] Pruefe persoenliche Daten und Secrets..." -ForegroundColor Yellow

$SecretPatterns = @(
    @{ Pattern = 'password\s*=\s*[''"][^''"]{3,}'; Label = "Passwort (hardkodiert)" },
    @{ Pattern = 'secret\s*=\s*[''"][^''"]{3,}'; Label = "Secret (hardkodiert)" },
    @{ Pattern = 'JWT_SECRET\s*=\s*[''"][^''"]{3,}'; Label = "JWT Secret" },
    @{ Pattern = 'DATABASE_URL\s*=\s*[''"][^''"]{3,}'; Label = "Datenbank-URL mit Credentials" },
    @{ Pattern = 'postgres://[^@]+@'; Label = "PostgreSQL Connection String" },
    @{ Pattern = 'api[_-]?key\s*=\s*[''"][^''"]{8,}'; Label = "API Key" },
    @{ Pattern = 'private[_-]?key'; Label = "Private Key Referenz" },
    @{ Pattern = '-----BEGIN (RSA |EC )?PRIVATE KEY'; Label = "Privater Schluessel (PEM)" },
    @{ Pattern = 'ghp_[A-Za-z0-9]{36}'; Label = "GitHub Personal Access Token" },
    @{ Pattern = 'sk-[A-Za-z0-9]{32,}'; Label = "API Secret Key (Format)" },
    @{ Pattern = 'bauer@'; Label = "E-Mail-Adresse (bauer@...)" },
    @{ Pattern = 'kurt@'; Label = "E-Mail-Adresse (kurt@...)" },
    @{ Pattern = 'C:\\Users\\bauer'; Label = "Lokaler Windows-Pfad" },
    @{ Pattern = '/Users/bauer'; Label = "Lokaler Unix-Pfad" },
    @{ Pattern = '\b192\.168\.\d+\.\d+\b'; Label = "Private IP-Adresse" },
    @{ Pattern = '\b10\.\d+\.\d+\.\d+\b'; Label = "Private IP-Adresse (10.x)" },
    @{ Pattern = 'localhost:\d{4,5}'; Label = "Localhost-Port (ggf. intern)" },
    @{ Pattern = 'Neunkirchen'; Label = "Ortsangabe Neunkirchen" },
    @{ Pattern = 'Kurt Bauer'; Label = "Vollstaendiger Name" }
)

$ScanExtensions = @('*.ts','*.js','*.json','*.md','*.env','*.yml','*.yaml',
                     '*.sql','*.py','*.sh','*.ps1','*.txt','*.toml','*.config')

$ExcludeDirs = @('node_modules','.git','dist','build','.pnpm-store')

Get-ChildItem -Path $RepoRoot -Recurse -Include $ScanExtensions -File |
Where-Object {
    $skip = $false
    foreach ($ex in $ExcludeDirs) {
        if ($_.FullName -like "*\$ex\*") { $skip = $true; break }
    }
    -not $skip
} | ForEach-Object {
    $file = $_
    $rel = $file.FullName.Replace($RepoRoot + "\", "")
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return }

    foreach ($p in $SecretPatterns) {
        if ($content -match $p.Pattern) {
            $sev = if ($p.Label -match "Passwort|Secret|Key|Token|PEM|Connection") { "KRITISCH" } else { "PRUEFEN" }
            Add-Finding "Persoenliche Daten / Secrets" $sev $p.Label $rel
        }
    }
}

# ---------------------------------------------------------------
# 2. .ENV DATEIEN
# ---------------------------------------------------------------
Write-Host "[2/7] Pruefe .env Dateien..." -ForegroundColor Yellow

Get-ChildItem -Path $RepoRoot -Recurse -Filter ".env" -File |
Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*.git*" } |
ForEach-Object {
    Add-Finding ".env Datei" "KRITISCH" ".env Datei gefunden (darf NICHT public sein)" $_.FullName.Replace($RepoRoot+"\","")
}
Get-ChildItem -Path $RepoRoot -Recurse -Filter ".env.*" -File |
Where-Object { $_.FullName -notlike "*node_modules*" -and $_.Name -ne ".env.example" } |
ForEach-Object {
    Add-Finding ".env Datei" "KRITISCH" "$($_.Name) gefunden" $_.FullName.Replace($RepoRoot+"\","")
}

# ---------------------------------------------------------------
# 3. GITIGNORE PRUEFEN
# ---------------------------------------------------------------
Write-Host "[3/7] Pruefe .gitignore..." -ForegroundColor Yellow

$gitignore = Join-Path $RepoRoot ".gitignore"
if (Test-Path $gitignore) {
    $gi = Get-Content $gitignore -Raw
    $required = @(".env", "node_modules", "dist", "*.log", ".pnpm-store")
    foreach ($r in $required) {
        if ($gi -notmatch [regex]::Escape($r)) {
            Add-Finding ".gitignore" "WARNUNG" "'$r' fehlt in .gitignore" ".gitignore"
        }
    }
    $OK += ".gitignore vorhanden"
} else {
    Add-Finding ".gitignore" "KRITISCH" ".gitignore fehlt vollstaendig" "(Root)"
}

# ---------------------------------------------------------------
# 4. GROSSE DATEIEN (>5 MB)
# ---------------------------------------------------------------
Write-Host "[4/7] Pruefe grosse Dateien (> 5 MB)..." -ForegroundColor Yellow

Get-ChildItem -Path $RepoRoot -Recurse -File |
Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*.git*" -and $_.Length -gt 5MB } |
ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 1)
    Add-Finding "Grosse Datei" "WARNUNG" "$mb MB -- ggf. Git LFS verwenden" $_.FullName.Replace($RepoRoot+"\","")
}

# ---------------------------------------------------------------
# 5. BINARY / DOCX / PDF IM CODE-BEREICH
# ---------------------------------------------------------------
Write-Host "[5/7] Pruefe Binaerdateien im Code-Bereich..." -ForegroundColor Yellow

Get-ChildItem -Path $RepoRoot -Recurse -Include @('*.docx','*.pdf','*.xlsx','*.zip') -File |
Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*.git*" -and $_.FullName -notlike "*\docs\*" } |
ForEach-Object {
    Add-Finding "Binaerdatei ausserhalb /docs" "PRUEFEN" "Binaerdatei ausserhalb /docs Ordner" $_.FullName.Replace($RepoRoot+"\","")
}

# ---------------------------------------------------------------
# 6. GIT LOG -- AUTOREN UND E-MAILS
# ---------------------------------------------------------------
Write-Host "[6/7] Pruefe git log auf Autoren/E-Mails..." -ForegroundColor Yellow

try {
    $gitLog = & git -C $RepoRoot log --format="%ae %an" 2>$null | Sort-Object -Unique
    foreach ($line in $gitLog) {
        Add-Finding "Git Autor" "INFO" "Commit-Autor sichtbar: $line" "git log"
    }
} catch {
    Add-Finding "Git Log" "WARNUNG" "git nicht verfuegbar oder kein Repository" "(Root)"
}

# ---------------------------------------------------------------
# 7. BEKANNTE PROBLEMPFADE
# ---------------------------------------------------------------
Write-Host "[7/7] Pruefe bekannte Problempfade..." -ForegroundColor Yellow

$problemPaths = @(
    "conformance-report.json",
    "cg_verify.py",
    ".github\workflows\chronogrid-ci.yml"
)
foreach ($p in $problemPaths) {
    $full = Join-Path $RepoRoot $p
    if (Test-Path $full) {
        $OK += "$p vorhanden (erwartet)"
    } else {
        Add-Finding "Erwartete Datei fehlt" "INFO" "$p nicht gefunden (FIX-20d?)" $p
    }
}

# ---------------------------------------------------------------
# REPORT AUSGABE
# ---------------------------------------------------------------
$lines = @()
$lines += "=" * 70
$lines += "ChronoGrid Pre-Public Scan Report"
$lines += "Datum: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$lines += "Repo:  $RepoRoot"
$lines += "=" * 70
$lines += ""

$kritisch = $Findings | Where-Object { $_.Severity -eq "KRITISCH" }
$warnung   = $Findings | Where-Object { $_.Severity -eq "WARNUNG" }
$pruefen   = $Findings | Where-Object { $_.Severity -eq "PRUEFEN" }
$info      = $Findings | Where-Object { $_.Severity -eq "INFO" }

$lines += "ZUSAMMENFASSUNG"
$lines += "-" * 40
$lines += "  KRITISCH : $($kritisch.Count)  (vor Go-Public beheben)"
$lines += "  WARNUNG  : $($warnung.Count)   (dringend pruefen)"
$lines += "  PRUEFEN  : $($pruefen.Count)   (manuell entscheiden)"
$lines += "  INFO     : $($info.Count)      (zur Kenntnis)"
$lines += ""

if ($kritisch.Count -gt 0) {
    $lines += ">>> KRITISCH -- VOR GO-PUBLIC BEHEBEN <<<"
    $lines += "-" * 40
    foreach ($f in $kritisch) {
        $lines += "  [$($f.Category)] $($f.Message)"
        $lines += "    Datei: $($f.File)"
    }
    $lines += ""
}

if ($warnung.Count -gt 0) {
    $lines += ">>> WARNUNG <<<"
    $lines += "-" * 40
    foreach ($f in $warnung) {
        $lines += "  [$($f.Category)] $($f.Message)"
        $lines += "    Datei: $($f.File)"
    }
    $lines += ""
}

if ($pruefen.Count -gt 0) {
    $lines += ">>> PRUEFEN (manuelle Entscheidung) <<<"
    $lines += "-" * 40
    foreach ($f in $pruefen) {
        $lines += "  [$($f.Category)] $($f.Message)"
        $lines += "    Datei: $($f.File)"
    }
    $lines += ""
}

if ($info.Count -gt 0) {
    $lines += ">>> INFO <<<"
    $lines += "-" * 40
    foreach ($f in $info) {
        $lines += "  $($f.Message)"
    }
    $lines += ""
}

$lines += ">>> OK <<<"
$lines += "-" * 40
foreach ($o in $OK) { $lines += "  OK: $o" }
$lines += ""
$lines += "=" * 70
$lines += "HANDLUNGSEMPFEHLUNGEN"
$lines += "=" * 70
$lines += ""
$lines += "KRITISCH-Befunde:"
$lines += "  .env Dateien     -> in .gitignore eintragen, aus git history entfernen"
$lines += "                      (git filter-repo oder BFG Repo Cleaner)"
$lines += "  Hardkodierte Secrets -> durch Umgebungsvariablen ersetzen"
$lines += "  PEM-Schluessel   -> sofort rotieren, aus history entfernen"
$lines += ""
$lines += "PRUEFEN-Befunde (persoenliche Daten):"
$lines += "  kurt@chronogrid.at  -> in README und CONTRIBUTING.md bewusst oeffentlich -- OK"
$lines += "  Neunkirchen NÖ      -> in README bewusst oeffentlich -- OK"
$lines += "  Kurt Bauer          -> in README/Lizenz bewusst oeffentlich -- OK"
$lines += "  C:\Users\bauer\...  -> lokale Pfade in .md/.docx duerfen NICHT im Code sein"
$lines += "                         Im Briefing-DOCX: nicht im Repo einchecken"
$lines += ""
$lines += "Git Autoren (INFO):"
$lines += "  Deine E-Mail-Adresse ist in der git history sichtbar."
$lines += "  Falls du eine andere E-Mail verwenden moechtest:"
$lines += "    git config user.email 'kurt@chronogrid.at'"
$lines += "  Die history laesst sich vor Go-Public mit git filter-repo bereinigen."
$lines += ""
$lines += "Grosse Dateien (WARNUNG):"
$lines += "  Git LFS einrichten: git lfs track '*.pdf' '*.docx'"
$lines += "  Dann: git add .gitattributes && git commit"
$lines += ""
$lines += "=" * 70
$lines += "CHECKLISTE VOR GO-PUBLIC"
$lines += "=" * 70
$lines += "  [ ] Alle KRITISCH-Befunde behoben"
$lines += "  [ ] .gitignore vollstaendig (.env, node_modules, dist, *.log)"
$lines += "  [ ] README.md im Root vorhanden"
$lines += "  [ ] CONTRIBUTING.md im Root vorhanden"
$lines += "  [ ] LICENSE-APACHE und LICENSE-CC im Root vorhanden"
$lines += "  [ ] .github/workflows/chronogrid-ci.yml committed (FIX-20d)"
$lines += "  [ ] Keine DOCX/PDF-Briefings im Code-Bereich eingecheckt"
$lines += "  [ ] git config user.email gesetzt (kurt@chronogrid.at)"
$lines += "  [ ] pnpm install + pnpm build lokal gruen"
$lines += "  [ ] tsx packages/cg-testkit/src/cli.ts --level 3 -> 229/229"
$lines += "  [ ] npx vitest run --globals -> 80/80"
$lines += "  [ ] GitHub Repository auf 'Public' stellen"
$lines += "  [ ] CI (GitHub Actions) manuell triggern und pruefen"
$lines += ""
$lines += "Scan abgeschlossen: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

$lines | Out-File -FilePath $ReportFile -Encoding UTF8
$lines | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Report gespeichert: $ReportFile" -ForegroundColor Green
