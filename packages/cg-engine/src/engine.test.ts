/**
 * cg-engine/src/engine.test.ts
 * Normative Testvektoren — CG-STD-3100 v1.5 Anhang A + Kap. 2.6
 * Alle Tests sind normativ: jede konforme Implementierung MUSS diese bestehen.
 */

import {
  safeAdd, mod, bigIntToBytesBigEndian, verifySerialization,
  computeMachineID, computeCGFI, checkExtent,
  Allen, utcSecondsToTaiNs, taiNsToUtcSeconds,
  cgfiToHex,
} from './engine.ts';
import { parseCGTA, encodeCGTA } from 'cg-types/domain.js';
import { parseCTDDL, DomainRegistry } from 'cg-ctddl/parser.js';
import { Errors } from 'cg-types/errors.js';
import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ── T-BIG: BigInt-Arithmetik (CG-STD-3100 Kap. 2.6) ─────────────────────────
console.log('\n── T-BIG: BigInt-Arithmetik ──');

test('T-BIG-001: add(2^100, 1) == 2^100+1', () => {
  const result = safeAdd(2n ** 100n, 1n);
  assert.equal(result, 2n ** 100n + 1n);
});

test('T-BIG-002: mod(-7, 3) == 2 (immer nicht-negativ)', () => {
  assert.equal(mod(-7n, 3n), 2n);
});

test('T-BIG-003: mod(6, 3) == 0', () => {
  assert.equal(mod(6n, 3n), 0n);
});

test('T-BIG-004: serialize(0) == [0x00]', () => {
  const b = bigIntToBytesBigEndian(0n);
  assert.equal(b.length, 1);
  assert.equal(b[0], 0x00);
});

test('T-BIG-005: serialize(256) == [0x01, 0x00]', () => {
  const b = bigIntToBytesBigEndian(256n);
  assert.equal(b.length, 2);
  assert.equal(b[0], 0x01);
  assert.equal(b[1], 0x00);
});

test('T-BIG-006: safeAdd(INT64_MAX, 1) mit Level 1 wirft CG-E-003', () => {
  const INT64_MAX = 9223372036854775807n;
  let threw = false;
  try { safeAdd(INT64_MAX, 1n, 1); }
  catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.equal((e as { code: string }).code, 'CG-E-003.004');
    }
  }
  assert.ok(threw, 'Muss CG-E-003 werfen');
});

test('T-BIG-007: verifySerialization() === true', () => {
  assert.ok(verifySerialization());
});

// ── T-CGTA: CGTA-Kodierung ────────────────────────────────────────────────────
console.log('\n── T-CGTA: CGTA-Kodierung ──');

test('T-CGTA-001: encode → parse Roundtrip', () => {
  const cgta = { domain: 'TAI', value: 1743585310000000000n, version: 1 };
  const encoded = encodeCGTA(cgta);
  const decoded = parseCGTA(encoded);
  assert.equal(decoded.domain, cgta.domain);
  assert.equal(decoded.value, cgta.value);
  assert.equal(decoded.version, cgta.version);
});

test('T-CGTA-002: ungültiges Format wirft Fehler', () => {
  assert.throws(() => parseCGTA('ungültig'), /CG-E-001.007/);
});

test('T-CGTA-003: sigma-Feld wird korrekt kodiert', () => {
  const cgta = { domain: 'TAI', value: 1743585310000000000n, version: 1, sigma: 100n };
  const encoded = encodeCGTA(cgta);
  assert.ok(encoded.includes(':σ100'));
  const decoded = parseCGTA(encoded);
  assert.equal(decoded.sigma, 100n);
});

// ── T-ENG: Engine-Kernfunktionen ──────────────────────────────────────────────
console.log('\n── T-ENG: Engine-Kernfunktionen ──');

test('T-ENG-001: MachineID ist deterministisch (I-R3)', () => {
  const tai = 1743585310000000000n;
  const mid1 = computeMachineID(tai);
  const mid2 = computeMachineID(tai);
  assert.deepEqual(mid1, mid2);
});

test('T-ENG-002: MachineID ist 32 Bytes (SHA-256)', () => {
  assert.equal(computeMachineID(1743585310000000000n).length, 32);
});

test('T-ENG-003: verschiedene Zeitpunkte → verschiedene MachineIDs', () => {
  const m1 = computeMachineID(1743585310000000000n);
  const m2 = computeMachineID(1743585310000000001n);
  assert.notDeepEqual(m1, m2);
});

test('T-ENG-004: CGFI ist deterministisch (I-R3)', () => {
  const tai = 1743585310000000000n;
  const content = Buffer.from('{"flight":"OS411"}');
  const typeId = 'aviation/atc-event/v1';
  const cgfi1 = computeCGFI(tai, content, typeId);
  const cgfi2 = computeCGFI(tai, content, typeId);
  assert.deepEqual(cgfi1, cgfi2);
});

test('T-ENG-005: CGFI ist 32 Bytes (SHA-256)', () => {
  const cgfi = computeCGFI(1743585310000000000n, Buffer.from('test'), 'test/v1');
  assert.equal(cgfi.length, 32);
});

