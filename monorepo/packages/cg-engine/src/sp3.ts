/**
 * sp3.ts
 * SP3-d-Bahndateien — Writer, Reader und exakte Lagrange-Interpolation
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6 (Klasse-B-Mapping F[W](τ)),
 *                  CG-STD-0000 v0.8 §3 (I-R3 Determinismus),
 *                  IERS Conventions 2010 (ω_⊕),
 *                  SP3-c/SP3-d Formatdefinition (Hilla 2010 / IGS RINEX-WG)
 * Tests: T-L3-SP3-001…006 (cg-testkit/suites/t-l3-sp3.ts), T-RELB-06x…08x (Vitest)
 * Paket: cg-engine (Erweiterung)
 * Autor: Kurt Bauer, Initiator & Hauptautor, ChronoGrid Systems
 * Stand: August 2026 — A4/Weg A, Schritt 3 (SP3-Vollausbau)
 *
 * Ersetzt den in relativistik.ts angekündigten Folgeschritt: die Ephemeride
 * kommt nicht mehr zwingend aus dem Kepler-Generator, sondern aus einer
 * SP3-Bahndatei. Die Integration selbst ist unverändert.
 *
 * ── Zielkonfiguration (gemessen, nicht geschätzt) ───────────────────────────
 * Die Parameter stammen aus scripts/sp3-fehlerbudget.ts, das den Fehler jeder
 * Näherung punktweise gegen den exakten Kepler-Zustand misst:
 *
 *   Produkt        IGS Final, 15-min-Raster (900 s), Bezug über BKG
 *   Interpolation  Lagrange Ordnung 9 (= 10 Stützstellen, zentriertes Fenster)
 *   Erdrotation    konstantes ω um die z-Achse, keine EOP/ERP-Datei
 *   Geschwindigkeit v_ECEF + ω×r, durchgehend in ECEF-Komponenten
 *
 * Ordnung 9 ist ein gemessenes Optimum, keine Konvention: oberhalb davon
 * dominiert die mm-Quantisierung der SP3-Felder den Interpolationsfehler, das
 * Polynom verstärkt sie sogar. Nach unten auszuweichen ist nicht zulässig —
 * dort wächst der Abschneidefehler wieder über das Budget.
 *
 * ── Warum die ECEF→ECI-Drehung entfällt ─────────────────────────────────────
 * f hängt nur von |r| und |v| ab (skalares 1PN-Modell). |r| ist drehinvariant.
 * Für die Geschwindigkeit gilt mit R = R_z(θ) und ω ∥ z:
 *
 *     v_ECI = R·(v_ECEF + ω×r_ECEF)
 *     |v_ECI| = |v_ECEF + ω×r_ECEF|                    (R ist eine Isometrie)
 *
 * ω× und R_z kommutieren, weil beide nur um dieselbe Achse wirken — deshalb
 * darf ω×r in ECEF-Komponenten gebildet werden, ohne vorher zu drehen. Es
 * entsteht kein sin/cos und damit kein viertes Rundungsereignis: die Kette
 * Datei → Interpolation → f bleibt vollständig exakt rational.
 * Diese Vereinfachung gilt genau solange, wie f skalar bleibt. Ein künftiges
 * J2- oder Volltensor-Modell bräuchte die Drehung zurück.
 *
 * ── Exaktheitszusage ────────────────────────────────────────────────────────
 * Der Rechenpfad Datei → Zustand enthält KEINEN Float. SP3-Zahlenfelder sind
 * Dezimalliterale fester Stellenzahl und damit exakt rational:
 *
 *   Position  %14.6f km  → 10⁻⁶ km = 1 mm     ⇒ r [m] = N/10³
 *   Velocity  %14.6f dm/s → 10⁻⁶ dm/s = 10⁻⁷ m/s ⇒ v [m/s] = N/10⁷
 *
 * Die Lagrange-Auswertung läuft über ganzzahlige Zähler (siehe
 * lagrangeValueAndDerivative), ω ist rational, ω×r exakt. Float tritt nur
 * unterhalb des KEIN-RECHENPFAD-Trenners auf: im Fixture-Writer, dessen
 * AUSGABE auf das SP3-Raster gerundet wird und damit exakt in den Reader
 * zurückläuft.
 */

import { Errors } from 'cg-types/errors.js';
import { gregorianToSeconds, secondsToISO8601 } from './gregorian.js';
import {
  type Rat, rat, ratAdd, ratSub, ratMul, ratDiv, ratCmp, ratAbs,
  ratRoundToScale, ratFromDecimal, ratToNumber, isqrtScaled,
} from './exakt.js';
import type { ExactState, ExactWorldline, ReferenceFrame } from './relativistik.js';
import { properTimeRateExact } from './relativistik.js';

// ─── Einheiten und Konstanten des Formats ────────────────────────────────────

/** Nanosekunden je Sekunde. */
const NS = 1_000_000_000n;

/** Nachkommastellen der SP3-Zahlenfelder (Position wie Velocity): %14.6f. */
export const SP3_FIELD_DECIMALS = 6;

/** Position: Feld in km ⇒ Meter = Feldziffern / 10³ (mm-Auflösung). */
export const SP3_POS_DEN = 1_000n;

/** Velocity: Feld in dm/s ⇒ m/s = Feldziffern / 10⁷ (10⁻⁷ m/s Auflösung). */
export const SP3_VEL_DEN = 10_000_000n;

