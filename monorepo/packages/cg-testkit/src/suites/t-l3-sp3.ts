/**
 * cg-testkit/src/suites/t-l3-sp3.ts
 * L3-C (Fortsetzung): SP3-Ephemeriden — T-L3-SP3-001…006
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6 (Klasse-B-Mapping F[W](τ)),
 *                  CG-STD-0000 v0.8 §3, I-R2/I-R3,
 *                  SP3-c/SP3-d Formatdefinition, IERS Conventions 2010
 * Implementierung: cg-engine/src/sp3.ts
 *
 * Mit A4/Weg A Schritt 3 stammt die Ephemeride nicht mehr zwingend aus dem
 * Kepler-Generator, sondern aus einer SP3-Bahndatei. Damit ist die in
 * t-l3-rk45.ts benannte Einschränkung „Offline-Kepler-Fixture statt SP3-Import"
 * aufgehoben — die Kette Datei → Interpolation → Mapping ist gebaut und geprüft.
 *
 * ── Was diese Gruppe NICHT belegt ───────────────────────────────────────────
 * Die Fixture wird vom eigenen Writer erzeugt (lizenzfrei, kein IGS-Byte). Ein
 * Lauf gegen ein echtes heruntergeladenes IGS-Final-Produkt hat nicht
 * stattgefunden; dessen Kopfvarianten, Konstellationskürzel und Ausreißer sind
 * damit ungeprüft. „SP3-Kette implementiert" heißt hier: das Format wird
 * geschrieben und gelesen, die Interpolation ist exakt, die Physik trifft die
 * analytischen Referenzen. Es heißt nicht „gegen IGS-Produktdateien verifiziert".
 *
 * ── Gemessene Zielkonfiguration ─────────────────────────────────────────────
 * IGS Final, 900-s-Raster, Lagrange Ordnung 9, konstantes ω um z, v = v_ECEF+ω×r.
 *
 *   GPS, 900 s, Ordnung   5 → Δf 1,7e-16   7 → 1,5e-18
 *                         9 → 5,2e-20     11 → 4,7e-20  (Sättigung)
 *   GPS, 900 s, Ordnung 9:  v-Records Δ|v| 7,6e-8, Ableitung Δ|v| 1,2e-6 m/s
 *   ISS, Ordnung 9:  900 s → Δ|r| 1,1e3 m   300 s → 2,4e-2 m   120 s → 6,0e-4 m
 *
 * Ordnung 9 ist das gemessene Optimum: darunter wächst der Abschneidefehler um
 * Größenordnungen, darüber sättigt er auf dem mm-Quantisierungsboden der
 * SP3-Felder. Das 900-s-Raster gilt für GNSS-Höhen; für LEO ist es zu grob
 * (siehe T-L3-RK45-006).
 */

import type { TestCase } from '../runner.js';
import { rat, ratAbs, ratSub, ratCmp } from 'cg-engine/exakt.js';
import {
  type ExactWorldline,
  executeClassBMapping, analyticMeanRateExact,
  gpsFixtureWorldline, GPS_SEMI_MAJOR_AXIS,
} from 'cg-engine/relativistik.js';
import {
  writeSp3d, parseSp3, sp3Worldline, compareMagnitudes, SP3_LAGRANGE_DEGREE,
} from 'cg-engine/sp3.js';

const NS = 1_000_000_000n;
const T0 = 1_770_000_000n * NS;          // fester TAI-Startpunkt (ns) — Determinismus
const STEP = 900n * NS;                  // IGS Final: 15-min-Raster
const TOL_RATE = rat(1n, 10n ** 12n);    // Toleranz aus T-L3-RK45-003

/** GPS-Fixture schreiben und wieder einlesen. */
function chain(withVelocity: boolean, count = 40) {
  const kepler = gpsFixtureWorldline(0, T0);
  const text = writeSp3d({
    worldline: kepler, startTaiNs: T0, intervalNs: STEP, count,
    includeVelocity: withVelocity, frame: 'ECEF',
  });
  return { kepler, text, file: parseSp3(text) };
}

