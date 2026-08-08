/**
 * cg-testkit/src/conformance.ts
 * ChronoGrid Hybrid-Konformitäts-CLI — AP 11.3
 *
 * Usage:
 *   # In-Process (Default) — läuft die interne Testsuite
 *   node --import tsx/esm packages/cg-testkit/src/conformance.ts [--level 3] [--report] [--json]
 *
 *   # Black-box-Modus — testet externen REST-Endpoint
 *   node --import tsx/esm packages/cg-testkit/src/conformance.ts --target http://host:port [--level 3] [--report] [--json]
 *
 * Exit-Codes:
 *   0 — alle aktiven Tests bestanden (KONFORM)
 *   1 — mindestens ein Test fehlgeschlagen (NICHT KONFORM)
 *   2 — Fehler beim Starten (ungültige Argumente, Server nicht erreichbar)
 *
 * Normative Grundlage: CG-STD-5100 v1.4 §3.3 (Konformitätsprüfung)
 */

import { writeFileSync } from 'node:fs';
import { runTests } from './runner.js';
import type { TestCase } from './runner.js';
import { buildBlackBoxTests } from './black-box.js';
import { PENDING_SUMMARY } from './suites/t-l3-pending.js';

// ── Argument-Parsing ──────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const level = parseInt(args[args.indexOf('--level') + 1] ?? '3', 10) as 1 | 2 | 3;
const target  = args.includes('--target') ? args[args.indexOf('--target') + 1] : null;
const isJson  = args.includes('--json');
const doReport = args.includes('--report');
const mode    = target ? 'black-box' : 'in-process';

if (target && (args.indexOf('--target') + 1 >= args.length || target.startsWith('--'))) {
  console.error('Fehler: --target erfordert eine URL (z.B. --target http://localhost:3000)');
  process.exit(2);
}

// ── In-Process-Imports (nur wenn kein --target) ───────────────────────────────

let allInProcessTests: TestCase[] = [];

if (mode === 'in-process') {
  const [
    { engineTests },
    { storageTests },
    { authTests },
    { apiTests, teardown: _teardown },
    { ucTests },
    { ALL_T_CGUAS },
    { cosmicTests },
    { T_L3_RK45 },
    { T_L3_SP3 },
  ] = await Promise.all([
    import('./suites/t-engine.js'),
    import('./suites/t-storage.js'),
    import('./suites/t-auth.js'),
    import('./suites/t-api.js'),
    import('./suites/t-uc.js'),
    import('./suites/t-cguas.js'),
    import('./suites/t-l3-cosmic.js'),
    import('./suites/t-l3-rk45.js'),
    import('./suites/t-l3-sp3.js'),
  ]);

  const { handleGraphQL }    = await import('cg-api/graphql.js');
  const { signPayload, verifySignature } = await import('cg-api/webhooks.js');
  const { InMemoryTimepointRepository, InMemoryDomainRepository,
          InMemoryManifestRepository, InMemoryRelationRepository,
          InMemorySegmentRepository }    = await import('cg-storage/repository.js');
  const { nowTaiNs } = await import('cg-engine/engine.js');

  type APIContext = Awaited<typeof import('cg-api/handlers.js')>['APIContext'] extends infer T ? T : never;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeCtx = (): any => ({
    timepoints: new InMemoryTimepointRepository(),
    domains:    new InMemoryDomainRepository(),
    manifests:  new InMemoryManifestRepository(),
    relations:  new InMemoryRelationRepository(),
    segments:   new InMemorySegmentRepository(),
    now:        nowTaiNs,
  });

  type GQL = { data?: Record<string, unknown>; errors?: unknown[] };
  const sprint7Tests: TestCase[] = [
    { id:'T-S7-001', level:2, description:'GraphQL health',
      run: async () => ((await handleGraphQL('{ health { status } }', undefined, makeCtx())) as GQL).data?.['health'],
      expected: { status:'ok' } },
    { id:'T-S7-002', level:2, description:'GraphQL allenRelation BEFORE',
      run: async () => ((await handleGraphQL('{ allenRelation(a_start:"1" a_end:"5" b_start:"10" b_end:"20") }', undefined, makeCtx())) as GQL).data?.['allenRelation'],
      expected: 'BEFORE' },
    { id:'T-S7-003', level:2, description:'GraphQL createTimepoint',
      run: async () => ((await handleGraphQL('mutation { createTimepoint(domain:"TAI",value:"1742041937") { cgta } }', undefined, makeCtx())) as GQL).data?.['createTimepoint'],
      expected: { cgta:'CG:TAI:1742041937/v1' } },
    { id:'T-S7-004', level:2, description:'GraphQL allocateSegment',
      run: async () => ((await handleGraphQL('mutation { allocateSegment(granted_by:"t",size_ns:"1000") { status } }', undefined, makeCtx())) as GQL).data?.['allocateSegment'],
      expected: { status:'active' } },
    { id:'T-S7-005', level:3, description:'GraphQL ungültige Query',
      run: async () => Array.isArray(((await handleGraphQL('{ bad }', undefined, makeCtx())) as GQL).errors),
      expected: true },
    { id:'T-S7-006', level:2, description:'Webhook signPayload',
      run: () => signPayload('s', 'b').startsWith('sha256='),
      expected: true },
    { id:'T-S7-007', level:2, description:'Webhook verifySignature korrekt',
      run: () => { const b = '{"t":1}'; return verifySignature('s', b, signPayload('s', b)); },
      expected: true },
    { id:'T-S7-008', level:2, description:'Webhook verifySignature falsch',
      run: () => verifySignature('s', 'b', 'sha256=bad'),
      expected: false },
  ];

  allInProcessTests = [
    ...engineTests, ...storageTests, ...sprint7Tests,
    ...authTests, ...apiTests, ...ucTests, ...ALL_T_CGUAS, ...cosmicTests,
    ...T_L3_RK45, ...T_L3_SP3,
  ];
}

