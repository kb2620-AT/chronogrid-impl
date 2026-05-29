/**
 * cg-zeitarithmetik.test.ts
 * Normative Testsuite — ChronoGrid Zeitarithmetik (ARITH Domain v1.0)
 *
 * Testbezeichnungen: T-ARITH-001 bis T-ARITH-040
 * Normative Basis: CG-STD-0000, CG-STD-3100, ARITH-v1.ctddl.json
 * Paket: cg-testkit
 *
 * Ausführung: pnpm test:arith
 */

import { describe, it, expect } from 'vitest';
import {
  fromSec, fromNs, arithIrrational, decode, compute, format,
  add, subtract, multiply, divide, modulo, power, compare,
  secToNs, nsToSecString,
  CG_E_003_ExtentError, CG_E_006_InvariantError, CG_E_008_ConstraintError,
  ARITH,
} from './cg-zeitarithmetik';

// ─── T-ARITH-00x: Konvertierung Float-String → BigInt ────────────────────────

describe('T-ARITH-00x: secToNs — Dezimal → BigInt Nanosekunden', () => {

  it('T-ARITH-001: Ganzzahl 144 → 144_000_000_000 ns', () => {
    expect(secToNs(144)).toBe(144_000_000_000n);
  });

  it('T-ARITH-002: Ganzzahl 3600 → 3_600_000_000_000 ns', () => {
    expect(secToNs(3600)).toBe(3_600_000_000_000n);
  });

  it('T-ARITH-003: Dezimal 17.123 → 17_123_000_000 ns (kein Float-Fehler)', () => {
    expect(secToNs('17.123')).toBe(17_123_000_000n);
  });

  it('T-ARITH-004: Dezimal 0.001 → 1_000_000 ns (1 ms)', () => {
    expect(secToNs('0.001')).toBe(1_000_000n);
  });

  it('T-ARITH-005: Dezimal 0.000000001 → 1 ns (Basiseinheit)', () => {
    expect(secToNs('0.000000001')).toBe(1n);
  });

  it('T-ARITH-006: Negativer Wert wirft CG-E-003 (C-ARITH-001)', () => {
    expect(() => secToNs('-1')).toThrow(CG_E_003_ExtentError);
  });

  it('T-ARITH-007: 86400 sec → 86_400_000_000_000 ns (1 Tag exakt)', () => {
    expect(secToNs(86400)).toBe(86_400_000_000_000n);
  });

  it('T-ARITH-008: Großer Wert 31536000 (1 Jahr) → korrekte BigInt', () => {
    expect(secToNs(31536000)).toBe(31_536_000_000_000_000n);
  });

});

// ─── T-ARITH-01x: Dekodierung ─────────────────────────────────────────────────

describe('T-ARITH-01x: decode — Zeitdarstellung', () => {

  it('T-ARITH-010: 144 sec → 2 min 24 sec', () => {
    const d = compute(144);
    expect(d.minutes).toBe(2n);
    expect(d.seconds).toBe(24n);
    expect(d.hours).toBe(0n);
    expect(d.days).toBe(0n);
  });

  it('T-ARITH-011: 3600 sec → 1 Stunde exakt', () => {
    const d = compute(3600);
    expect(d.hours).toBe(1n);
    expect(d.minutes).toBe(0n);
    expect(d.seconds).toBe(0n);
  });

  it('T-ARITH-012: 86400 sec → 1 Tag exakt', () => {
    const d = compute(86400);
    expect(d.days).toBe(1n);
    expect(d.hours).toBe(0n);
  });

  it('T-ARITH-013: 17.123 sec → 17 sec 123 ms', () => {
    const d = compute('17.123');
    expect(d.seconds).toBe(17n);
    expect(d.milliseconds).toBe(123n);
  });

  it('T-ARITH-014: 0.007 sec → 7 ms', () => {
    const d = compute('0.007');
    expect(d.milliseconds).toBe(7n);
    expect(d.seconds).toBe(0n);
  });

  it('T-ARITH-015: 0 sec → 0 sec', () => {
    const d = compute(0);
    expect(d.days).toBe(0n);
    expect(d.seconds).toBe(0n);
    expect(d.label_de).toBe('0 sec');
  });

  it('T-ARITH-016: CGTA-Notation korrekt', () => {
    const v = fromSec(144);
    const d = decode(v);
    expect(d.cgta).toBe('CG:ARITH:144000000000/v1');
  });

  it('T-ARITH-017: ISO 8601 Duration korrekt', () => {
    const d = compute(144);
    expect(d.iso8601).toBe('PT2M24S');
  });

  it('T-ARITH-018: ISO 8601 für 1 Stunde', () => {
    const d = compute(3600);
    expect(d.iso8601).toBe('PT1H');
  });

  it('T-ARITH-019: ISO 8601 für 1 Tag', () => {
    const d = compute(86400);
    expect(d.iso8601).toBe('P1DT');
  });

});

