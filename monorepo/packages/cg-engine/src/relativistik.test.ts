/**
 * relativistik.test.ts
 * Klasse-B-Mapping (RK45) — exakte BigInt-Arithmetik
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6, CG-STD-0000 §I-R3,
 *                  IS-GPS-200 §20.3.3.3.3.1
 * Stand: August 2026 — A4/Weg A, Schritt 2
 *
 * Gliederung:
 *   T-RELB-01x  exakte Arithmetik (Rat, isqrt)
 *   T-RELB-02x  RKF45-Tableau: Ordnungsbedingungen, exakt in BigInt
 *   T-RELB-03x  Integrator: exakte Identitäten (konstanter Integrand)
 *   T-RELB-04x  Physik gegen analytische Referenzen (GPS, ISS, Exzentrizität)
 *   T-RELB-05x  Determinismus (I-R3), Fehlerpfade
 *
 * Die normativen Tests T-L3-RK45-001…005 liegen in
 * cg-testkit/src/suites/t-l3-rk45.ts und sind seit diesem Schritt aktiv.
 */

import { describe, it, expect } from 'vitest';
import {
  type Rat, rat, ratAdd, ratSub, ratMul, ratDiv, ratCmp, ratAbs, ratEq, ratPow,
  ratToNumber, ratFromDecimal, ratRoundToScale, isqrt, isqrtScaled, gcd, lcm,
} from './exakt.js';
import {
  C_LIGHT, C_SQ, GM_EARTH, L_G, RATE_SCALE,
  RK_NODE_N, RK_NODE_D, RK_B4, RK_B5, RK_B_DEN,
  GPS_SEMI_MAJOR_AXIS, ISS_SEMI_MAJOR_AXIS, F_GPS_APPROX,
  properTimeRateExact, properTimeRateScaled, srRateTermExact, analyticMeanRateExact,
  executeClassBMapping, constantWorldline, keplerFixtureWorldline,
  gpsFixtureWorldline, issFixtureWorldline, solveKepler, orbitalPeriodApprox,
  lorentzGammaApprox,
} from './relativistik.js';

const NS = 1_000_000_000n;
const T0 = 1_770_000_000n * NS;           // beliebiger TAI-Startpunkt (ns)
const SEC_PER_DAY = 86_400n;

/** |a − b| < tol, vollständig rational. */
function ratWithin(a: Rat, b: Rat, tol: Rat): boolean {
  return ratCmp(ratAbs(ratSub(a, b)), tol) < 0;
}
const TOL = (exp: number): Rat => rat(1n, 10n ** BigInt(exp));

