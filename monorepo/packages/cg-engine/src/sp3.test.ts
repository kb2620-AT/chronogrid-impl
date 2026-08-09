/**
 * sp3.test.ts
 * SP3-d-Kette — Format, Interpolation, Physik (exakte BigInt-Arithmetik)
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6, CG-STD-0000 §I-R3,
 *                  SP3-c/SP3-d Formatdefinition, IERS Conventions 2010
 * Stand: August 2026 — A4/Weg A, Schritt 3 (SP3-Vollausbau)
 *
 * Gliederung:
 *   T-RELB-06x  Format: exaktes Feldparsing, Spaltenlage, Epochenzeit, Fehler
 *   T-RELB-07x  Lagrange Ordnung 9: Exaktheit, Ableitung, Knotenverhalten
 *   T-RELB-08x  Kette Writer→Reader→Mapping gegen analytische Referenzen
 *
 * Die normativen Tests T-L3-SP3-001…006 liegen in
 * cg-testkit/src/suites/t-l3-sp3.ts.
 *
 * Alle Schwellen dieser Datei sind gemessen, nicht geraten: die Werte stammen
 * aus derselben Messung, die auch die Zielkonfiguration begründet
 * (scripts/sp3-fehlerbudget.ts sowie die Ordnungs-/Rasterreihe im Kopf von
 * t-l3-sp3.ts). Sie liegen jeweils rund eine Größenordnung über dem gemessenen
 * Wert, damit sie Regressionen fangen, ohne bei Rundungsdetails zu flackern.
 */

import { describe, it, expect } from 'vitest';
import {
  type Rat, rat, ratAdd, ratSub, ratMul, ratDiv, ratCmp, ratAbs, ratEq,
  ratToNumber, isqrtScaled,
} from './exakt.js';
import {
  type ExactWorldline,
  GPS_SEMI_MAJOR_AXIS, analyticMeanRateExact, executeClassBMapping,
  gpsFixtureWorldline, issFixtureWorldline,
} from './relativistik.js';
import {
  OMEGA_EARTH, SP3_LAGRANGE_DEGREE, SP3_LAGRANGE_POINTS, TAI_MINUS_GPST_S,
  SP3_POS_DEN, SP3_VEL_DEN,
  writeSp3d, parseSp3, sp3Worldline, lagrangeValueAndDerivative,
  crossExact, normSquaredExact, withinDistance, compareMagnitudes,
} from './sp3.js';

const NS = 1_000_000_000n;
const T0 = 1_770_000_000n * NS;          // fester TAI-Startpunkt (ns)
const GPS_STEP = 900n * NS;              // IGS Final: 15-min-Raster

/** |x| als Rat, auf 10⁻¹⁸ abgeschnitten — dieselbe Wurzel wie im Rechenpfad (R1). */
function magnitude(v: readonly [Rat, Rat, Rat]): Rat {
  return rat(isqrtScaled(normSquaredExact(v), 10n ** 18n), 10n ** 18n);
}

/** Eine GPS-Fixture als SP3 schreiben und wieder einlesen. */
function gpsChain(opts: {
  withVelocity: boolean; frame?: 'ECI' | 'ECEF'; count?: number;
  points?: number; velocitySource?: 'auto' | 'records' | 'derivative';
}) {
  const W = gpsFixtureWorldline(0, T0);
  const text = writeSp3d({
    worldline: W, startTaiNs: T0, intervalNs: GPS_STEP,
    count: opts.count ?? 40, includeVelocity: opts.withVelocity,
    frame: opts.frame ?? 'ECEF',
  });
  const file = parseSp3(text);
  return {
    kepler: W, text, file,
    sp3: sp3Worldline(file, { points: opts.points, velocitySource: opts.velocitySource }),
  };
}

