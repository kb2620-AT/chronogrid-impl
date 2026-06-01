/**
 * cg-zeitarithmetik.ts
 * ChronoGrid Zeitarithmetik — ℤ∞ BigInt Implementierung
 *
 * Normative Basis: CG-STD-0000 v0.8, CG-STD-3100 v1.6, ARITH Domain v1.0
 * Paket: cg-engine (Erweiterung)
 * Autor: Kurt Bauer, Initiator & Hauptautor, ChronoGrid Systems
 * Stand: Mai 2026
 *
 * Alle internen Berechnungen erfolgen als BigInt in Nanosekunden.
 * Kein Float, kein Rundungsfehler, kein stiller Overflow.
 * Invarianten: I-R2 (totale Ordnung ℤ∞; duration ≥ 0 als Typ-Constraint),
 *              I-R3 (Determinismus), I-E1 (kein Epoch).
 *
 * ARITH ist UNBOUNDED (CG-STD-3100 v1.6 §8.7): Werte liegen in ℤ∞.
 * C-ARITH-001 (duration_non_negative) gilt ausschließlich als Typ-Constraint
 * für arithKind='duration'. Für arithKind='period' sind negative Werte erlaubt.
 */

// ─── Fehlerklassen (CG-E-*) ──────────────────────────────────────────────────

export class CG_E_003_ExtentError extends Error {
  readonly code = 'CG-E-003';
  constructor(msg: string) {
    super(`[CG-E-003 ExtentError] ${msg}`);
    this.name = 'CG_E_003_ExtentError';
  }
}

export class CG_E_006_InvariantError extends Error {
  readonly code = 'CG-E-006';
  constructor(invariant: string, msg: string) {
    super(`[CG-E-006 InvariantError] ${invariant}: ${msg}`);
    this.name = 'CG_E_006_InvariantError';
  }
}

export class CG_E_008_ConstraintError extends Error {
  readonly code = 'CG-E-008';
  constructor(constraint: string, msg: string) {
    super(`[CG-E-008 ConstraintError] ${constraint}: ${msg}`);
    this.name = 'CG_E_008_ConstraintError';
  }
}

// ─── Typen ────────────────────────────────────────────────────────────────────

export type ArithKind = 'duration' | 'period';
export type PrecisionClass = 'P-SEC' | 'P-MS' | 'P-NS' | 'P-PS';

/** Kanonischer ARITH-Zeitwert in Nanosekunden (ℤ∞ BigInt).
 *  duration: ns ≥ 0 (C-ARITH-001 Typ-Constraint)
 *  period:   ns ∈ ℤ∞ (UNBOUNDED, CG-STD-3100 v1.6 §8.7)
 */
export interface ArithValue {
  readonly ns:         bigint;           // interner ℤ∞-Wert in Nanosekunden
  readonly arithKind:  ArithKind;        // Semantik-Klasse (duration | period)
  readonly precision:  PrecisionClass;   // Auflösungsklasse
  readonly approx?:    ApproximationInfo; // nur bei irrationalen Zahlen
}

/** Annotierung für approximierte Werte (π, e, √2, φ) */
export interface ApproximationInfo {
  readonly source:        string;  // z.B. "pi", "e", "sqrt2"
  readonly error_ns:      bigint;  // absoluter Fehler in Nanosekunden
  readonly error_ps:      bigint;  // absoluter Fehler in Pikosekunden (für Dokumentation)
  readonly description:   string;
}

/** Dekodierte Zeitdarstellung (human-readable) */
export interface DecodedTime {
  readonly days:         bigint;
  readonly hours:        bigint;
  readonly minutes:      bigint;
  readonly seconds:      bigint;
  readonly milliseconds: bigint;
  readonly microseconds: bigint;
  readonly nanoseconds:  bigint;
  readonly label_de:     string;   // "2 min 24 sec"
  readonly iso8601:      string;   // "PT2M24S"
  readonly cgta:         string;   // "CG:ARITH:144000000000/v1"
}

