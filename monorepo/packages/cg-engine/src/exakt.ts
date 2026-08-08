/**
 * exakt.ts
 * Exakte Arithmetik-Primitive — BigInt-Brüche und Integer-Wurzel
 *
 * Normative Basis: CG-STD-3100 v1.6 §8.6 (Klasse-B ohne Float-Zwischenwert),
 *                  CG-STD-0000 v0.8 (I-R3 Determinismus)
 * Paket: cg-engine (Erweiterung)
 * Autor: Kurt Bauer, Initiator & Hauptautor, ChronoGrid Systems
 * Stand: August 2026 — A4/Weg A, Schritt 2
 *
 * Grundlage der exakten RK45-Integration in relativistik.ts. Alle Operationen
 * sind total, deterministisch und plattformunabhängig (reines BigInt) — im
 * Gegensatz zu IEEE-754, dessen Rundung zwar spezifiziert, dessen transzendente
 * Funktionen (Math.sin, Math.pow) aber engineabhängig sind und damit I-R3
 * verletzen.
 *
 * Rundung findet an genau zwei Stellen statt, beide explizit benannt:
 *   - ratRoundToScale  — kaufmännisch symmetrisch (half away from zero)
 *   - isqrt/isqrtScaled — Abschneiden nach unten (floor), exakt definiert
 */

import { Errors } from 'cg-types/errors.js';

// ─── Rationalzahl: gekürzter BigInt-Bruch ────────────────────────────────────

/** Exakte Rationalzahl. Invariante: d > 0 und gcd(|n|, d) = 1 (kanonisch). */
export interface Rat {
  readonly n: bigint;
  readonly d: bigint;
}

/** Größter gemeinsamer Teiler (euklidisch, immer ≥ 0). */
export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) { const t = x % y; x = y; y = t; }
  return x;
}

/** Kleinstes gemeinsames Vielfaches (≥ 0). */
export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  const g = gcd(a, b);
  const r = (a / g) * b;
  return r < 0n ? -r : r;
}

/**
 * Konstruktor: kürzt und normalisiert das Vorzeichen auf den Zähler.
 * Nenner 0 → CG-E-005.007 (divisionByZero).
 */
export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) {
    throw Errors.MappingError.divisionByZero('Rat: Nenner = 0', { n: n.toString() });
  }
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  if (g > 1n) { n /= g; d /= g; }
  return { n, d };
}

export const RAT_ZERO: Rat = { n: 0n, d: 1n };
export const RAT_ONE: Rat = { n: 1n, d: 1n };

export function ratIsZero(x: Rat): boolean { return x.n === 0n; }
export function ratSign(x: Rat): -1 | 0 | 1 { return x.n < 0n ? -1 : x.n > 0n ? 1 : 0; }
export function ratNeg(x: Rat): Rat { return { n: -x.n, d: x.d }; }
export function ratAbs(x: Rat): Rat { return x.n < 0n ? { n: -x.n, d: x.d } : x; }

export function ratAdd(a: Rat, b: Rat): Rat { return rat(a.n * b.d + b.n * a.d, a.d * b.d); }
export function ratSub(a: Rat, b: Rat): Rat { return rat(a.n * b.d - b.n * a.d, a.d * b.d); }
export function ratMul(a: Rat, b: Rat): Rat { return rat(a.n * b.n, a.d * b.d); }

export function ratDiv(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw Errors.MappingError.divisionByZero('Rat: Division durch 0');
  return rat(a.n * b.d, a.d * b.n);
}

