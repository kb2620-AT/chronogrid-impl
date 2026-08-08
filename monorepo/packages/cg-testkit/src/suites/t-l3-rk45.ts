/**
 * cg-testkit/src/suites/t-l3-rk45.ts
 * L3-C: MissionTime / Klasse-B / RK45 — T-L3-RK45-001…005
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6 (Klasse-B-Mapping F[W](τ)),
 *                  CG-STD-0000 v0.8 §3 (Mapping-Klassen), I-R2/I-R3
 * Implementierung: cg-engine/src/relativistik.ts, cg-engine/src/exakt.ts
 *
 * Diese Gruppe lag bis Sprint 11-A als skip:true in t-l3-pending.ts. Mit der
 * exakten BigInt-Arithmetik (A4/Weg A, Schritt 2) ist sie aktiv: der
 * Rechenpfad von der Ephemeride bis zum Ergebnis enthält keinen Float mehr.
 *
 * Bewusst noch NICHT abgedeckt (eigener Folgeschritt, siehe relativistik.ts):
 * SP3-Echtimport. Die Ephemeride stammt hier aus einem Offline-Kepler-
 * Generator, dessen Ausgabe auf µm bzw. nm/s gerundet und damit exakt rational
 * in die Integration eingeht.
 */

import type { TestCase } from '../runner.js';
import { rat, ratAbs, ratSub, ratCmp, ratRoundToScale } from 'cg-engine/exakt.js';
import {
  executeClassBMapping, srRateTermExact, analyticMeanRateExact,
  gpsFixtureWorldline, issFixtureWorldline, ISS_SEMI_MAJOR_AXIS,
} from 'cg-engine/relativistik.js';

const NS = 1_000_000_000n;
const T0 = 1_770_000_000n * NS;   // fester TAI-Startpunkt (ns) — Determinismus

export const T_L3_RK45: TestCase[] = [

  { id: 'T-L3-RK45-001', level: 3,
    description: '[L3-C] RK45: MissionTime-Domain ausführbar (executeClassBMapping)',
    run: () => {
      const res = executeClassBMapping({
        worldline: gpsFixtureWorldline(0, T0),
        tStartTaiNs: T0,
        tEndTaiNs: T0 + 86_400n * NS,
        tauStartNs: 0n,                       // Missionsuhr startet bei 0
      });
      return {
        mappingClass: res.mappingClass,
        worldlineRef: res.worldlineRef,
        // Missionszeit = verstrichene Koordinatenzeit + relativistische Drift
        tauNs: (res.tauNs === 86_400n * NS + res.deltaNs),
        driftPositiv: res.deltaNs > 0n,       // GPS-Uhr geht gegenüber TAI vor
        schritteAusgefuehrt: res.steps > 0,
      };
    },
    expected: { mappingClass: 'B', worldlineRef: 'urn:cg:worldline:gps-sv-nominal',
                tauNs: true, driftPositiv: true, schritteAusgefuehrt: true } },

  { id: 'T-L3-RK45-002', level: 3,
    description: '[L3-C] RK45: Lorentz-Faktor γ(v=7660 m/s) korrekt (ISS)',
    run: () => {
      // γ − 1 = v²/2c² + O(β⁴). Geprüft wird der exakte SRT-Term −v²/(2c²)
      // als Golden Value auf der Skala 10⁻²⁴; der β⁴-Rest liegt bei 1,6·10⁻¹⁹.
      // Die naive Float-Form 1/√(1−β²) − 1 wäre hier um 6·10⁻¹⁷ falsch, weil
      // 1 − β² bei β² ≈ 6,5·10⁻¹⁰ auf ein halbes ulp auslöscht.
      const v = 7660n;
      return {
        srTermScaled: ratRoundToScale(srRateTermExact(rat(v * v)), 10n ** 24n).toString(),
        vorzeichenNegativ: ratCmp(srRateTermExact(rat(v * v)), rat(0n)) < 0,
      };
    },
    expected: { srTermScaled: '-326427048144898', vorzeichenNegativ: true } },

  { id: 'T-L3-RK45-003', level: 3,
    description: '[L3-C] RK45: Eigenzeit-Integral 90 min ISS-Orbit (Toleranz 10⁻¹² s/s)',
    run: () => {
      const TOL = rat(1n, 10n ** 12n);
      const res = executeClassBMapping({
        worldline: issFixtureWorldline(0, T0),
        tStartTaiNs: T0,
        tEndTaiNs: T0 + 5_400n * NS,          // 90 min
        rateTolerance: TOL,
      });
      // Analytische Referenz f̄ = L_G − 3GM/(2ac²), vollständig rational
      const ref = analyticMeanRateExact(rat(ISS_SEMI_MAJOR_AXIS));
      return {
        innerhalbToleranz: ratCmp(ratAbs(ratSub(res.meanRate, ref)), TOL) < 0,
        // ISS liegt tief im Potentialtopf und ist schnell ⇒ Uhr geht nach
        rateNegativ: ratCmp(res.meanRate, rat(0n)) < 0,
        driftNegativ: res.deltaNs < 0n,
      };
    },
    expected: { innerhalbToleranz: true, rateNegativ: true, driftNegativ: true } },

  { id: 'T-L3-RK45-004', level: 3,
    description: '[L3-C] RK45: Ephemeride fehlt → Fehler (Pflichtparameter)',
    run: () => {
      try {
        executeClassBMapping({ tStartTaiNs: T0, tEndTaiNs: T0 + NS });
        return { code: 'kein Fehler geworfen', cgClass: '-', httpStatus: 0 };
      } catch (err: any) {
        return { code: err.code, cgClass: err.cgClass, httpStatus: err.httpStatus };
      }
    },
    expected: { code: 'CG-E-005.002', cgClass: 'MappingError', httpStatus: 422 } },

  { id: 'T-L3-RK45-005', level: 3,
    description: '[L3-C] RK45: Ergebnis ist BigInt, kein Float-Zwischenwert',
    run: () => {
      const res = executeClassBMapping({
        worldline: gpsFixtureWorldline(0.02, T0),
        tStartTaiNs: T0,
        tEndTaiNs: T0 + 3_600n * NS,
      });
      // Wiederholung muss bitgleich sein (I-R3): die Schrittweitensteuerung
      // arbeitet ausschließlich mit BigInt-Vergleichen, ohne Math.pow.
      const wdh = executeClassBMapping({
        worldline: gpsFixtureWorldline(0.02, T0),
        tStartTaiNs: T0,
        tEndTaiNs: T0 + 3_600n * NS,
      });
      return {
        tau: typeof res.tauNs,
        delta: typeof res.deltaNs,
        deltaExaktZaehler: typeof res.deltaExact.n,
        deltaExaktNenner: typeof res.deltaExact.d,
        mittlereRate: typeof res.meanRate.n,
        fehlerschaetzung: typeof res.maxLocalError,
        precision: res.precision,
        deterministisch: res.deltaExact.n === wdh.deltaExact.n
                      && res.deltaExact.d === wdh.deltaExact.d
                      && res.steps === wdh.steps,
      };
    },
    expected: { tau: 'bigint', delta: 'bigint', deltaExaktZaehler: 'bigint',
                deltaExaktNenner: 'bigint', mittlereRate: 'bigint',
                fehlerschaetzung: 'bigint', precision: 'exact-bigint',
                deterministisch: true } },
];