/** Ergebnis einer Rechenoperation */
export interface ArithResult {
  readonly value:      ArithValue;
  readonly decoded:    DecodedTime;
  readonly operation:  string;     // z.B. "144000000000 + 216000000000"
}

// ─── Konstanten ───────────────────────────────────────────────────────────────

const NS_PER_SEC    = 1_000_000_000n;
const NS_PER_MS     = 1_000_000n;
const NS_PER_US     = 1_000n;
const NS_PER_MIN    = 60_000_000_000n;
const NS_PER_HOUR   = 3_600_000_000_000n;
const NS_PER_DAY    = 86_400_000_000_000n;

/** Präzisionsgranularitäten in Nanosekunden */
const PRECISION_NS: Record<PrecisionClass, bigint> = {
  'P-SEC': NS_PER_SEC,
  'P-MS':  NS_PER_MS,
  'P-NS':  1n,
  'P-PS':  1n,   // Sub-ns: nur dokumentarisch, intern immer 1 ns
};

/**
 * Irrationale Konstanten — approximiert auf 1 ns.
 * Fehler ist unvermeidbar und wird explizit annotiert (I-R3 konform).
 */
const IRRATIONAL_CONSTANTS = {
  pi:    { ns: 3_141_592_653n, error_ns: 1n, error_ps: 589_793n, source: 'pi',    description: 'π = 3.14159265358979... (Fehler < 1 ns)' },
  e:     { ns: 2_718_281_828n, error_ns: 1n, error_ps: 459_045n, source: 'e',     description: 'e = 2.71828182845904... (Fehler < 1 ns)' },
  sqrt2: { ns: 1_414_213_562n, error_ns: 1n, error_ps: 373_095n, source: 'sqrt2', description: '√2 = 1.41421356237... (Fehler < 1 ns)' },
  phi:   { ns: 1_618_033_988n, error_ns: 1n, error_ps: 749_894n, source: 'phi',   description: 'φ = 1.61803398874... (Fehler < 1 ns)' },
} as const;

// ─── Guard-Funktionen (Invarianten) ──────────────────────────────────────────

/**
 * C-ARITH-001: duration_non_negative.
 * Wird nur für arithKind='duration' aufgerufen.
 * Für arithKind='period' gilt UNBOUNDED (kein Guard).
 */
function assertDurationNonNegative(ns: bigint, context: string): void {
  if (ns < 0n) {
    throw new CG_E_003_ExtentError(
      `${context}: Zeitdauer negativ (${ns} ns). ` +
      `Für arithKind='duration' muss ns ≥ 0 gelten (C-ARITH-001).`
    );
  }
}

/**
 * C-ARITH-002: Alle Werte müssen BigInt sein.
 * Diese Funktion prüft zur Laufzeit, ob versehentlich ein Float übergeben wurde.
 */
function assertBigInt(val: unknown, context: string): asserts val is bigint {
  if (typeof val !== 'bigint') {
    throw new CG_E_006_InvariantError(
      'I-R3',
      `${context}: Erwartet BigInt, erhalten ${typeof val}. ` +
      `Float verletzt Determinismus-Invariante I-R3 (C-ARITH-002).`
    );
  }
}

/** Division durch 0 ist verboten (C-ARITH-DIV0) */
function assertNonZeroDivisor(divisor: bigint, context: string): void {
  if (divisor === 0n) {
    throw new CG_E_008_ConstraintError(
      'C-ARITH-DIV0',
      `${context}: Division durch 0 ist mathematisch undefiniert.`
    );
  }
}

// ─── Konvertierungs-Hilfsfunktionen ──────────────────────────────────────────

/**
 * Dezimale Sekundenangabe → BigInt Nanosekunden (ℤ∞).
 * Beispiel: 17.123 → 17_123_000_000n, -1 → -1_000_000_000n
 * KEIN Float: Trennstelle wird als String-Split behandelt, um Rundungsfehler zu vermeiden.
 * Kein negativer Guard hier — ARITH ist UNBOUNDED. Der Typ-Constraint C-ARITH-001
 * (duration ≥ 0) wird erst in fromSec/fromNs für arithKind='duration' geprüft.
 */
