<#
.SYNOPSIS
  ChronoGrid CG-FIX - lokale Verifikation und Commit.
  Bildet die drei CI-Jobs aus cg-normative-tests.yml lokal nach:
    1) Level-3 In-Process  (conformance.ts --level 3)
    2) CGUA + ARITH Vitest
    3) Black-box API gegen echtes PostgreSQL (Docker)
  Committet NUR, wenn alle Tore gruen sind. Push nach main nur mit -Push.

.BEISPIELE
  # Vollstaendig (vitest + in-process + black-box), lokal committen, nicht pushen:
  .\cg-verify-and-commit.ps1

  # Ohne black-box (kein Docker/PostgreSQL noetig), nur Tore 1+2:
  .\cg-verify-and-commit.ps1 -SkipBlackBox

  # Vollstaendig + nach main pushen (mit Rueckfrage):
  .\cg-verify-and-commit.ps1 -Push

.HINWEISE
  - Voraussetzungen: node 22, pnpm 9, git. Fuer black-box zusaetzlich Docker.
  - OneDrive: vor git-Operationen Sync abwarten; .npmrc (shamefully-hoist) wird sichergestellt.
  - JWT_SECRET ist lokal nicht noetig: die gepatchte auth.ts erzeugt im Dev-Modus ein
    ephemeres Secret pro Prozess (Token werden im selben Prozess ausgestellt+geprueft).
#>
#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$MonorepoRoot = "C:\Users\bauer\OneDrive\Desktop\chronogrid-impl\monorepo",
  [int]   $ApiPort      = 3000,
  [string]$BindHost     = "127.0.0.1",
  [string]$PgHost       = "localhost",
  [int]   $PgPort       = 5432,
  [string]$PgDatabase   = "chronogrid",
  [string]$PgUser       = "cg_user",
  [string]$PgPassword   = "cg_secret",
  [string]$PgService    = "postgres",
  [switch]$SkipInstall,
  [switch]$SkipBlackBox,
  [switch]$KeepDocker,
  [switch]$Push,
  [switch]$Yes,
  [string]$Branch       = "main",
  [string]$CommitMessage = "CG-FIX E1-E4: ARITH UNBOUNDED + Insert-only/Trigger + JWT-Secret fail-fast + CG-E-012 (verifiziert: vitest + in-process + black-box)"
)

$ErrorActionPreference = "Stop"
$script:ApiProcess = $null