/** Fehlwert des Formats für Uhrfelder (999999.999999 µs). */
export const SP3_CLOCK_BAD = '999999.999999';

/** ω_⊕ = 7,292115·10⁻⁵ rad/s — IERS Conventions 2010, mittlere Rotationsrate.
 *  Exakt rational; EOP/ERP werden bewusst nicht gelesen (siehe Dateikopf). */
export const OMEGA_EARTH: Rat = rat(7_292_115n, 10n ** 11n);

/** Grad des Interpolationspolynoms — gemessenes Optimum (sp3-fehlerbudget.ts). */
export const SP3_LAGRANGE_DEGREE = 9;

/** Stützstellen je Fenster = Grad + 1. */
export const SP3_LAGRANGE_POINTS = SP3_LAGRANGE_DEGREE + 1;

/** TAI − GPST = 19 s, konstant seit der GPS-Epoche 1980-01-06 (BIPM/IERS).
 *  SP3-Epochenzeilen tragen GPS-Zeit; intern rechnet ChronoGrid in TAI. */
export const TAI_MINUS_GPST_S = 19n;

/** Sekunden von 0001-01-01 (Epoche von gregorianToSeconds) bis 1970-01-01.
 *  Aus der bestehenden Kalenderroutine abgeleitet statt neu hergeleitet. */
const EPOCH_1970_S = gregorianToSeconds(1970n, 1n, 1n);

// ─── Datenmodell ─────────────────────────────────────────────────────────────

/** Ein Satellitenrecord einer Epoche. `v` fehlt bei positions-only Dateien. */
export interface Sp3Record {
  readonly r: readonly [Rat, Rat, Rat];
  readonly v?: readonly [Rat, Rat, Rat];
  /** Uhrkorrektur [µs]; undefined, wenn das Fehlwertmuster steht. */
  readonly clockUs?: Rat;
}

/** Alle Satelliten einer Epoche. */
export interface Sp3EpochBlock {
  readonly tTaiNs: bigint;
  readonly sats: ReadonlyMap<string, Sp3Record>;
}

export interface Sp3File {
  readonly version: 'c' | 'd';
  /** Kopf-Kennung: 'P' = nur Positionen, 'V' = Positionen + Geschwindigkeiten. */
  readonly mode: 'P' | 'V';
  readonly satellites: readonly string[];
  readonly coordSys: string;
  readonly agency: string;
  /** Rasterabstand [ns] aus der ##-Zeile. */
  readonly intervalNs: bigint;
  /** Bezugssystem der Koordinaten. Reale Produkte sind erdfest (ECEF). */
  readonly frame: 'ECEF' | 'ECI';
  readonly blocks: readonly Sp3EpochBlock[];
}

// ─── Exakte Lagrange-Interpolation ───────────────────────────────────────────

/**
 * Lagrange-Interpolation über die ganzzahligen Knoten 0…n−1, exakt rational,
 * mit analytischer Ableitung nach τ (Einheit: Rasterschritte).
 *
 * Die Auswertung läuft über ganzzahlige Zähler statt über Rat-Produkte: mit
 * τ = A/B ist
 *
 *     Π_{j≠i}(τ − j) = Π_{j≠i}(A − jB) / B^(n−1)
 *
 * und die Ableitung nach τ verliert genau eine Potenz von B. Damit fällt in der
 * inneren Doppelschleife keine einzige Kürzung an — nur BigInt-Multiplikation.
 * Das ist nicht nur schneller, es hält die Zwischengrößen auch klein genug,
 * dass Ordnung 9 im Integrator praktikabel bleibt (der Integrator wertet
 * stateAt fünfmal je Schritt aus).
 *
 * Die Ableitung ist analytisch, keine Differenz benachbarter Stützstellen —
 * genau deshalb liefert der positions-only Pfad überhaupt eine brauchbare
 * Geschwindigkeit.
 */
export function lagrangeValueAndDerivative(
  vals: readonly Rat[], tau: Rat,
): { readonly v: Rat; readonly d: Rat } {
  const n = vals.length;
  if (n < 2) {
    throw Errors.MappingError.invalidMathExpr(
      `Lagrange: mindestens 2 Stützstellen nötig (n=${n})`, { n },
    );
  }
  const A = tau.n, B = tau.d;

  // m[j] = A − j·B  — ganzzahlige Darstellung von (τ − j)·B
  const m: bigint[] = new Array(n);
  for (let j = 0; j < n; j++) m[j] = A - BigInt(j) * B;

  // Prefix-/Suffixprodukte über m ⇒ Π_{j≠i} m[j] in O(n)
  const pre: bigint[] = new Array(n + 1);
  const suf: bigint[] = new Array(n + 1);
  pre[0] = 1n;
  for (let j = 0; j < n; j++) pre[j + 1] = pre[j]! * m[j]!;
  suf[n] = 1n;
  for (let j = n - 1; j >= 0; j--) suf[j] = suf[j + 1]! * m[j]!;

  const Bp1 = B ** BigInt(n - 1);          // Nenner der Werte
  const Bp2 = B ** BigInt(n - 2);          // Nenner der Ableitung

  let val = rat(0n), der = rat(0n);
  for (let i = 0; i < n; i++) {
    // D_i = Π_{j≠i}(i − j) — reine Knotengröße, unabhängig von τ
    let D = 1n;
    for (let j = 0; j < n; j++) if (j !== i) D *= BigInt(i - j);

    const P = pre[i]! * suf[i + 1]!;       // Π_{j≠i} m[j]

    // S_i = Σ_{k≠i} Π_{j≠i,k} m[j] — Ableitung des Produkts nach A
    const rest: bigint[] = new Array(n - 1);
    let p = 0;
    for (let j = 0; j < n; j++) if (j !== i) rest[p++] = m[j]!;
    const rp: bigint[] = new Array(n);
    const rs: bigint[] = new Array(n);
    rp[0] = 1n;
    for (let j = 0; j < n - 1; j++) rp[j + 1] = rp[j]! * rest[j]!;
    rs[n - 1] = 1n;
    for (let j = n - 2; j >= 0; j--) rs[j] = rs[j + 1]! * rest[j]!;
    let S = 0n;
    for (let k = 0; k < n - 1; k++) S += rp[k]! * rs[k + 1]!;

    const c = vals[i]!;
    val = ratAdd(val, rat(c.n * P, c.d * D * Bp1));
    der = ratAdd(der, rat(c.n * S, c.d * D * Bp2));
  }
  return { v: val, d: der };
}