export function secToNs(sec: number | string): bigint {
  const s = String(sec).trim();

  const negative = s.startsWith('-');
  const abs = negative ? s.slice(1) : s;

  const dotIdx = abs.indexOf('.');
  let result: bigint;
  if (dotIdx === -1) {
    result = BigInt(abs) * NS_PER_SEC;
  } else {
    const intPart  = abs.slice(0, dotIdx);
    const fracPart = abs.slice(dotIdx + 1).padEnd(9, '0').slice(0, 9);
    const intNs    = BigInt(intPart) * NS_PER_SEC;
    const fracNs   = BigInt(fracPart);
    result = intNs + fracNs;
  }

  return negative ? -result : result;
}

/**
 * BigInt Nanosekunden → Dezimale Sekundendarstellung (nur für Anzeige).
 */
export function nsToSecString(ns: bigint): string {
  const negative  = ns < 0n;
  const absNs     = negative ? -ns : ns;
  const wholeSec  = absNs / NS_PER_SEC;
  const remNs     = absNs % NS_PER_SEC;
  const sign      = negative ? '-' : '';
  if (remNs === 0n) return `${sign}${wholeSec}`;
  const fracStr   = remNs.toString().padStart(9, '0').replace(/0+$/, '');
  return `${sign}${wholeSec}.${fracStr}`;
}

/**
 * Anwenden der Präzisionsklasse (Lazy Precision, CG-STD-3100 v1.5 E2).
 * Rundet auf die nächste Granularität der Klasse ab (floor, vorzeichenerhaltend).
 */
function applyPrecision(ns: bigint, precision: PrecisionClass): bigint {
  const gran = PRECISION_NS[precision];
  if (gran === 1n) return ns;
  // Vorzeichenerhaltende floor-Division für negative Werte
  if (ns >= 0n) return (ns / gran) * gran;
  return -(((-ns) / gran) * gran);
}

// ─── ArithValue-Konstruktor ───────────────────────────────────────────────────

/**
 * Erstellt einen normativen ArithValue aus einem Sekundenwert.
 * Für arithKind='duration': C-ARITH-001 wird geprüft (ns ≥ 0).
 * Für arithKind='period': UNBOUNDED, negative Werte erlaubt.
 */
export function fromSec(
  sec: number | string,
  arithKind: ArithKind = 'duration',
  precision: PrecisionClass = 'P-NS'
): ArithValue {
  const rawNs = secToNs(sec);
  const ns    = applyPrecision(rawNs, precision);
  if (arithKind === 'duration') {
    assertDurationNonNegative(ns, `fromSec(${sec})`);
  }
  return { ns, arithKind, precision };
}

/**
 * Erstellt einen ArithValue direkt aus BigInt Nanosekunden.
 * Für arithKind='duration': C-ARITH-001 wird geprüft (ns ≥ 0).
 * Für arithKind='period': UNBOUNDED, negative Werte erlaubt.
 */
export function fromNs(
  ns: bigint,
  arithKind: ArithKind = 'duration',
  precision: PrecisionClass = 'P-NS'
): ArithValue {
  assertBigInt(ns, 'fromNs');
  const adjusted = applyPrecision(ns, precision);
  if (arithKind === 'duration') {
    assertDurationNonNegative(adjusted, 'fromNs');
  }
  return { ns: adjusted, arithKind, precision };
}

/**
 * Irrationale Konstante als ArithValue (mit expliziter Approximationsannotation).
 * Multipliziert mit einem Sekunden-Faktor.
 * Beispiel: arithIrrational('pi', 3600) → π × 3600 sec
 */
