/**
 * relativistik.ts
 * ChronoGrid Klasse-B-Mapping — relativistische Eigenzeit-Integration (RK45)
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6 (Klasse-B-Mapping F[W](τ)),
 *                  CG-STD-0000 v0.8 §3 (Mapping-Klassen A/B), I-R3 (Determinismus),
 *                  IAU 2000 Resolution B1.9 (L_G), IERS Conventions 2010,
 *                  IS-GPS-200 §20.3.3.3.3.1 (relativistische Exzentrizitätskorrektur)
 * Tests: T-L3-RK45-001…005 (cg-testkit/suites/t-l3-rk45.ts), T-RELB-* (Vitest)
 * Paket: cg-engine (Erweiterung)
 * Autor: Kurt Bauer, Initiator & Hauptautor, ChronoGrid Systems
 * Stand: August 2026 — A4/Weg A, Schritt 2 (exakte BigInt-Arithmetik)
 *
 * ── Exaktheitszusage ────────────────────────────────────────────────────────
 * Der Rechenpfad von der Ephemeride bis zum Ergebnis enthält KEINEN Float:
 * Butcher-Koeffizienten sind exakte Brüche, Zustände exakte Rationalzahlen,
 * die Akkumulation läuft in reiner BigInt-Festkommaarithmetik. Gerundet wird
 * an genau drei benannten Stellen, jede mit beschränktem, deterministischem
 * Fehler:
 *   R1  |r| = ⌊√(r·r)·10¹⁸⌋/10¹⁸      Fehler < 10⁻¹⁸ m  → < 10⁻³⁵ s/s
 *   R2  f  → ⌊f·10³⁶⌉ (Festkomma)     Fehler ≤ 5·10⁻³⁷ s/s
 *   R3  Δ  → ns (Ausgabe, symmetrisch) Fehler ≤ 0,5 ns
 * Zusammen liegen R1+R2 rund 24 Größenordnungen unter der von T-L3-RK45-003
 * geforderten Toleranz von 10⁻¹² s/s.
 *
 * Float tritt nur noch außerhalb des Rechenpfads auf, in zwei klar getrennten
 * Abschnitten am Dateiende: dem Offline-Fixture-Generator (Kepler-Ephemeride,
 * Ausgabe auf µm bzw. nm/s gerundet — später durch SP3-Import zu ersetzen) und
 * den Diagnose-Hilfsfunktionen. Beide sind für kein Mapping-Ergebnis kausal.
 *
 * ── Modell (schwaches Feld, 1PN — CG-STD-3100 §8.6) ─────────────────────────
 *
 *     dτ/dt = 1 + L_G − ( v²/2 + GM/r ) / c²
 *
 * t   = TAI-Koordinatenzeit (realisiert auf dem rotierenden Geoid),
 * τ   = Eigenzeit der Weltlinie W,
 * v,r = Betrag von Geschwindigkeit/Ortsvektor im ECI-Rahmen (nicht rotierend),
 * L_G = W_0/c² kompensiert das Geoidpotential, auf dem TAI definiert ist.
 *
 * Integriert wird die Abweichung Δ(t) = τ(t) − t, nicht τ selbst:
 *
 *     dΔ/dt = f(t) := L_G − ( v(t)²/2 + GM/r(t) ) / c²        (|f| ≈ 4·10⁻¹⁰)
 *
 * In Festkomma ist diese Zerlegung zwingend: τ und t unterscheiden sich erst
 * in der 10. signifikanten Stelle, eine direkte τ-Integration bräuchte ~30
 * signifikante Stellen im Zeitstempel selbst. Über Δ genügt eine Skala von
 * 10⁻³⁶ relativ.
 *
 * ── Quadraturcharakter ──────────────────────────────────────────────────────
 * f hängt nur von t ab, nicht von Δ. Die RKF45-Stufen k₁…k₆ sind daher reine
 * Auswertungen von f an den Knoten t + cᵢ·h; die Matrix aᵢⱼ des Butcher-
 * Tableaus geht nicht ein. Das Verfahren reduziert sich auf ein eingebettetes
 * Quadraturpaar der Ordnungen 4 und 5 — die Ordnungsbedingungen
 * Σbᵢcᵢᵏ = 1/(k+1) sind exakt in BigInt prüfbar (T-RELB-021/022).
 */