// ── Test-Auswahl je Modus ─────────────────────────────────────────────────────

const activeTests: TestCase[] = mode === 'black-box'
  ? buildBlackBoxTests(target!)
  : allInProcessTests;

const filtered  = activeTests.filter(t => t.level <= level);
const skipCount = PENDING_SUMMARY.total;

// ── Header ────────────────────────────────────────────────────────────────────

console.log(`\n┌──────────────────────────────────────────────────────────────┐`);
console.log(`│  ChronoGrid Conformance CLI — CG-STD-5100 v1.4               │`);
console.log(`│  Sprint 11-A · Hybrid-Modus                                  │`);
console.log(`│  Modus:  ${mode === 'black-box' ? `black-box → ${target!.slice(0, 30).padEnd(30)}` : 'in-process (intern)                      '}  │`);
console.log(`│  Level:  ${level} | Aktiv: ${String(filtered.length).padEnd(4)} | Pending: ${String(skipCount).padEnd(4)}                   │`);
console.log(`└──────────────────────────────────────────────────────────────┘\n`);

if (skipCount > 0 && mode === 'in-process') {
  console.log(`  ⏭  ${skipCount} pending: ${PENDING_SUMMARY.pending_v12} pending-v1.2, ${PENDING_SUMMARY.pending_sprint_11b} pending-Sprint-11-B\n`);
}

// ── Erreichbarkeitscheck im Black-box-Modus ───────────────────────────────────

if (mode === 'black-box') {
  try {
    const r = await fetch(`${target}/v1/health`);
    if (r.status !== 200) throw new Error(`Health-Check: HTTP ${r.status}`);
    console.log(`  ✓ Ziel erreichbar: ${target}/v1/health → 200\n`);
  } catch (e) {
    console.error(`  ✗ Ziel nicht erreichbar: ${target}`);
    console.error(`    ${(e as Error).message}`);
    console.error(`\n  Starte die Registry-API und übergib den korrekten --target URL.\n`);
    process.exit(2);
  }
}

// ── Tests ausführen ───────────────────────────────────────────────────────────

