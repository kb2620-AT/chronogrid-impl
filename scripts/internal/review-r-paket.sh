#!/usr/bin/env bash
# =============================================================================
# ChronoGrid — Abnahmepruefung Paket R (CG-VERM-0101 §5, R-1 bis R-4)
#
# Legt die Aenderung an sp3.ts offen und prueft sie gegen die vier
# Anforderungen. Nur lesend: kein Commit, keine Datei wird veraendert.
#
# Die statischen Pruefungen sind Heuristiken. Sie zeigen die relevanten
# Codestellen und markieren Verdachtsfaelle — die Entscheidung triffst du.
#
# Aufruf im Repository-Wurzelverzeichnis:  bash scripts/internal/review-r-paket.sh
# =============================================================================
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -z "$ROOT" ]] && { echo "FEHLER: kein Git-Repository." >&2; exit 1; }
cd "$ROOT"
SP3="monorepo/packages/cg-engine/src/sp3.ts"
[[ -f "$SP3" ]] || { echo "FEHLER: $SP3 nicht gefunden." >&2; exit 1; }

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
pass() { printf '   \033[0;32mERFUELLT\033[0m  %s\n' "$*"; }
chk()  { printf '   \033[0;33mPRUEFEN\033[0m   %s\n' "$*"; }
fail() { printf '   \033[0;31mFEHLT\033[0m     %s\n' "$*"; }
info() { printf '             %s\n' "$*"; }

# --- 1 -----------------------------------------------------------------------
say "1  Welche Dateien sind angefasst?"
git status --porcelain
echo
git diff --stat
UNEXPECTED="$(git diff --name-only; git diff --cached --name-only)"
UNEXPECTED="$(printf '%s\n' "$UNEXPECTED" | sort -u | grep -v '^monorepo/packages/cg-engine/src/sp3\(\.test\)\?\.ts$' | grep -v '^monorepo/packages/cg-testkit/src/suites/t-l3-sp3\.ts$' || true)"
if [[ -n "$UNEXPECTED" ]]; then
  chk "Ausserhalb des R-Pakets geaendert:"
  printf '%s\n' "$UNEXPECTED" | sed 's/^/             /'
  info "R betrifft nur sp3.ts und dessen Tests. K und T kommen spaeter."
else
  pass "nur sp3.ts und zugehoerige Tests"
fi

# --- 2 -----------------------------------------------------------------------
say "2  Der vollstaendige Diff"
git diff -- "$SP3" "${SP3%.ts}.test.ts" monorepo/packages/cg-testkit/src/suites/t-l3-sp3.ts

# --- 3 -----------------------------------------------------------------------
say "3  R-1  Satellitenliste ueber ALLE +-Zeilen, Sollzahl geprueft"
grep -n "startsWith('+" "$SP3" | sed 's/^/             /'
if grep -nE "satellites\.length[^;]*(!==|<|>)" "$SP3" >/dev/null; then
  pass "Abgleich gegen die deklarierte Satellitenzahl vorhanden:"
  grep -nE "satellites\.length[^;]*(!==|<|>)" "$SP3" | sed 's/^/             /'
else
  fail "kein Abgleich gegen die Sollzahl aus Spalten 2-6 gefunden"
  info "Erwartet: deklarierte Zahl lesen, mit satellites.length vergleichen, bei"
  info "Abweichung werfen. Eine blosse Warnung genuegt nicht."
fi
if grep -n "!== '0'" "$SP3" >/dev/null; then
  pass "Fuellslots '  0' werden verworfen"
else
  chk "Filter fuer Fuellslots '  0' nicht erkannt — von Hand nachsehen"
fi

say "4  R-2  Versionszeichen c UND d"
if grep -nE "#\[cd\]|=== 'c'|'c' \|\| |\['c', ?'d'\]" "$SP3" >/dev/null; then
  pass "Versionspruefung vorhanden:"
  grep -nE "#\[cd\]|version" "$SP3" | head -6 | sed 's/^/             /'
else
  fail "keine Pruefung des Versionszeichens gefunden"
fi