export function arithIrrational(
  constant: keyof typeof IRRATIONAL_CONSTANTS,
  factorSec: number | bigint = 1,
  arithKind: ArithKind = 'duration',
  precision: PrecisionClass = 'P-NS'
): ArithValue {
  const c       = IRRATIONAL_CONSTANTS[constant];
  const factor  = typeof factorSec === 'bigint' ? factorSec : BigInt(Math.round(Number(factorSec)));
  const ns      = c.ns * factor;
  if (arithKind === 'duration') {
    assertDurationNonNegative(ns, `arithIrrational(${constant})`);
  }
  return {
    ns: applyPrecision(ns, precision),
    arithKind,
    precision,
    approx: {
      source:      c.source,
      error_ns:    c.error_ns * (factor < 0n ? -factor : factor),
      error_ps:    c.error_ps * (factor < 0n ? -factor : factor),
      description: `${c.description} × ${factor}`,
    },
  };
}

// ─── Dekodierung (ns → Zeitdarstellung) ──────────────────────────────────────

/**
 * Dekodiert einen ArithValue in eine menschenlesbare Zeitdarstellung.
 * Negative Werte (UNBOUNDED / period) werden mit Vorzeichen dekodiert.
 * Normative Formel (CG-APP-0600 §Formeln) auf |ns| angewandt; Vorzeichen im Label.
 */
export function decode(v: ArithValue): DecodedTime {
  const { ns } = v;
  const negative = ns < 0n;
  const absNs    = negative ? -ns : ns;

  const days         = absNs / NS_PER_DAY;
  const rem_day      = absNs % NS_PER_DAY;
  const hours        = rem_day / NS_PER_HOUR;
  const rem_hour     = rem_day % NS_PER_HOUR;
  const minutes      = rem_hour / NS_PER_MIN;
  const rem_min      = rem_hour % NS_PER_MIN;
  const seconds      = rem_min / NS_PER_SEC;
  const rem_sec      = rem_min % NS_PER_SEC;
  const milliseconds = rem_sec / NS_PER_MS;
  const rem_ms       = rem_sec % NS_PER_MS;
  const microseconds = rem_ms / NS_PER_US;
  const nanoseconds  = rem_ms % NS_PER_US;

  const label_de = buildLabelDe(days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds, negative);
  const iso8601  = buildISO8601(days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds, negative);
  const cgta     = `CG:ARITH:${ns}/v1`;

  return { days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds, label_de, iso8601, cgta };
}

function buildLabelDe(d: bigint, h: bigint, m: bigint, s: bigint,
                      ms: bigint, us: bigint, ns: bigint, negative: boolean): string {
  const parts: string[] = [];
  if (d > 0n)  parts.push(`${d} Tag${d === 1n ? '' : 'e'}`);
  if (h > 0n)  parts.push(`${h} Std`);
  if (m > 0n)  parts.push(`${m} min`);
  if (s > 0n)  parts.push(`${s} sec`);
  if (ms > 0n) parts.push(`${ms} ms`);
  if (us > 0n) parts.push(`${us} µs`);
  if (ns > 0n) parts.push(`${ns} ns`);
  const base = parts.length > 0 ? parts.join(' ') : '0 sec';
  return negative ? `-${base}` : base;
}

function buildISO8601(d: bigint, h: bigint, m: bigint, s: bigint,
                      ms: bigint, us: bigint, _ns: bigint, negative: boolean = false): string {
  const sign = negative ? '-' : '';
  let result = `${sign}P`;
  if (d > 0n) result += `${d}D`;
  const hasTime = h > 0n || m > 0n || (Number(s)+Number(ms)/1000+Number(us)/1000000)>0 || d===0n;
  if (hasTime) result += 'T';
  if (h > 0n) result += `${h}H`;
  if (m > 0n) result += `${m}M`;

  const subSec   = Number(ms) / 1000 + Number(us) / 1_000_000;
  const totalSec = Number(s) + subSec;
  if (totalSec > 0 || result === `${sign}PT`) {
    result += `${totalSec.toFixed(totalSec % 1 === 0 ? 0 : 6).replace(/\.?0+$/, '')}S`;
  }
  return result;
}

// ─── Arithmetische Operationen ────────────────────────────────────────────────

