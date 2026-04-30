/**
 * cgua.test.ts — Normative Testsuite CGUA-Algorithmen-Validierung
 *
 * T-ENG-100–107  CGUA-Arithmetik        (CG-STD-3100 v1.5 §11.2 + Anhang A)
 * T-ENG-112–114  semantics-Feld          (CG-STD-3100 v1.5 Anhang A)
 * T-CGUAS-001    allocate                (CG-STD-6100 v0.5 §3.1)
 * T-CGUAS-002    Kollisionsverhinderung  (CG-STD-6100 v0.5 §3.2)
 * T-CGUAS-003    N-CGUAS-001 Spezifität  (CG-STD-6100 v0.5 §3.4)
 * Determinismus  I-R3                    (CG-STD-3100 v1.5 §2.1)
 *
 * Ausführen: pnpm jest cgua.test
 */

import {
  CGUAS_MAX,
  isCGUAValid,
  cgua_safeAdd,
  toCGUA,
  cgua_toCGTA,
  parseCGTA_CGUAS,
  SegmentRegistry,
} from './cguas.js';

// ═══════════════════════════════════════════════════════════════════════
// T-ENG-10x: CGUA-Arithmetik
// ═══════════════════════════════════════════════════════════════════════

describe('T-ENG-10x: CGUA-Arithmetik', () => {

  test('T-ENG-100: isCGUAValid(0n) — untere Grenze', () => {
    expect(() => isCGUAValid(0n)).not.toThrow();
    expect(isCGUAValid(0n)).toBe(true);
  });

  test('T-ENG-101: isCGUAValid(CGUAS_MAX) — obere Grenze', () => {
    expect(() => isCGUAValid(CGUAS_MAX)).not.toThrow();
    expect(isCGUAValid(CGUAS_MAX)).toBe(true);
  });

  test('T-ENG-102: isCGUAValid(CGUAS_MAX + 1n) → Fehler', () => {
    expect(() => isCGUAValid(CGUAS_MAX + 1n)).toThrow();
  });

  test('T-ENG-103: isCGUAValid(-1n) → Fehler', () => {
    expect(() => isCGUAValid(-1n)).toThrow();
  });

  test('T-ENG-104: cgua_safeAdd — gültige Addition', () => {
    const a = 219_847_362_910_000_000_000_000n;
    const b = 7_234_891n;
    expect(cgua_safeAdd(a, b)).toBe(a + b);
  });

  test('T-ENG-105: cgua_safeAdd(CGUAS_MAX, 1n) → Overflow FATAL', () => {
    expect(() => cgua_safeAdd(CGUAS_MAX, 1n)).toThrow();
    expect(() => cgua_safeAdd(CGUAS_MAX - 1n, 2n)).toThrow();
  });

  test('T-ENG-106: toCGUA(100n, 50n) = 150n', () => {
    expect(toCGUA(100n, 50n)).toBe(150n);
  });

  test('T-ENG-106a: toCGUA(0n, 0n) = 0n', () => {
    expect(toCGUA(0n, 0n)).toBe(0n);
  });

  test('T-ENG-106b: toCGUA mit negativem Offset → Fehler', () => {
    expect(() => toCGUA(100n, -1n)).toThrow();
  });

  test('T-ENG-107: cgua_toCGTA erzeugt korrekte CGTA-Syntax', () => {
    const addr = 219_847_362_910_000_007_234_891n;
    const cgta = cgua_toCGTA(addr);
    expect(cgta).toBe(`CG:CGUAS:${addr}/v1`);
    expect(cgta).toMatch(/^CG:CGUAS:\d+\/v1$/);
  });

  test('T-ENG-107a: parseCGTA_CGUAS — Roundtrip', () => {
    const orig = 219_847_362_910_000_007_234_891n;
    expect(parseCGTA_CGUAS(cgua_toCGTA(orig))).toBe(orig);
  });

  test('T-ENG-100x: CGUAS_MAX normativ korrekt (435116774400000 s × 10^9)', () => {
    expect(CGUAS_MAX).toBe(435_116_774_400_000n * 1_000_000_000n);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-ENG-112–114: semantics-Feld
// ═══════════════════════════════════════════════════════════════════════

describe('T-ENG-11x: semantics-Feld', () => {

  test('T-ENG-112: semantics:address — CGTA parsebar', () => {
    const addr = 1_000_000_000_000n;
    expect(parseCGTA_CGUAS(cgua_toCGTA(addr))).toBe(addr);
  });

  test('T-ENG-113: semantics:filetype — Adresse valide', () => {
    expect(() => isCGUAValid(5_000_000_000_000_000n)).not.toThrow();
  });

  test('T-ENG-114: kein semantics-Feld — CGUA-Arithmetik domain-agnostisch', () => {
    expect(() => isCGUAValid(1_742_041_937_000_000_000n)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-CGUAS-001: allocate
// ═══════════════════════════════════════════════════════════════════════

describe('T-CGUAS-001: allocate', () => {

  test('T-CGUAS-001a: start, end, size_ns korrekt', () => {
    const r = new SegmentRegistry();
    const sz = 1_000_000_000_000_000n;
    const seg = r.allocate('at.gv.staatsarchiv', sz);
    expect(seg.base_address).toBe(0n);
    expect(seg.base_address + seg.size_ns).toBe(sz);
    expect(seg.size_ns).toBe(sz);
    expect(seg.granted_by).toBe('at.gv.staatsarchiv');
    expect(seg.status).toBe('active');
  });

  test('T-CGUAS-001b: Zwei sequenzielle Segmente sind zusammenhängend', () => {
    const r = new SegmentRegistry();
    const s1 = r.allocate('org.a', 1_000_000_000_000_000n);
    const s2 = r.allocate('org.b', 2_000_000_000_000_000n);
    expect(s2.base_address).toBe(s1.base_address + s1.size_ns);
  });

  test('T-CGUAS-001c: Overflow > CGUAS_MAX → Fehler FATAL', () => {
    const r = new SegmentRegistry();
    expect(() => r.allocate('org.greedy', CGUAS_MAX + 1n)).toThrow();
  });

  test('T-CGUAS-001d: sizeNs <= 0 → Fehler', () => {
    const r = new SegmentRegistry();
    expect(() => r.allocate('org.a', 0n)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-CGUAS-002: Kollisionsverhinderung
// ═══════════════════════════════════════════════════════════════════════

describe('T-CGUAS-002: Kollisionsverhinderung', () => {

  test('T-CGUAS-002a: Zwei Allokationen — kein Overlap', () => {
    const r = new SegmentRegistry();
    const s1 = r.allocate('org.a', 1_000_000_000_000_000n);
    const s2 = r.allocate('org.b', 1_000_000_000_000_000n);
    expect(s1.base_address + s1.size_ns).toBeLessThanOrEqual(s2.base_address);
  });

  test('T-CGUAS-002b: Drei Segmente — lückenlos und nicht-überlappend', () => {
    const r = new SegmentRegistry();
    const segs = [
      r.allocate('org.a', 500_000_000_000_000n),
      r.allocate('org.b', 300_000_000_000_000n),
      r.allocate('org.c', 200_000_000_000_000n),
    ];
    expect(segs[0]!.base_address).toBe(0n);
    expect(segs[1]!.base_address).toBe(segs[0]!.base_address + segs[0]!.size_ns);
    expect(segs[2]!.base_address).toBe(segs[1]!.base_address + segs[1]!.size_ns);
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const si = segs[i]!, sj = segs[j]!;
        const ov = si.base_address < sj.base_address + sj.size_ns &&
                   sj.base_address < si.base_address + si.size_ns;
        expect(ov).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// T-CGUAS-003: N-CGUAS-001 — findSegment Spezifität
// ═══════════════════════════════════════════════════════════════════════

describe('T-CGUAS-003: N-CGUAS-001 — findSegment', () => {

  test('T-CGUAS-003a: kleineres Segment gewinnt bei Adressüberschneidung', () => {
    const r = new SegmentRegistry();
    const big   = r.allocate('org.big',   1_000_000_000_000_000n);
    const small  = r.allocate('org.small', 1_000_000_000n);
    const found = r.findSegment(small.base_address + 1n);
    expect(found.id).toBe(small.id);
  });

  test('T-CGUAS-003b: N-CGUAS-001 direkt — kleinste size_ns gewinnt', () => {
    const r = new SegmentRegistry();
    r.allocate('org.large', 1_000_000_000_000n);
    const small = r.allocate('org.small', 500_000_000_000n);
    const found = r.findSegment(small.base_address + 1n);
    expect(found.id).toBe(small.id);
  });

  test('T-CGUAS-003c: kein Segment vorhanden → Fehler CG-E-010.002', () => {
    const r = new SegmentRegistry();
    expect(() => r.findSegment(42n)).toThrow();
  });

  test('T-CGUAS-003d: localOffset = addr - segment.base_address', () => {
    const r = new SegmentRegistry();
    const seg = r.allocate('at.gv.staatsarchiv', 1_000_000_000_000_000n);
    const offset = 7_234_891n;
    const addr = toCGUA(seg.base_address, offset);
    const found = r.findSegment(addr);
    expect(found.id).toBe(seg.id);
    expect(addr - found.base_address).toBe(offset);
  });

  test('T-CGUAS-003e: revoked Segment wird nicht gefunden', () => {
    const r = new SegmentRegistry();
    const seg = r.allocate('org.revoked', 1_000_000_000_000n);
    r.revoke(seg.id);
    expect(() => r.findSegment(seg.base_address + 1n)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Determinismus (I-R3, CG-STD-3100 §2.1)
// ═══════════════════════════════════════════════════════════════════════

describe('Determinismus: CGUA-Arithmetik (I-R3)', () => {

  test('isCGUAValid — 100× identisch', () => {
    const r = Array.from({ length: 100 }, () => isCGUAValid(219_847_362_910_000_007_234_891n));
    expect(r.every((v) => v === true)).toBe(true);
  });

  test('cgua_safeAdd — 100× identisch', () => {
    const a = 100_000_000_000_000n, b = 7_234_891n, e = a + b;
    expect(Array.from({ length: 100 }, () => cgua_safeAdd(a, b)).every((v) => v === e)).toBe(true);
  });

  test('toCGUA — 100× identisch', () => {
    const s = 219_847_362_910_000_000_000_000n, o = 7_234_891n, e = s + o;
    expect(Array.from({ length: 100 }, () => toCGUA(s, o)).every((v) => v === e)).toBe(true);
  });

  test('cgua_toCGTA — 100× identisch', () => {
    const addr = 219_847_362_910_000_007_234_891n;
    const e = `CG:CGUAS:${addr}/v1`;
    expect(Array.from({ length: 100 }, () => cgua_toCGTA(addr)).every((v) => v === e)).toBe(true);
  });
});