import { Errors } from 'cg-types/errors.js';
import {
  type Rat, rat, ratAdd, ratSub, ratMul, ratDiv, ratCmp, ratIsZero, ratNeg,
  ratRoundToScale, ratFromDecimal, isqrtScaled, ratToNumber,
} from './exakt.js';

// ─── Naturkonstanten, exakt (CG-STD-3100 §8.6, scientific_dependency) ────────

/** Lichtgeschwindigkeit im Vakuum [m/s] — exakt per SI-Definition (BIPM SI 2019). */
export const C_LIGHT = 299_792_458n;

/** c² [m²/s²] — exakt: 299792458² = 89875517873681764. */
export const C_SQ = C_LIGHT * C_LIGHT;
export const C_SQ_RAT: Rat = rat(C_SQ);

/** Geozentrische Gravitationskonstante GM_⊕ [m³/s²] — WGS-84 / IERS 2010.
 *  3,986004418·10¹⁴ ist ganzzahlig darstellbar; uncertainty_rel ≈ 2·10⁻⁹,
 *  review_trigger: neue IERS Conventions. */
export const GM_EARTH = 398_600_441_800_000n;

/** L_G = W_0/c² — definierende Konstante, IAU 2000 Resolution B1.9 (exakt). */
export const L_G: Rat = ratFromDecimal('6.969290134e-10');

/** Geoid-Potential W_0 [m²/s²] = L_G·c² (IERS 2010: 62 636 856,0). */
export const W0_GEOID: Rat = ratMul(L_G, C_SQ_RAT);

/** Skala der Ortsbetragswurzel: |r| wird auf 10⁻¹⁸ m abgeschnitten (R1). */
export const R_SCALE = 10n ** 18n;

/** Festkommaskala der Ratenfunktion: f wird als ⌊f·10³⁶⌉ geführt (R2). */
export const RATE_SCALE = 10n ** 36n;

const RAT_TWO: Rat = rat(2n);

// ─── Exakte Weltlinie W (CG-STD-3100 §8.6, API: worldline_ref) ───────────────

/** Bezugssystem der Ephemeride. ECI = erdzentriert, nicht rotierend (GCRS). */
export type ReferenceFrame = 'ECI';

/** Zustand auf der Weltlinie: Ort [m], Geschwindigkeit [m/s] — exakt rational. */
export interface ExactState {
  readonly r: readonly [Rat, Rat, Rat];
  readonly v: readonly [Rat, Rat, Rat];
}

/**
 * Weltlinie W — Pflichtparameter jedes Klasse-B-Mappings.
 * `ref` entspricht dem `worldline_ref` der API (OpenAPI ConvertRequest).
 *
 * Die Abtastzeit ist eine exakte Rationalzahl in Nanosekunden, kein BigInt:
 * die RK45-Knoten t + cᵢ·h liegen bei cᵢ ∈ {1/4, 3/8, 12/13, 1/2} zwischen den
 * ns-Rastern. Eine Quantisierung der Knoten wäre ein verdeckter Rundungs-
 * schritt; ein realer SP3-Import interpoliert ohnehin (15-min-Raster), womit
 * die rationale Abtastzeit die ehrlichere Schnittstelle ist.
 */
export interface ExactWorldline {
  readonly ref: string;
  readonly frame: ReferenceFrame;
  stateAt(tNs: Rat): ExactState;
}

// ─── Ratenfunktion f(t) = dτ/dt − 1 ──────────────────────────────────────────

function sumOfSquares(x: readonly [Rat, Rat, Rat]): Rat {
  return ratAdd(ratAdd(ratMul(x[0], x[0]), ratMul(x[1], x[1])), ratMul(x[2], x[2]));
}

/**
 * f(state) = L_G − (v²/2 + GM/r)/c²  — exakt rational (CG-STD-3100 §8.6, 1PN).
 * Positiv ⇒ Uhr auf W geht schneller als TAI (GPS-Fall), negativ ⇒ langsamer
 * (ISS-Fall).
 *
 * Die Vorbedingung |v| < c wird ohne Wurzel als v² < c² geprüft; die einzige
 * Wurzel des Modells ist |r| (Rundung R1).
 * Fehler: v² ≥ c² oder |r| = 0 → CG-E-008.003.
 */