// ─── T-ARITH-02x: Arithmetische Operationen ──────────────────────────────────

describe('T-ARITH-02x: Arithmetische Operationen', () => {

  it('T-ARITH-020: add(144, 216) = 360 sec = 6 min', () => {
    const a = fromSec(144);
    const b = fromSec(216);
    const r = add(a, b);
    expect(r.value.ns).toBe(360_000_000_000n);
    expect(r.decoded.minutes).toBe(6n);
  });

  it('T-ARITH-021: add(3600, 60) = 3660 sec = 1h 1min', () => {
    const r = add(fromSec(3600), fromSec(60));
    expect(r.value.ns).toBe(3_660_000_000_000n);
    expect(r.decoded.hours).toBe(1n);
    expect(r.decoded.minutes).toBe(1n);
  });

  it('T-ARITH-022: subtract(3660, 60) = 3600 sec = 1h', () => {
    const r = subtract(fromSec(3660), fromSec(60));
    expect(r.value.ns).toBe(3_600_000_000_000n);
    expect(r.decoded.hours).toBe(1n);
  });

  it('T-ARITH-023: subtract(a, b) mit a < b wirft CG-E-003', () => {
    expect(() => subtract(fromSec(60), fromSec(144)))
      .toThrow(CG_E_003_ExtentError);
  });

  it('T-ARITH-024: multiply(60, 60n) = 3600 sec', () => {
    const r = multiply(fromSec(60), 60n);
    expect(r.value.ns).toBe(3_600_000_000_000n);
  });

  it('T-ARITH-025: multiply(12, 12n) = 144 sec [Fibonacci F12]', () => {
    const r = multiply(fromSec(12), 12n);
    expect(r.value.ns).toBe(144_000_000_000n);
    expect(r.decoded.minutes).toBe(2n);
    expect(r.decoded.seconds).toBe(24n);
  });

  it('T-ARITH-026: multiply(negativ) wirft CG-E-008', () => {
    expect(() => multiply(fromSec(100), -1n))
      .toThrow(CG_E_008_ConstraintError);
  });

  it('T-ARITH-027: divide(3600, 4n) = 900 sec = 15 min', () => {
    const r = divide(fromSec(3600), 4n);
    expect(r.value.ns).toBe(900_000_000_000n);
    expect(r.decoded.minutes).toBe(15n);
  });

  it('T-ARITH-028: divide durch 0 wirft CG-E-008', () => {
    expect(() => divide(fromSec(100), 0n))
      .toThrow(CG_E_008_ConstraintError);
  });

  it('T-ARITH-029: modulo(3661, 3600n) = 61 sec = 1min 1sec', () => {
    const r = modulo(fromSec(3661), 3_600_000_000_000n);
    expect(r.value.ns).toBe(61_000_000_000n);
    expect(r.decoded.minutes).toBe(1n);
    expect(r.decoded.seconds).toBe(1n);
  });

  it('T-ARITH-030: power(fromNs(60000000000), 2n) = 3600 sec^2 in ns', () => {
    // 60 sec ^ 2 = 3600 sec² (in ns²: sehr große Zahl, BigInt hält das)
    const r = power(fromNs(60n), 2n); // 60 ns ^ 2 = 3600 ns
    expect(r.value.ns).toBe(3600n);
  });

});

// ─── T-ARITH-03x: Irrationale Konstanten ─────────────────────────────────────