/** Größte Abweichung von |r|, |v| und f gegen die Kepler-Referenz. */
function deviation(
  exact: ExactWorldline, approx: ExactWorldline,
  startNs: bigint, spanNs: bigint, samples: number,
): { dr: number; dv: number; df: number } {
  const m = compareMagnitudes(exact, approx, startNs, spanNs, samples);
  return { dr: m.maxDr, dv: m.maxDv, df: m.maxDf };
}

export const T_L3_SP3: TestCase[] = [

  { id: 'T-L3-SP3-001', level: 3,
    description: '[L3-C] SP3-d: eigene lizenzfreie Fixture schreiben und wieder einlesen',
    run: () => {
      const { text, file } = chain(true, 24);
      const zweiterLauf = writeSp3d({
        worldline: gpsFixtureWorldline(0, T0), startTaiNs: T0, intervalNs: STEP,
        count: 24, includeVelocity: true, frame: 'ECEF',
      });
      return {
        version: file.version,
        modus: file.mode,
        satellit: file.satellites[0],
        epochen: file.blocks.length,
        rasterSekunden: Number(file.intervalNs / NS),
        ersteEpocheTrifftTAI: file.blocks[0]!.tTaiNs === T0,
        // I-R3: gleicher Input ⇒ bytegleiche Datei
        bytegleich: text === zweiterLauf,
        // kein IGS-Byte: die Datei trägt die eigene Herkunftskennung
        eigeneHerkunft: text.includes('CG-FRAME ECEF') && text.includes('ChronoGrid-Fixture'),
        endetMitEOF: text.trimEnd().endsWith('EOF'),
      };
    },
    expected: { version: 'd', modus: 'V', satellit: 'L01', epochen: 24, rasterSekunden: 900,
                ersteEpocheTrifftTAI: true, bytegleich: true, eigeneHerkunft: true,
                endetMitEOF: true } },

  { id: 'T-L3-SP3-002', level: 3,
    description: '[L3-C] SP3-Reader: Betriebsmodus mit Velocity-Records (direktes Ablesen)',
    run: () => {
      const { kepler, file } = chain(true);
      const W = sp3Worldline(file, { velocitySource: 'records' });
      const d = deviation(kepler, W, T0 + 8n * STEP, 20n * STEP, 16);
      return {
        quelle: W.info.velocitySource,
        grad: W.info.degree,
        erdrotation: W.info.earthRotation,
        // gemessen: Δ|r| 4,9e-4 m, Δ|v| 7,6e-8 m/s, Δf 4,7e-21 s/s
        bahnUnterMillimeterDezi: d.dr < 1e-2,
        geschwindigkeitUnterMikro: d.dv < 1e-6,
        rateWeitUnterToleranz: d.df < 1e-18,
      };
    },
    expected: { quelle: 'records', grad: 9, erdrotation: true, bahnUnterMillimeterDezi: true,
                geschwindigkeitUnterMikro: true, rateWeitUnterToleranz: true } },

  { id: 'T-L3-SP3-003', level: 3,
    description: '[L3-C] SP3-Reader: positions-only wie IGS Final, v nur aus der Ableitung',
    run: () => {
      // Reale IGS-Final-Produkte enthalten keine Velocity-Records. Dieser Pfad
      // ist deshalb der einzige, der für echte Ephemeriden zählt.
      const { kepler, file } = chain(false);
      const W = sp3Worldline(file);
      const d = deviation(kepler, W, T0 + 8n * STEP, 20n * STEP, 16);
      let vFehlt = false;
      for (const b of file.blocks) if (b.sats.get('L01')!.v !== undefined) vFehlt = true;
      return {
        dateiHatKeineVRecords: file.mode === 'P' && !vFehlt,
        quelle: W.info.velocitySource,
        // gemessen: Δ|v| 1,2e-6 m/s, Δf 5,2e-20 s/s — acht Größenordnungen Reserve
        geschwindigkeitAusAbleitungBrauchbar: d.dv < 1e-4,
        rateUnterToleranz: d.df < 1e-12,
        rateWeitUnterToleranz: d.df < 1e-17,
      };
    },
    expected: { dateiHatKeineVRecords: true, quelle: 'derivative',
                geschwindigkeitAusAbleitungBrauchbar: true, rateUnterToleranz: true,
                rateWeitUnterToleranz: true } },

  { id: 'T-L3-SP3-004', level: 3,
    description: '[L3-C] SP3: beide Geschwindigkeitswege gegen dieselbe Referenz, Abstand ausgewiesen',
    run: () => {
      const start = T0 + 8n * STEP, span = 20n * STEP;
      const rec = chain(true);
      const der = chain(false);
      const dRec = deviation(rec.kepler, sp3Worldline(rec.file, { velocitySource: 'records' }), start, span, 16);
      const dDer = deviation(der.kepler, sp3Worldline(der.file), start, span, 16);
      return {
        // Position ist in beiden Fällen derselbe Interpolant
        gleicheBahn: Math.abs(dRec.dr - dDer.dr) < 1e-9,
        // Die Ableitung ist gröber — gemessen rund 16-fach. Wäre sie es nicht,
        // liefe der Ableitungspfad in Wahrheit über die V-Records.
        ableitungIstGroeber: dDer.dv > dRec.dv,
        abstandFaktorUnter1000: dDer.dv / dRec.dv < 1000,
        beideUnterToleranz: dRec.df < 1e-12 && dDer.df < 1e-12,
        beideMitMindestens6Groessenordnungen: dRec.df < 1e-18 && dDer.df < 1e-18,
      };
    },
    expected: { gleicheBahn: true, ableitungIstGroeber: true, abstandFaktorUnter1000: true,
                beideUnterToleranz: true, beideMitMindestens6Groessenordnungen: true } },

  { id: 'T-L3-SP3-005', level: 3,
    description: '[L3-C] SP3: Klasse-B-Mapping über die Bahndatei trifft f̄ = L_G − 3GM/(2ac²)',
    run: () => {
      const { file } = chain(false);
      const W = sp3Worldline(file);
      const start = file.blocks[6]!.tTaiNs;
      const res = executeClassBMapping({
        worldline: W, tStartTaiNs: start, tEndTaiNs: start + 20n * STEP,
        rateTolerance: TOL_RATE,
      });
      const ref = analyticMeanRateExact(rat(GPS_SEMI_MAJOR_AXIS));
      return {
        innerhalbToleranz: ratCmp(ratAbs(ratSub(res.meanRate, ref)), TOL_RATE) < 0,
        driftPositiv: res.deltaNs > 0n,          // GPS-Uhr geht gegenüber TAI vor
        precision: res.precision,
        tauIstBigInt: typeof res.tauNs === 'bigint',
        worldlineRefTraegtQuelle: res.worldlineRef.startsWith('urn:cg:worldline:sp3:'),
        ordnungImRef: res.worldlineRef.includes(`ord${SP3_LAGRANGE_DEGREE}`),
      };
    },
    expected: { innerhalbToleranz: true, driftPositiv: true, precision: 'exact-bigint',
                tauIstBigInt: true, worldlineRefTraegtQuelle: true, ordnungImRef: true } },

  { id: 'T-L3-SP3-006', level: 3,
    description: '[L3-C] SP3: Fehlerpfade — Formatverstoß, Extrapolation, fehlende V-Records',
    run: () => {
      const codes: string[] = [];
      const fang = (f: () => unknown): void => {
        try { f(); codes.push('kein Fehler'); } catch (e: any) { codes.push(e.code); }
      };
      const { file } = chain(false);
      const W = sp3Worldline(file);

      fang(() => parseSp3('das ist keine SP3-Datei\nEOF\n'));
      fang(() => W.stateAt(rat(T0 + 10_000n * STEP)));          // über den Dateirand
      fang(() => sp3Worldline(file, { velocitySource: 'records' }));
      fang(() => sp3Worldline(parseSp3(writeSp3d({
        worldline: gpsFixtureWorldline(0, T0), startTaiNs: T0, intervalNs: STEP, count: 5,
      }))));                                                     // zu wenige Epochen
      return { codes };
    },
    expected: { codes: ['CG-E-001.007', 'CG-E-005.003', 'CG-E-001.002', 'CG-E-008.003'] } },
];