/** Vergleich a ⋚ b — ohne Division, da d > 0 gilt. */
export function ratCmp(a: Rat, b: Rat): -1 | 0 | 1 {
  const l = a.n * b.d, r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function ratEq(a: Rat, b: Rat): boolean { return a.n === b.n && a.d === b.d; }

/** Ganzzahlige Potenz mit nicht-negativem Exponenten. */
export function ratPow(x: Rat, k: number): Rat {
  if (k < 0 || !Number.isInteger(k)) {
    throw Errors.MappingError.invalidMathExpr(`ratPow: Exponent ${k} nicht ∈ ℕ₀`);
  }
  let acc = RAT_ONE, base = x, e = k;
  while (e > 0) {
    if (e & 1) acc = ratMul(acc, base);
    base = ratMul(base, base);
    e >>= 1;
  }
  return acc;
}

/**
 * Exakter Dezimalliteral-Parser: '3.986004418e14' → Rat.
 * Ersetzt Float-Literale für Naturkonstanten; wirft bei nicht darstellbaren
 * Eingaben (CG-E-005.006), damit keine stille Näherung entsteht.
 */
export function ratFromDecimal(s: string): Rat {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
  if (!m) throw Errors.MappingError.invalidMathExpr(`ratFromDecimal: '${s}' ist kein Dezimalliteral`);
  const sign = m[1] === '-' ? -1n : 1n;
  const frac = m[3] ?? '';
  const exp = m[4] ? Number(m[4]) : 0;
  let n = sign * BigInt(m[2] + frac);
  let d = 10n ** BigInt(frac.length);
  if (exp > 0) n *= 10n ** BigInt(exp);
  else if (exp < 0) d *= 10n ** BigInt(-exp);
  return rat(n, d);
}

/**
 * Skalierte Rundung: round(x · scale) als BigInt, symmetrisch (half away from
 * zero). Einziger Übergang von exakt-rational nach Festkomma.
 */
export function ratRoundToScale(x: Rat, scale: bigint): bigint {
  const n = x.n * scale, d = x.d;
  const q = n / d, r = n % d;             // BigInt-Division trunkiert zur Null
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice >= d) return q + (n < 0n ? -1n : 1n);
  return q;
}

/**
 * Näherung als double — AUSSCHLIESSLICH für Diagnose, Reports und die
 * Testfixture-Erzeugung. Niemals im Rechenpfad eines Mappings verwenden
 * (CG-STD-3100 §8.6: kein Float-Zwischenwert).
 */
export function ratToNumber(x: Rat, digits = 20): number {
  const s = 10n ** BigInt(digits);
  return Number((x.n * s) / x.d) / Number(s);
}

/** Rat → Dezimalstring mit fester Nachkommastellenzahl (Report-Ausgabe). */
export function ratToFixed(x: Rat, digits: number): string {
  const s = 10n ** BigInt(digits);
  const v = ratRoundToScale(x, s);
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(digits + 1, '0');
  const head = a.slice(0, a.length - digits), tail = a.slice(a.length - digits);
  return `${neg ? '-' : ''}${head}${digits > 0 ? '.' + tail : ''}`;
}

// ─── Integer-Wurzel ──────────────────────────────────────────────────────────

/**
 * isqrt(n) = ⌊√n⌋ für n ≥ 0, Newton-Verfahren auf BigInt.
 *
 * Start bei 2^⌈bits/2⌉ ≥ √n; die Newton-Folge x ← ⌊(x + n/x)/2⌋ ist von oben
 * monoton fallend und bricht exakt bei ⌊√n⌋ ab (Standardresultat für
 * Integer-Newton bei Startwert ≥ √n). Terminiert in O(log log n) Schritten.
 * Negatives n → CG-E-005.006.
 */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw Errors.MappingError.invalidMathExpr(`isqrt: negatives Argument ${n}`);
  if (n < 2n) return n;
  const bits = BigInt(n.toString(2).length);
  let x = 1n << ((bits + 1n) / 2n);       // 2^⌈bits/2⌉ ≥ √n
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/**
 * ⌊√x · scale⌋ für x = N/D ≥ 0 — die einzige Wurzeloperation des
 * relativistischen Modells (Betrag des Ortsvektors |r|).
 *
 * Es gilt ⌊√(N·scale²/D)⌋ = ⌊√(⌊N·scale²/D⌋)⌋, die vorgezogene Ganzzahl-
 * division ist also verlustfrei. Der Abschneidefehler beträgt < 1/scale und
 * ist damit deterministisch nach unten beschränkt (I-R3).
 */
export function isqrtScaled(x: Rat, scale: bigint): bigint {
  if (x.n < 0n) throw Errors.MappingError.invalidMathExpr(`isqrtScaled: negatives Argument ${x.n}/${x.d}`);
  return isqrt((x.n * scale * scale) / x.d);
}
