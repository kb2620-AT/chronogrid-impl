#!/usr/bin/env bash
# =============================================================================
# ChronoGrid — Vorbereitung der IGS-Realdatenprüfung (A4-Abschluss)
# Grundlage: CG-VERM-0101 v1.0, Abschnitt 5, Voraussetzung
#
# Legt das lokale Fixture-Verzeichnis an, repariert und ergaenzt
# monorepo/.gitignore, laedt zwei IGS-Final-Produktdateien vom BKG und
# verifiziert, dass Git sie nicht sieht.
#
# Aendert KEINEN Quellcode. Committet NICHTS. Idempotent.
#
# Rechtlicher Rahmen (CG-VERM-0100, 08.08.2026): Die IGS-Nutzungsbedingungen
# vom 05.08.2020 sind keine Lizenz. Namensnennung ist verbindlich,
# lebenskritische Verwendung ausgeschlossen. Die Dateien bleiben lokal.
# =============================================================================
set -euo pipefail

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[0;32mOK\033[0m   %s\n' "$*"; }
warn() { printf '   \033[0;33mACHTUNG\033[0m %s\n' "$*"; }
info() { printf '        %s\n' "$*"; }

# --- 0 -----------------------------------------------------------------------
say "0  Repository lokalisieren"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo "FEHLER: kein Git-Repository. Skript im chronogrid-impl-Checkout ausfuehren." >&2
  exit 1
fi
if [[ ! -d "$ROOT/monorepo" ]]; then
  echo "FEHLER: $ROOT enthaelt kein monorepo/. Falsches Repository?" >&2
  exit 1
fi
cd "$ROOT"
ok "Repository: $ROOT"
info "Branch: $(git rev-parse --abbrev-ref HEAD)  ·  HEAD: $(git rev-parse --short HEAD)"

MONO="$ROOT/monorepo"
FIXDIR="$MONO/fixtures/igs-local"
GI="$MONO/.gitignore"

# --- 1 -----------------------------------------------------------------------
say "1  Fixture-Verzeichnis anlegen"

if [[ -d "$FIXDIR" ]]; then
  ok "existiert bereits: monorepo/fixtures/igs-local/"
else
  mkdir -p "$FIXDIR"
  ok "angelegt: monorepo/fixtures/igs-local/"
fi

if [[ -f "$FIXDIR/.gitkeep" ]]; then
  ok ".gitkeep vorhanden"
else
  : > "$FIXDIR/.gitkeep"
  ok ".gitkeep angelegt"
fi

# Hinweisdatei mit der vorgeschriebenen Namensnennung
cat > "$FIXDIR/HERKUNFT.txt" <<'TXT'
Herkunft und Nutzungsbedingungen der Dateien in diesem Verzeichnis
==================================================================

Quelle:  International GNSS Service (IGS), Final orbit products,
         bezogen ueber das Datenrepositorium des Bundesamts fuer
         Kartographie und Geodaesie (BKG),
         https://igs.bkg.bund.de/root_ftp/IGS/products/

Rechtsgrundlage: IGS Data and Product Disclaimer and Terms of Use,
         05.08.2020. Dies ist KEINE Lizenz: kein Rechtegewaehrungssatz,
         keine Aussage zur Weitergabe.

Auflagen: Namensnennung ist verbindlich.
          Lebenskritische Verwendung ist ausdruecklich ausgeschlossen.

Folge:    Diese Dateien werden NICHT in das Repository aufgenommen und
          NICHT weitergegeben. Siehe Aktenvermerk CG-VERM-0100.
TXT
ok "HERKUNFT.txt geschrieben (Attributionsnachweis)"

# --- 2 -----------------------------------------------------------------------
say "2  monorepo/.gitignore pruefen, reparieren, ergaenzen"

if [[ ! -f "$GI" ]]; then
  warn "monorepo/.gitignore fehlt — wird neu angelegt"
  : > "$GI"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$GI" "$GI.bak-$STAMP"
ok "Sicherung: monorepo/.gitignore.bak-$STAMP"

# 2a — UTF-16-Reste entfernen (entstanden durch PowerShell >> bzw. Add-Content)
if ! LC_ALL=C tr -d '\000' < "$GI" | cmp -s - "$GI"; then
  warn "UTF-16-Fragmente gefunden — die betroffenen Regeln sind derzeit WIRKUNGSLOS"
  LC_ALL=C tr -d '\000' < "$GI" | sed 's/\r$//' > "$GI.tmp"
  mv "$GI.tmp" "$GI"
  ok "NUL-Bytes entfernt, Zeilenenden normalisiert"
  REPAIRED=1
else
  ok "keine UTF-16-Fragmente"
  REPAIRED=0
fi

# 2b — falscher Pfad in der wiederhergestellten Regel
# 'monorepo/CG-FIX-C_backup_*/' innerhalb von monorepo/.gitignore meint
# monorepo/monorepo/... und greift daher nie.
if grep -q '^monorepo/CG-FIX-C_backup_\*/$' "$GI"; then
  sed -i 's|^monorepo/CG-FIX-C_backup_\*/$|CG-FIX-C_backup_*/|' "$GI"
  warn "Pfad korrigiert: 'monorepo/CG-FIX-C_backup_*/' -> 'CG-FIX-C_backup_*/'"
  info "Begruendung: Pfade in monorepo/.gitignore sind relativ zu monorepo/."
fi

# 2c — neue Regeln idempotent ergaenzen
add_rule() {
  local rule="$1"
  if grep -Fxq "$rule" "$GI"; then
    info "vorhanden: $rule"
  else
    printf '%s\n' "$rule" >> "$GI"
    ok "ergaenzt: $rule"
  fi
}

if ! grep -Fq '# IGS-Fremddaten' "$GI"; then
  printf '\n# IGS-Fremddaten — nicht ins Repository (CG-VERM-0100 / CG-VERM-0101)\n' >> "$GI"
fi
# Inhalt ausschliessen, nicht das Verzeichnis: sonst steigt Git nicht hinab
# und die .gitkeep-Ausnahme greift nie.
add_rule 'fixtures/igs-local/*'
add_rule '!fixtures/igs-local/.gitkeep'
add_rule '!fixtures/igs-local/HERKUNFT.txt'
add_rule '*.SP3'
add_rule '*.SP3.gz'
add_rule '.gitignore.bak-*'

say "2d  Ergebnis (Unterschied zur Sicherung)"
diff -u --text "$GI.bak-$STAMP" "$GI" || true

# --- 3 -----------------------------------------------------------------------
say "3  IGS-Final-Produktdateien beziehen"

BASE="https://igs.bkg.bund.de/root_ftp/IGS/products/2414"

# Datei | SHA-256 gepackt | SHA-256 entpackt
FILES=(
  "IGS0OPSFIN_20261050000_01D_15M_ORB.SP3|a446d160070d46e3e703d77589923238e0579faae8c309454b9373a00d06e2cd|08a1c13a4480a443a4c27f106cd1c9b51d32a2dcb461cbe9b63c244ce22a065b"
  "IGS0OPSFIN_20261060000_01D_15M_ORB.SP3|d2d4ea0842d19b5b10101e75fe9ee60fed936b995dbc8c11f50aab44ec173dae|d9e928b6d8c6f5adda9e94ac4c1f4855b061d79fda0c4f08c2181adb3601131d"
)

DL_OK=1
for entry in "${FILES[@]}"; do
  IFS='|' read -r NAME SHA_GZ SHA_RAW <<< "$entry"
  GZ="$FIXDIR/$NAME.gz"
  RAW="$FIXDIR/$NAME"

  if [[ -f "$RAW" ]]; then
    ok "bereits vorhanden: $NAME"
  else
    if [[ ! -f "$GZ" ]]; then
      info "lade $NAME.gz ..."
      if ! curl -fsSL --retry 3 --connect-timeout 20 --max-time 180 -o "$GZ" "$BASE/$NAME.gz"; then
        warn "Download fehlgeschlagen: $NAME.gz"
        warn "Datei manuell ueber den Browser laden: $BASE/$NAME.gz"
        rm -f "$GZ"
        DL_OK=0
        continue
      fi
    fi
    HAVE="$(sha256sum "$GZ" | cut -d' ' -f1)"
    if [[ "$HAVE" == "$SHA_GZ" ]]; then
      ok "SHA-256 gepackt stimmt: $NAME.gz"
    else
      warn "SHA-256 gepackt weicht ab bei $NAME.gz"
      info "erwartet: $SHA_GZ"
      info "erhalten: $HAVE"
      info "Moeglich bei Neuausgabe des Produkts. Nicht abgebrochen — bitte pruefen."
    fi
    gunzip -kf "$GZ"
  fi

  if [[ -f "$RAW" ]]; then
    HAVE="$(sha256sum "$RAW" | cut -d' ' -f1)"
    if [[ "$HAVE" == "$SHA_RAW" ]]; then
      ok "SHA-256 entpackt stimmt: $NAME"
    else
      warn "SHA-256 entpackt weicht ab bei $NAME"
      info "erwartet: $SHA_RAW"
      info "erhalten: $HAVE"
    fi
    info "$(wc -l < "$RAW") Zeilen · $(wc -c < "$RAW") Byte"
    info "Kopfzeile: $(head -n1 "$RAW")"
  fi
done

# --- 4 -----------------------------------------------------------------------
say "4  Verifikation: sieht Git die Dateien?"

LEAK=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  case "$f" in
    monorepo/fixtures/igs-local/.gitkeep|monorepo/fixtures/igs-local/HERKUNFT.txt) continue ;;
  esac
  warn "NICHT ignoriert: $f"
  LEAK=1
done < <(git status --porcelain --untracked-files=all -- monorepo/fixtures | sed 's/^...//')

if [[ $LEAK -eq 0 ]]; then
  ok "Keine IGS-Datei im Git-Status. Ausschluss wirkt."
else
  warn "Mindestens eine Datei ist sichtbar — .gitignore pruefen, NICHT committen."
fi

for entry in "${FILES[@]}"; do
  IFS='|' read -r NAME _ _ <<< "$entry"
  if [[ -f "$FIXDIR/$NAME" ]]; then
    R="$(git check-ignore -v "monorepo/fixtures/igs-local/$NAME" 2>/dev/null || echo 'KEINE REGEL')"
    info "$NAME  <-  $R"
  fi
done

say "5  Zusammenfassung"
info "Verzeichnis : monorepo/fixtures/igs-local/"
info "Dateien     : $(ls -1 "$FIXDIR" | tr '\n' ' ')"
info "gitignore   : monorepo/.gitignore (Sicherung .bak-$STAMP)"
[[ "${REPAIRED:-0}" -eq 1 ]] && warn "monorepo/.gitignore war beschaedigt und wurde repariert — Aenderung pruefen, dann separat committen (NUR .gitignore, keine Datendateien)."
[[ $DL_OK -eq 0 ]] && warn "Mindestens ein Download ist fehlgeschlagen — siehe oben."
info ""
info "Naechster Schritt: Arbeitsauftrag CG-VERM-0101 §5, Pakete R-1..R-4, K-1..K-3, T-1..T-4."