export function properTimeRateExact(state: ExactState): Rat {
  const r2 = sumOfSquares(state.r);
  const v2 = sumOfSquares(state.v);
  if (ratIsZero(r2)) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      'Klasse-B: |r| = 0 auf der Weltlinie (Singularität)', { r2: '0' },
    );
  }
  if (ratCmp(v2, C_SQ_RAT) >= 0) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      `Klasse-B: |v| ≥ c auf der Weltlinie (v² = ${v2.n}/${v2.d} m²/s²)`,
      { v2: `${v2.n}/${v2.d}`, cSq: C_SQ.toString() },
    );
  }
  const rScaled = isqrtScaled(r2, R_SCALE);   // R1: ⌊|r|·10¹⁸⌋
  if (rScaled === 0n) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      'Klasse-B: |r| unterschreitet die Wurzelskala 10⁻¹⁸ m', { rScaled: '0' },
    );
  }
  const gmOverR = rat(GM_EARTH * R_SCALE, rScaled);
  const inner = ratAdd(ratDiv(v2, RAT_TWO), gmOverR);
  return ratSub(L_G, ratDiv(inner, C_SQ_RAT));
}

/** f als Festkommazahl ⌊f·RATE_SCALE⌉ (R2) — Eingang der RK45-Akkumulation. */
export function properTimeRateScaled(state: ExactState): bigint {
  return ratRoundToScale(properTimeRateExact(state), RATE_SCALE);
}

/** SRT-Anteil −v²/(2c²) exakt — Zeitdilatation ohne Gravitationsterm. */
export function srRateTermExact(v2: Rat): Rat {
  return ratNeg(ratDiv(v2, ratMul(RAT_TWO, C_SQ_RAT)));
}

/** ART-Anteil (W_0 − GM/r)/c² exakt — Rotverschiebung ohne Geschwindigkeit. */
export function grRateTermExact(rMagnitude: Rat): Rat {
  return ratDiv(ratSub(W0_GEOID, ratDiv(rat(GM_EARTH), rMagnitude)), C_SQ_RAT);
}

/**
 * Analytische Referenz: zeitgemittelte Rate einer Kepler-Bahn mit Halbachse a.
 *     f̄ = L_G − 3GM/(2 a c²)
 * Exakt für Kreisbahnen (r = a) und im Mittel über eine volle Umlaufperiode für
 * jede Exzentrizität, da ⟨1/r⟩_t = 1/a. Vollständig rational — a ist ganzzahlig
 * in Metern, es tritt keine Wurzel auf. Referenzwert von T-L3-RK45-003.
 */
export function analyticMeanRateExact(semiMajorAxis_m: Rat): Rat {
  return ratSub(L_G, ratDiv(ratMul(rat(3n), rat(GM_EARTH)), ratMul(ratMul(RAT_TWO, semiMajorAxis_m), C_SQ_RAT)));
}

// ─── RKF45-Tableau, exakt (Fehlberg 1969) ────────────────────────────────────
//
// Knoten cᵢ als gekürzte Brüche; die Gewichte b werden mit dem gemeinsamen
// Nenner L = kgV(216,2565,4104,5,135,12825,56430,50,55) = 1 128 600 ganzzahlig
// geführt. Damit ist die gesamte Schrittkombination Σbᵢkᵢ divisionsfrei.

/** Knoten cᵢ = RK_NODE_N[i] / RK_NODE_D[i]. */
export const RK_NODE_N: readonly bigint[] = [0n, 1n, 3n, 12n, 1n, 1n];
export const RK_NODE_D: readonly bigint[] = [1n, 4n, 8n, 13n, 1n, 2n];

/** Gemeinsamer Nenner der Gewichte. */
export const RK_B_DEN = 1_128_600n;

/** Gewichte 4. Ordnung · L  (25/216, 0, 1408/2565, 2197/4104, −1/5, 0). */
export const RK_B4: readonly bigint[] = [130_625n, 0n, 619_520n, 604_175n, -225_720n, 0n];

/** Gewichte 5. Ordnung · L  (16/135, 0, 6656/12825, 28561/56430, −9/50, 2/55). */
export const RK_B5: readonly bigint[] = [133_760n, 0n, 585_728n, 571_220n, -203_148n, 41_040n];

// ─── Klasse-B-Mapping ────────────────────────────────────────────────────────

