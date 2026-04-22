/**
 * cg-testkit/src/runner.ts
 * Normative Test-Runner — CG-STD-5100 v1.3
 */

export interface TestCase {
  id: string;
  description: string;
  level: 1 | 2 | 3;
  tags?: string[];
  run: () => unknown | Promise<unknown>;
  expected: unknown;
}

export interface TestResult {
  id: string;
  description: string;
  level: 1 | 2 | 3;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export async function runTests(tests: TestCase[], maxLevel = 3): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const filtered = tests.filter(t => t.level <= maxLevel);

  for (const test of filtered) {
    const start = Date.now();
    try {
      const actual = await test.run();
      const passed = deepEqual(actual, test.expected);
      results.push({ id: test.id, description: test.description, level: test.level,
        passed, durationMs: Date.now() - start,
        error: passed ? undefined : `Erwartet: ${JSON.stringify(test.expected)}, Erhalten: ${JSON.stringify(actual)}` });
    } catch (err) {
      results.push({ id: test.id, description: test.description, level: test.level,
        passed: false, durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (!deepEqual(ka, kb)) return false;
    return ka.every(k => deepEqual((a as Record<string,unknown>)[k], (b as Record<string,unknown>)[k]));
  }
  return false;
}