/** Maximale Betragsabweichung |r|, |v| und f — Helfer liegt in sp3.ts. */
function maxMagnitudeDeviation(
  exact: ExactWorldline, approx: ExactWorldline,
  startNs: bigint, spanNs: bigint, samples: number,
): { dr: number; dv: number; df: number } {
  const m = compareMagnitudes(exact, approx, startNs, spanNs, samples);
  return { dr: m.maxDr, dv: m.maxDv, df: m.maxDf };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-06x: SP3-Format — exaktes Parsing', () => {

  it('T-RELB-061: Positionsfeld km→m ist exakt, ohne Float-Zwischenwert', () => {
    const text = [
      '#dP2026  2  2  0  0  0.00000000       2 ORBIT CGF20  CG CGSY',
      '## 2404      0.00000000   900.00000000 61073 0.0000000000000',
      '+    1   L01  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0',
      '%c L  cc GPS ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc',
      '*  2026  2  2  0  0  0.00000000',
      'PL01  26559.800000      0.000000      0.000000999999.999999',
      '*  2026  2  2  0 15  0.00000000',
      'PL01  26559.800000      0.000000      0.000000999999.999999',
      'EOF',
    ].join('\n');
    const f = parseSp3(text);
    const r = f.blocks[0]!.sats.get('L01')!.r;
    // 26559.800000 km = 26 559 800 m, exakt und ganzzahlig
    expect(ratEq(r[0], rat(26_559_800n))).toBe(true);
    expect(r[0].d).toBe(1n);
    expect(ratEq(r[1], rat(0n))).toBe(true);
    // Auflösung: ein Digit der letzten Stelle = 1 mm
    expect(SP3_POS_DEN).toBe(1_000n);
  });

  it('T-RELB-062: Velocity-Feld dm/s→m/s ist exakt (10⁻⁷ m/s Auflösung)', () => {
    const text = [
      '#dV2026  2  2  0  0  0.00000000       2 ORBIT CGF20  CG CGSY',
      '## 2404      0.00000000   900.00000000 61073 0.0000000000000',
      '+    1   L01  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0',
      '%c L  cc GPS ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc',
      '*  2026  2  2  0  0  0.00000000',
      'PL01  26559.800000      0.000000      0.000000999999.999999',
      'VL01  38746.000001      0.000000      0.000000999999.999999',
      '*  2026  2  2  0 15  0.00000000',
      'PL01  26559.800000      0.000000      0.000000999999.999999',
      'VL01  38746.000001      0.000000      0.000000999999.999999',
      'EOF',
    ].join('\n');
    const f = parseSp3(text);
    const v = f.blocks[0]!.sats.get('L01')!.v!;
    // 38746.000001 dm/s = 3874.6000001 m/s = 38746000001/10⁷
    expect(ratEq(v[0], rat(38_746_000_001n, 10_000_000n))).toBe(true);
    expect(SP3_VEL_DEN).toBe(10_000_000n);
  });

  it('T-RELB-063: aneinanderstoßende %14.6f-Felder werden spaltenweise gelesen', () => {
    // Beträge > 100 000 km füllen das Feld vollständig aus; mit negativem
    // Vorzeichen berühren sich die Felder. Ein Whitespace-Split läse hier
    // still falsch — deshalb liest der Reader nach Spalten.
    const line = 'PL01-123456.789012-234567.890123 345678.901234999999.999999';
    expect(line.slice(4, 18)).toBe('-123456.789012');
    expect(line.slice(18, 32)).toBe('-234567.890123');
    const text = [
      '#dP2026  2  2  0  0  0.00000000       2 ORBIT CGF20  CG CGSY',
      '## 2404      0.00000000   900.00000000 61073 0.0000000000000',
      '+    1   L01  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0',
      '%c L  cc GPS ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc',
      '*  2026  2  2  0  0  0.00000000', line,
      '*  2026  2  2  0 15  0.00000000', line,
      'EOF',
    ].join('\n');
    const r = parseSp3(text).blocks[0]!.sats.get('L01')!.r;
    expect(ratEq(r[0], rat(-123_456_789_012n, 1_000n))).toBe(true);
    expect(ratEq(r[1], rat(-234_567_890_123n, 1_000n))).toBe(true);
    expect(ratEq(r[2], rat(345_678_901_234n, 1_000n))).toBe(true);
    // Gegenprobe: der naive Split liefert drei statt vier Feldern
    expect(line.slice(1).trim().split(/\s+/).length).not.toBe(5);
  });

  it('T-RELB-064: Epochenzeile trägt GPS-Zeit, intern gilt TAI = GPST + 19 s', () => {
    const { text, file } = gpsChain({ withVelocity: false, count: 12 });
    expect(file.blocks[0]!.tTaiNs).toBe(T0);
    expect(file.blocks[1]!.tTaiNs - file.blocks[0]!.tTaiNs).toBe(GPS_STEP);
    expect(TAI_MINUS_GPST_S).toBe(19n);
    // Die geschriebene Kalenderzeit liegt 19 s vor der TAI-Zeit
    const epoch = text.split('\n').find(l => l.startsWith('*'))!;
    expect(epoch).toMatch(/^\*\s+2026\s+2\s+2\s+2\s+39\s+41\.00000000$/);
  });

  it('T-RELB-065: Formatfehler und Bereichsfehler tragen die richtigen Codes', () => {
    const good = gpsChain({ withVelocity: false, count: 20 });

    // kein #c/#d-Kopf
    expect(() => parseSp3('kein SP3\nEOF\n')).toThrow(/CG-E-001\.007|#c\/#d/);
    try { parseSp3('kein SP3\nEOF\n'); } catch (e: any) { expect(e.code).toBe('CG-E-001.007'); }

    // V-Record ohne vorangehenden P-Record
    const orphan = good.text.replace(/^PL01.*$/m, 'VL01      0.000000      0.000000      0.000000');
    try { parseSp3(orphan); } catch (e: any) { expect(e.code).toBe('CG-E-001.007'); }

    // zu wenige Epochen für Ordnung 9
    try {
      sp3Worldline(parseSp3(writeSp3d({
        worldline: gpsFixtureWorldline(0, T0), startTaiNs: T0, intervalNs: GPS_STEP, count: 5,
      })));
    } catch (e: any) { expect(e.code).toBe('CG-E-008.003'); }

    // Extrapolation über den Dateirand hinaus
    try {
      good.sp3.stateAt(rat(T0 + 10_000n * GPS_STEP));
    } catch (e: any) { expect(e.code).toBe('CG-E-005.003'); }

    // velocitySource='records' auf einer positions-only Datei
    try {
      sp3Worldline(good.file, { velocitySource: 'records' });
    } catch (e: any) { expect(e.code).toBe('CG-E-001.002'); }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-07x: Lagrange-Interpolation Ordnung 9, exakt', () => {

  /** Testpolynom p(x) = Σ coef[k]·xᵏ, exakt rational. */
  const poly = (coef: readonly bigint[], x: Rat): Rat => {
    let acc = rat(0n);
    for (let k = coef.length - 1; k >= 0; k--) acc = ratAdd(ratMul(acc, x), rat(coef[k]!));
    return acc;
  };
  const dpoly = (coef: readonly bigint[], x: Rat): Rat => {
    let acc = rat(0n);
    for (let k = coef.length - 1; k >= 1; k--) acc = ratAdd(ratMul(acc, x), rat(BigInt(k) * coef[k]!));
    return acc;
  };
  const COEF = [7n, -3n, 11n, 2n, -5n, 13n, 1n, -8n, 4n, 6n];   // Grad 9

  it('T-RELB-071: Ordnung 9 reproduziert Polynome vom Grad ≤ 9 exakt', () => {
    expect(SP3_LAGRANGE_DEGREE).toBe(9);
    expect(SP3_LAGRANGE_POINTS).toBe(10);
    const vals = Array.from({ length: 10 }, (_, i) => poly(COEF, rat(BigInt(i))));
    for (const tau of [rat(1n, 3n), rat(17n, 4n), rat(9n, 2n), rat(89n, 10n)]) {
      const { v } = lagrangeValueAndDerivative(vals, tau);
      // exakte Gleichheit, nicht 'nahe bei' — Grad 9 durch 10 Punkte ist eindeutig
      expect(ratEq(v, poly(COEF, tau))).toBe(true);
    }
  });

  it('T-RELB-072: die analytische Ableitung ist exakt, keine Differenzenformel', () => {
    const vals = Array.from({ length: 10 }, (_, i) => poly(COEF, rat(BigInt(i))));
    for (const tau of [rat(1n, 3n), rat(23n, 7n), rat(61n, 8n)]) {
      const { d } = lagrangeValueAndDerivative(vals, tau);
      expect(ratEq(d, dpoly(COEF, tau))).toBe(true);
    }
  });

  it('T-RELB-073: an den Knoten gilt Interpolation = Stützwert (Kronecker)', () => {
    const vals = Array.from({ length: 10 }, (_, i) => rat(BigInt(i * i + 1), BigInt(i + 3)));
    for (let i = 0; i < 10; i++) {
      const { v } = lagrangeValueAndDerivative(vals, rat(BigInt(i)));
      expect(ratEq(v, vals[i]!)).toBe(true);
    }
  });

  it('T-RELB-074: Grad 11 bringt nichts mehr — die mm-Quantisierung dominiert', () => {
    // Begründung der Zielkonfiguration: unterhalb Ordnung 9 wächst der
    // Abschneidefehler deutlich, oberhalb sättigt er auf dem Quantisierungs-
    // boden. Gemessen (GPS, 900 s): Ord 5 → 1,7e-16, Ord 7 → 1,5e-18,
    // Ord 9 → 5,2e-20, Ord 11 → 4,7e-20 s/s.
    const start = T0 + 8n * GPS_STEP, span = 20n * GPS_STEP;
    const dev = (points: number) => {
      const c = gpsChain({ withVelocity: false, count: 40, points });
      return maxMagnitudeDeviation(c.kepler, c.sp3, start, span, 12);
    };
    const ord7 = dev(8), ord9 = dev(10), ord11 = dev(12);
    expect(ord9.df).toBeLessThan(ord7.df / 10);        // 9 ist deutlich besser als 7
    expect(ord11.df).toBeGreaterThan(ord9.df / 10);    // 11 bringt keine Größenordnung mehr
    expect(ord9.df).toBeLessThan(1e-18);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('T-RELB-08x: Kette Writer → Reader → Mapping', () => {

  it('T-RELB-081: Writer/Reader-Round-Trip ist wertetreu und deterministisch', () => {
    const a = writeSp3d({
      worldline: gpsFixtureWorldline(0, T0), startTaiNs: T0,
      intervalNs: GPS_STEP, count: 16, includeVelocity: true,
    });
    const b = writeSp3d({
      worldline: gpsFixtureWorldline(0, T0), startTaiNs: T0,
      intervalNs: GPS_STEP, count: 16, includeVelocity: true,
    });
    expect(a).toBe(b);                                   // bytegleich (I-R3)
    const f = parseSp3(a);
    expect(f.version).toBe('d');
    expect(f.mode).toBe('V');
    expect(f.blocks).toHaveLength(16);
    expect(f.intervalNs).toBe(GPS_STEP);
    // Erneutes Schreiben der gelesenen Werte trifft dieselben Felder
    const line = a.split('\n').find(l => l.startsWith('PL01'))!;
    const r = f.blocks[0]!.sats.get('L01')!.r;
    const km = ratDiv(r[0], rat(1_000n));
    expect(line.slice(4, 18).trim()).toBe(ratToNumber(km, 20).toFixed(6));
  });

  it('T-RELB-082: |v_ECEF + ω×r| = |v_ECI| — ω× und R_z kommutieren', () => {
    // Der Grund, warum die ECEF→ECI-Drehung entfällt. Geprüft wird die
    // Isometrie an der Kette selbst: dieselbe Fixture einmal als ECI-Datei
    // (ohne Rotationskorrektur) und einmal als ECEF-Datei (mit ω×r) muss
    // denselben Geschwindigkeitsbetrag liefern.
    const eci = gpsChain({ withVelocity: true, frame: 'ECI', count: 24 });
    const ecef = gpsChain({ withVelocity: true, frame: 'ECEF', count: 24 });
    expect(eci.sp3.info.earthRotation).toBe(false);
    expect(ecef.sp3.info.earthRotation).toBe(true);

    const t = rat(T0 + 12n * GPS_STEP + GPS_STEP / 3n);
    const mEci = magnitude(eci.sp3.stateAt(t).v);
    const mEcef = magnitude(ecef.sp3.stateAt(t).v);
    // Beide Wege müssen auf mm/s-Ebene übereinstimmen; Rest ist Quantisierung
    expect(ratToNumber(ratAbs(ratSub(mEci, mEcef)), 30)).toBeLessThan(1e-3);

    // und ω×r ist exakt rational — kein sin/cos, kein viertes Rundungsereignis
    const r: readonly [Rat, Rat, Rat] = [rat(3n), rat(5n), rat(7n)];
    const w: readonly [Rat, Rat, Rat] = [rat(0n), rat(0n), OMEGA_EARTH];
    const c = crossExact(w, r);
    expect(ratEq(c[0], ratMul(rat(-5n), OMEGA_EARTH))).toBe(true);
    expect(ratEq(c[1], ratMul(rat(3n), OMEGA_EARTH))).toBe(true);
    expect(ratEq(c[2], rat(0n))).toBe(true);
  });

  it('T-RELB-083: beide Geschwindigkeitswege treffen dieselbe Referenz', () => {
    // Der Ableitungspfad ist der einzige, den reale IGS-Final-Produkte
    // zulassen — er muss eigenständig geprüft sein, nicht nur der bequeme
    // Weg über V-Records.
    const start = T0 + 8n * GPS_STEP, span = 20n * GPS_STEP;
    const rec = gpsChain({ withVelocity: true, velocitySource: 'records', count: 40 });
    const der = gpsChain({ withVelocity: false, count: 40 });
    expect(rec.sp3.info.velocitySource).toBe('records');
    expect(der.sp3.info.velocitySource).toBe('derivative');
    expect(der.file.mode).toBe('P');                     // positions-only wie IGS Final

    const dRec = maxMagnitudeDeviation(rec.kepler, rec.sp3, start, span, 24);
    const dDer = maxMagnitudeDeviation(der.kepler, der.sp3, start, span, 24);

    // Gemessen: Δ|v| 7,6e-8 (Records) gegen 1,2e-6 m/s (Ableitung),
    // Δf 4,7e-21 gegen 5,2e-20 s/s. Der Ableitungspfad ist rund 16-fach
    // gröber und liegt immer noch acht Größenordnungen unter der Toleranz.
    expect(dRec.dv).toBeLessThan(1e-6);
    expect(dDer.dv).toBeLessThan(1e-4);
    expect(dRec.df).toBeLessThan(1e-19);
    expect(dDer.df).toBeLessThan(1e-18);
    expect(dDer.dv).toBeGreaterThan(dRec.dv);            // Ableitung ist gröber
    // beide identisch in der Position — es ist derselbe Interpolant
    expect(Math.abs(dRec.dr - dDer.dr)).toBeLessThan(1e-9);
  });

  it('T-RELB-084: Klasse-B-Mapping über die SP3-Kette trifft f̄ = L_G − 3GM/(2ac²)', () => {
    const { file } = gpsChain({ withVelocity: false, count: 40 });
    const W = sp3Worldline(file);
    const start = file.blocks[6]!.tTaiNs;
    const end = start + 20n * GPS_STEP;
    const res = executeClassBMapping({
      worldline: W, tStartTaiNs: start, tEndTaiNs: end,
      rateTolerance: rat(1n, 10n ** 12n),
    });
    const ref = analyticMeanRateExact(rat(GPS_SEMI_MAJOR_AXIS));
    const abw = ratAbs(ratSub(res.meanRate, ref));
    expect(ratCmp(abw, rat(1n, 10n ** 12n))).toBeLessThan(0);
    expect(res.deltaNs).toBeGreaterThan(0n);             // GPS-Uhr geht vor
    expect(res.precision).toBe('exact-bigint');
    expect(typeof res.tauNs).toBe('bigint');
  });

  it('T-RELB-085: die SP3-Kette ist bitgleich reproduzierbar (I-R3)', () => {
    const mk = () => {
      const { file } = gpsChain({ withVelocity: false, count: 30 });
      const W = sp3Worldline(file);
      return executeClassBMapping({
        worldline: W, tStartTaiNs: file.blocks[6]!.tTaiNs,
        tEndTaiNs: file.blocks[6]!.tTaiNs + 12n * GPS_STEP,
      });
    };
    const a = mk(), b = mk();
    expect(a.deltaExact.n).toBe(b.deltaExact.n);
    expect(a.deltaExact.d).toBe(b.deltaExact.d);
    expect(a.steps).toBe(b.steps);
    expect(a.tauNs).toBe(b.tauNs);
  });

  it('T-RELB-086: Δr/Δv-Kriterium fängt, was die Ratentoleranz durchlässt', () => {
    // ISS auf dem 15-min-Raster: 9 Intervalle überspannen 8100 s bei 5568 s
    // Umlaufzeit — das Fenster deckt mehr als eine Bahn ab, der Interpolant
    // ist wertlos. Gemessen: Δ|r| ≈ 1,1 km, Δf ≈ 1,6e-13 s/s, also UNTER der
    // Ratentoleranz von 1e-12. Genau dafür gibt es das Bahnkriterium.
    const W = issFixtureWorldline(0, T0);
    const file = parseSp3(writeSp3d({
      worldline: W, startTaiNs: T0, intervalNs: GPS_STEP, count: 40,
    }));
    const sp3 = sp3Worldline(file);
    const d = maxMagnitudeDeviation(W, sp3, T0 + 8n * GPS_STEP, 20n * GPS_STEP, 16);

    expect(d.df).toBeLessThan(1e-12);      // Ratentoleranz: unauffällig
    expect(d.dr).toBeGreaterThan(1);       // Bahn: grob daneben (~km)

    // Auf einem für LEO angemessenen Raster ist dieselbe Kette in Ordnung.
    // Gemessen (300 s): Δ|r| ≈ 2,4e-2 m, Δf ≈ 4,4e-18 s/s.
    const fine = parseSp3(writeSp3d({
      worldline: W, startTaiNs: T0, intervalNs: 300n * NS, count: 40,
    }));
    const dFine = maxMagnitudeDeviation(W, sp3Worldline(fine), T0 + 8n * 300n * NS, 20n * 300n * NS, 16);
    expect(dFine.dr).toBeLessThan(1);
    expect(dFine.df).toBeLessThan(1e-16);
  });

  it('T-RELB-087: withinDistance vergleicht ohne Wurzel und ohne Float', () => {
    const a: readonly [Rat, Rat, Rat] = [rat(3n), rat(4n), rat(0n)];
    const b: readonly [Rat, Rat, Rat] = [rat(0n), rat(0n), rat(0n)];
    expect(withinDistance(a, b, rat(5n))).toBe(true);     // |a−b| = 5 exakt
    expect(withinDistance(a, b, rat(49n, 10n))).toBe(false);
    expect(ratEq(normSquaredExact(a), rat(25n))).toBe(true);
  });
});
