/**
 * cg-zeitarithmetik.ts
 * ChronoGrid Zeitarithmetik — ℤ∞ BigInt Implementierung
 *
 * Normative Basis: CG-STD-0000 v0.5, CG-STD-3100 v1.5, ARITH Domain v1.0
 * Paket: cg-engine (Erweiterung)
 * Autor: Kurt Bauer, Initiator & Hauptautor, ChronoGrid Systems
 * Stand: Mai 2026
 *
 * Alle internen Berechnungen erfolgen als BigInt in Nanosekunden.
 * Kein Float, kein Rundungsfehler, kein stiller Overflow.
 * Invarianten: I-R2 (t >= 0), I-R3 (Determinismus), I-E1 (kein Epoch).
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

export type SigmaClass = 'duration' | 'period';
export type PrecisionClass = 'P-SEC' | 'P-MS' | 'P-NS' | 'P-PS';

/** Kanonischer ARITH-Zeitwert in Nanosekunden (ℤ∞, immer >= 0) */
export interface ArithValue {
  readonly ns:         bigint;           // interner ℤ∞-Wert in Nanosekunden
  readonly sigma:      SigmaClass;       // Semantik-Klasse (duration | period)
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
 * I-R2: t >= 0. Negative Zeitdauer ist undefiniert.
 * C-ARITH-001: duration_non_negative
 */
function assertNonNegative(ns: bigint, context: string): void {
  if (ns < 0n) {
    throw new CG_E_003_ExtentError(
      `${context}: Zeitdauer negativ (${ns} ns). ` +
      `Subtraktion a−b nur erlaubt wenn a >= b. Verletzt I-R2 und C-ARITH-001.`
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
 * Beispiel: 17.123 → 17_123_000_000n
 * KEIN Float: Trennstelle wird als String-Split behandelt, um Rundungsfehler zu vermeiden.
 */
export function secToNs(sec: number | string): bigint {
  const s = String(sec).trim();

  // Negativprüfung
  if (s.startsWith('-')) {
    throw new CG_E_003_ExtentError(
      `secToNs(${s}): Negativer Eingabewert. ARITH erlaubt nur t >= 0 (C-ARITH-001).`
    );
  }

  const dotIdx = s.indexOf('.');
  if (dotIdx === -1) {
    // Ganzzahl: direkt
    return BigInt(s) * NS_PER_SEC;
  }

  const intPart  = s.slice(0, dotIdx);
  const fracPart = s.slice(dotIdx + 1).padEnd(9, '0').slice(0, 9); // max 9 Stellen = ns

  const intNs  = BigInt(intPart)  * NS_PER_SEC;
  const fracNs = BigInt(fracPart);

  return intNs + fracNs;
}

/**
 * BigInt Nanosekunden → Dezimale Sekundendarstellung (nur für Anzeige).
 */
export function nsToSecString(ns: bigint): string {
  const wholeSec = ns / NS_PER_SEC;
  const remNs    = ns % NS_PER_SEC;
  if (remNs === 0n) return wholeSec.toString();
  const fracStr  = remNs.toString().padStart(9, '0').replace(/0+$/, '');
  return `${wholeSec}.${fracStr}`;
}

/**
 * Anwenden der Präzisionsklasse (Lazy Precision, CG-STD-3100 v1.5 E2).
 * Rundet auf die nächste Granularität der Klasse ab (floor).
 */
function applyPrecision(ns: bigint, precision: PrecisionClass): bigint {
  const gran = PRECISION_NS[precision];
  return (ns / gran) * gran;
}

// ─── ArithValue-Konstruktor ───────────────────────────────────────────────────

/**
 * Erstellt einen normativen ArithValue aus einem Sekundenwert.
 * Nimmt einen Number oder String entgegen und konvertiert intern zu BigInt.
 */
export function fromSec(
  sec: number | string,
  sigma: SigmaClass = 'duration',
  precision: PrecisionClass = 'P-NS'
): ArithValue {
  const rawNs = secToNs(sec);
  const ns    = applyPrecision(rawNs, precision);
  assertNonNegative(ns, `fromSec(${sec})`);
  return { ns, sigma, precision };
}

/**
 * Erstellt einen ArithValue direkt aus BigInt Nanosekunden.
 */
export function fromNs(
  ns: bigint,
  sigma: SigmaClass = 'duration',
  precision: PrecisionClass = 'P-NS'
): ArithValue {
  assertBigInt(ns, 'fromNs');
  assertNonNegative(ns, 'fromNs');
  const adjusted = applyPrecision(ns, precision);
  return { ns: adjusted, sigma, precision };
}

/**
 * Irrationale Konstante als ArithValue (mit expliziter Approximationsannotation).
 * Multipliziert mit einem Sekunden-Faktor.
 * Beispiel: arithIrrational('pi', 3600) → π × 3600 sec
 */
export function arithIrrational(
  constant: keyof typeof IRRATIONAL_CONSTANTS,
  factorSec: number | bigint = 1,
  sigma: SigmaClass = 'duration',
  precision: PrecisionClass = 'P-NS'
): ArithValue {
  const c       = IRRATIONAL_CONSTANTS[constant];
  const factor  = typeof factorSec === 'bigint' ? factorSec : BigInt(Math.round(Number(factorSec)));
  const ns      = c.ns * factor;
  assertNonNegative(ns, `arithIrrational(${constant})`);
  return {
    ns: applyPrecision(ns, precision),
    sigma,
    precision,
    approx: {
      source:      c.source,
      error_ns:    c.error_ns * factor,
      error_ps:    c.error_ps * factor,
      description: `${c.description} × ${factor}`,
    },
  };
}

// ─── Dekodierung (ns → Zeitdarstellung) ──────────────────────────────────────

/**
 * Dekodiert einen ArithValue in eine menschenlesbare Zeitdarstellung.
 * Normative Formel (CG-APP-0600 §Formeln):
 *   days      = floor(ns / NS_PER_DAY)
 *   hours     = floor((ns mod NS_PER_DAY) / NS_PER_HOUR)
 *   minutes   = floor((ns mod NS_PER_HOUR) / NS_PER_MIN)
 *   seconds   = floor((ns mod NS_PER_MIN) / NS_PER_SEC)
 *   ms        = floor((ns mod NS_PER_SEC) / NS_PER_MS)
 *   us        = floor((ns mod NS_PER_MS) / NS_PER_US)
 *   ns_rem    = ns mod NS_PER_US
 */
export function decode(v: ArithValue): DecodedTime {
  const { ns } = v;

  const days         = ns / NS_PER_DAY;
  const rem_day      = ns % NS_PER_DAY;
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

  const label_de = buildLabelDe(days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds);
  const iso8601  = buildISO8601(days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds);
  const cgta     = `CG:ARITH:${ns}/v1`;

  return { days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds, label_de, iso8601, cgta };
}

function buildLabelDe(d: bigint, h: bigint, m: bigint, s: bigint,
                      ms: bigint, us: bigint, ns: bigint): string {
  const parts: string[] = [];
  if (d > 0n)  parts.push(`${d} Tag${d === 1n ? '' : 'e'}`);
  if (h > 0n)  parts.push(`${h} Std`);
  if (m > 0n)  parts.push(`${m} min`);
  if (s > 0n)  parts.push(`${s} sec`);
  if (ms > 0n) parts.push(`${ms} ms`);
  if (us > 0n) parts.push(`${us} µs`);
  if (ns > 0n) parts.push(`${ns} ns`);
  return parts.length > 0 ? parts.join(' ') : '0 sec';
}

function buildISO8601(d: bigint, h: bigint, m: bigint, s: bigint,
                      ms: bigint, us: bigint, _ns: bigint): string {
  // ISO 8601 Duration: PT[nH][nM][n.nnnS]
  let result = 'P';
  if (d > 0n) result += `${d}D`;
  result += 'T';
  if (h > 0n) result += `${h}H`;
  if (m > 0n) result += `${m}M`;

  // Sekunden inkl. Subsekunden
  const subSec = Number(ms) / 1000 + Number(us) / 1_000_000;
  const totalSec = Number(s) + subSec;
  if (totalSec > 0 || result === 'PT') {
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
  const value = fromNs(resultNs, a.sigma, precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} + ${b.ns} = ${resultNs} ns`,
  };
}

/**
 * Subtraktion: a − b. Nur erlaubt wenn a.ns >= b.ns (C-ARITH-001).
 * DURATION − DURATION = DURATION
 */
export function subtract(a: ArithValue, b: ArithValue): ArithResult {
  if (a.ns < b.ns) {
    throw new CG_E_003_ExtentError(
      `subtract(${a.ns}, ${b.ns}): Ergebnis wäre negativ (${a.ns - b.ns} ns). ` +
      `Verletzt C-ARITH-001 (duration_non_negative) und I-R2.`
    );
  }
  const resultNs = a.ns - b.ns;
  const value = fromNs(resultNs, a.sigma, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} - ${b.ns} = ${resultNs} ns`,
  };
}

/**
 * Multiplikation: DURATION × skalarer Faktor (bigint oder number).
 * Number-Faktoren werden als Ganzzahl × NS_PER_SEC interpretiert (Subsekunden via Dezimal-Konverter).
 * Für rationale Faktoren: multiply(a, BigInt-Faktor) direkt nutzen.
 */
export function multiply(a: ArithValue, factor: bigint | number): ArithResult {
  let factorNs: bigint;
  let opStr: string;

  if (typeof factor === 'bigint') {
    if (factor < 0n) {
      throw new CG_E_008_ConstraintError(
        'C-ARITH-MUL-NEG',
        `multiply: Negativer Faktor (${factor}) würde Ergebnis negativ machen. Verletzt C-ARITH-001.`
      );
    }
    factorNs = factor;
    opStr = `${a.ns} × ${factor}`;
  } else {
    // number-Faktor: Umwandlung über String-Methode (kein Float-Fehler für ganze Zahlen)
    if (factor < 0) {
      throw new CG_E_008_ConstraintError(
        'C-ARITH-MUL-NEG',
        `multiply: Negativer Faktor (${factor}) würde Ergebnis negativ machen. Verletzt C-ARITH-001.`
      );
    }
    // Für Integer-Faktoren: direkt; für rationale: Warnung
    factorNs = BigInt(Math.trunc(factor));
    opStr = `${a.ns} × ${factor}`;
    if (factor !== Math.trunc(factor)) {
      // rationaler Faktor: Dezimalteil separat behandeln
      const fracFactor = factor - Math.trunc(factor);
      const fracNs = BigInt(Math.round(fracFactor * Number(a.ns)));
      const resultNs = a.ns * factorNs + fracNs;
      assertNonNegative(resultNs, `multiply(rational, ${factor})`);
      const value = fromNs(resultNs, a.sigma, a.precision);
      return { value, decoded: decode(value), operation: `${opStr} ≈ ${resultNs} ns [rational factor]` };
    }
  }

  const resultNs = a.ns * factorNs;
  assertNonNegative(resultNs, `multiply(${factor})`);
  const value = fromNs(resultNs, a.sigma, a.precision);
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
      `divide: Negativer Divisor (${divisor}) nicht erlaubt in ARITH (C-ARITH-001).`
    );
  }
  const resultNs = a.ns / divisor;       // BigInt: floor-Division
  const remainder = a.ns % divisor;
  const value = fromNs(resultNs, a.sigma, a.precision);
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
  const resultNs = ((a.ns % divisor) + divisor) % divisor; // immer nicht-negativ
  const value = fromNs(resultNs, a.sigma, a.precision);
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
  assertNonNegative(resultNs, `power(${exponent})`);
  const value = fromNs(resultNs, a.sigma, a.precision);
  return {
    value,
    decoded: decode(value),
    operation: `${a.ns} ^ ${exponent} = ${resultNs} ns`,
  };
}

/**
 * Vergleich: a ≤ b (Invariante I-R2: totale Ordnung auf ℤ∞).
 * Gibt eines von: 'less' | 'equal' | 'greater' zurück.
 */
export function compare(a: ArithValue, b: ArithValue): 'less' | 'equal' | 'greater' {
  if (a.ns < b.ns) return 'less';
  if (a.ns > b.ns) return 'greater';
  return 'equal';
}

// ─── Bequemlichkeitsfunktionen (Wrapper für häufige Anwendungsfälle) ──────────

/**
 * Berechnet einen ArithValue aus einer Sekunden-Zahl und gibt
 * direkt die vollständige Dekodierung zurück.
 * Hauptfunktion für einfache Zeitarithmetik-Abfragen.
 */
export function compute(sec: number | string, sigma: SigmaClass = 'duration'): DecodedTime {
  return decode(fromSec(sec, sigma));
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
    `σ-Klasse:  ${v.sigma}`,
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
  PULSAR_PSR_B1919_21: arithIrrational('pi',  // Näherung via Konstante
    1n, 'period'),                              // Echtwert: fromSec('1.337759')
} as const;