function Step([string]$msg){ Write-Host "`n========== $msg ==========" -ForegroundColor Cyan }
function Ok([string]$msg){ Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Info([string]$msg){ Write-Host "  [INFO] $msg" -ForegroundColor DarkGray }
function Need([string]$tool){ if(-not (Get-Command $tool -ErrorAction SilentlyContinue)){ throw "Werkzeug nicht gefunden: $tool" } }

function Invoke-Gate([string]$Name,[scriptblock]$Action){
  Step "TOR: $Name"
  & $Action
  if($LASTEXITCODE -ne 0){ throw "TOR FEHLGESCHLAGEN: $Name (ExitCode $LASTEXITCODE) - kein Commit." }
  Ok "Tor bestanden: $Name"
}

function Stop-Api {
  if($script:ApiProcess -and -not $script:ApiProcess.HasExited){
    Info "Stoppe Registry-API (PID $($script:ApiProcess.Id))"
    try{ Stop-Process -Id $script:ApiProcess.Id -Force -ErrorAction SilentlyContinue }catch{}
  }
}

# FIX: Robuste PostgreSQL-Bereitschaftspruefung via TCP-Verbindungsversuch.
# docker compose exec setzt unter Windows $LASTEXITCODE nicht zuverlaessig;
# ein direkter TCP-Connect auf Port 5432 ist plattformunabhaengig und korrekt.
function Wait-Postgres([string]$PgTcpHost,[int]$Port,[int]$MaxSeconds=60){
  for($i=1; $i -le $MaxSeconds; $i++){
    try{
      $tcp = New-Object System.Net.Sockets.TcpClient
      $tcp.Connect($PgTcpHost, $Port)
      $tcp.Close()
      # TCP offen: PostgreSQL-Prozess laeuft. Kurz warten fuer DB-Init.
      Start-Sleep -Milliseconds 500
      return $true
    }catch{ }
    Start-Sleep -Seconds 1
  }
  return $false
}

# FIX: Datenbank anlegen falls nicht vorhanden (erster Lauf / frischer Container).
# Verwendet docker exec direkt (nicht docker compose exec) um stderr-Warnungen zu vermeiden.
function Ensure-Database([string]$PgSvc,[string]$User,[string]$Db){
  # DB wird automatisch durch POSTGRES_DB in docker-compose.yml angelegt.
  # Diese Funktion prueft nur, ob psql erreichbar ist (Sanity-Check).
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try {
    $cid = (docker compose ps -q $PgSvc 2>$null) -join ''
    if(-not $cid){ throw "Container nicht gefunden fuer Service '$PgSvc'" }
    $result = (docker exec -i $cid psql -U $User -d $Db -tAc "SELECT 1;" 2>&1) -join ''
    if($result -match "1"){
      Info "Datenbank '$Db' erreichbar (User: $User)."
    } else {
      Info "Datenbank-Sanity-Check: $result -- fahre fort."
    }
  } catch {
    Info "Ensure-Database Warnung: $($_.Exception.Message) -- fahre fort."
  } finally {
    $ErrorActionPreference = $prev
  }
}

try {
  # --- Vorbereitung ---
  Step "Vorbereitung"
  if(-not (Test-Path $MonorepoRoot)){ throw "Monorepo-Wurzel nicht gefunden: $MonorepoRoot" }
  Set-Location $MonorepoRoot
  Need node; Need git
  if(-not (Get-Command pnpm -ErrorAction SilentlyContinue)){ throw "pnpm nicht gefunden (npm i -g pnpm@9)" }
  Info ("node     : " + (node --version))
  Info ("pnpm     : " + (pnpm --version))
  if(-not (Test-Path "packages\cg-testkit\src\conformance.ts")){ throw "conformance.ts nicht gefunden - stimmt MonorepoRoot ($MonorepoRoot)?" }

  # .npmrc-Fix gegen OneDrive-Symlink-Probleme sicherstellen
  $npmrc = Join-Path $MonorepoRoot ".npmrc"
  if(-not (Test-Path $npmrc) -or -not (Select-String -Path $npmrc -Pattern "shamefully-hoist" -Quiet)){
    [System.IO.File]::WriteAllText($npmrc, "shamefully-hoist=true`n")
    Info ".npmrc gesetzt (shamefully-hoist=true)"
  }

  if(-not $SkipInstall){
    Invoke-Gate "pnpm install" { pnpm install --no-frozen-lockfile }
  } else { Info "pnpm install uebersprungen (-SkipInstall)" }

  # --- TOR 1: Level-3 In-Process (conformance.ts) ---
  Invoke-Gate "Level-3 In-Process" {
    node --import tsx/esm packages\cg-testkit\src\conformance.ts --level 3 --report
  }

  # --- TOR 2: CGUA + ARITH Vitest ---
  Invoke-Gate "CGUA Vitest" {
    Push-Location (Join-Path $MonorepoRoot "packages\cg-cguas")
    try { npx vitest run --globals src\cgua.test.ts } finally { Pop-Location }
  }
  Invoke-Gate "ARITH Vitest" {
    Push-Location (Join-Path $MonorepoRoot "packages\cg-engine")
    try { npx vitest run --globals src\cg-zeitarithmetik.test.ts } finally { Pop-Location }
  }

  # --- TOR 3: Black-box API gegen PostgreSQL ---
  if($SkipBlackBox){
    Info "Black-box-Tor uebersprungen (-SkipBlackBox)"
  } else {
    Need docker
    Step "TOR: Black-box API (PostgreSQL)"

    Info "Starte PostgreSQL ueber docker compose ..."
    docker compose up -d $PgService
    if($LASTEXITCODE -ne 0){ throw "docker compose up fehlgeschlagen - laeuft Docker? Servicename '$PgService' korrekt?" }

    # FIX: TCP-basierter Wait statt pg_isready via docker compose exec
    Info "Warte auf PostgreSQL TCP-Bereitschaft (max. 60s) ..."
    $pgReady = Wait-Postgres -PgTcpHost $PgHost -Port $PgPort -MaxSeconds 60
    if(-not $pgReady){ throw "PostgreSQL wurde nicht rechtzeitig bereit (TCP $PgHost`:$PgPort)." }
    Ok "PostgreSQL TCP bereit"

    # Kurze Pause: TCP offen bedeutet noch nicht, dass der DB-Cluster Queries akzeptiert
    Info "Warte auf DB-Cluster-Initialisierung (3s) ..."
    Start-Sleep -Seconds 3

    # FIX: Datenbank anlegen falls noetig
    Ensure-Database -PgSvc $PgService -User $PgUser -Db $PgDatabase

    Info "Spiele Schema ein (packages\cg-storage\src\schema.sql) ..."
    $schema = Join-Path $MonorepoRoot "packages\cg-storage\src\schema.sql"

    # docker compose ps -q und docker cp/exec direkt (kein docker compose exec -> keine version-Warnung auf stderr)
    $prev2 = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $containerName = (docker compose ps -q $PgService 2>$null) -join ''
    $ErrorActionPreference = $prev2
    if(-not $containerName){ throw "Container '$PgService' nicht gefunden nach docker compose up." }

    Info "Kopiere schema.sql in Container ($containerName) ..."
    docker cp $schema "${containerName}:/tmp/schema.sql"
    if($LASTEXITCODE -ne 0){ throw "docker cp fehlgeschlagen." }

    docker exec -i $containerName psql -U $PgUser -d $PgDatabase -v ON_ERROR_STOP=1 -f /tmp/schema.sql
    if($LASTEXITCODE -ne 0){ throw "Schema-Deploy fehlgeschlagen." }
    Ok "Schema eingespielt (inkl. Insert-only-Trigger)"

    Info "Starte Registry-API (apps\cg-api\src\server.ts) ..."
    $env:API_PORT="$ApiPort"; $env:API_HOST=$BindHost
    $env:STORAGE="postgres"; $env:PG_HOST=$PgHost; $env:PG_PORT="$PgPort"
    $env:PG_DATABASE=$PgDatabase; $env:PG_USER=$PgUser; $env:PG_PASSWORD=$PgPassword
    $script:ApiProcess = Start-Process -FilePath "node" `
      -ArgumentList "--import","tsx/esm","apps\cg-api\src\server.ts" `
      -WorkingDirectory $MonorepoRoot -PassThru -NoNewWindow

    Info "Warte auf /v1/health ..."
    $apiReady = $false
    for($i=1; $i -le 30; $i++){
      try{
        $r = Invoke-WebRequest -Uri "http://$BindHost`:$ApiPort/v1/health" -UseBasicParsing -TimeoutSec 2
        if($r.StatusCode -eq 200){ $apiReady = $true; break }
      }catch{}
      if($script:ApiProcess.HasExited){ throw "API-Prozess vorzeitig beendet (ExitCode $($script:ApiProcess.ExitCode))." }
      Start-Sleep -Seconds 1
    }
    if(-not $apiReady){ throw "API wurde nicht rechtzeitig bereit (/v1/health)." }
    Ok "API bereit auf http://$BindHost`:$ApiPort"

    Invoke-Gate "Black-box Conformance" {
      node --import tsx/esm packages\cg-testkit\src\conformance.ts --target "http://$BindHost`:$ApiPort" --level 3 --report
    }

    Stop-Api
    if(-not $KeepDocker){ Info "Fahre PostgreSQL herunter ..."; docker compose down | Out-Null }
    else { Info "PostgreSQL bleibt laufen (-KeepDocker)" }
  }

  # --- Alle Tore gruen -> Commit ---
  Step "Alle Tore bestanden - Commit"
  Set-Location $MonorepoRoot
  Write-Host "Geaenderte Dateien:" -ForegroundColor Yellow
  git status --short
  git add -A
  git commit -m $CommitMessage
  if($LASTEXITCODE -ne 0){ throw "git commit fehlgeschlagen (nichts zu committen?)." }
  $hash = (git rev-parse --short HEAD)
  Ok "Commit erstellt: $hash"

  # --- Push (optional, mit Rueckfrage) ---
  if($Push){
    Step "Push nach origin/$Branch"
    Write-Host "Lokale Commits, die gepusht wuerden:" -ForegroundColor Yellow
    git log "origin/$Branch..HEAD" --oneline
    $proceed = $Yes
    if(-not $Yes){
      $ans = Read-Host "Push nach origin/$Branch ausfuehren? (j/N)"
      $proceed = ($ans -match '^(j|y)')
    }
    if($proceed){
      git push origin $Branch
      if($LASTEXITCODE -ne 0){ throw "git push fehlgeschlagen." }
      Ok "Gepusht nach origin/$Branch"
    } else { Info "Push abgebrochen - Commit bleibt lokal." }
  } else {
    Info "Lokal committet. Push mit:  git push origin $Branch   (oder Skript mit -Push)"
  }

  Step "FERTIG - Verifikation gruen, Aenderungen committet"
}
catch {
  Write-Host "`n!!! ABBRUCH: $($_.Exception.Message)" -ForegroundColor Red
  Stop-Api
  if(-not $SkipBlackBox -and -not $KeepDocker){ try{ docker compose down | Out-Null }catch{} }
  Write-Host "Kein Commit ausgefuehrt." -ForegroundColor Red
  exit 1
}
finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
