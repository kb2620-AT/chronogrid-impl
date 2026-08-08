/**
 * scripts/sp3-fehlerbudget.ts
 * Fehlerbudget des geplanten SP3-Imports — Messung, keine Schätzung
 *
 * Normative Bezugsgröße: CG-STD-3100 v1.6 §8.6, Toleranz T-L3-RK45-003 = 10⁻¹² s/s
 * Stand: August 2026 — A4/Weg A, Vorstufe zum SP3-Folgeschritt
 *
 * Beantwortet zwei Fragen, bevor der SP3-Import gebaut wird:
 *
 *   TEIL 1  Was kostet es, v nicht mehr exakt zu kennen, sondern aus einem
 *           15-min-Positionsraster mit mm-Auflösung zu interpolieren?
 *           (IGS Final enthält keine Velocity-Records.)
 *
 *   TEIL 2  Was kostet die ECEF→ECI-Transformation, wenn Anteile des
 *           Erdrotationsmodells weggelassen werden? (SP3 ist erdfest.)
 *
 * Methode: Die Ratenfunktion f wird nicht integriert, sondern punktweise
 * gegen den exakten Kepler-Zustand verglichen. Damit ist der gemessene Wert
 * frei vom Integratorfehler (der bei < 10⁻²² s/s liegt, siehe T-RELB-041/042).
 * Summiert wird über die Festkommadarstellung ⌊f·10³⁶⌉, die Mittelwertbildung
 * ist deshalb selbst exakt.
 *
 * Grenze der Messung: interpoliert werden hier ECI-Koordinaten, weil die
 * Fixture ECI liefert; eine echte SP3-Kette interpoliert ECEF-Koordinaten.
 * Die Krümmung der Bahnkurve unterscheidet sich dadurch etwas, der
 * Abschneidefehler der Interpolation also auch. Bei den gemessenen zehn
 * Größenordnungen Abstand zur Toleranz ändert das an der Schlussfolgerung
 * nichts, ist aber bei einer Neubewertung zu beachten.
 *
 * Aufruf:  node --import tsx/esm scripts/sp3-fehlerbudget.ts
 */

import {
  type Rat, rat, ratAdd, ratSub, ratMul, ratDiv, ratCmp, ratToNumber,
} from 'cg-engine/exakt.js';
import {
  type ExactState, type ExactWorldline,
  properTimeRateScaled, RATE_SCALE, keplerFixtureWorldline,
  GPS_SEMI_MAJOR_AXIS, ISS_SEMI_MAJOR_AXIS, orbitalPeriodApprox,
} from 'cg-engine/relativistik.js';

const NS = 1_000_000_000n;
const T0 = 1_770_000_000n * NS;

/** ⌊x⌋ für Rat. */
function ratFloor(x: Rat): bigint {
  const q = x.n / x.d;
  return x.n < 0n && q * x.d !== x.n ? q - 1n : q;
}

/** Auf ein Dezimalraster quantisieren (SP3: Position mm ⇒ den = 1000). */
function quantize(x: Rat, den: bigint): Rat {
  const n = x.n * den, d = x.d;
  const q = n / d, r = n % d;
  const twice = (r < 0n ? -r : r) * 2n;
  return rat(twice >= d ? q + (n < 0n ? -1n : 1n) : q, den);
}

/**
 * Lagrange-Interpolation mit ganzzahligen, äquidistanten Knoten 0…n−1.
 * Liefert Wert und Ableitung nach τ (Einheit: Rasterschritte) — beides exakt
 * rational, da Knotenabstände ganzzahlig sind und die Nenner Π(i−j) klein
 * bleiben (|Π| ≤ 11! bei Ordnung 11).
 */
