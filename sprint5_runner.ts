/**
 * cg-testkit/src/runner.ts
 * Normative Test-Runner — CG-STD-3100 v1.5 Kap. 11 + CG-STD-4100 v0.5 Kap. 9
 *
 * Führt alle normativen Testvektoren gegen eine laufende Implementierung
 * und berechnet das Konformitätslevel (Level 1 / 2 / 3).
 *
 * Konzept:
 * - Jeder Test ist eine pure Funktion: () → TestResult
 * - Testvektoren sind exakt aus den Spezifikationen übernommen (normativ)
 * - Das Ergebnis wird als maschinenlesbares JSON + menschenlesbarer Report ausgegeben
 */

import type { ConformanceLevel } from 'cg-types/domain.js';

// ── Test-Ergebnis-Typen ───────────────────────────────────────────────────────
export type TestStatus = 'pass' | 'fail' | 'skip' | 'error';

export interface TestResult {
  id:          string;        // z.B. "T-ENG-010"
  description: string;
  status:      TestStatus;
  expected?:   unknown;
  actual?:     unknown;
  error?:      string;
  duration_ms: number;
  level:       ConformanceLevel;  // 1, 2, oder 3 — Level ab dem dieser Test gilt
  suite:       string;            // "T-ENG", "T-BIG", "T-CTDDL", "T-API", ...
}

export interface SuiteResult {
  suite:    string;
  tests:    TestResult[];
  passed:   number;
  failed:   number;
  skipped:  number;
  errors:   number;
}

export interface ConformanceReport {
  timestamp:        string;   // TAI-CGTA
  implementation:   string;   // Name/Version der getesteten Implementierung
  spec_versions: {
    engine:   string;  // "CG-STD-3100 v1.5"
    ctddl:    string;  // "CG-STD-2100 v1.4"
    storage:  string;  // "CG-STD-4100 v0.5"
    cguas:    string;  // "CG-STD-6100 v0.2"
  };
  suites:           SuiteResult[];
  totals: {
    passed:   number;
    failed:   number;
    skipped:  number;
    errors:   number;
    total:    number;
  };
  conformance_level: ConformanceLevel | 'none';
  level_1_passed:    boolean;
  level_2_passed:    boolean;
  level_3_passed:    boolean;
  certification: {
    eligible:  boolean;
    reason:    string;
    mandatory_failures: string[];  // Test-IDs die fehlgeschlagen sind
  };
}

// ── Einzelner Test-Case ────────────────────────────────────────────────────────
export interface TestCase {
  id:          string;
  description: string;
  level:       ConformanceLevel;
  suite:       string;
  fn:          () => unknown | Promise<unknown>;  // wirft bei Fehler
  expected?:   unknown;
  skip?:       boolean;
  skipReason?: string;
}

// ── Test-Runner ────────────────────────────────────────────────────────────────
export async function runTest(tc: TestCase): Promise<TestResult> {
  if (tc.skip) {
    return {
      id: tc.id, description: tc.description, status: 'skip',
      duration_ms: 0, level: tc.level, suite: tc.suite,
    };
  }

  const start = Date.now();
  try {
    const actual = await tc.fn();

    // Wenn expected definiert: normativ vergleichen
    if (tc.expected !== undefined) {
      const match = deepEqual(actual, tc.expected);
      if (!match) {
        return {
          id: tc.id, description: tc.description, status: 'fail',
          expected: tc.expected, actual,
          duration_ms: Date.now() - start, level: tc.level, suite: tc.suite,
        };
      }
    }

    return {
      id: tc.id, description: tc.description, status: 'pass',
      expected: tc.expected, actual,
      duration_ms: Date.now() - start, level: tc.level, suite: tc.suite,
    };
  } catch (err) {
    return {
      id: tc.id, description: tc.description, status: 'error',
      error: err instanceof Error ? `${err.message} (${(err as Record<string,unknown>).code ?? ''})` : String(err),
      duration_ms: Date.now() - start, level: tc.level, suite: tc.suite,
    };
  }
}

export async function runSuite(name: string, cases: TestCase[]): Promise<SuiteResult> {
  const tests: TestResult[] = [];
  for (const tc of cases) {
    tests.push(await runTest(tc));
  }
  return {
    suite:   name,
    tests,
    passed:  tests.filter(t => t.status === 'pass').length,
    failed:  tests.filter(t => t.status === 'fail').length,
    skipped: tests.filter(t => t.status === 'skip').length,
    errors:  tests.filter(t => t.status === 'error').length,
  };
}

// ── Konformitätslevel-Berechnung ──────────────────────────────────────────────
// Normative Regel: alle Tests eines Levels MÜSSEN bestehen.
// Ein Level-1-Test-Fehler → max. Level 0 (keine Zertifizierung).

export function computeConformanceLevel(suites: SuiteResult[]): {
  level: ConformanceLevel | 'none';
  l1: boolean; l2: boolean; l3: boolean;
  mandatory_failures: string[];
} {
  const allTests = suites.flatMap(s => s.tests);
  const failures = allTests.filter(t => t.status === 'fail' || t.status === 'error');
  const mandatory_failures = failures.map(t => t.id);

  const l1fails = failures.filter(t => t.level === 1);
  const l2fails = failures.filter(t => t.level <= 2);
  const l3fails = failures.filter(t => t.level <= 3);

  const l1 = l1fails.length === 0;
  const l2 = l1 && l2fails.length === 0;
  const l3 = l2 && l3fails.length === 0;

  const level: ConformanceLevel | 'none' = l3 ? 3 : l2 ? 2 : l1 ? 1 : 'none';

  return { level, l1, l2, l3, mandatory_failures };
}

export async function generateReport(params: {
  implementation: string;
  suites: SuiteResult[];
  nowTai: bigint;
}): Promise<ConformanceReport> {
  const { level, l1, l2, l3, mandatory_failures } = computeConformanceLevel(params.suites);

  const totals = params.suites.reduce(
    (acc, s) => ({
      passed:  acc.passed  + s.passed,
      failed:  acc.failed  + s.failed,
      skipped: acc.skipped + s.skipped,
      errors:  acc.errors  + s.errors,
      total:   acc.total   + s.tests.length,
    }),
    { passed: 0, failed: 0, skipped: 0, errors: 0, total: 0 },
  );

  return {
    timestamp:       `CG:TAI:${params.nowTai}/v1`,
    implementation:  params.implementation,
    spec_versions: {
      engine:  'CG-STD-3100-2026 v1.5',
      ctddl:   'CG-STD-2100-2026 v1.4',
      storage: 'CG-STD-4100-2026 v0.5',
      cguas:   'CG-STD-6100-2026 v0.2',
    },
    suites:              params.suites,
    totals,
    conformance_level:   level,
    level_1_passed:      l1,
    level_2_passed:      l2,
    level_3_passed:      l3,
    certification: {
      eligible:           level !== 'none',
      reason:             level !== 'none'
        ? `Level ${level} Konformität bestätigt — ${totals.passed}/${totals.total} Tests bestanden`
        : `Keine Konformität — ${mandatory_failures.length} Level-1-Fehler`,
      mandatory_failures,
    },
  };
}

// ── Deep-Equal (BigInt-sicher) ────────────────────────────────────────────────
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.join() !== kb.join()) return false;
  for (const k of ka) {
    if (!deepEqual((a as Record<string,unknown>)[k], (b as Record<string,unknown>)[k])) return false;
  }
  return true;
}