// ─── Reader ──────────────────────────────────────────────────────────────────

/** Exakter Feldparser: Dezimalliteral → Rat, ohne Float-Zwischenwert. */
function parseField(text: string, where: string): Rat {
  const s = text.trim();
  if (s === '') {
    throw Errors.SyntaxError.missingField(`SP3: leeres Zahlenfeld (${where})`, { where });
  }
  try {
    return ratFromDecimal(s);
  } catch {
    throw Errors.SyntaxError.abnfViolation(
      `SP3: '${s}' ist kein gültiges Zahlenfeld (${where})`, { where, feld: s },
    );
  }
}

/** Kalenderfelder einer Epochenzeile → TAI-Nanosekunden. */
function epochToTaiNs(
  y: bigint, mo: bigint, d: bigint, h: bigint, mi: bigint, secField: Rat, where: string,
): bigint {
  const wholeSec = secField.n / secField.d;
  const fracNs = ratRoundToScale(ratSub(secField, rat(wholeSec)), NS);
  if (fracNs < 0n || fracNs >= NS) {
    throw Errors.SyntaxError.abnfViolation(
      `SP3: Sekundenfeld außerhalb [0,1) nach Ganzzahlabspaltung (${where})`, { where },
    );
  }
  const gpstSec = gregorianToSeconds(y, mo, d, h, mi, wholeSec) - EPOCH_1970_S;
  return (gpstSec + TAI_MINUS_GPST_S) * NS + fracNs;
}

export interface Sp3ParseOptions {
  /** Überschreibt das aus dem Kopf erkannte Bezugssystem. */
  readonly frame?: 'ECEF' | 'ECI';
}

/**
 * SP3-c/SP3-d-Parser. Zahlenfelder werden exakt rational gelesen.
 *
 * Die P/V-Zeilen werden spaltenweise zerlegt, nicht per Whitespace-Split: das
 * Format erlaubt %14.6f-Felder, die bei großen Beträgen oder negativem
 * Vorzeichen aneinanderstoßen (etwa '-12345.678901-23456.789012'). Ein Split
 * auf Leerzeichen liest solche Zeilen still falsch — genau die Sorte Fehler,
 * die erst bei echten Produktdateien auffällt.
 *
 * Kopfzeilen ohne Bedeutung für das Mapping (%c, %f, %i, ++) werden übergangen.
 * Fehler: Formatverstoß → CG-E-001.007, fehlendes Feld → CG-E-001.002.
 */