say "5  R-3  %c-Zeile ausgewertet, kein stiller Default"
if grep -nE "startsWith\('%c'\).*startsWith\('%(f|i)'\)|startsWith\('%(f|i)'\).*startsWith\('%c'\)" "$SP3" >/dev/null; then
  fail "%c steht weiterhin in der Ueberspringliste — R-3 nicht umgesetzt"
  grep -nE "startsWith\('%c'\)" "$SP3" | sed 's/^/             /'
elif ! grep -nE "slice\(9, ?12\)|slice\(9,12\)" "$SP3" >/dev/null; then
  fail "Zeitsystem wird nicht aus Spalten 10-12 (slice(9,12)) gelesen"
  grep -nE "startsWith\('%c'\)" "$SP3" | sed 's/^/             /'
else
  grep -nE "%c|timeSystem|zeitsystem|GPST?'" "$SP3" | head -12 | sed 's/^/             /'
  if grep -nE "\?\?\s*'GPS'|\|\|\s*'GPS'|= 'GPS';" "$SP3" >/dev/null; then
    chk "moeglicher stiller Default auf GPS — diese Zeilen genau ansehen:"
    grep -nE "\?\?\s*'GPS'|\|\|\s*'GPS'|= 'GPS';" "$SP3" | sed 's/^/             /'
    info "Gefordert: bei jedem Wert ausser GPS fehlschlagen, nicht annehmen."
  else
    pass "kein offensichtlicher Default auf GPS"
  fi
fi

say "6  R-4  Uhr-Fehlwert am Spaltenfeld, nicht per Textsuche"
grep -nE "SP3_CLOCK_BAD|999999" "$SP3" | sed 's/^/             /'
if grep -nE "(includes|indexOf|test)\(.*999999|line\.includes" "$SP3" >/dev/null; then
  fail "Erkennung ueber Textsuche in der ganzen Zeile — falsch"
  info "Ein Positionswert mit derselben Ziffernfolge waere sonst ein Uhr-Fehlwert."
  info "Gefordert: Feld aus Spalten 47-60 (slice(46,60)) vergleichen."
elif grep -nE "slice\(46, ?60\)" "$SP3" >/dev/null; then
  pass "Uhrfeld wird spaltenweise aus slice(46,60) gelesen"
else
  chk "Herkunft des Uhrfelds nicht eindeutig — von Hand nachsehen"
fi

# --- 7 -----------------------------------------------------------------------
say "7  K-Pfad darf noch unberuehrt sein (K kommt spaeter)"
if grep -nE "if \(start < 0\) start = 0|start = blocks\.length - points" "$SP3" >/dev/null; then
  pass "Randklemmung in stateAt noch vorhanden — K-3 wurde nicht vorweggenommen"
  grep -nE "if \(start < 0\) start = 0|start = blocks\.length - points" "$SP3" | sed 's/^/             /'
else
  chk "Randklemmung nicht mehr auffindbar — wurde K-3 vorgezogen?"
  info "Das waere kein Fehler, aber es gehoert in ein eigenes Paket."
fi
if grep -n "file.blocks.filter" "$SP3" >/dev/null; then
  pass "gefilterte Blockliste noch vorhanden — K-1 wurde nicht vorweggenommen"
else
  chk "Blockfilterung veraendert — gehoert zu K-1, nicht zu R"
fi

# --- 8 -----------------------------------------------------------------------
say "8  Testlauf"
cd monorepo 2>/dev/null || true
echo "--- Vitest ---"
npx vitest run --globals 2>&1 | tail -20
echo
echo "--- cg-testkit CLI, Level 3 ---"
npx tsx packages/cg-testkit/src/cli.ts --level 3 2>&1 | tail -20

say "9  Sollwerte zum Abgleich"
info "cg-testkit  241/241 (101 L1 + 96 L2 + 44 L3), 25 pending"
info "Vitest      120/120 (30 CGUA + 50 ARITH + 24 RELB + 16 SP3)"
info ""
info "Abweichung nach oben ist erwartbar, sobald T-1 dazukommt."
info "Abweichung nach unten in dieser Runde bedeutet: R hat etwas zerbrochen,"
info "ODER ein alter Test hatte die falsche Annahme fest verdrahtet. Beides"
info "muss benannt werden, bevor irgendetwas committet wird."