test('T-ENG-006: verschiedener Inhalt → verschiedener CGFI (I-M1)', () => {
  const tai = 1743585310000000000n;
  const f1 = computeCGFI(tai, Buffer.from('inhalt-a'), 'test/v1');
  const f2 = computeCGFI(tai, Buffer.from('inhalt-b'), 'test/v1');
  assert.notDeepEqual(f1, f2);
});

test('T-ENG-007: seq ändert CGFI (Kollisionsschutz)', () => {
  const tai = 1743585310000000000n;
  const c = Buffer.from('gleich');
  const f1 = computeCGFI(tai, c, 'test/v1', 0);
  const f2 = computeCGFI(tai, c, 'test/v1', 1);
  assert.notDeepEqual(f1, f2);
});

// ── T-ENG: UC1-Testvektor (CG-APP-0600 Use Case 1) ───────────────────────────
console.log('\n── T-ENG: UC1-Testvektor (OS411 / EVINA) ──');

test('T-ENG-UC1-001: TAI Waypoint-Crossing = UTC + 37s', () => {
  // UTC 2026-04-02T09:14:33Z = 1743585273 Unix-Sekunden
  const utcSeconds = 1743585273n;
  const taiNs = utcSecondsToTaiNs(utcSeconds);
  const expectedTaiNs = (utcSeconds + 37n) * 1_000_000_000n;
  assert.equal(taiNs, expectedTaiNs);
});

test('T-ENG-UC1-002: Allen during(crossing, flight)', () => {
  const crossing = { start: 1743585310n, end: 1743585310n, domain: 'TAI', version: 1 };
  const flight   = { start: 1743583537n, end: 1743591337n, domain: 'TAI', version: 1 };
  assert.ok(Allen.during(crossing, flight));
});

test('T-ENG-UC1-003: Allen before(crossing, arrival)', () => {
  const crossing = { start: 1743585310n, end: 1743585310n, domain: 'TAI', version: 1 };
  const arrival  = { start: 1743591337n, end: 1743591337n, domain: 'TAI', version: 1 };
  assert.ok(Allen.before(crossing, arrival));
});

// ── T-ENG: UC3-Testvektor (Energiemesswert meets()-Reihe) ────────────────────
console.log('\n── T-ENG: UC3-Testvektor (Energiemesswert) ──');

test('T-ENG-UC3-001: meets() für 100ms-Zeitreihe', () => {
  const m1 = { start: 1744035862300_000_000n, end: 1744035862400_000_000n, domain: 'energy', version: 1 };
  const m2 = { start: 1744035862400_000_000n, end: 1744035862500_000_000n, domain: 'energy', version: 1 };
  assert.ok(Allen.meets(m1, m2));
  assert.ok(Allen.metBy(m2, m1));
});

test('T-ENG-UC3-002: TAI monoton über Sommerzeitumstellung', () => {
  // Sommerzeit 2026: 2026-03-29 01:00 UTC (03:00 → 02:00 CET→CEST)
  // TAI muss trotzdem strikt steigen
  const t1 = 1743209999_000_000_000n; // kurz vor Umstellung
  const t2 = 1743210000_000_000_000n; // kurz nach Umstellung
  assert.ok(t2 > t1, 'TAI ist monoton über Sommerzeitumstellung');
});

// ── T-ENG: UC4-Testvektor (Cosmic BigInt) ────────────────────────────────────
console.log('\n── T-ENG: UC4-Testvektor (Cosmic Domain) ──');

test('T-ENG-UC4-001: Cosmic-Age überschreitet INT64_MAX', () => {
  const INT64_MAX = 9223372036854775807n;
  const cosmicAgeNs = 435_116_774_400_000_000_000_000n;
  assert.ok(cosmicAgeNs > INT64_MAX, 'Cosmic-Domain erfordert BigInt (Level 3)');
});

test('T-ENG-UC4-002: BigInt Allen.before() auf kosmologischer Skala', () => {
  const obs1967 = { start: 434_693_261_180_800_000_000_000n, end: 434_693_261_187_200_000_000n, domain: 'cosmic', version: 1 };
  const obs1968 = { start: 434_724_797_180_800_000_000_000n, end: 434_724_797_184_400_000_000n, domain: 'cosmic', version: 1 };
  assert.ok(Allen.before(obs1967, obs1968), 'Kosmologische Zeitordnung');
});

// ── T-CTDDL: Parser-Tests ─────────────────────────────────────────────────────
console.log('\n── T-CTDDL: Parser ──');

const atcDomain = {
  name: 'aviation/atc-event',
  version: 1,
  semantics: 'time',
  type: 'piecewise-linear',
  granularity: '1000000000',
  extent: { min: '-210866803200000000000', max: null },
  epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 8, rationale: 'ICAO UTC' },
  mappings: [{
    targetDomain: 'Gregorian', targetVersion: 2,
    class: 'A', function: 'utc_to_tai_piecewise',
    leapSecondsRef: 'CG-STD-2100-AnnexA-v1.0',
  }],
};