/** Exzentrische Anomalie der Fixture-Bahn nach dtSec (Referenzrechnung). */
function E_at(a: number, e: number, dtSec: number): number {
  return solveKepler(Math.sqrt(Number(GM_EARTH) / (a * a * a)) * dtSec, e);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-01x: exakte Arithmetik (exakt.ts)', () => {

  it('T-RELB-011: Rat ist kanonisch — gekürzt, Vorzeichen im Zähler', () => {
    expect(rat(6n, 8n)).toEqual({ n: 3n, d: 4n });
    expect(rat(-6n, 8n)).toEqual({ n: -3n, d: 4n });
    expect(rat(6n, -8n)).toEqual({ n: -3n, d: 4n });
    expect(rat(0n, -5n)).toEqual({ n: 0n, d: 1n });
    expect(() => rat(1n, 0n)).toThrow(/Nenner/);
    expect(gcd(-12n, 18n)).toBe(6n);
    expect(lcm(4n, 6n)).toBe(12n);
  });

  it('T-RELB-012: Körperaxiome auf Zufallswerten — kein Rundungsdrift', () => {
    // deterministische Pseudozufallsfolge (I-R3: kein Math.random)
    let s = 12345n;
    const next = (): bigint => { s = (s * 6364136223846793005n + 1442695040888963407n) % (1n << 62n); return (s % 2001n) - 1000n; };
    for (let i = 0; i < 200; i++) {
      const a = rat(next(), next() || 1n), b = rat(next(), next() || 1n), c = rat(next(), next() || 1n);
      expect(ratEq(ratAdd(a, b), ratAdd(b, a))).toBe(true);
      expect(ratEq(ratMul(a, ratAdd(b, c)), ratAdd(ratMul(a, b), ratMul(a, c)))).toBe(true);
      if (b.n !== 0n) expect(ratEq(ratMul(ratDiv(a, b), b), a)).toBe(true);
    }
  });

  it('T-RELB-013: ratFromDecimal ist verlustfrei (Naturkonstanten)', () => {
    expect(ratFromDecimal('6.969290134e-10')).toEqual(rat(6_969_290_134n, 10n ** 19n));
    expect(ratFromDecimal('3.986004418e14')).toEqual(rat(398_600_441_800_000n, 1n));
    expect(ratFromDecimal('-0.5')).toEqual(rat(-1n, 2n));
    expect(L_G).toEqual(rat(6_969_290_134n, 10n ** 19n));
    expect(C_SQ).toBe(89_875_517_873_681_764n);   // 299792458² exakt
    expect(C_LIGHT * C_LIGHT).toBe(C_SQ);
  });

  it('T-RELB-014: ratRoundToScale rundet symmetrisch (half away from zero)', () => {
    expect(ratRoundToScale(rat(1n, 2n), 1n)).toBe(1n);
    expect(ratRoundToScale(rat(-1n, 2n), 1n)).toBe(-1n);
    expect(ratRoundToScale(rat(3n, 2n), 1n)).toBe(2n);
    expect(ratRoundToScale(rat(-3n, 2n), 1n)).toBe(-2n);
    expect(ratRoundToScale(rat(1n, 3n), 1n)).toBe(0n);
    expect(ratRoundToScale(rat(2n, 3n), 100n)).toBe(67n);
  });

  it('T-RELB-015: isqrt = ⌊√n⌋ exakt, auch jenseits von 2⁵³', () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    for (const k of [7n, 12345n, 2n ** 40n + 7n, 10n ** 25n + 3n, 2n ** 100n - 1n]) {
      const sq = k * k;
      expect(isqrt(sq)).toBe(k);            // exakte Quadrate
      expect(isqrt(sq - 1n)).toBe(k - 1n);  // knapp darunter
      expect(isqrt(sq + 2n * k)).toBe(k);   // knapp unter (k+1)²
    }
    expect(() => isqrt(-1n)).toThrow(/negativ/);
  });

  it('T-RELB-016: isqrtScaled — Abschneidefehler strikt < 1/scale', () => {
    const x = rat(2n);                       // √2 = 1,41421356237309504880…
    expect(isqrtScaled(x, 10n ** 20n)).toBe(141_421_356_237_309_504_880n);
    // Fehlerschranke: (q/scale)² ≤ x < ((q+1)/scale)²
    for (const scale of [10n ** 6n, 10n ** 18n, 10n ** 30n]) {
      const q = isqrtScaled(x, scale);
      expect(ratCmp(ratMul(rat(q, scale), rat(q, scale)), x)).toBeLessThanOrEqual(0);
      expect(ratCmp(ratMul(rat(q + 1n, scale), rat(q + 1n, scale)), x)).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-02x: RKF45-Tableau exakt (Fehlberg 1969)', () => {

  const node = (i: number): Rat => rat(RK_NODE_N[i]!, RK_NODE_D[i]!);
  /** Σ bᵢ·cᵢᵏ als exakter Bruch (Gewichte sind mit RK_B_DEN skaliert). */
  const moment = (B: readonly bigint[], k: number): Rat => {
    let acc = rat(0n);
    for (let i = 0; i < 6; i++) acc = ratAdd(acc, ratMul(rat(B[i]!, RK_B_DEN), ratPow(node(i), k)));
    return acc;
  };

  it('T-RELB-021: b₅ erfüllt die Ordnungsbedingungen bis Grad 4 (Ordnung 5)', () => {
    for (let k = 0; k <= 4; k++) {
      expect(ratEq(moment(RK_B5, k), rat(1n, BigInt(k + 1)))).toBe(true);
    }
    // Gegenprobe: bei Grad 5 endet die Exaktheit
    expect(ratEq(moment(RK_B5, 5), rat(1n, 6n))).toBe(false);
  });

  it('T-RELB-022: b₄ erfüllt die Bedingungen bis Grad 3 — und nur bis dort', () => {
    for (let k = 0; k <= 3; k++) {
      expect(ratEq(moment(RK_B4, k), rat(1n, BigInt(k + 1)))).toBe(true);
    }
    expect(ratEq(moment(RK_B4, 4), rat(1n, 5n))).toBe(false);
  });

  it('T-RELB-023: Zerlegung der Eins und ganzzahliger Nenner', () => {
    expect(RK_B4.reduce((a, b) => a + b, 0n)).toBe(RK_B_DEN);
    expect(RK_B5.reduce((a, b) => a + b, 0n)).toBe(RK_B_DEN);
    // RK_B_DEN ist das kgV aller Gewichtsnenner — jeder Knotennenner teilt 104
    for (let i = 0; i < 6; i++) expect(104n % RK_NODE_D[i]!).toBe(0n);
    expect(RK_B_DEN).toBe(1_128_600n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-03x: Integrator — exakte Identitäten', () => {

  /** GPS-artiger Zustand mit exakt rationalen Komponenten. */
  const stillState = {
    r: [rat(GPS_SEMI_MAJOR_AXIS), rat(0n), rat(0n)] as const,
    v: [rat(0n), rat(3874n), rat(0n)] as const,
  };

  it('T-RELB-031: konstanter Integrand ⇒ Δ = span·f exakt (keine Restrundung)', () => {
    const W = constantWorldline('urn:cg:worldline:konstant', stillState.r, stillState.v);
    const F = properTimeRateScaled(W.stateAt(rat(0n)));
    const span = 86_400n * NS;
    const res = executeClassBMapping({
      worldline: W, tStartTaiNs: T0, tEndTaiNs: T0 + span,
      rateTolerance: TOL(24), maxStepNs: span,   // konstanter Integrand, kein Aliasing
    });
    // Exakte Gleichheit der Bruchdarstellung, nicht bloß numerische Nähe
    expect(ratEq(res.deltaExact, rat(span * F, RATE_SCALE))).toBe(true);
    expect(res.maxLocalError).toBe(0n);      // y₄ und y₅ stimmen überein
    expect(res.steps).toBe(1);
    expect(res.rejectedSteps).toBe(0);
    expect(res.minStepHits).toBe(0);
  });

  it('T-RELB-032: Additivität — [t₀,t₁] + [t₁,t₂] = [t₀,t₂] bei konstantem f', () => {
    const W = constantWorldline('urn:cg:worldline:konstant', stillState.r, stillState.v);
    const mk = (a: bigint, b: bigint) => executeClassBMapping({
      worldline: W, tStartTaiNs: a, tEndTaiNs: b, rateTolerance: TOL(24),
    }).deltaExact;
    const g = mk(T0, T0 + 3600n * NS), h = mk(T0 + 3600n * NS, T0 + 7200n * NS);
    expect(ratEq(ratAdd(g, h), mk(T0, T0 + 7200n * NS))).toBe(true);
  });

  it('T-RELB-033: Nullintervall ⇒ Δ = 0, τ = τ_start', () => {
    const res = executeClassBMapping({
      worldline: gpsFixtureWorldline(0, T0), tStartTaiNs: T0, tEndTaiNs: T0, tauStartNs: 42n,
    });
    expect(res.deltaNs).toBe(0n);
    expect(res.tauNs).toBe(42n);
    expect(res.steps).toBe(0);
  });

  it('T-RELB-034: Ratenfunktion — Geoidpotential liefert exakt f = 0', () => {
    // |r| so gewählt, dass GM/r = W₀ ⇒ f = L_G − W₀/c² = 0 (ruhende Uhr).
    // r = GM/(L_G·c²) exakt rational; die Wurzelrundung R1 bleibt < 10⁻¹⁸ m.
    const rGeoid = ratDiv(rat(GM_EARTH), ratMul(L_G, rat(C_SQ)));
    const f = properTimeRateExact({ r: [rGeoid, rat(0n), rat(0n)], v: [rat(0n), rat(0n), rat(0n)] });
    expect(ratCmp(ratAbs(f), TOL(30))).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-04x: analytische Referenzwerte', () => {

  it('T-RELB-041: GPS-Kreisbahn, 1 Tag — trifft f̄ = L_G − 3GM/(2ac²)', () => {
    const res = executeClassBMapping({
      worldline: gpsFixtureWorldline(0, T0),
      tStartTaiNs: T0, tEndTaiNs: T0 + SEC_PER_DAY * NS,
      rateTolerance: TOL(20),
    });
    const ref = analyticMeanRateExact(rat(GPS_SEMI_MAJOR_AXIS));
    expect(res.mappingClass).toBe('B');
    expect(ratWithin(res.meanRate, ref, TOL(20))).toBe(true);
    // Lehrbuchwert: GPS-Uhr gewinnt ≈ 38,6 µs/Tag gegenüber TAI
    const microsPerDay = ratToNumber(res.meanRate) * 86_400 * 1e6;
    expect(microsPerDay).toBeGreaterThan(38.4);
    expect(microsPerDay).toBeLessThan(38.7);
    expect(res.deltaNs).toBeGreaterThan(0n);
  });

  it('T-RELB-042: ISS-Kreisbahn — negative Rate, ≈ −24 µs/Tag', () => {
    const res = executeClassBMapping({
      worldline: issFixtureWorldline(0, T0),
      tStartTaiNs: T0, tEndTaiNs: T0 + SEC_PER_DAY * NS,
      rateTolerance: TOL(20),
    });
    const ref = analyticMeanRateExact(rat(ISS_SEMI_MAJOR_AXIS));
    expect(ratWithin(res.meanRate, ref, TOL(20))).toBe(true);
    expect(res.deltaNs).toBeLessThan(0n);
    const microsPerDay = ratToNumber(res.meanRate) * 86_400 * 1e6;
    expect(microsPerDay).toBeLessThan(-23);
    expect(microsPerDay).toBeGreaterThan(-26);
  });

  it('T-RELB-043: SRT-/ART-Zerlegung ≈ −7,2 / +45,8 µs/Tag (GPS)', () => {
    const a = rat(GPS_SEMI_MAJOR_AXIS);
    // Kreisbahn: v² = GM/a exakt, ohne Wurzel
    const v2 = ratDiv(rat(GM_EARTH), a);
    const srt = srRateTermExact(v2);
    const grt = ratDiv(ratSub(ratMul(L_G, rat(C_SQ)), ratDiv(rat(GM_EARTH), a)), rat(C_SQ));
    expect(ratToNumber(srt) * 86_400 * 1e6).toBeCloseTo(-7.2, 1);
    expect(ratToNumber(grt) * 86_400 * 1e6).toBeCloseTo(45.8, 1);
    // Summe muss exakt der geschlossenen Form entsprechen
    expect(ratEq(ratAdd(srt, grt), analyticMeanRateExact(a))).toBe(true);
  });

  it('T-RELB-044: exzentrische Bahn (e=0,01), volle Periode ⇒ ⟨1/r⟩ = 1/a', () => {
    const a = Number(GPS_SEMI_MAJOR_AXIS), e = 0.01;
    const P = orbitalPeriodApprox(a);
    const res = executeClassBMapping({
      worldline: gpsFixtureWorldline(e, T0),
      tStartTaiNs: T0, tEndTaiNs: T0 + BigInt(Math.round(P * 1e9)),
      rateTolerance: TOL(20),
    });
    // Mittel über eine volle Umlaufperiode ist exzentrizitätsunabhängig
    expect(ratWithin(res.meanRate, analyticMeanRateExact(rat(GPS_SEMI_MAJOR_AXIS)), TOL(17))).toBe(true);
    expect(res.steps).toBeGreaterThan(1);    // Integrator arbeitet wirklich
  });

  it('T-RELB-045: Teilbogen (e=0,02) ⇒ periodischer Term nach IS-GPS-200', () => {
    const a = Number(GPS_SEMI_MAJOR_AXIS), e = 0.02;
    const spanSec = orbitalPeriodApprox(a) / 3;
    const spanNs = BigInt(Math.round(spanSec * 1e9));
    const res = executeClassBMapping({
      worldline: keplerFixtureWorldline({ ref: 'urn:cg:worldline:gps-ecc', a_m: a, e, epochNs: T0 }),
      tStartTaiNs: T0, tEndTaiNs: T0 + spanNs,
      rateTolerance: TOL(20),
    });
    // Δt_r = F·e·√a·sin E  (IS-GPS-200 §20.3.3.3.3.1) — Referenz in float64,
    // die Konstante F selbst ist irrational.
    const periodic = F_GPS_APPROX * e * Math.sqrt(a) * (Math.sin(E_at(a, e, spanSec)) - Math.sin(E_at(a, e, 0)));
    const meanPart = ratToNumber(analyticMeanRateExact(rat(GPS_SEMI_MAJOR_AXIS))) * spanSec;
    const expectedDeltaSec = meanPart + periodic;
    expect(Math.abs(periodic)).toBeGreaterThan(1e-8);       // ≈ 39 ns, klar messbar
    // Restfehler als Rate, gegen die Toleranz aus T-L3-RK45-003 (10⁻¹² s/s)
    const gotSec = ratToNumber(res.deltaExact) / 1e9;
    expect(Math.abs(gotSec - expectedDeltaSec) / spanSec).toBeLessThan(1e-17);
    expect(res.deltaNs).toBe(BigInt(Math.round(expectedDeltaSec * 1e9)));
  });

  it('T-RELB-046: γ(v=7660 m/s) — exakter SRT-Term deckt sich mit Lorentz-Reihe', () => {
    const v = 7660n;
    const srt = srRateTermExact(rat(v * v));
    // Exakter Wert: −0,0000000003264270481448984684… (Golden Value der
    // testkit-Fassung T-L3-RK45-002, dort als ⌊srt·10²⁴⌉).
    expect(ratRoundToScale(srt, 10n ** 24n)).toBe(-326_427_048_144_898n);
    // Gegenprobe mit der Lorentz-Reihe β²/2 + 3β⁴/8 in float: stimmt auf 2·10⁻¹⁹
    // überein (der β⁴-Term beträgt 1,6·10⁻¹⁹).
    const b2 = (7660 / Number(C_LIGHT)) ** 2;
    expect(Math.abs(-(b2 / 2 + (3 * b2 * b2) / 8) - ratToNumber(srt))).toBeLessThan(2e-19);
    // Die naive Float-Form 1/√(1−β²) − 1 weicht dagegen um 6·10⁻¹⁷ ab: bei
    // β² ≈ 6,5·10⁻¹⁰ löscht sich 1 − β² auf ein halbes ulp aus. Genau diese
    // Auslöschung entfällt in der exakten Arithmetik.
    expect(Math.abs(lorentzGammaApprox(7660) - 1 + ratToNumber(srt))).toBeGreaterThan(5e-17);
    expect(Math.abs(lorentzGammaApprox(7660) - 1 + ratToNumber(srt))).toBeLessThan(1e-16);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-05x: Determinismus (I-R3) und Fehlerpfade', () => {

  it('T-RELB-051: bitgleiche Wiederholung — gleiche Eingabe, gleiche Schrittfolge', () => {
    const args = {
      worldline: gpsFixtureWorldline(0.02, T0),
      tStartTaiNs: T0, tEndTaiNs: T0 + SEC_PER_DAY * NS,
      rateTolerance: TOL(20),
    };
    const a = executeClassBMapping(args), b = executeClassBMapping(args);
    expect(a.deltaExact).toEqual(b.deltaExact);
    expect(a.deltaNs).toBe(b.deltaNs);
    expect(a.steps).toBe(b.steps);
    expect(a.rejectedSteps).toBe(b.rejectedSteps);
    expect(a.maxLocalError).toBe(b.maxLocalError);
  });

  it('T-RELB-052: Ergebnis ist durchgehend BigInt — kein Float im Rechenpfad', () => {
    const span = 3600n * NS;
    const res = executeClassBMapping({
      worldline: gpsFixtureWorldline(0, T0),
      tStartTaiNs: T0, tEndTaiNs: T0 + span, tauStartNs: 0n,
    });
    expect(typeof res.tauNs).toBe('bigint');
    expect(typeof res.deltaNs).toBe('bigint');
    expect(typeof res.deltaExact.n).toBe('bigint');
    expect(typeof res.deltaExact.d).toBe('bigint');
    expect(typeof res.meanRate.n).toBe('bigint');
    expect(typeof res.maxLocalError).toBe('bigint');
    expect(res.precision).toBe('exact-bigint');
    expect(res.tauNs).toBe(span + res.deltaNs);
    expect(res.deltaNs).toBeGreaterThan(0n);
  });

  it('T-RELB-053: engere Toleranz verfeinert, ohne das Ergebnis zu verschieben', () => {
    const args = {
      worldline: gpsFixtureWorldline(0.02, T0),
      tStartTaiNs: T0, tEndTaiNs: T0 + SEC_PER_DAY * NS,
    };
    const grob = executeClassBMapping({ ...args, rateTolerance: TOL(12) });
    const fein = executeClassBMapping({ ...args, rateTolerance: TOL(20) });
    expect(ratWithin(grob.meanRate, fein.meanRate, TOL(12))).toBe(true);
    expect(fein.steps).toBeGreaterThanOrEqual(grob.steps);
  });

  it('T-RELB-054: fehlende Weltlinie ⇒ CG-E-005.002', () => {
    try {
      executeClassBMapping({ tStartTaiNs: T0, tEndTaiNs: T0 + NS });
      throw new Error('erwarteter Fehler ausgeblieben');
    } catch (err: any) {
      expect(err.code).toBe('CG-E-005.002');
      expect(err.cgClass).toBe('MappingError');
      expect(err.httpStatus).toBe(422);
    }
  });

  it('T-RELB-055: t_end < t_start, |v| ≥ c, |r| = 0 ⇒ CG-E-008.003', () => {
    const expectCode = (fn: () => unknown, code: string) => {
      try { fn(); throw new Error('erwarteter Fehler ausgeblieben'); }
      catch (err: any) { expect(err.code).toBe(code); }
    };
    expectCode(() => executeClassBMapping({
      worldline: gpsFixtureWorldline(0, T0), tStartTaiNs: T0, tEndTaiNs: T0 - NS,
    }), 'CG-E-008.003');
    expectCode(() => properTimeRateExact({
      r: [rat(7_000_000n), rat(0n), rat(0n)], v: [rat(C_LIGHT), rat(0n), rat(0n)],
    }), 'CG-E-008.003');
    expectCode(() => properTimeRateExact({
      r: [rat(0n), rat(0n), rat(0n)], v: [rat(0n), rat(0n), rat(0n)],
    }), 'CG-E-008.003');
  });
});