export interface ClassBMappingRequest {
  /** Weltlinie W — Pflicht (CG-STD-3100 §8.6); fehlt sie ⇒ CG-E-005.002. */
  readonly worldline?: ExactWorldline;
  /** Start der Koordinatenzeit t (TAI, ns) */
  readonly tStartTaiNs: bigint;
  /** Ende der Koordinatenzeit t (TAI, ns) */
  readonly tEndTaiNs: bigint;
  /** Eigenzeitstand der Missionsuhr bei tStart (ns). Default: = tStartTaiNs. */
  readonly tauStartNs?: bigint;
  /** Toleranz der mittleren Rate [s/s], exakt rational. Default 10⁻¹⁸.
   *  T-L3-RK45-003 fordert 10⁻¹². */
  readonly rateTolerance?: Rat;
  /**
   * Auflösungsschranke der Schrittweite [ns]. Default: span/16.
   *
   * Der eingebettete 4(5)-Schätzer misst nur, was er abtastet: überspannt ein
   * Schritt mehrere Umläufe der Weltlinie, aliasen die sechs Stufen und der
   * Schätzer meldet fälschlich einen kleinen Fehler. Eine Toleranzangabe allein
   * kann das nicht abfangen — die Schranke muss aus der Dynamik kommen. Für
   * periodische Bahnen ist ein Bruchteil der Umlaufperiode zu wählen (der
   * Default span/16 deckt die typischen Fälle ab, in denen das Intervall selbst
   * im Bereich einer Periode liegt).
   */
  readonly maxStepNs?: bigint;
  /** Sicherung gegen Nichtterminierung der Schrittweitensteuerung. */
  readonly maxSteps?: number;
}

export interface ClassBMappingResult {
  readonly mappingClass: 'B';
  readonly worldlineRef: string;
  /** Eigenzeit bei tEnd [ns] — BigInt (I-R2). */
  readonly tauNs: bigint;
  /** Δ = τ − t über das Intervall, auf ns gerundet (R3). */
  readonly deltaNs: bigint;
  /** Δ in ns, exakt rational — ungerundetes Integrationsergebnis. */
  readonly deltaExact: Rat;
  /** Mittlere Rate Δ/(t_end − t_start) [s/s], exakt rational. */
  readonly meanRate: Rat;
  /** Akzeptierte RK45-Schritte */
  readonly steps: number;
  /** Verworfene Schritte (Toleranz verletzt) */
  readonly rejectedSteps: number;
  /** Schritte, die trotz Toleranzverletzung bei h = 1 ns akzeptiert wurden */
  readonly minStepHits: number;
  /** Größte Einzelschritt-Fehlerschätzung |y₅ − y₄|, in Akkumulatoreinheiten
   *  1/(RK_B_DEN·RATE_SCALE) ns. */
  readonly maxLocalError: bigint;
  readonly precision: 'exact-bigint';
}

/**
 * executeClassBMapping — normative Einstiegsfunktion für Klasse-B-Mappings
 * (CG-STD-3100 v1.6 Kap. 8.6; GraphQL MappingClass.B; OpenAPI mapping_class=B).
 *
 * Integriert dΔ/dt = f(t) adaptiv über [t_start, t_end] und liefert τ(t_end)
 * als BigInt-Nanosekunden. Der Akkumulator Y führt Δ in Einheiten von
 * 1/(RK_B_DEN·RATE_SCALE) ns und ist damit über den gesamten Lauf exakt —
 * es findet keine Zwischenrundung statt.
 *
 * Schrittweitensteuerung (I-R3): h ist ein BigInt in Nanosekunden, die
 * Entscheidung fällt allein über BigInt-Vergleiche. Bei Toleranzverletzung
 * wird halbiert, bei 16-facher Reserve verdoppelt (der lokale Fehler skaliert
 * mit h⁵, das Budget mit h, das Verhältnis also mit h⁴ — Faktor 2 ⇒ 16).
 * Kein Math.pow, kein Gleitkommafaktor, keine plattformabhängige Rundung:
 * gleiche Eingabe ⇒ bitgleiche Schrittfolge und bitgleiches Ergebnis.
 * Nach oben begrenzt maxStepNs die Schrittweite — siehe dort, warum die
 * Toleranz allein dafür nicht ausreicht.
 *
 * Fehlerverhalten:
 *   - Weltlinie fehlt               → CG-E-005.002 (T-L3-RK45-004)
 *   - t_end < t_start               → CG-E-008.003
 *   - |v| ≥ c bzw. |r| = 0 auf W    → CG-E-008.003
 *   - maxSteps überschritten        → CG-E-008.003
 */