/**
 * Addition zweier ARITH-Werte → ARITH-Wert.
 * Erlaubt: DURATION + DURATION = DURATION  (Allen-Regel)
 * Erlaubt: PERIOD + PERIOD = PERIOD
 */
export function add(a: ArithValue, b: ArithValue): ArithResult {
  const resultNs = a.ns + b.ns;
  const precision: PrecisionClass = a.precision === 'P-NS' ? b.precision : a.precision;
  const value = fromNs(resultNs, a.arithKind, precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} + ${b.ns} = ${resultNs} ns`,
  };
}

/**
 * Subtraktion: a − b → ℤ∞.
 * UNBOUNDED: Das Ergebnis kann negativ sein (CG-STD-3100 v1.6 §8.7).
 * Für arithKind='duration' wird C-ARITH-001 in fromNs durchgesetzt —
 * d. h. ein negatives Ergebnis wirft CG-E-003, sofern der Aufrufer
 * nicht explizit arithKind='period' verwendet.
 * Für arithKind='period' sind negative Ergebnisse vollständig erlaubt.
 */
export function subtract(a: ArithValue, b: ArithValue): ArithResult {
  const resultNs = a.ns - b.ns;
  // fromNs prüft C-ARITH-001 nur für arithKind='duration'
  const value = fromNs(resultNs, a.arithKind, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} - ${b.ns} = ${resultNs} ns`,
  };
}

/**
 * Multiplikation: DURATION × skalarer Faktor (bigint oder number).
 * Negativer Faktor ist verboten (C-ARITH-MUL-NEG, CG-E-008) —
 * dies ist ein Operanden-Constraint, kein UNBOUNDED-Fall.
 * Number-Faktoren werden als Ganzzahl × NS_PER_SEC interpretiert.
 */
export function multiply(a: ArithValue, factor: bigint | number): ArithResult {
  let factorNs: bigint;
  let opStr: string;

  if (typeof factor === 'bigint') {
    if (factor < 0n) {
      throw new CG_E_008_ConstraintError(
        'C-ARITH-MUL-NEG',
        `multiply: Negativer Faktor (${factor}) verletzt C-ARITH-MUL-NEG (CG-E-008).`
      );
    }
    factorNs = factor;
    opStr = `${a.ns} × ${factor}`;
  } else {
    if (factor < 0) {
      throw new CG_E_008_ConstraintError(
        'C-ARITH-MUL-NEG',
        `multiply: Negativer Faktor (${factor}) verletzt C-ARITH-MUL-NEG (CG-E-008).`
      );
    }
    factorNs = BigInt(Math.trunc(factor));
    opStr = `${a.ns} × ${factor}`;
    if (factor !== Math.trunc(factor)) {
      const fracFactor = factor - Math.trunc(factor);
      const fracNs = BigInt(Math.round(fracFactor * Number(a.ns)));
      const resultNs = a.ns * factorNs + fracNs;
      const value = fromNs(resultNs, a.arithKind, a.precision);
      return { value, decoded: decode(value), operation: `${opStr} ≈ ${resultNs} ns [rational factor]` };
    }
  }

  const resultNs = a.ns * factorNs;
  const value = fromNs(resultNs, a.arithKind, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${opStr} = ${resultNs} ns`,
  };
}

/**
 * Division: DURATION ÷ divisor (bigint).
 * Ganzzahlige Division (floor). Für periodische Aufteilung.
 */
export function divide(a: ArithValue, divisor: bigint): ArithResult {
  assertBigInt(divisor, 'divide.divisor');
  assertNonZeroDivisor(divisor, 'divide');
  if (divisor < 0n) {
    throw new CG_E_008_ConstraintError(
      'C-ARITH-DIV-NEG',
      `divide: Negativer Divisor (${divisor}) nicht erlaubt (CG-E-008).`
    );
  }
  const resultNs  = a.ns / divisor;
  const remainder = a.ns % divisor;
  const value = fromNs(resultNs, a.arithKind, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} ÷ ${divisor} = ${resultNs} ns (Rest: ${remainder} ns)`,
  };
}

