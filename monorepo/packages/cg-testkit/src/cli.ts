/**
 * cg-testkit/src/cli.ts
 * Normative Testkit CLI — CG-STD-5100 v1.3
 * Verwendung: node --import tsx/esm src/cli.ts [--level 1|2|3] [--json]
 *
 * Sprint 7: 96 Tests total (55 L1 + 21 L2-Engine + 10 L3-Engine + 16 Storage + 22 Sprint7)
 */

import { runTests } from './runner.js';
import { engineTests } from './suites/t-engine.js';
import { storageTests } from './suites/t-storage.js';
import { sprint7Tests } from './suites/t-sprint7.js';

const args  = process.argv.slice(2);
const level = parseInt(args[args.indexOf('--level') + 1] ?? '3', 10) as 1|2|3;
const json  = args.includes('--json');

const allTests = [...engineTests, ...storageTests, ...sprint7Tests];

console.log(`\n┌─────────────────────────────────────────────────────────────────┐`);
console.log(`│  ChronoGrid Conformance Testkit — CG-STD-5100 v1.3              │`);
console.log(`│  Sprint 7: GraphQL + Webhooks + Interface-APIContext            │`);
console.log(`│  Level: ${level} | Tests: ${allTests.filter(t=>t.level<=level).length} von ${allTests.length}                                        │`);
console.log(`└─────────────────────────────────────────────────────────────────┘\n`);

const results = await runTests(allTests, level);

if (json) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.some(r => !r.passed) ? 1 : 0);
}

// Ausgabe
let passed = 0, failed = 0;
const byLevel: Record<number, {passed:number, total:number}> = {1:{passed:0,total:0},2:{passed:0,total:0},3:{passed:0,total:0}};

for (const r of results) {
  const icon = r.passed ? '✓' : '✗';
  const color = r.passed ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`  ${color}${icon}${reset} [L${r.level}] ${r.id.padEnd(18)} ${r.description.slice(0,55).padEnd(55)} ${r.durationMs}ms`);
  if (!r.passed && r.error) console.log(`       └─ ${r.error}`);
  if (r.passed) passed++; else failed++;
  byLevel[r.level]!.total++;
  if (r.passed) byLevel[r.level]!.passed++;
}

console.log('\n──────────────────────────────────────────────────────────────────');
console.log(`Tests gesamt:    ${results.length}`);
console.log(`Bestanden:       ${passed}`);
console.log(`Fehlgeschlagen:  ${failed}`);
console.log(`Level 1:         ${byLevel[1]!.passed}/${byLevel[1]!.total}`);
if (level >= 2) console.log(`Level 2:         ${byLevel[2]!.passed}/${byLevel[2]!.total}`);
if (level >= 3) console.log(`Level 3:         ${byLevel[3]!.passed}/${byLevel[3]!.total}`);

const conformance = failed === 0;
const levelLabel  = level === 1 ? 'LEVEL 1' : level === 2 ? 'LEVEL 2' : 'LEVEL 3';
if (conformance) {
  console.log(`\n\x1b[32m✓ ${levelLabel} KONFORM — ${passed}/${results.length} Tests bestanden\x1b[0m`);
  console.log(`  Sprint 7: GraphQL | Webhooks | Interface-basierter APIContext\n`);
} else {
  console.log(`\n\x1b[31m✗ ${levelLabel} NICHT KONFORM — ${failed} Test(s) fehlgeschlagen\x1b[0m\n`);
}

process.exit(conformance ? 0 : 1);