export function executeClassBMapping(req: ClassBMappingRequest): ClassBMappingResult {
  const W = req.worldline;
  if (!W) {
    throw Errors.MappingError.missingRefPoint(
      'Klasse-B-Mapping erfordert worldline_ref (CG-STD-3100 §8.6)',
      { mappingClass: 'B' },
    );
  }
  const t0 = req.tStartTaiNs, t1 = req.tEndTaiNs;
  if (t1 < t0) {
    throw Errors.ConstraintError.mappingConstraintViolated(
      `Klasse-B: t_end < t_start (${t1} < ${t0})`,
      { t0: t0.toString(), t1: t1.toString() },
    );
  }
  const tauStart = req.tauStartNs ?? t0;
  const span = t1 - t0;                       // Intervalllänge [ns]
  const tolRate = req.rateTolerance ?? rat(1n, 10n ** 18n);
  const maxSteps = req.maxSteps ?? 100_000;
  const ACC_DEN = RK_B_DEN * RATE_SCALE;      // Akkumulatornenner: Y/ACC_DEN = Δ [ns]

  if (span === 0n) {
    const zero = rat(0n);
    return {
      mappingClass: 'B', worldlineRef: W.ref, tauNs: tauStart, deltaNs: 0n,
      deltaExact: zero, meanRate: zero, steps: 0, rejectedSteps: 0,
      minStepHits: 0, maxLocalError: 0n, precision: 'exact-bigint',
    };
  }

  let hMax = req.maxStepNs ?? span / 16n;
  if (hMax < 1n) hMax = 1n;
  if (hMax > span) hMax = span;

  let tCur = t0;
  let Y = 0n;                                  // Δ in Einheiten 1/ACC_DEN ns
  let h = hMax;                                // bevorzugte Schrittweite [ns]
  let steps = 0, rejected = 0, minStepHits = 0;
  let maxLocalError = 0n;

  while (tCur < t1) {
    if (steps + rejected >= maxSteps) {
      throw Errors.ConstraintError.mappingConstraintViolated(
        `RK45: maxSteps=${maxSteps} überschritten (h=${h} ns, t=${tCur})`,
        { maxSteps, h: h.toString(), t: tCur.toString() },
      );
    }
    const remaining = t1 - tCur;
    const hStep = h < remaining ? h : remaining;

    // Stufen kᵢ = f(t + cᵢ·h); die Knotenzeit ist exakt rational (kein Raster).
    let s4 = 0n, s5 = 0n;
    for (let i = 0; i < 6; i++) {
      if (RK_B4[i] === 0n && RK_B5[i] === 0n) continue;   // k₂ geht in kein Gewicht ein
      const d = RK_NODE_D[i]!;
      const tNode = rat(tCur * d + RK_NODE_N[i]! * hStep, d);
      const k = properTimeRateScaled(W.stateAt(tNode));
      s4 += RK_B4[i]! * k;
      s5 += RK_B5[i]! * k;
    }
    const dY4 = hStep * s4;
    const dY5 = hStep * s5;
    const err = dY5 > dY4 ? dY5 - dY4 : dY4 - dY5;
    // Fehlerbudget dieses Schritts: tolRate·h ⇒ Gesamtfehler ≤ tolRate·span
    const tolY = ratRoundToScale(tolRate, hStep * ACC_DEN);

    if (err <= tolY || hStep === 1n) {
      if (err > tolY) minStepHits++;
      tCur += hStep;
      Y += dY5;                                // lokale Extrapolation, 5. Ordnung
      steps++;
      if (err > maxLocalError) maxLocalError = err;
      h = (err * 16n <= tolY) ? hStep * 2n : hStep;
      if (h > hMax) h = hMax;
    } else {
      rejected++;
      h = hStep / 2n;
      if (h < 1n) h = 1n;
    }
  }

  const deltaExact = rat(Y, ACC_DEN);          // Δ [ns], exakt
  return {
    mappingClass: 'B',
    worldlineRef: W.ref,
    tauNs: tauStart + span + ratRoundToScale(deltaExact, 1n),   // R3
    deltaNs: ratRoundToScale(deltaExact, 1n),
    deltaExact,
    meanRate: rat(Y, ACC_DEN * span),          // Δ[ns]/span[ns] — dimensionslos
    steps,
    rejectedSteps: rejected,
    minStepHits,
    maxLocalError,
    precision: 'exact-bigint',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// AB HIER: KEIN RECHENPFAD. Float ist zulässig.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Offline-Fixture-Generator (Ephemeride) ──────────────────────────────────
//
// Erzeugt Testephemeriden aus Kepler-Elementen. Die interne Bahnrechnung läuft
// in float64 — das ist unschädlich, weil die AUSGABE auf ein festes Raster
// gerundet wird (Ort µm, Geschwindigkeit nm/s) und damit exakt rational in die
// Integration eingeht. Der Generator steht damit an exakt der Stelle, an der
// später ein SP3-Import stehen wird: er liefert Messdaten, er rechnet nicht.
//
// Reproduzierbarkeit: Math.sin/cos sind engineabhängig auf ~1 ulp ≈ 3·10⁻⁹ m
// bei r ≈ 2,7·10⁷ m. Das Ausgaberaster von 1 µm liegt darüber, die gerundeten
// Fixturewerte sind also plattformstabil (außer bei exakten Rundungsgleich-
// ständen, die bei irrationalen Bahnkoordinaten nicht auftreten).
//
// SP3-Echtimport ist bewusst ein eigener Folgeschritt und hier nicht gebaut.

/** Ausgaberaster der Fixture: 1 µm bzw. 1 nm/s. */
export const FIXTURE_POS_SCALE = 10n ** 6n;
export const FIXTURE_VEL_SCALE = 10n ** 9n;

export interface KeplerFixtureOptions {
  /** worldline_ref */
  readonly ref: string;
  /** Große Halbachse [m] */
  readonly a_m: number;
  /** Numerische Exzentrizität (0 = Kreisbahn) */
  readonly e?: number;
  /** Bahnneigung [rad] — ändert |r| und |v| nicht, dient der Vollständigkeit */
  readonly i_rad?: number;
  /** Epoche der mittleren Anomalie M0 = 0 (Perizentrumsdurchgang), TAI in ns */
  readonly epochNs?: bigint;
  readonly posScale?: bigint;
  readonly velScale?: bigint;
}

/**
 * Kepler-Gleichung M = E − e·sin E, Newton-Iteration — NUR Fixture-Generator.
 * M wird auf [0, 2π) reduziert: E ist nur bis auf 2πk bestimmt, sin/cos E sind
 * davon unabhängig, und ohne Reduktion bricht die Konvergenz für große M an der
 * float64-Auflösung ab (bei M ≈ 2,6·10⁵ ist ulp ≈ 3·10⁻¹¹ > tol).
 */
export function solveKepler(M: number, e: number, tol = 1e-15, maxIter = 64): number {
  const TWO_PI = 2 * Math.PI;
  M = M % TWO_PI;
  if (M < 0) M += TWO_PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < maxIter; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < tol) return E;
  }
  throw Errors.ConstraintError.mappingConstraintViolated(
    `Kepler-Gleichung nicht konvergent (M=${M}, e=${e})`, { M, e, maxIter },
  );
}