function lagrange(vals: readonly Rat[], tau: Rat): { v: Rat; d: Rat } {
  const n = vals.length;
  let val = rat(0n), der = rat(0n);
  for (let i = 0; i < n; i++) {
    let denom = 1n;
    for (let j = 0; j < n; j++) if (j !== i) denom *= BigInt(i - j);
    let prod = rat(1n);
    for (let j = 0; j < n; j++) if (j !== i) prod = ratMul(prod, ratSub(tau, rat(BigInt(j))));
    let dsum = rat(0n);
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      let p = rat(1n);
      for (let j = 0; j < n; j++) if (j !== i && j !== k) p = ratMul(p, ratSub(tau, rat(BigInt(j))));
      dsum = ratAdd(dsum, p);
    }
    const c = ratDiv(vals[i]!, rat(denom));
    val = ratAdd(val, ratMul(c, prod));
    der = ratAdd(der, ratMul(c, dsum));
  }
  return { v: val, d: der };
}

/**
 * Weltlinie, die eine SP3-Produktdatei nachbildet: nur Positionen auf einem
 * festen Raster, quantisiert; v entsteht durch Ableitung des Interpolanten.
 */
function sp3StyleWorldline(
  base: ExactWorldline, epochNs: bigint, stepNs: bigint, points: number, posDen: bigint | null,
): ExactWorldline {
  const cache = new Map<string, readonly [Rat, Rat, Rat]>();
  const sample = (k: bigint): readonly [Rat, Rat, Rat] => {
    const key = k.toString();
    const hit = cache.get(key);
    if (hit) return hit;
    const s = base.stateAt(rat(epochNs + k * stepNs));
    const r = (posDen === null ? s.r : [quantize(s.r[0], posDen), quantize(s.r[1], posDen), quantize(s.r[2], posDen)]) as readonly [Rat, Rat, Rat];
    cache.set(key, r);
    return r;
  };
  // dτ/dt-Umrechnung: Ableitung je Rasterschritt → je Sekunde
  const perSec = ratDiv(rat(NS), rat(stepNs));

  return {
    ref: `${base.ref}#sp3-${stepNs / NS}s-ord${points - 1}`,
    frame: 'ECI',
    stateAt(tNs: Rat): ExactState {
      const u = ratDiv(ratSub(tNs, rat(epochNs)), rat(stepNs));   // Position in Rasterschritten
      const k = ratFloor(u);
      const start = k - BigInt(Math.floor((points - 1) / 2));      // zentriertes Fenster
      const tau = ratSub(u, rat(start));
      const rr: Rat[] = [], vv: Rat[] = [];
      for (let axis = 0; axis < 3; axis++) {
        const vals: Rat[] = [];
        for (let i = 0; i < points; i++) vals.push(sample(start + BigInt(i))[axis]!);
        const { v, d } = lagrange(vals, tau);
        rr.push(v);
        vv.push(ratMul(d, perSec));
      }
      return { r: rr as unknown as readonly [Rat, Rat, Rat], v: vv as unknown as readonly [Rat, Rat, Rat] };
    },
  };
}

/**
 * Abweichung gegen die exakte Kepler-Weltlinie.
 *
 * Neben der Rate werden Ort und Geschwindigkeit direkt gemessen. Erst damit ist
 * die Ratenzahl nachprüfbar: es muss |Δf| ≈ v·|Δv|/c² gelten (SRT-Anteil). Eine
 * Ratenabweichung unter Toleranz bei gleichzeitig grober Bahnabweichung wäre
 * kein Beleg für Tauglichkeit, sondern nur dafür, dass relativistische Effekte
 * klein sind.
 */
function compare(
  exact: ExactWorldline, approx: ExactWorldline, spanNs: bigint, samples: number,
): { mean: number; max: number; dr: number; dv: number } {
  let sum = 0n, max = 0n, dr2max = rat(0n), dv2max = rat(0n);
  const norm2 = (a: readonly [Rat, Rat, Rat], b: readonly [Rat, Rat, Rat]): Rat => {
    let s = rat(0n);
    for (let k = 0; k < 3; k++) { const d = ratSub(a[k]!, b[k]!); s = ratAdd(s, ratMul(d, d)); }
    return s;
  };
  for (let i = 0; i < samples; i++) {
    const t = rat(T0 * BigInt(samples) + spanNs * BigInt(i), BigInt(samples));
    const sa = approx.stateAt(t), se = exact.stateAt(t);
    const d = properTimeRateScaled(sa) - properTimeRateScaled(se);
    sum += d;
    const a = d < 0n ? -d : d;
    if (a > max) max = a;
    const r2 = norm2(sa.r, se.r); if (ratCmp(r2, dr2max) > 0) dr2max = r2;
    const v2 = norm2(sa.v, se.v); if (ratCmp(v2, dv2max) > 0) dv2max = v2;
  }
  return {
    mean: ratToNumber(rat(sum, BigInt(samples) * RATE_SCALE), 40),
    max:  ratToNumber(rat(max, RATE_SCALE), 40),
    dr:   Math.sqrt(ratToNumber(dr2max, 30)),
    dv:   Math.sqrt(ratToNumber(dv2max, 30)),
  };
}