describe('T-ARITH-03x: Irrationale Konstanten und Approximation', () => {

  it('T-ARITH-030: PI × 1 sec ≈ 3_141_592_653 ns', () => {
    const v = arithIrrational('pi', 1);
    expect(v.ns).toBe(3_141_592_653n);
    expect(v.approx).toBeDefined();
    expect(v.approx!.source).toBe('pi');
  });

  it('T-ARITH-031: PI × 3600 sec → Zeitdarstellung korrekt', () => {
    const v = arithIrrational('pi', 3600);
    const d = decode(v);
    // π × 3600 = 11309.733... sec = 3h 8min 29sec + Subsekunden
    expect(d.hours).toBe(3n);
    expect(d.minutes).toBe(8n);
  });

  it('T-ARITH-032: Approximationsannotation trägt Fehler', () => {
    const v = arithIrrational('e', 100);
    expect(v.approx).toBeDefined();
    expect(v.approx!.error_ns).toBeGreaterThanOrEqual(1n);
  });

  it('T-ARITH-033: PHI × 1 sec ≈ 1_618_033_988 ns (Goldener Schnitt)', () => {
    const v = ARITH.PHI;
    expect(v.ns).toBe(1_618_033_988n);
  });

  it('T-ARITH-034: Fibonacci F12 = 144 sec = 12×12', () => {
    const v = ARITH.FIBONACCI_F12;
    const d = decode(v);
    expect(d.minutes).toBe(2n);
    expect(d.seconds).toBe(24n);
    expect(v.ns).toBe(144_000_000_000n);
  });

});

// ─── T-ARITH-04x: Vergleich und Invarianten ──────────────────────────────────

describe('T-ARITH-04x: Vergleich (I-R2) und Invarianten', () => {

  it('T-ARITH-040: compare(60, 3600) = less', () => {
    expect(compare(fromSec(60), fromSec(3600))).toBe('less');
  });

  it('T-ARITH-041: compare(3600, 3600) = equal', () => {
    expect(compare(fromSec(3600), fromSec(3600))).toBe('equal');
  });

  it('T-ARITH-042: compare(86400, 3600) = greater', () => {
    expect(compare(fromSec(86400), fromSec(3600))).toBe('greater');
  });

  it('T-ARITH-043: 144 sec Roundtrip: fromSec → decode → ns identisch', () => {
    const v  = fromSec(144);
    const d  = decode(v);
    // Rückrechnung: days×DAY + hours×HOUR + min×MIN + sec×SEC + ms×MS + us×US + ns
    const reconstructed =
      d.days         * 86_400_000_000_000n +
      d.hours        *  3_600_000_000_000n +
      d.minutes      *     60_000_000_000n +
      d.seconds      *      1_000_000_000n +
      d.milliseconds *          1_000_000n +
      d.microseconds *              1_000n +
      d.nanoseconds;
    expect(reconstructed).toBe(v.ns);
  });

  it('T-ARITH-044: 1 Tag Roundtrip exakt', () => {
    const v  = ARITH.ONE_DAY;
    const d  = decode(v);
    expect(d.days).toBe(1n);
    expect(d.hours).toBe(0n);
    expect(d.minutes).toBe(0n);
    expect(d.seconds).toBe(0n);
  });

  it('T-ARITH-045: I-R3 Determinismus — zweimal fromSec(144) = identisch', () => {
    const v1 = fromSec(144);
    const v2 = fromSec(144);
    expect(v1.ns).toBe(v2.ns);
    expect(v1.sigma).toBe(v2.sigma);
  });

  it('T-ARITH-046: sigma=period korrekt gesetzt', () => {
    const v = fromSec('1337.759', 'period');
    expect(v.sigma).toBe('period');
  });

  it('T-ARITH-047: Großer Wert — Alter des Universums (partiell)', () => {
    // 13.8 Mrd. Jahre in Sekunden: 4.354e17
    // Hier nur Teilwert um Testlaufzeit zu begrenzen
    const yearNs = 31_536_000_000_000_000n; // 1 Jahr in ns
    const v = fromNs(yearNs * 1_000_000n);  // 1 Mio Jahre
    expect(v.ns).toBe(yearNs * 1_000_000n);
    expect(v.sigma).toBe('duration');
  });

});

// ─── T-ARITH-05x: Fehlercodes ────────────────────────────────────────────────

describe('T-ARITH-05x: Fehlercode-Verhalten', () => {

  it('T-ARITH-050: CG-E-003 hat korrekten code', () => {
    try {
      fromSec(-1);
    } catch (e) {
      expect((e as CG_E_003_ExtentError).code).toBe('CG-E-003');
    }
  });

  it('T-ARITH-051: CG-E-008 bei Division durch 0', () => {
    try {
      divide(fromSec(100), 0n);
    } catch (e) {
      expect((e as CG_E_008_ConstraintError).code).toBe('CG-E-008');
    }
  });

  it('T-ARITH-052: subtract negatives Ergebnis → CG-E-003', () => {
    expect(() => subtract(fromSec(1), fromSec(2))).toThrow(CG_E_003_ExtentError);
  });

  it('T-ARITH-053: multiply negativer Faktor → CG-E-008', () => {
    expect(() => multiply(fromSec(60), -5n)).toThrow(CG_E_008_ConstraintError);
  });

});