/** Umlaufperiode [s] — Diagnose/Testspannen, nicht im Rechenpfad. */
export function orbitalPeriodApprox(a_m: number): number {
  return 2 * Math.PI * Math.sqrt((a_m * a_m * a_m) / Number(GM_EARTH));
}

/** Lorentz-Faktor γ(v) = 1/√(1−β²) — Diagnose/Referenz, nicht im Rechenpfad. */
export function lorentzGammaApprox(vMagnitude: number): number {
  const beta = vMagnitude / Number(C_LIGHT);
  return 1 / Math.sqrt(1 - beta * beta);
}

/** F = −2·√GM/c² [s/√m] — IS-GPS-200 §20.3.3.3.3.1, Referenzwert für Tests. */
export const F_GPS_APPROX = (-2 * Math.sqrt(Number(GM_EARTH))) / Number(C_SQ);

/** Fixture-Weltlinie aus Kepler-Elementen (Float intern, exakte Ausgabe). */
export function keplerFixtureWorldline(o: KeplerFixtureOptions): ExactWorldline {
  const a = o.a_m;
  const e = o.e ?? 0;
  const inc = o.i_rad ?? 0;
  const epoch = o.epochNs ?? 0n;
  const pS = o.posScale ?? FIXTURE_POS_SCALE;
  const vS = o.velScale ?? FIXTURE_VEL_SCALE;
  if (!(a > 0)) {
    throw Errors.ConstraintError.mappingConstraintViolated(`Fixture: a ≤ 0 (a=${a} m)`, { a });
  }
  if (!(e >= 0 && e < 1)) {
    throw Errors.ConstraintError.mappingConstraintViolated(`Fixture: e ∉ [0,1) (e=${e})`, { e });
  }
  const n = Math.sqrt(Number(GM_EARTH) / (a * a * a));   // mittlere Bewegung [rad/s]
  const b = a * Math.sqrt(1 - e * e);
  const ci = Math.cos(inc), si = Math.sin(inc);
  const q = (x: number, scale: bigint): Rat => rat(BigInt(Math.round(x * Number(scale))), scale);

  return {
    ref: o.ref,
    frame: 'ECI',
    stateAt(tNs: Rat): ExactState {
      // Differenz zur Epoche EXAKT bilden, erst dann nach float — sonst
      // verschluckt die Mantisse bei t ≈ 1,8·10¹⁸ ns die Sekundenstelle.
      const dtSec = ratToNumber(ratSub(tNs, rat(epoch))) / 1e9;
      const E = solveKepler(n * dtSec, e);
      const cE = Math.cos(E), sE = Math.sin(E);
      const Edot = n / (1 - e * cE);          // dE/dt aus M = E − e·sin E
      const px = a * (cE - e), py = b * sE;   // Bahnebene, Perizentrum auf +x
      const vx = -a * sE * Edot, vy = b * cE * Edot;
      return {
        r: [q(px, pS), q(py * ci, pS), q(py * si, pS)],
        v: [q(vx, vS), q(vy * ci, vS), q(vy * si, vS)],
      };
    },
  };
}