const fmt = (x: number): string => (x === 0 ? '0' : x.toExponential(2));

// ═══ TEIL 1: Interpolation aus Positionsraster ═══════════════════════════════

console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║ TEIL 1 — v aus interpoliertem Positionsraster (IGS Final hat kein v)      ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
console.log('Referenz: exakter Kepler-Zustand. Toleranz T-L3-RK45-003 = 1.00e-12 s/s\n');

interface Case { name: string; a: bigint; e: number; stepSec: bigint }
const faelle: Case[] = [
  { name: 'GPS  Kreis   Raster 900s', a: GPS_SEMI_MAJOR_AXIS, e: 0,    stepSec: 900n },
  { name: 'GPS  e=0,02  Raster 900s', a: GPS_SEMI_MAJOR_AXIS, e: 0.02, stepSec: 900n },
  { name: 'ISS  Kreis   Raster 900s', a: ISS_SEMI_MAJOR_AXIS, e: 0,    stepSec: 900n },
  { name: 'ISS  Kreis   Raster  60s', a: ISS_SEMI_MAJOR_AXIS, e: 0,    stepSec: 60n },
  { name: 'ISS  Kreis   Raster  30s', a: ISS_SEMI_MAJOR_AXIS, e: 0,    stepSec: 30n },
];

console.log('Fall                       Ord  Quant   |Δf| Mittel   |Δf| Max    max|Δr|/m  max|Δv| m/s');
console.log('─'.repeat(90));

for (const f of faelle) {
  const exact = keplerFixtureWorldline({ ref: 'exakt', a_m: Number(f.a), e: f.e, epochNs: T0 });
  const P = orbitalPeriodApprox(Number(f.a));
  const span = BigInt(Math.round(P * 1e9));
  for (const points of [8, 10, 12]) {
    for (const [qname, den] of [['exakt', null], ['mm', 1000n]] as const) {
      const approx = sp3StyleWorldline(exact, T0, f.stepSec * NS, points, den);
      const { mean, max, dr, dv } = compare(exact, approx, span, 120);
      console.log(
        `${f.name.padEnd(26)} ${String(points - 1).padStart(2)}  ${qname.padEnd(6)} ` +
        `${fmt(Math.abs(mean)).padStart(10)}  ${fmt(max).padStart(10)}  ` +
        `${fmt(dr).padStart(10)}  ${fmt(dv).padStart(10)}`,
      );
    }
  }
  console.log('─'.repeat(90));
}

// ═══ TEIL 2: ECEF → ECI ══════════════════════════════════════════════════════

console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║ TEIL 2 — Erdrotationsmodell (SP3 ist erdfest, f braucht ECI)              ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
console.log('v_ECI = v_ECEF + ω×r.  Gemessen wird die Ratenänderung durch eine');
console.log('Störung δω des Rotationsvektors, exakt rational (ω×r braucht keine Trig.).\n');

/** Kreuzprodukt, exakt. */
function cross(a: readonly [Rat, Rat, Rat], b: readonly [Rat, Rat, Rat]): readonly [Rat, Rat, Rat] {
  return [
    ratSub(ratMul(a[1], b[2]), ratMul(a[2], b[1])),
    ratSub(ratMul(a[2], b[0]), ratMul(a[0], b[2])),
    ratSub(ratMul(a[0], b[1]), ratMul(a[1], b[0])),
  ];
}