export function parseSp3(text: string, opts: Sp3ParseOptions = {}): Sp3File {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || !/^#[cd]/.test(lines[0] ?? '')) {
    throw Errors.SyntaxError.abnfViolation(
      'SP3: erste Zeile ist keine #c/#d-Kopfzeile', { kopf: (lines[0] ?? '').slice(0, 20) },
    );
  }
  const head = lines[0]!;
  const version = head[1] as 'c' | 'd';
  const modeChar = head[2];
  if (modeChar !== 'P' && modeChar !== 'V') {
    throw Errors.SyntaxError.abnfViolation(
      `SP3: Kopf-Kennung '${modeChar}' ist weder P noch V`, { modeChar: String(modeChar) },
    );
  }
  const mode: 'P' | 'V' = modeChar;
  const coordSys = head.slice(46, 51).trim() || 'UNKNOWN';
  const agency = head.slice(56, 60).trim() || 'UNKNOWN';

  let intervalNs = 0n;
  let frame: 'ECEF' | 'ECI' = 'ECEF';        // reale Produkte sind erdfest
  const satellites: string[] = [];
  const blocks: Sp3EpochBlock[] = [];
  let current: { tTaiNs: bigint; sats: Map<string, Sp3Record> } | null = null;

  const flush = (): void => {
    if (current) blocks.push({ tTaiNs: current.tTaiNs, sats: current.sats });
    current = null;
  };

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li]!;
    if (line.trim() === '') continue;

    if (line.startsWith('##')) {
      // ## GPSweek SecOfWeek EpochInterval MJD FracDay
      const tok = line.slice(2).trim().split(/\s+/);
      if (tok.length < 3) {
        throw Errors.SyntaxError.missingField(`SP3: ##-Zeile unvollständig (Zeile ${li + 1})`, { zeile: li + 1 });
      }
      const iv = parseField(tok[2]!, `##-Intervall, Zeile ${li + 1}`);
      intervalNs = ratRoundToScale(iv, NS);
      if (intervalNs <= 0n) {
        throw Errors.SyntaxError.abnfViolation(
          `SP3: Epochenintervall ${tok[2]} s ist nicht positiv`, { intervall: tok[2]! },
        );
      }
      continue;
    }
    if (line.startsWith('+ ') || line.startsWith('+\t') || /^\+ {0,3}\d/.test(line)) {
      // Satellitenliste: 3-stellige IDs ab Spalte 10
      const body = line.slice(9);
      for (let k = 0; k + 3 <= body.length; k += 3) {
        const id = body.slice(k, k + 3).trim();
        if (id !== '' && id !== '0' && !satellites.includes(id)) satellites.push(id);
      }
      continue;
    }
    if (line.startsWith('++') || line.startsWith('%c') || line.startsWith('%f') || line.startsWith('%i')) {
      continue;
    }
    if (line.startsWith('/*')) {
      // Eigene Fixtures markieren ihr Bezugssystem im Kommentar; reale
      // Produkte tun das nicht und bleiben deshalb bei der ECEF-Vorgabe.
      const m = /CG-FRAME\s+(ECEF|ECI)/.exec(line);
      if (m) frame = m[1] as 'ECEF' | 'ECI';
      continue;
    }
    if (line.startsWith('EOF')) { flush(); break; }

    if (line.startsWith('*')) {
      flush();
      const tok = line.slice(1).trim().split(/\s+/);
      if (tok.length < 6) {
        throw Errors.SyntaxError.missingField(
          `SP3: Epochenzeile unvollständig (Zeile ${li + 1})`, { zeile: li + 1 },
        );
      }
      const tTaiNs = epochToTaiNs(
        BigInt(tok[0]!), BigInt(tok[1]!), BigInt(tok[2]!), BigInt(tok[3]!), BigInt(tok[4]!),
        parseField(tok[5]!, `Epochensekunde, Zeile ${li + 1}`), `Zeile ${li + 1}`,
      );
      current = { tTaiNs, sats: new Map() };
      continue;
    }

    if (line.startsWith('P') || line.startsWith('V')) {
      if (!current) {
        throw Errors.SyntaxError.abnfViolation(
          `SP3: ${line[0]}-Record ohne vorangehende Epochenzeile (Zeile ${li + 1})`, { zeile: li + 1 },
        );
      }
      const kind = line[0]!;
      const sat = line.slice(1, 4).trim();
      const where = `${kind}-Record ${sat}, Zeile ${li + 1}`;
      const f = (a: number, b: number): Rat => parseField(line.slice(a, b), where);
      const x = f(4, 18), y = f(18, 32), z = f(32, 46);
      const clockRaw = line.length > 46 ? line.slice(46, 60).trim() : '';

      if (kind === 'P') {
        // km → m: Feld/10⁶ km · 10³ m/km = Feldziffern/10³
        const toM = (q: Rat): Rat => ratMul(q, rat(1_000n));
        const clockUs = clockRaw === '' || clockRaw === SP3_CLOCK_BAD
          ? undefined : parseField(clockRaw, where);
        const prev = current.sats.get(sat);
        current.sats.set(sat, {
          r: [toM(x), toM(y), toM(z)] as const,
          v: prev?.v,
          clockUs,
        });
      } else {
        // dm/s → m/s: Feld/10⁶ dm/s / 10 = Feldziffern/10⁷
        const toMs = (q: Rat): Rat => ratDiv(q, rat(10n));
        const prev = current.sats.get(sat);
        if (!prev) {
          throw Errors.SyntaxError.abnfViolation(
            `SP3: V-Record ohne zugehörigen P-Record (${sat}, Zeile ${li + 1})`,
            { sat, zeile: li + 1 },
          );
        }
        current.sats.set(sat, { ...prev, v: [toMs(x), toMs(y), toMs(z)] as const });
      }
      if (!satellites.includes(sat)) satellites.push(sat);
      continue;
    }
  }
  flush();

  if (blocks.length === 0) {
    throw Errors.SyntaxError.missingField('SP3: Datei enthält keine Epochen', {});
  }
  if (intervalNs === 0n) {
    // Aus den ersten beiden Epochen ableiten, falls die ##-Zeile fehlt
    if (blocks.length < 2) {
      throw Errors.SyntaxError.missingField(
        'SP3: Epochenintervall weder in ##-Zeile noch aus zwei Epochen ableitbar', {},
      );
    }
    intervalNs = blocks[1]!.tTaiNs - blocks[0]!.tTaiNs;
  }
  return {
    version, mode, satellites, coordSys, agency, intervalNs,
    frame: opts.frame ?? frame, blocks,
  };
}

// ─── Weltlinie aus SP3 ───────────────────────────────────────────────────────

/** Kreuzprodukt, exakt rational. */
export function crossExact(
  a: readonly [Rat, Rat, Rat], b: readonly [Rat, Rat, Rat],
): readonly [Rat, Rat, Rat] {
  return [
    ratSub(ratMul(a[1], b[2]), ratMul(a[2], b[1])),
    ratSub(ratMul(a[2], b[0]), ratMul(a[0], b[2])),
    ratSub(ratMul(a[0], b[1]), ratMul(a[1], b[0])),
  ];
}

export type Sp3VelocitySource = 'auto' | 'records' | 'derivative';