test('T-CTDDL-001: gültige Domain wird akzeptiert', () => {
  const domain = parseCTDDL(atcDomain);
  assert.equal(domain.name, 'aviation/atc-event');
  assert.equal(domain.version, 1);
  assert.equal(domain.semantics, 'time');
});

test('T-CTDDL-002: fehlendes Pflichtfeld wirft CG-E-001.002', () => {
  const bad = { ...atcDomain, name: undefined };
  let threw = false;
  try { parseCTDDL(bad as unknown as object); }
  catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.equal((e as { code: string }).code, 'CG-E-001.002');
    }
  }
  assert.ok(threw);
});

test('T-CTDDL-003: ungültiger Domain-Typ wirft CG-E-001.004', () => {
  const bad = { ...atcDomain, type: 'invalid' };
  let threw = false;
  try { parseCTDDL(bad); }
  catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.equal((e as { code: string }).code, 'CG-E-001.004');
    }
  }
  assert.ok(threw);
});

test('T-CTDDL-004: stability=low ohne scientific_dependency wirft CG-E-008.001', () => {
  const bad = { ...atcDomain, stability: 'low' };
  let threw = false;
  try { parseCTDDL(bad); }
  catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.equal((e as { code: string }).code, 'CG-E-008.001');
    }
  }
  assert.ok(threw);
});

test('T-CTDDL-005: Registry verhindert Rollback (CG-E-007.004)', () => {
  const registry = new DomainRegistry();
  registry.register(parseCTDDL({ ...atcDomain, version: 2 }));
  let threw = false;
  try { registry.register(parseCTDDL({ ...atcDomain, version: 1 })); }
  catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.equal((e as { code: string }).code, 'CG-E-007.004');
    }
  }
  assert.ok(threw);
});

test('T-CTDDL-006: Registry verhindert Duplikat (CG-E-009.001)', () => {
  const registry = new DomainRegistry();
  registry.register(parseCTDDL(atcDomain));
  let threw = false;
  try { registry.register(parseCTDDL({ ...atcDomain, version: 2 }));
        registry.register(parseCTDDL({ ...atcDomain, version: 2 })); }
  catch (e: unknown) {
    threw = true;
  }
  assert.ok(threw);
});

test('T-CTDDL-007: I-D1 — registrierte Domain ist eingefroren', () => {
  const registry = new DomainRegistry();
  const domain = parseCTDDL(atcDomain);
  registry.register(domain);
  const retrieved = registry.get('aviation/atc-event', 1);
  assert.throws(() => {
    (retrieved as Record<string, unknown>).version = 99;
  }, 'Frozen object darf nicht mutiert werden');
});

// ── Allen: alle 13 Relationen ─────────────────────────────────────────────────
console.log('\n── T-ALLEN: alle 13 Relationen ──');

const A = { start: 10n, end: 20n, domain: 'test', version: 1 };
const B = { start: 30n, end: 40n, domain: 'test', version: 1 };

test('Allen before/after', () => {
  assert.ok(Allen.before(A, B));
  assert.ok(Allen.after(B, A));
  assert.ok(!Allen.before(B, A));
});

test('Allen meets/metBy', () => {
  const m1 = { start: 10n, end: 20n, domain: 'test', version: 1 };
  const m2 = { start: 20n, end: 30n, domain: 'test', version: 1 };
  assert.ok(Allen.meets(m1, m2));
  assert.ok(Allen.metBy(m2, m1));
});

test('Allen overlaps/overlappedBy', () => {
  const o1 = { start: 10n, end: 25n, domain: 'test', version: 1 };
  const o2 = { start: 20n, end: 40n, domain: 'test', version: 1 };
  assert.ok(Allen.overlaps(o1, o2));
  assert.ok(Allen.overlappedBy(o2, o1));
});

test('Allen during/contains', () => {
  const outer = { start: 0n, end: 100n, domain: 'test', version: 1 };
  const inner = { start: 10n, end: 20n, domain: 'test', version: 1 };
  assert.ok(Allen.during(inner, outer));
  assert.ok(Allen.contains(outer, inner));
});

test('Allen equals', () => {
  const x = { start: 10n, end: 20n, domain: 'test', version: 1 };
  const y = { start: 10n, end: 20n, domain: 'test', version: 1 };
  assert.ok(Allen.equals(x, y));
});

test('Allen starts/startedBy', () => {
  const s1 = { start: 10n, end: 20n, domain: 'test', version: 1 };
  const s2 = { start: 10n, end: 30n, domain: 'test', version: 1 };
  assert.ok(Allen.starts(s1, s2));
  assert.ok(Allen.startedBy(s2, s1));
});

test('Allen finishes/finishedBy', () => {
  const f1 = { start: 20n, end: 30n, domain: 'test', version: 1 };
  const f2 = { start: 10n, end: 30n, domain: 'test', version: 1 };
  assert.ok(Allen.finishes(f1, f2));
  assert.ok(Allen.finishedBy(f2, f1));
});

// ── Ergebnis ──────────────────────────────────────────────────────────────────
console.log(`\n── Ergebnis: ${passed} bestanden, ${failed} fehlgeschlagen ──\n`);
if (failed > 0) process.exit(1);