const results = await runTests(activeTests, level);

// Teardown nur im In-Process-Modus (API-Server stoppen)
if (mode === 'in-process') {
  try {
    const { teardown } = await import('./suites/t-api.js');
    await teardown();
  } catch { /* kein Server gestartet */ }
}

// ── Report ────────────────────────────────────────────────────────────────────

if (doReport) {
  const report = {
    title:        'ChronoGrid Conformance Report',
    version:      '0.9.0',
    cgStd:        'CG-STD-5100 v1.4',
    sprint:       'Sprint 11-A',
    mode,
    target:       target ?? 'in-process',
    generatedAt:  new Date().toISOString(),
    conformance: {
      level,
      passed:    results.filter(r => r.passed).length,
      failed:    results.filter(r => !r.passed).length,
      skipped:   skipCount,
      total:     results.length + skipCount,
      compliant: results.every(r => r.passed),
    },
    pending: {
      pending_v12:        PENDING_SUMMARY.pending_v12,
      pending_sprint_11b: PENDING_SUMMARY.pending_sprint_11b,
      details: {
        worm_oais:       PENDING_SUMMARY.worm_oais,
        geo_redundancy:  PENDING_SUMMARY.geo_redundancy,
        rk45_classb:     PENDING_SUMMARY.rk45_classb,
        graphql_sub:     PENDING_SUMMARY.graphql_sub,
        event_bus_mtls:  PENDING_SUMMARY.event_bus_mtls,
        anchoring_audit: PENDING_SUMMARY.anchoring_audit,
      },
    },
    results: results.map(r => ({
      id: r.id, level: r.level, passed: r.passed, durationMs: r.durationMs,
      ...(r.passed ? {} : { error: r.error }),
    })),
  };
  const filename = mode === 'black-box' ? 'conformance-report-blackbox.json' : 'conformance-report.json';
  writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`✓ ${filename} geschrieben`);
}

// ── Ausgabe ───────────────────────────────────────────────────────────────────

if (isJson) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.some(r => !r.passed) ? 1 : 0);
}

let passed = 0, failed = 0;
const byLevel: { [k: number]: { p: number; t: number } } = { 1:{p:0,t:0}, 2:{p:0,t:0}, 3:{p:0,t:0} };

for (const r of results) {
  const c = r.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${c} [L${r.level}] ${r.id.padEnd(16)} ${r.description.slice(0, 48).padEnd(48)} ${r.durationMs}ms`);
  if (!r.passed && r.error) console.log(`       └─ ${r.error}`);
  r.passed ? passed++ : failed++;
  byLevel[r.level]!.t++;
  if (r.passed) byLevel[r.level]!.p++;
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`Modus:          ${mode}${target ? ` → ${target}` : ''}`);
console.log(`Tests gesamt:   ${results.length} aktiv${mode === 'in-process' ? ` + ${skipCount} pending` : ''}`);
console.log(`Bestanden:      ${passed}`);
console.log(`Fehlgeschlagen: ${failed}`);
for (const [l, v] of Object.entries(byLevel)) {
  if (Number(l) <= level) console.log(`Level ${l}:        ${v.p}/${v.t}`);
}

const ok = failed === 0;
if (ok) {
  console.log(`\n\x1b[32m✓ LEVEL ${level} (Kernpfade) KONFORM — ${passed} aktiv/${results.length} bestanden, ${skipCount} pending\x1b[0m`);
  console.log(`  Klasse-B/RK45 + SP3-Kette aktiv (T-L3-RK45-001–006, T-L3-SP3-001–006, exakte BigInt-Arithmetik); ${skipCount} Stubs dokumentiert offen (Sprint 11-B / CG-STD-4100 v1.2)${mode === 'in-process' ? ` | Modus: ${mode}` : ''}\n`);
} else {
  console.log(`\n\x1b[31m✗ LEVEL ${level} NICHT KONFORM — ${failed} fehlgeschlagen\x1b[0m\n`);
}

process.exit(ok ? 0 : 1);