export interface Sp3WorldlineOptions {
  /** Satellit; Vorgabe: der erste der Datei. */
  readonly satellite?: string;
  /** Stützstellen je Fenster. Vorgabe: 10 (Ordnung 9, gemessenes Optimum). */
  readonly points?: number;
  /**
   * Woher die Geschwindigkeit stammt:
   *   'records'    — V-Records der Datei (nur bei mode='V')
   *   'derivative' — analytische Ableitung des Positionsinterpolanten
   *   'auto'       — V-Records, wenn vorhanden, sonst Ableitung
   *
   * Beide Wege müssen getestet werden: reale IGS-Final-Produkte enthalten
   * keine V-Records, der Ableitungspfad ist dort der einzige. Eine Fixture mit
   * V-Records würde ihn stillschweigend umgehen.
   */
  readonly velocitySource?: Sp3VelocitySource;
  /** ω für v_ECI = v_ECEF + ω×r. Vorgabe: OMEGA_EARTH. */
  readonly omega?: Rat;
  /** Erdrotationskorrektur erzwingen/abschalten. Vorgabe: frame === 'ECEF'. */
  readonly earthRotation?: boolean;
  /** worldline_ref des Ergebnisses. */
  readonly ref?: string;
}

/** Welche Quelle eine SP3-Weltlinie tatsächlich benutzt (Diagnose/Report). */
export interface Sp3WorldlineInfo {
  readonly satellite: string;
  readonly points: number;
  readonly degree: number;
  readonly velocitySource: 'records' | 'derivative';
  readonly earthRotation: boolean;
  readonly firstTaiNs: bigint;
  readonly lastTaiNs: bigint;
  readonly intervalNs: bigint;
  readonly epochs: number;
}

export interface Sp3Worldline extends ExactWorldline {
  readonly info: Sp3WorldlineInfo;
}

/**
 * Weltlinie W aus einer SP3-Datei (CG-STD-3100 §8.6, worldline_ref).
 *
 * Das Fenster ist zentriert und wird an den Dateirändern in den gültigen
 * Bereich geschoben, statt zu extrapolieren. Zeiten außerhalb der Datei sind
 * ein Fehler (CG-E-005.003) — eine Ephemeride, die über ihren Rand hinaus
 * befragt wird, liefert keine Aussage, sondern ein Polynomartefakt.
 */
