/**
 * cg-engine/src/sprint2.test.ts
 * Normative Testvektoren Sprint 2 — CG-STD-3100 v1.5 Kap. 4, 8, 11
 */
import assert from 'node:assert/strict';
import { isLeapYear, daysInMonth, encodeGregorian, toISO8601, verifyGregorianRoundtrip, } from './gregorian.js';
import { utcToTai, taiToUtc, utcNsToTaiNs, taiNsToUtcNs, gpsNsToTaiNs, taiNsToGpsNs, convert, lookupTaiOffset, } from './mapping.js';
import { BUILTIN_DOMAINS, getBuiltinDomain } from './domains.js';
let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    }
    catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        failed++;
    }
}
// ── T-ENG-01x: Gregorianischer Encode/Decode ─────────────────────────────────
console.log('\n── T-ENG-01x: Gregorianischer Encode/Decode ──');
test('T-ENG-011: Unix-Epoche 1970-01-01T00:00:00Z = 0 Sekunden', () => {
    // Gregorian-Epoche ist 0001-01-01; Unix-Epoche ist 1970-01-01
    // Sekunden von 0001-01-01 bis 1970-01-01 = 62135596800
    const unixEpoch = { year: 1970n, month: 1n, day: 1n, hour: 0n, minute: 0n, second: 0n };
    const encoded = encodeGregorian(unixEpoch);
    assert.equal(encoded, 62135596800n, `Erwartet 62135596800, got ${encoded}`);
});
test('T-ENG-012: Roundtrip 2026-04-02T09:14:33Z', () => {
    const c = { year: 2026n, month: 4n, day: 2n, hour: 9n, minute: 14n, second: 33n };
    assert.ok(verifyGregorianRoundtrip(c), 'Roundtrip muss exakt sein (I-M1)');
});
test('T-ENG-013: Roundtrip 2026-03-29T01:59:59Z (kurz vor Sommerzeit)', () => {
    const c = { year: 2026n, month: 3n, day: 29n, hour: 1n, minute: 59n, second: 59n };
    assert.ok(verifyGregorianRoundtrip(c));
});
test('T-ENG-014: Schaltjahr-Logik (normativ)', () => {
    assert.ok(isLeapYear(2000n), '2000 ist Schaltjahr (÷400)');
    assert.ok(!isLeapYear(1900n), '1900 ist kein Schaltjahr (÷100, nicht ÷400)');
    assert.ok(isLeapYear(2024n), '2024 ist Schaltjahr (÷4)');
    assert.ok(!isLeapYear(2023n), '2023 ist kein Schaltjahr');
});
test('T-ENG-015: daysInMonth Feb 2024 (Schaltjahr) = 29', () => {
    assert.equal(daysInMonth(2n, 2024n), 29n);
});
test('T-ENG-016: daysInMonth Feb 2023 (kein Schaltjahr) = 28', () => {
    assert.equal(daysInMonth(2n, 2023n), 28n);
});
test('T-ENG-017: ISO-8601-Label korrekt', () => {
    const c = { year: 2026n, month: 4n, day: 2n, hour: 9n, minute: 14n, second: 33n };
    assert.equal(toISO8601(c), '2026-04-02T09:14:33Z');
});
test('T-ENG-018: Roundtrip historisch 1582-10-15T00:00:00Z (Gregorianische Reform)', () => {
    const c = { year: 1582n, month: 10n, day: 15n, hour: 0n, minute: 0n, second: 0n };
    assert.ok(verifyGregorianRoundtrip(c));
});
test('T-ENG-019: Roundtrip Cosmic-Skala Jahr 12000', () => {
    const c = { year: 12000n, month: 6n, day: 15n, hour: 12n, minute: 0n, second: 0n };
    assert.ok(verifyGregorianRoundtrip(c));
});
// ── T-ENG-03x: Mapping-Tests ──────────────────────────────────────────────────
console.log('\n── T-ENG-03x: Mapping (piecewise-linear) ──');
test('T-ENG-031: UTC → TAI, Offset 2026 = 37s', () => {
    // 2026-04-02T09:14:33Z = 1743585273 Unix-Sekunden
    const utcSec = 1743585273n;
    const taiSec = utcToTai(utcSec);
    assert.equal(taiSec - utcSec, 37n, `TAI-UTC muss 37 sein, got ${taiSec - utcSec}`);
});
test('T-ENG-032: TAI → UTC korrekt invertiert', () => {
    const utcSec = 1743585273n;
    const taiSec = utcToTai(utcSec);
    const backToUtc = taiToUtc(taiSec);
    assert.equal(backToUtc, utcSec, 'TAI→UTC muss Inverse von UTC→TAI sein');
});
test('T-ENG-033: Schaltsekunden-Lookup 1972-07-01 → Offset 11', () => {
    // 1972-07-01 00:00:00 UTC = 78796800 Unix-Sekunden
    const offset = lookupTaiOffset(78796800n);
    assert.equal(offset, 11, `Erwartet 11, got ${offset}`);
});
test('T-ENG-034: Schaltsekunden-Lookup 2017-01-01 → Offset 37 (aktuell)', () => {
    const offset = lookupTaiOffset(1483228800n);
    assert.equal(offset, 37, `Erwartet 37, got ${offset}`);
});
test('T-ENG-035: GPS → TAI konstant +19s', () => {
    const gpsNs = 1743585273000000000n;
    const taiNs = gpsNsToTaiNs(gpsNs);
    assert.equal(taiNs - gpsNs, 19n * 1000000000n);
});
test('T-ENG-036: TAI → GPS korrekt invertiert', () => {
    const taiNs = 1743585310000000000n;
    const gpsNs = taiNsToGpsNs(taiNs);
    assert.equal(gpsNsToTaiNs(gpsNs), taiNs);
});
test('T-ENG-037: UTC→TAI Sub-Sekunden (Nanosekunden-Granularität)', () => {
    // 2026-04-07T14:23:45.300Z in TAI
    const utcMs = 1744035825300n;
    const utcNs = utcMs * 1000000n;
    const taiNs = utcNsToTaiNs(utcNs);
    const expectedOffset = 37n * 1000000000n;
    assert.equal(taiNs - utcNs, expectedOffset, 'Sub-Sekunden-Offset muss korrekt sein');
});
test('T-ENG-038: TAI→UTC Sub-Sekunden korrekt invertiert', () => {
    const utcNs = 1744035825300000000n;
    const taiNs = utcNsToTaiNs(utcNs);
    const backNs = taiNsToUtcNs(taiNs);
    assert.equal(backNs, utcNs);
});
test('T-ENG-039: convert() UTC→GPS in zwei Schritten', () => {
    // UTC-Sekunden → TAI → GPS
    const utcNs = 1743585273000000000n;
    const gpsNs = convert(utcNs, 'UTC', 'GPS');
    // GPS = UTC + 37 - 19 = UTC + 18s
    const expectedDiff = (37n - 19n) * 1000000000n;
    assert.equal(gpsNs - utcNs, expectedDiff, `GPS-UTC-Differenz muss 18s sein, got ${gpsNs - utcNs}`);
});
test('T-ENG-040: TAI-Monotonie über Schaltsekunde 2016-12-31', () => {
    // 2016-12-31 23:59:59 UTC → 2017-01-01 00:00:00 UTC
    // Schaltsekunde: UTC springt 23:59:60 (existiert nur in UTC, nicht TAI)
    const utcBefore = 1483228799n; // 23:59:59
    const utcAfter = 1483228800n; // 00:00:00 des nächsten Tages
    const taiBefore = utcToTai(utcBefore);
    const taiAfter = utcToTai(utcAfter);
    assert.ok(taiAfter > taiBefore, 'TAI muss strikt monoton steigen');
    assert.equal(taiAfter - taiBefore, 2n, 'TAI-Differenz = 2s (UTC +1s Schaltsekunde +1s normal)');
});
// ── T-DOM: Built-in Domains ───────────────────────────────────────────────────
console.log('\n── T-DOM: Built-in Domains ──');
test('T-DOM-001: alle 6 Built-in Domains vorhanden', () => {
    assert.equal(BUILTIN_DOMAINS.length, 6);
    const names = BUILTIN_DOMAINS.map(d => d.name);
    assert.ok(names.includes('TAI'));
    assert.ok(names.includes('Gregorian'));
    assert.ok(names.includes('Unix'));
    assert.ok(names.includes('GPS'));
    assert.ok(names.includes('UTC'));
    assert.ok(names.includes('Cosmic'));
});
test('T-DOM-002: alle Built-in Domains haben semantics=time', () => {
    for (const d of BUILTIN_DOMAINS) {
        assert.equal(d.semantics, 'time', `${d.name} muss semantics=time haben`);
    }
});
test('T-DOM-003: TAI hat leeres mappings-Array (Basisdomäne)', () => {
    const tai = getBuiltinDomain('TAI', 1);
    assert.ok(Array.isArray(tai.mappings));
    assert.equal(tai.mappings.length, 0);
});
test('T-DOM-004: Cosmic hat scientific_dependency (stability=low)', () => {
    const cosmic = getBuiltinDomain('Cosmic', 1);
    assert.equal(cosmic.stability, 'low');
    assert.ok(cosmic.scientific_dependency, 'scientific_dependency muss vorhanden sein');
    assert.equal(cosmic.scientific_dependency.model, 'Planck-2018');
});
test('T-DOM-005: Cosmic extent.max = Universumsalter in ns', () => {
    const cosmic = getBuiltinDomain('Cosmic', 1);
    const maxNs = BigInt(cosmic.extent.max);
    const INT64_MAX = 9223372036854775807n;
    assert.ok(maxNs > INT64_MAX, 'Cosmic-Domain erfordert BigInt — größer als INT64_MAX');
});
test('T-DOM-006: I-D1 — Built-in Domains sind eingefroren', () => {
    const tai = getBuiltinDomain('TAI', 1);
    assert.throws(() => {
        tai.version = 99;
    }, 'Frozen object muss nicht-mutierbar sein');
});
test('T-DOM-007: GPS-Offset normativ = 19s (konstant)', () => {
    const gps = getBuiltinDomain('GPS', 1);
    assert.equal(gps.epoch.tai_offset, 19);
});
// ── T-ENG: UC1 vollständig (Kap. 4 + 8) ─────────────────────────────────────
console.log('\n── T-ENG: UC1 vollständig (OS411 / EVINA, Gregorian + TAI) ──');
test('T-ENG-UC1-010: Gregorianische Encode stimmt mit CG-APP-0600 überein', () => {
    // 2026-04-02T09:14:33Z als Unix: 1743585273
    const c = { year: 2026n, month: 4n, day: 2n, hour: 9n, minute: 14n, second: 33n };
    const gregSec = encodeGregorian(c);
    // Gregorian-Epoche-Offset zu Unix: 62135596800s
    const unixSec = gregSec - 62135596800n;
    assert.equal(unixSec, 1743585273n, `Unix-Sekunden muss 1743585273 sein, got ${unixSec}`);
});
test('T-ENG-UC1-011: UTC→TAI→CGTA vollständiger Pfad', () => {
    const utcSec = 1743585273n; // 2026-04-02T09:14:33Z
    const taiSec = utcToTai(utcSec); // + 37s
    const taiNs = taiSec * 1000000000n; // → Nanosekunden
    assert.equal(taiNs, 1743585310000000000n); // CG-APP-0600 Testvektor
});
test('T-ENG-UC3-010: Energiemesswert TAI-Nanosekunden Sub-Sekunden', () => {
    // 2026-04-07T14:23:45.300Z
    const utcMs = 1744035825300n;
    const taiNs = utcNsToTaiNs(utcMs * 1000000n);
    assert.equal(taiNs, 1744035862300000000n, `UC3 TAI-Nanosekunden muss 1744035862300000000 sein, got ${taiNs}`);
});
// ── Ergebnis ──────────────────────────────────────────────────────────────────
console.log(`\n── Ergebnis Sprint 2: ${passed} bestanden, ${failed} fehlgeschlagen ──\n`);
if (failed > 0)
    process.exit(1);
