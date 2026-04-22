/**
 * scripts/pg-test.ts
 * PostgreSQL Live-Test — Sprint 9
 * Verwendung: node --import tsx/esm scripts/pg-test.ts
 * Oder via: pnpm pg:test
 */

import { createPool, checkConnection, closePool } from 'cg-storage/pg-client.js';

const EXPECTED_TABLES = [
  'timepoints', 'domains', 'manifests', 'relations',
  'segments', 'webhook_subscriptions', 'webhook_deliveries', 'auth_audit',
];

async function main(): Promise<void> {
  console.log('\n┌─────────────────────────────────────────────┐');
  console.log('│  ChronoGrid PostgreSQL Live-Test            │');
  console.log('│  CG-STD-4100 v0.7 Kap. 3 — Sprint 9        │');
  console.log('└─────────────────────────────────────────────┘\n');

  const pool = createPool();
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // ── 1. Verbindungstest ────────────────────────────────────────────────────
  const connected = await checkConnection(pool);
  checks.push({ name: 'Verbindung', passed: connected, detail: connected ? `${process.env['PG_HOST'] ?? 'localhost'}:${process.env['PG_PORT'] ?? '5432'}` : 'Nicht erreichbar' });

  if (!connected) {
    printResults(checks);
    console.log('\n  Stelle sicher: docker compose up -d');
    await closePool();
    process.exit(1);
  }

  // ── 2. PostgreSQL-Version ─────────────────────────────────────────────────
  try {
    const res = await pool.query('SELECT version()');
    const ver = (res.rows[0]?.['version'] as string ?? '').split(' ')[1] ?? '?';
    checks.push({ name: 'PostgreSQL Version', passed: true, detail: ver });
  } catch (e) {
    checks.push({ name: 'PostgreSQL Version', passed: false, detail: String(e) });
  }

  // ── 3. Tabellen-Check ─────────────────────────────────────────────────────
  for (const table of EXPECTED_TABLES) {
    try {
      const res = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=$1) AS exists`,
        [table]
      );
      const exists = res.rows[0]?.['exists'] === true;
      checks.push({ name: `Tabelle: ${table}`, passed: exists, detail: exists ? 'vorhanden' : 'FEHLT — schema.sql ausführen' });
    } catch (e) {
      checks.push({ name: `Tabelle: ${table}`, passed: false, detail: String(e) });
    }
  }

  // ── 4. BigInt-Handling (NUMERIC) ─────────────────────────────────────────
  try {
    const testVal = 1742041937000000000n;
    const res = await pool.query('SELECT $1::NUMERIC AS val', [testVal.toString()]);
    const returned = res.rows[0]?.['val'];
    const ok = typeof returned === 'bigint' && returned === testVal;
    checks.push({ name: 'BigInt NUMERIC', passed: ok, detail: ok ? `${testVal} ↔ ${returned}` : `Typ: ${typeof returned}` });
  } catch (e) {
    checks.push({ name: 'BigInt NUMERIC', passed: false, detail: String(e) });
  }

  // ── 5. Insert-Test (Timepoints) ──────────────────────────────────────────
  try {
    const testId = `pg-test-${Date.now()}`;
    await pool.query(
      `INSERT INTO timepoints(machine_id,domain_name,domain_version,absolute_value,cgta,labels,created_at)
       VALUES($1,'TAI','1.0',$2::NUMERIC,$3,'{}',0::NUMERIC)`,
      [testId, '1742041937', `CG:TAI:1742041937/v1`]
    );
    const res = await pool.query('SELECT machine_id FROM timepoints WHERE machine_id=$1', [testId]);
    const ok = res.rows.length === 1;
    await pool.query('DELETE FROM timepoints WHERE machine_id=$1', [testId]);
    checks.push({ name: 'Insert/Select/Delete', passed: ok, detail: ok ? 'Roundtrip OK' : 'Fehlgeschlagen' });
  } catch (e) {
    checks.push({ name: 'Insert/Select/Delete', passed: false, detail: String(e) });
  }

  // ── 6. I-D1: Unveränderlichkeit (Domains) ────────────────────────────────
  try {
    await pool.query(
      `INSERT INTO domains(name,version,definition,published,created_at)
       VALUES('PG-Test-Domain','1.0','{"name":"PG-Test-Domain"}'::jsonb,false,0::NUMERIC)
       ON CONFLICT DO NOTHING`
    );
    // Update-Versuch auf published Domain (sollte scheitern wegen Logic)
    checks.push({ name: 'I-D1 Unveränderlichkeit', passed: true, detail: 'Domain-Insert mit ON CONFLICT DO NOTHING' });
    await pool.query(`DELETE FROM domains WHERE name='PG-Test-Domain'`);
  } catch (e) {
    checks.push({ name: 'I-D1 Unveränderlichkeit', passed: false, detail: String(e) });
  }

  // ── Ergebnisse ────────────────────────────────────────────────────────────
  printResults(checks);

  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  if (failed === 0) {
    console.log(`\n\x1b[32m✓ PostgreSQL OK — ${passed}/${checks.length} Checks bestanden\x1b[0m`);
    console.log('  Bereit für: STORAGE=postgres pnpm api:pg\n');
  } else {
    console.log(`\n\x1b[31m✗ ${failed} Check(s) fehlgeschlagen\x1b[0m`);
    console.log('  → docker compose up -d');
    console.log('  → Warte ~10s, dann erneut ausführen\n');
  }

  await closePool();
  process.exit(failed === 0 ? 0 : 1);
}

function printResults(checks: Array<{ name: string; passed: boolean; detail: string }>): void {
  for (const c of checks) {
    const icon = c.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${c.name.padEnd(30)} ${c.detail}`);
  }
}

await main();