export function sp3Worldline(file: Sp3File, opts: Sp3WorldlineOptions = {}): Sp3Worldline {
  const points = opts.points ?? SP3_LAGRANGE_POINTS;
  const sat = opts.satellite ?? file.satellites[0];
  if (!sat) {
    throw Errors.MappingError.missingRefPoint('SP3: Datei enthält keinen Satelliten', {});
  }
  const blocks = file.blocks.filter(b => b.sats.has(sat));
  if (blocks.length < points) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      `SP3: ${blocks.length} Epochen für ${sat}, Ordnung ${points - 1} braucht ${points}`,
      { sat, epochen: blocks.length, points },
    );
  }
  const wantRecords = opts.velocitySource === 'records';
  const hasRecords = blocks.every(b => b.sats.get(sat)!.v !== undefined);
  if (wantRecords && !hasRecords) {
    throw Errors.SyntaxError.missingField(
      `SP3: velocitySource='records' verlangt V-Records, die Datei hat keine (${sat})`,
      { sat },
    );
  }
  const source: 'records' | 'derivative' =
    opts.velocitySource === 'derivative' ? 'derivative'
      : (wantRecords || hasRecords) ? 'records' : 'derivative';

  const rotate = opts.earthRotation ?? (file.frame === 'ECEF');
  const omega = opts.omega ?? OMEGA_EARTH;
  const omegaVec: readonly [Rat, Rat, Rat] = [rat(0n), rat(0n), omega];  // ω ∥ z

  const t0 = blocks[0]!.tTaiNs;
  const tN = blocks[blocks.length - 1]!.tTaiNs;
  const step = file.intervalNs;
  /** Ableitung je Rasterschritt → je Sekunde. */
  const perSec = ratDiv(rat(NS), rat(step));
  const half = Math.floor((points - 1) / 2);

  const ref = opts.ref
    ?? `urn:cg:worldline:sp3:${sat}:ord${points - 1}:${source === 'records' ? 'v-rec' : 'v-deriv'}`;

  const frame: ReferenceFrame = 'ECI';   // stateAt liefert stets ECI-Beträge

  return {
    ref,
    frame,
    info: {
      satellite: sat, points, degree: points - 1, velocitySource: source,
      earthRotation: rotate, firstTaiNs: t0, lastTaiNs: tN,
      intervalNs: step, epochs: blocks.length,
    },
    stateAt(tNs: Rat): ExactState {
      // u = (t − t₀)/Δ — Position im Raster, exakt rational
      const u = ratDiv(ratSub(tNs, rat(t0)), rat(step));
      // 0 ≤ u ≤ N−1, ohne Division: u.d > 0 nach Rat-Invariante
      if (u.n < 0n || u.n > BigInt(blocks.length - 1) * u.d) {
        throw Errors.MappingError.refPointOutOfExtent(
          `SP3: t = ${ratToNumber(tNs, 0).toFixed(0)} ns liegt außerhalb der Ephemeride `
          + `[${t0}, ${tN}] ns (${sat})`,
          { sat, t0: t0.toString(), t1: tN.toString() },
        );
      }
      const k = u.n / u.d;                              // ⌊u⌋, u ≥ 0
      let start = Number(k) - half;
      if (start < 0) start = 0;
      if (start + points > blocks.length) start = blocks.length - points;
      const tau = ratSub(u, rat(BigInt(start)));

      const rOut: Rat[] = [], vOut: Rat[] = [];
      for (let axis = 0; axis < 3; axis++) {
        const pv: Rat[] = new Array(points);
        for (let i = 0; i < points; i++) pv[i] = blocks[start + i]!.sats.get(sat)!.r[axis]!;
        const { v: rVal, d: rDer } = lagrangeValueAndDerivative(pv, tau);
        rOut.push(rVal);
        if (source === 'derivative') {
          vOut.push(ratMul(rDer, perSec));
        } else {
          const vv: Rat[] = new Array(points);
          for (let i = 0; i < points; i++) vv[i] = blocks[start + i]!.sats.get(sat)!.v![axis]!;
          vOut.push(lagrangeValueAndDerivative(vv, tau).v);
        }
      }
      const r = rOut as unknown as readonly [Rat, Rat, Rat];
      let v = vOut as unknown as readonly [Rat, Rat, Rat];

      if (rotate) {
        // v_ECI = v_ECEF + ω×r — in ECEF-Komponenten zulässig, da |·| erhalten
        // bleibt und ω× mit R_z kommutiert (Herleitung im Dateikopf).
        const wxr = crossExact(omegaVec, r);
        v = [ratAdd(v[0], wxr[0]), ratAdd(v[1], wxr[1]), ratAdd(v[2], wxr[2])] as const;
      }
      return { r, v };
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// AB HIER: KEIN RECHENPFAD. Float ist zulässig.
// ═════════════════════════════════════════════════════════════════════════════

// ─── SP3-d-Writer (Fixture-Erzeugung) ────────────────────────────────────────
//
// Erzeugt eine eigene, lizenzfreie SP3-d-Datei aus einer beliebigen
// ExactWorldline — üblicherweise keplerFixtureWorldline. Es wird kein Byte aus
// einem IGS-Produkt übernommen; Struktur und Feldbreiten folgen der öffentlich
// dokumentierten Formatdefinition, die Zahlen stammen aus dem eigenen
// Generator.
//
// Float tritt genau an einer Stelle auf: der Drehung ECI→ECEF um die z-Achse,
// die sin/cos braucht. Das ist unschädlich, weil die AUSGABE auf das SP3-Raster
// (mm bzw. 10⁻⁷ m/s) gerundet wird und damit exakt rational in den Reader
// zurückläuft — dieselbe Konstruktion wie beim Kepler-Generator: der Writer
// liefert Messdaten, er rechnet nicht.

export interface Sp3WriteOptions {
  readonly worldline: ExactWorldline;
  /** Erste Epoche [TAI ns]. */
  readonly startTaiNs: bigint;
  /** Rasterabstand [ns]. Vorgabe: 900 s (IGS Final). */
  readonly intervalNs?: bigint;
  /** Anzahl Epochen. */
  readonly count: number;
  /** 3-stellige Satelliten-ID (SP3-d erlaubt beliebige Konstellationskürzel). */
  readonly satellite?: string;
  /**
   * Bezugssystem der geschriebenen Koordinaten:
   *   'ECEF' — realistisch, wie IGS-Produkte; Reader addiert ω×r
   *   'ECI'  — Koordinaten unverändert, für Tests ohne Rotationsanteil
   */
  readonly frame?: 'ECEF' | 'ECI';
  /** V-Records schreiben? false erzeugt eine positions-only Datei wie IGS Final. */
  readonly includeVelocity?: boolean;
  readonly omega?: Rat;
  readonly coordSys?: string;
  readonly agency?: string;
  /** Zusätzliche /*-Kommentarzeilen (max. 57 Zeichen Nutzlast). */
  readonly comments?: readonly string[];
}

/** Rat → Festkommafeld fester Breite, symmetrisch gerundet (exakt). */
function fixedField(x: Rat, decimals: number, width: number): string {
  const scale = 10n ** BigInt(decimals);
  const v = ratRoundToScale(x, scale);
  const neg = v < 0n;
  const a = (neg ? -v : v).toString().padStart(decimals + 1, '0');
  const head = a.slice(0, a.length - decimals);
  const tail = a.slice(a.length - decimals);
  const s = `${neg ? '-' : ''}${head}.${tail}`;
  if (s.length > width) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      `SP3-Writer: Feld '${s}' überschreitet ${width} Zeichen`, { feld: s, width },
    );
  }
  return s.padStart(width);
}

/** TAI-ns → SP3-Epochenzeile (GPS-Zeit). */
function epochLine(tTaiNs: bigint): string {
  const gpstNs = tTaiNs - TAI_MINUS_GPST_S * NS;
  const sec = gpstNs / NS;
  const frac = gpstNs % NS;
  const iso = secondsToISO8601(sec + EPOCH_1970_S);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(iso)!;
  const secs = Number(m[6]) + Number(frac) / 1e9;
  return `*  ${m[1]} ${String(Number(m[2])).padStart(2)} ${String(Number(m[3])).padStart(2)}`
    + ` ${String(Number(m[4])).padStart(2)} ${String(Number(m[5])).padStart(2)}`
    + ` ${secs.toFixed(8).padStart(11)}`;
}