/**
 * Modulo: DURATION mod divisor.
 * Ergebnis ist immer >= 0 (normativ: mod ist immer nicht-negativ, CG-STD-3100 §2.6).
 */
export function modulo(a: ArithValue, divisor: bigint): ArithResult {
  assertBigInt(divisor, 'modulo.divisor');
  assertNonZeroDivisor(divisor, 'modulo');
  const resultNs = ((a.ns % divisor) + divisor) % divisor;
  const value = fromNs(resultNs, a.arithKind, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} mod ${divisor} = ${resultNs} ns`,
  };
}

/**
 * Potenz: DURATION ^ exponent (ganzzahlig, >= 0).
 * Entspricht CG-STD-3100 §2.6 BigInt-Pflichtoperation Pow.
 */
export function power(a: ArithValue, exponent: bigint): ArithResult {
  if (exponent < 0n) {
    throw new CG_E_008_ConstraintError(
      'C-ARITH-POW-NEG',
      `power: Negativer Exponent (${exponent}) nicht erlaubt (Ergebnis wäre Bruch).`
    );
  }
  const resultNs = a.ns ** exponent;
  const value = fromNs(resultNs, a.arithKind, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} ^ ${exponent} = ${resultNs} ns`,
  };
}

/**
 * Vergleich zweier ARITH-Werte (totale Ordnung auf ℤ∞, I-R2).
 * Gibt eines von: 'less' | 'equal' | 'greater' zurück.
 */
export function compare(a: ArithValue, b: ArithValue): 'less' | 'equal' | 'greater' {
  if (a.ns < b.ns) return 'less';
  if (a.ns > b.ns) return 'greater';
  return 'equal';
}

// ─── Bequemlichkeitsfunktionen ────────────────────────────────────────────────

/**
 * Berechnet einen ArithValue aus einer Sekunden-Zahl und gibt
 * direkt die vollständige Dekodierung zurück.
 */
export function compute(sec: number | string, arithKind: ArithKind = 'duration'): DecodedTime {
  return decode(fromSec(sec, arithKind));
}

/**
 * Formatiert einen ArithValue als kompakte Zusammenfassung.
 */
export function format(v: ArithValue): string {
  const d = decode(v);
  const lines = [
    `Zeitwert:  ${nsToSecString(v.ns)} sec`,
    `Intern:    ${v.ns} ns  [ℤ∞ BigInt]`,
    `Darst.:    ${d.label_de}`,
    `ISO 8601:  ${d.iso8601}`,
    `CGTA:      ${d.cgta}`,
    `arith_kind:  ${v.arithKind}`,
    `Präzision: ${v.precision}`,
  ];
  if (v.approx) {
    lines.push(`Approx.:   ${v.approx.description}`);
    lines.push(`Fehler:    ± ${v.approx.error_ns} ns  (± ${v.approx.error_ps} ps)`);
  }
  return lines.join('\n');
}

// ─── Konstanten-Exporte ───────────────────────────────────────────────────────

/** Vordefinierte ArithValues für häufige Zeiteinheiten */
export const ARITH = {
  ONE_NS:    fromNs(1n),
  ONE_US:    fromNs(NS_PER_US),
  ONE_MS:    fromNs(NS_PER_MS),
  ONE_SEC:   fromNs(NS_PER_SEC),
  ONE_MIN:   fromNs(NS_PER_MIN),
  ONE_HOUR:  fromNs(NS_PER_HOUR),
  ONE_DAY:   fromNs(NS_PER_DAY),
  ONE_YEAR:  fromNs(NS_PER_DAY * 365n),

  PI:        arithIrrational('pi'),
  E:         arithIrrational('e'),
  SQRT2:     arithIrrational('sqrt2'),
  PHI:       arithIrrational('phi'),

  FIBONACCI_F12: fromNs(144n * NS_PER_SEC),   // F(12) = 144 = 12×12
  PULSAR_PSR_B1919_21: fromSec('1.337759', 'period'),  // Echtwert (nicht π-Näherung)
} as const;