/** Konstante Weltlinie — für exakte Integratortests (Integrand konstant). */
export function constantWorldline(
  ref: string, r: readonly [Rat, Rat, Rat], v: readonly [Rat, Rat, Rat],
): ExactWorldline {
  return { ref, frame: 'ECI', stateAt: () => ({ r, v }) };
}

/** Nominelle GPS-Bahn (IS-GPS-200, a ≈ 26 560 km, i = 55°). */
export const GPS_SEMI_MAJOR_AXIS = 26_559_800n;
/** Nominelle ISS-Bahn (≈ 420 km Höhe, i = 51,6°), Periode ≈ 92,8 min. */
export const ISS_SEMI_MAJOR_AXIS = 6_791_000n;

export function gpsFixtureWorldline(
  e = 0, epochNs = 0n, ref = 'urn:cg:worldline:gps-sv-nominal',
): ExactWorldline {
  return keplerFixtureWorldline({
    ref, a_m: Number(GPS_SEMI_MAJOR_AXIS), e, i_rad: (55 * Math.PI) / 180, epochNs,
  });
}

export function issFixtureWorldline(
  e = 0, epochNs = 0n, ref = 'urn:cg:worldline:iss-nominal',
): ExactWorldline {
  return keplerFixtureWorldline({
    ref, a_m: Number(ISS_SEMI_MAJOR_AXIS), e, i_rad: (51.6 * Math.PI) / 180, epochNs,
  });
}

// ─── Offener Folgeschritt ────────────────────────────────────────────────────
//
// SP3-Import (bewusst zurückgestellt): keplerFixtureWorldline durch einen
// Reader für SP3-c/SP3-d-Bahndateien ersetzen. Die Schnittstelle steht bereits
// richtig — stateAt(Rat) verlangt Interpolation auf dem 15-min-Raster
// (Lagrange, Grad 9–11), deren Stützstellen als exakte Rationalzahlen aus den
// SP3-Dezimalfeldern gelesen werden können. Erst damit wird das Mapping auf
// reale Satelliten anwendbar; die Integration selbst ändert sich nicht.