/** ω_⊕ = 7,292115·10⁻⁵ rad/s (IERS 2010, mittlere Rotationsrate). */
const OMEGA = rat(7_292_115n, 10n ** 11n);

/** Störungen: (Name, δω-Vektor als Funktion von ω, Begründung der Größe) */
const stoerungen: Array<{ name: string; dw: readonly [Rat, Rat, Rat]; grund: string }> = [
  { name: 'ω×r ganz weggelassen', dw: [rat(0n), rat(0n), ratMul(OMEGA, rat(-1n))],
    grund: 'Kontrollfall — zeigt, dass die Korrektur nicht optional ist' },
  { name: 'LOD δω/ω = 2e-8',      dw: [rat(0n), rat(0n), ratMul(OMEGA, rat(2n, 10n ** 8n))],
    grund: 'Tageslängenschwankung ~2 ms/Tag' },
  { name: 'Polbewegung 0,3″',     dw: [ratMul(OMEGA, rat(145n, 10n ** 8n)), rat(0n), rat(0n)],
    grund: 'Polbewegung ±0,3 Bogensekunden = 1,45e-6 rad' },
  { name: 'Nutation 9″',          dw: [ratMul(OMEGA, rat(436n, 10n ** 7n)), rat(0n), rat(0n)],
    grund: 'Nutationsamplitude ~9″ = 4,36e-5 rad' },
  { name: 'UT1−UTC 0,9 s',        dw: [ratMul(OMEGA, rat(656n, 10n ** 7n)), rat(0n), rat(0n)],
    grund: 'Rotationsphase 0,9 s · ω = 6,56e-5 rad' },
];

for (const bahn of [
  { name: 'GPS', a: GPS_SEMI_MAJOR_AXIS },
  { name: 'ISS', a: ISS_SEMI_MAJOR_AXIS },
]) {
  const W = keplerFixtureWorldline({ ref: 'x', a_m: Number(bahn.a), e: 0, epochNs: T0, i_rad: 0.9 });
  const P = orbitalPeriodApprox(Number(bahn.a));
  console.log(`\n${bahn.name} (a = ${bahn.a} m):`);
  console.log('  Störung                  max |Δ Rate|   Anteil an 1e-12   Begründung');
  console.log('  ' + '─'.repeat(88));
  for (const s of stoerungen) {
    let max = 0n;
    for (let i = 0; i < 48; i++) {
      const t = rat(T0 * 48n + BigInt(Math.round(P * 1e9)) * BigInt(i), 48n);
      const st = W.stateAt(t);
      const dv = cross(s.dw, st.r);
      const gestoert: ExactState = {
        r: st.r,
        v: [ratAdd(st.v[0], dv[0]), ratAdd(st.v[1], dv[1]), ratAdd(st.v[2], dv[2])] as const,
      };
      const d = properTimeRateScaled(gestoert) - properTimeRateScaled(st);
      const a = d < 0n ? -d : d;
      if (a > max) max = a;
    }
    const v = ratToNumber(rat(max, RATE_SCALE), 40);
    console.log(
      `  ${s.name.padEnd(24)} ${fmt(v).padStart(12)}   ${(v / 1e-12).toExponential(1).padStart(9)}   ${s.grund}`,
    );
  }
}

console.log(`
Befund: Die ECEF→ECI-DREHUNG wird gar nicht gebraucht.
  f hängt nur von den Beträgen |r| und |v| ab. |r| ist drehinvariant, und
  |v_ECI| = |R·(v_ECEF + ω×r)| = |v_ECEF + ω×r| — auswertbar in ECEF-Komponenten.
  ω×r ist mit rationalem ω exakt. Es entsteht also KEIN sin/cos und kein viertes
  Rundungsereignis: die SP3-Kette bleibt vollständig exakt rational.
  Diese Vereinfachung gilt genau solange, wie die Ratenfunktion skalar bleibt
  (1PN). Ein künftiges J2- oder Volltensor-Modell bräuchte die Drehung wieder.
`);