/** GPS-Woche und Sekunde-der-Woche zu einer TAI-Zeit (GPS-Epoche 1980-01-06). */
function gpsWeekAndSow(tTaiNs: bigint): { week: bigint; sow: bigint } {
  const gpstSec = (tTaiNs - TAI_MINUS_GPST_S * NS) / NS;
  const gpsEpoch = gregorianToSeconds(1980n, 1n, 6n) - EPOCH_1970_S;
  const d = gpstSec - gpsEpoch;
  const week = d / 604_800n;
  return { week, sow: d - week * 604_800n };
}

/**
 * Schreibt eine SP3-d-Datei. Deterministisch: gleiche Weltlinie und gleiche
 * Optionen ⇒ bytegleiche Datei (Grundlage von T-L3-SP3-001).
 */
export function writeSp3d(o: Sp3WriteOptions): string {
  const step = o.intervalNs ?? 900n * NS;
  const sat = (o.satellite ?? 'L01').padEnd(3).slice(0, 3);
  const frame = o.frame ?? 'ECEF';
  const withV = o.includeVelocity ?? false;
  const omega = o.omega ?? OMEGA_EARTH;
  const coordSys = (o.coordSys ?? 'CGF20').padEnd(5).slice(0, 5);
  const agency = (o.agency ?? 'CGSY').padEnd(4).slice(0, 4);
  if (o.count < 2) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      `SP3-Writer: count=${o.count} zu klein`, { count: o.count },
    );
  }

  const omegaF = ratToNumber(omega, 20);
  const out: string[] = [];
  const { week, sow } = gpsWeekAndSow(o.startTaiNs);
  // MJD 40587 = 1970-01-01; die Kopfzeile trägt GPS-Zeit.
  const mjd = 40_587n + (o.startTaiNs - TAI_MINUS_GPST_S * NS) / (86_400n * NS);

  const first = epochLine(o.startTaiNs).slice(1).trim().split(/\s+/);
  out.push(
    `#d${withV ? 'V' : 'P'}${first[0]} ${first[1]!.padStart(2)} ${first[2]!.padStart(2)}`
    + ` ${first[3]!.padStart(2)} ${first[4]!.padStart(2)} ${first[5]!.padStart(11)}`
    + ` ${String(o.count).padStart(7)} ORBIT ${coordSys}  CG ${agency}`,
  );
  out.push(
    `## ${String(week).padStart(4)} ${(Number(sow)).toFixed(8).padStart(15)}`
    + ` ${(Number(step) / 1e9).toFixed(8).padStart(14)} ${String(mjd).padStart(5)}`
    + ` 0.0000000000000`,
  );
  out.push(`+    1   ${sat}${'  0'.repeat(16)}`);
  for (let i = 0; i < 4; i++) out.push(`+        0${'  0'.repeat(16)}`);
  for (let i = 0; i < 5; i++) out.push(`++       0${'  0'.repeat(16)}`);
  out.push('%c L  cc GPS ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc');
  out.push('%c cc cc ccc ccc cccc cccc cccc cccc ccccc ccccc ccccc ccccc');
  out.push('%f  0.0000000  0.000000000  0.00000000000  0.000000000000000');
  out.push('%f  0.0000000  0.000000000  0.00000000000  0.000000000000000');
  out.push('%i    0    0    0    0      0      0      0      0         0');
  out.push('%i    0    0    0    0      0      0      0      0         0');
  out.push(`/* CG-FRAME ${frame}  ChronoGrid-Fixture, lizenzfrei erzeugt`);
  out.push(`/* Quelle: ${o.worldline.ref}`.slice(0, 60));
  out.push(`/* Ordnung-${SP3_LAGRANGE_DEGREE}-tauglich: Raster ${Number(step) / 1e9} s`);
  for (const c of o.comments ?? []) out.push(`/* ${c}`.slice(0, 60));
  while (out.filter(l => l.startsWith('/*')).length < 4) out.push('/*');

  for (let e = 0; e < o.count; e++) {
    const tNs = o.startTaiNs + BigInt(e) * step;
    const st = o.worldline.stateAt(rat(tNs));
    let r = st.r, v = st.v;

    if (frame === 'ECEF') {
      // ECI → ECEF: Drehung um −θ mit θ = ω·(t − t_start). Float ist hier
      // zulässig; die Ausgabe wird auf mm bzw. 10⁻⁷ m/s gerundet.
      const dtSec = Number(tNs - o.startTaiNs) / 1e9;
      const th = omegaF * dtSec;
      const c = Math.cos(th), s = Math.sin(th);
      const rot = (a: readonly [Rat, Rat, Rat]): readonly [Rat, Rat, Rat] => {
        const ax = ratToNumber(a[0], 20), ay = ratToNumber(a[1], 20);
        return [
          ratFromDecimal((ax * c + ay * s).toExponential(17)),
          ratFromDecimal((-ax * s + ay * c).toExponential(17)),
          a[2],
        ] as const;
      };
      const rE = rot(r);
      const vE0 = rot(v);
      // v_ECEF = R·v_ECI − ω×r_ECEF
      const wxr = crossExact([rat(0n), rat(0n), omega], rE);
      r = rE;
      v = [ratSub(vE0[0], wxr[0]), ratSub(vE0[1], wxr[1]), ratSub(vE0[2], wxr[2])] as const;
    }

    out.push(epochLine(tNs));
    const km = (q: Rat): Rat => ratDiv(q, rat(1_000n));
    out.push(
      `P${sat}${fixedField(km(r[0]), SP3_FIELD_DECIMALS, 14)}`
      + `${fixedField(km(r[1]), SP3_FIELD_DECIMALS, 14)}`
      + `${fixedField(km(r[2]), SP3_FIELD_DECIMALS, 14)}`
      + `${SP3_CLOCK_BAD.padStart(14)}`,
    );
    if (withV) {
      const dms = (q: Rat): Rat => ratMul(q, rat(10n));   // m/s → dm/s
      out.push(
        `V${sat}${fixedField(dms(v[0]), SP3_FIELD_DECIMALS, 14)}`
        + `${fixedField(dms(v[1]), SP3_FIELD_DECIMALS, 14)}`
        + `${fixedField(dms(v[2]), SP3_FIELD_DECIMALS, 14)}`
        + `${SP3_CLOCK_BAD.padStart(14)}`,
      );
    }
  }
  out.push('EOF');
  return out.join('\n') + '\n';
}

