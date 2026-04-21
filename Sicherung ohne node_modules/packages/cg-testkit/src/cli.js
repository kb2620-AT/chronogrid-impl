/**
 * cg-testkit/src/cli.ts
 * ChronoGrid Conformance Test CLI
 * Führt alle normativen Testvektoren aus und druckt Zertifikat.
 *
 * Verwendung:
 *   node --loader ts-node/esm src/cli.ts [--level 1|2|3] [--json] [--output report.json]
 *
 * Exit-Codes:
 *   0 = alle Tests für gewähltes Level bestanden
 *   1 = Fehler
 *   2 = Konformitätslevel nicht erreicht
 */
import { runSuite, generateReport } from './runner';
import { ALL_T_ENG } from './suites/t-eng';
import { ALL_T_API } from './suites/t-api';
// ── ANSI-Farben ───────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
};
const OK = `${C.green}✓${C.reset}`;
const FAIL = `${C.red}✗${C.reset}`;
const SKIP = `${C.yellow}○${C.reset}`;
const ERR = `${C.red}✗${C.reset}`;
// ── Argument-Parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const targetLevel = parseInt(args[args.indexOf('--level') + 1] ?? '3', 10);
const jsonMode = args.includes('--json');
const quiet = args.includes('--quiet');
const outputFile = args.indexOf('--output') >= 0 ? args[args.indexOf('--output') + 1] : null;
// ── Header ────────────────────────────────────────────────────────────────────
if (!jsonMode) {
    console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.blue}║  ChronoGrid Conformance Testkit v1.0                     ║${C.reset}`);
    console.log(`${C.bold}${C.blue}║  CG-STD-3100 v1.5 + CG-STD-2100 v1.4 + CG-STD-4100 v0.5║${C.reset}`);
    console.log(`${C.bold}${C.blue}╚══════════════════════════════════════════════════════════╝${C.reset}`);
    console.log(`\n  Target Level: ${C.bold}Level ${targetLevel}${C.reset}  (--level 1|2|3)`);
    console.log(`  TAI now:      ${C.dim}CG:TAI:${(BigInt(Date.now().toString()) * 1000000n).toString()}/v1${C.reset}\n`);
}
// ── Suite-Definitionen ─────────────────────────────────────────────────────────
const SUITES = [
    { name: 'T-ENG (Engine + BigInt)', cases: ALL_T_ENG },
    { name: 'T-CTDDL (Parser)', cases: ALL_T_API.filter(t => t.suite === 'T-CTDDL') },
    { name: 'T-API (REST API)', cases: ALL_T_API.filter(t => t.suite === 'T-API') },
    { name: 'T-CGUAS (Address Space)', cases: ALL_T_API.filter(t => t.suite === 'T-CGUAS') },
];
// ── Run all suites ─────────────────────────────────────────────────────────────
async function main() {
    const suiteResults = [];
    for (const { name, cases } of SUITES) {
        // Filtere Tests nach Target-Level (Tests mit level <= targetLevel)
        const filtered = cases.filter(tc => tc.level <= targetLevel);
        if (!jsonMode && !quiet) {
            console.log(`${C.bold}── ${name} (${filtered.length} Tests) ──${C.reset}`);
        }
        const result = await runSuite(name, filtered);
        suiteResults.push(result);
        if (!jsonMode && !quiet) {
            for (const t of result.tests) {
                const icon = t.status === 'pass' ? OK
                    : t.status === 'fail' ? FAIL
                        : t.status === 'skip' ? SKIP : ERR;
                const dur = t.duration_ms > 0 ? ` ${C.dim}(${t.duration_ms}ms)${C.reset}` : '';
                console.log(`  ${icon} [${C.dim}L${t.level}${C.reset}] ${t.id}: ${t.description}${dur}`);
                if (t.status === 'fail') {
                    console.log(`     ${C.red}Expected:${C.reset} ${JSON.stringify(t.expected, bigintReplacer)}`);
                    console.log(`     ${C.red}Actual:${C.reset}   ${JSON.stringify(t.actual, bigintReplacer)}`);
                }
                if (t.status === 'error') {
                    console.log(`     ${C.red}Error:${C.reset} ${t.error}`);
                }
            }
            const statusLine = [
                `${C.green}${result.passed} ✓${C.reset}`,
                result.failed > 0 ? `${C.red}${result.failed} ✗${C.reset}` : '',
                result.errors > 0 ? `${C.red}${result.errors} err${C.reset}` : '',
                result.skipped > 0 ? `${C.yellow}${result.skipped} skipped${C.reset}` : '',
            ].filter(Boolean).join('  ');
            console.log(`  ─── ${statusLine}\n`);
        }
    }
    // ── Report generieren ──────────────────────────────────────────────────────
    const nowNs = BigInt(Date.now()) * 1000000n;
    const report = await generateReport({
        implementation: `ChronoGrid Reference Implementation — Sprint 1–5`,
        suites: suiteResults,
        nowTai: nowNs,
    });
    if (jsonMode) {
        console.log(JSON.stringify(report, bigintReplacer, 2));
    }
    else {
        // ── Zertifikat ausgeben ──────────────────────────────────────────────────
        const { totals, conformance_level, certification } = report;
        const levelColor = conformance_level === 'none' ? C.red
            : conformance_level === 1 ? C.yellow
                : conformance_level === 2 ? C.blue : C.green;
        console.log(`${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
        console.log(`${C.bold}║  KONFORMITÄTSZERTIFIKAT                                  ║${C.reset}`);
        console.log(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
        console.log();
        console.log(`  Implementierung:  ${C.bold}${report.implementation}${C.reset}`);
        console.log(`  Timestamp:        ${C.dim}${report.timestamp}${C.reset}`);
        console.log();
        console.log(`  Tests gesamt:     ${totals.total}`);
        console.log(`  Bestanden:        ${C.green}${totals.passed}${C.reset}`);
        console.log(`  Fehlgeschlagen:   ${totals.failed > 0 ? C.red : C.dim}${totals.failed}${C.reset}`);
        console.log(`  Fehler:           ${totals.errors > 0 ? C.red : C.dim}${totals.errors}${C.reset}`);
        console.log(`  Übersprungen:     ${C.dim}${totals.skipped}${C.reset}`);
        console.log();
        const levelBadge = conformance_level === 'none'
            ? `${C.red}${C.bold}KEINE KONFORMITÄT${C.reset}`
            : `${levelColor}${C.bold}LEVEL ${conformance_level} KONFORM${C.reset}`;
        console.log(`  ${C.bold}Konformitätslevel: ${levelBadge}`);
        console.log();
        console.log(`  Level 1 (Basis):         ${report.level_1_passed ? `${C.green}✓ BESTANDEN${C.reset}` : `${C.red}✗ NICHT BESTANDEN${C.reset}`}`);
        console.log(`  Level 2 (Standard):      ${report.level_2_passed ? `${C.green}✓ BESTANDEN${C.reset}` : `${C.dim}– nicht getestet/bestanden${C.reset}`}`);
        console.log(`  Level 3 (Referenz):      ${report.level_3_passed ? `${C.green}✓ BESTANDEN${C.reset}` : `${C.dim}– nicht getestet/bestanden${C.reset}`}`);
        console.log();
        if (certification.mandatory_failures.length > 0) {
            console.log(`  ${C.red}${C.bold}Fehlgeschlagene normative Tests:${C.reset}`);
            for (const id of certification.mandatory_failures.slice(0, 10)) {
                console.log(`    ${C.red}✗${C.reset} ${id}`);
            }
            if (certification.mandatory_failures.length > 10) {
                console.log(`    ${C.dim}... und ${certification.mandatory_failures.length - 10} weitere${C.reset}`);
            }
        }
        else {
            console.log(`  ${C.green}${certification.reason}${C.reset}`);
        }
        console.log();
        console.log(`  ${C.dim}Spec-Versionen:${C.reset}`);
        for (const [k, v] of Object.entries(report.spec_versions)) {
            console.log(`    ${C.dim}${k}:${C.reset} ${v}`);
        }
        console.log();
        if (certification.eligible) {
            console.log(`  ${C.green}${C.bold}Eligible für Zertifizierungseinreichung bei ASI/ON.${C.reset}`);
            console.log(`  ${C.dim}Nächster Schritt: Unabhängiges Gutachten (TU Wien) beantragen.${C.reset}`);
        }
        else {
            console.log(`  ${C.red}Nicht zertifizierungsfähig. Bitte behebe die Fehler und teste erneut.${C.reset}`);
        }
        console.log();
    }
    // Optionaler JSON-Output
    if (outputFile) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(outputFile, JSON.stringify(report, bigintReplacer, 2), 'utf8');
        if (!jsonMode)
            console.log(`  ${C.dim}Report gespeichert: ${outputFile}${C.reset}\n`);
    }
    // Exit-Code
    const exitCode = report.conformance_level === 'none' ? 2
        : report.totals.failed > 0 ? 1 : 0;
    process.exit(exitCode);
}
// BigInt → String für JSON.stringify
function bigintReplacer(_, v) {
    return typeof v === 'bigint' ? v.toString() : v;
}
main().catch(err => {
    console.error(`\n${C.red}Unerwarteter Fehler:${C.reset}`, err);
    process.exit(1);
});