// ─── Diagnose ────────────────────────────────────────────────────────────────

/** |a − b| als Zahl [m] bzw. [m/s] — nur für Reports und Testausgaben. */
export function vectorDistanceApprox(
  a: readonly [Rat, Rat, Rat], b: readonly [Rat, Rat, Rat],
): number {
  let s = rat(0n);
  for (let k = 0; k < 3; k++) { const d = ratSub(a[k]!, b[k]!); s = ratAdd(s, ratMul(d, d)); }
  return Math.sqrt(ratToNumber(s, 30));
}

/** Maximale Bahn-/Geschwindigkeitsabweichung zweier Weltlinien über ein Raster. */
export function compareWorldlines(
  exact: ExactWorldline, approx: ExactWorldline,
  startNs: bigint, spanNs: bigint, samples: number,
): { readonly maxDr: number; readonly maxDv: number } {
  let maxDr = 0, maxDv = 0;
  for (let i = 0; i < samples; i++) {
    const t = rat(startNs * BigInt(samples) + spanNs * BigInt(i), BigInt(samples));
    const a = approx.stateAt(t), e = exact.stateAt(t);
    const dr = vectorDistanceApprox(a.r, e.r);
    const dv = vectorDistanceApprox(a.v, e.v);
    if (dr > maxDr) maxDr = dr;
    if (dv > maxDv) maxDv = dv;
  }
  return { maxDr, maxDv };
}

/**
 * Betragsvergleich zweier Weltlinien: max |Δ|r||, max |Δ|v|| und max |Δf|.
 *
 * Gegenstück zu compareWorldlines, das komponentenweise vergleicht und deshalb
 * nur bei gleichem Bezugssystem taugt. Eine SP3-Kette liefert ECEF-Komponenten
 * mit ECI-Beträgen — komponentenweise verglichen sähe sie um den vollen
 * Rotationsbetrag falsch aus, obwohl sie richtig ist. Verglichen werden
 * deshalb genau die Größen, die f konsumiert: |r| und |v|.
 *
 * Die Beträge entstehen über isqrtScaled auf 10⁻¹⁸ — dieselbe Wurzel und
 * dieselbe Abschneideregel wie im Rechenpfad (R1). Die Rückgabe ist float,
 * weil sie ausschließlich in Schwellenvergleichen von Tests und Reports
 * landet; die Messung selbst ist exakt.
 */
export function compareMagnitudes(
  exact: ExactWorldline, approx: ExactWorldline,
  startNs: bigint, spanNs: bigint, samples: number,
): { readonly maxDr: number; readonly maxDv: number; readonly maxDf: number } {
  let dr = rat(0n), dv = rat(0n), df = rat(0n);
  const mag = (v: readonly [Rat, Rat, Rat]): Rat =>
    rat(isqrtScaled(normSquaredExact(v), 10n ** 18n), 10n ** 18n);
  for (let i = 0; i < samples; i++) {
    const t = rat(startNs * BigInt(samples) + spanNs * BigInt(i), BigInt(samples));
    const a = approx.stateAt(t), e = exact.stateAt(t);
    const q1 = ratAbs(ratSub(mag(a.r), mag(e.r)));
    const q2 = ratAbs(ratSub(mag(a.v), mag(e.v)));
    const q3 = ratAbs(ratSub(properTimeRateExact(a), properTimeRateExact(e)));
    if (ratCmp(q1, dr) > 0) dr = q1;
    if (ratCmp(q2, dv) > 0) dv = q2;
    if (ratCmp(q3, df) > 0) df = q3;
  }
  return {
    maxDr: ratToNumber(dr, 30), maxDv: ratToNumber(dv, 30), maxDf: ratToNumber(df, 40),
  };
}

/** Exakter Betrag² eines Vektors — für Δr/Δv-Kriterien ohne Float. */
export function normSquaredExact(a: readonly [Rat, Rat, Rat]): Rat {
  return ratAdd(ratAdd(ratMul(a[0], a[0]), ratMul(a[1], a[1])), ratMul(a[2], a[2]));
}

/**
 * true, wenn |a − b| ≤ tol — vollständig rational, ohne Wurzel: verglichen wird
 * |a−b|² gegen tol². Grundlage des Δr/Δv-Kriteriums (T-L3-RK45-006).
 */
export function withinDistance(
  a: readonly [Rat, Rat, Rat], b: readonly [Rat, Rat, Rat], tol: Rat,
): boolean {
  const d: [Rat, Rat, Rat] = [ratSub(a[0], b[0]), ratSub(a[1], b[1]), ratSub(a[2], b[2])];
  return ratCmp(normSquaredExact(d), ratMul(tol, tol)) <= 0;
}
