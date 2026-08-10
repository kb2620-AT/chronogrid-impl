/**
 * cg-testkit/src/suites/t-l3-sp3.ts
 * L3-C (Fortsetzung): SP3-Ephemeriden — T-L3-SP3-001…007 aktiv, 008 pending
 *   (T-L3-SP3-008 liegt als Stub in t-l3-pending.ts — dort läuft die Zählung.)
 *
 * Normative Basis: CG-STD-3100 v1.6 Kap. 8.6 (Klasse-B-Mapping F[W](τ)),
 *                  CG-STD-0000 v0.8 §3, I-R2/I-R3,
 *                  SP3-c/SP3-d Formatdefinition, IERS Conventions 2010
 * Implementierung: cg-engine/src/sp3.ts
 *
 * Datenquelle T-L3-SP3-007:
 *   International GNSS Service (IGS), Final orbit product
 *   IGS0OPSFIN_20261050000_01D_15M_ORB.SP3, bezogen ueber BKG.
 *   (Attribution verbindlich nach CG-VERM-0100.)
 *
 * Mit A4/Weg A Schritt 3 stammt die Ephemeride nicht mehr zwingend aus dem
 * Kepler-Generator, sondern aus einer SP3-Bahndatei. Damit ist die in
 * t-l3-rk45.ts benannte Einschränkung „Offline-Kepler-Fixture statt SP3-Import"
 * aufgehoben — die Kette Datei → Interpolation → Mapping ist gebaut und geprüft.
 *
 * ── Was diese Gruppe belegt und was nicht ───────────────────────────────────
 * T-L3-SP3-001…006 arbeiten auf einer Fixture des eigenen Writers (lizenzfrei,
 * kein IGS-Byte). T-L3-SP3-007 läuft als einziger gegen ein echtes,
 * heruntergeladenes IGS-Final-Produkt und deckt damit Kopfvarianten,
 * Konstellationskürzel und reale Bahndaten mit ab — aber nur, wenn die Datei
 * lokal vorliegt. Sie ist per .gitignore ausgeschlossen; fehlt sie, überspringt
 * sich der Test mit Meldung, und die Gruppe belegt wieder nur das, was
 * T-L3-SP3-001…006 belegen.
 *
 * „SP3-Kette implementiert" heißt weiterhin: das Format wird geschrieben und
 * gelesen, die Interpolation ist exakt, die Physik trifft die analytischen
 * Referenzen. Ein einzelner Satellit (G01) aus einem einzelnen Tagesprodukt ist
 * kein Nachweis über die Breite realer Produkte — andere Konstellationen,
 * Manöver, Ausreißer und Kopfvarianten anderer Analysezentren bleiben ungeprüft.
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestCase } from '../runner.js';
import { type Rat, rat, ratAbs, ratSub, ratCmp, ratToNumber } from 'cg-engine/exakt.js';
import {
  type ExactWorldline,
  executeClassBMapping, analyticMeanRateExact,
  gpsFixtureWorldline, GPS_SEMI_MAJOR_AXIS,
} from 'cg-engine/relativistik.js';
import {
  writeSp3d, parseSp3, sp3Worldline, compareMagnitudes, SP3_LAGRANGE_DEGREE,
  withinDistance, normSquaredExact,
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

// ─────────────────────────────────────────────────────────────────────────────
// T-L3-SP3-007: Ausdünnung gegen ein echtes IGS-Final-Produkt
//
// Datenquelle:
//   International GNSS Service (IGS), Final orbit product
//   IGS0OPSFIN_20261050000_01D_15M_ORB.SP3, bezogen ueber BKG.
//
// Die Datei liegt NICHT im Repository (.gitignore schließt IGS-Produkte aus).
// Der Pfad wird über import.meta.url aufgelöst, nicht über das
// Arbeitsverzeichnis — der Test soll unabhängig davon laufen, von wo die CLI
// gestartet wurde.
const IGS_DATEI = 'IGS0OPSFIN_20261050000_01D_15M_ORB.SP3';
const IGS_PFAD = resolve(
  dirname(fileURLToPath(import.meta.url)), '../../../../fixtures/igs-local', IGS_DATEI,
);
const IGS_VORHANDEN = existsSync(IGS_PFAD);

/** Antwort, wenn das Produkt fehlt — identisch in run() und expected. */
const SP3_007_UEBERSPRUNGEN = {
  status: 'übersprungen',
  grund: `${IGS_DATEI} liegt nicht unter fixtures/igs-local/ — IGS-Produkte sind `
       + `per .gitignore ausgeschlossen; scripts/internal/setup-igs-fixture.sh legt sie an`,
};

/** Bahnschwelle aus CG-VERM-0101. Die Δv-Schwelle gehört zu T-L3-SP3-008. */
const SCHWELLE_DR = rat(1n, 5n);              // 0,20 m

/** |a − b| als Float — nur für die Meldung, nie für die Prüfung. */
function abstand(a: readonly [Rat, Rat, Rat], b: readonly [Rat, Rat, Rat]): number {
  return Math.sqrt(ratToNumber(normSquaredExact([
    ratSub(a[0], b[0]), ratSub(a[1], b[1]), ratSub(a[2], b[2]),
  ]), 24));
}

/**
 * Ausdünnung 900 s → 1800 s und Vergleich an den ausgelassenen Epochen.
 *
 * Warum eine eigene Bahnschwelle und nicht die Ratentoleranz: f hängt so
 * schwach von der Bahnlage ab, dass 80 m Bahnfehler nur 6,6e-15 s/s erzeugen —
 * 150-fach unter der Toleranz von 1e-12. Ein Interpolant könnte die Bahn also
 * grob verfehlen und die Ratenprüfung trotzdem bestehen. Dasselbe Argument
 * steht hinter T-L3-RK45-006.
 *
 * Geprüft wird hier NUR Δr. Der Grund ist die Beweislage, nicht die Bequem-
 * lichkeit: an einer ausgelassenen Epoche sitzt der volle Interpolant auf einem
 * Knoten und gibt den tabellierten Wert zurück (Kronecker, T-RELB-073) — die
 * Referenz ist echte Tabellenwahrheit. Für Δv gilt das nicht, weil IGS Final
 * keine Velocity-Records führt; dort stünden zwei abgeleitete Größen
 * gegeneinander. Dieser Vergleich liegt als T-L3-SP3-008 pending.
 *
 * Kernbereich: der ausgedünnte Interpolant hat 48 Knoten im 1800-s-Raster, fünf
 * Stützstellen je Seite sind 2,5 h — gültig ist [02:00, 21:30) (K-3). Die
 * Vergleichspunkte liegen deshalb bei 02:15 … 21:15. Punkte davor oder danach
 * lehnt K-3 zu Recht ab; sie sind keine Testfälle.
 */
function ausduennungsprobe() {
  const SAT = 'G01';
  const voll = parseSp3(readFileSync(IGS_PFAD, 'utf8'));
  const Wvoll = sp3Worldline(voll, { satellite: SAT });

  // Jede zweite Epoche. `grid` wird mitgeschleppt und nur für info.gapsTaiNs
  // gelesen — deshalb wird unten geprüft, dass G01 im Original lückenlos ist.
  const duenn = {
    ...voll,
    blocks: voll.blocks.filter((_, i) => i % 2 === 0),
    intervalNs: voll.intervalNs * 2n,
  };
  const Wduenn = sp3Worldline(duenn, { satellite: SAT });

  // Gültiger Kern des ausgedünnten Interpolanten, in Indizes der VOLLEN Datei:
  // Knoten k des dünnen Rasters ⇔ Index 2k des vollen.
  const halb = 4, letzterDuenn = duenn.blocks.length - 1 - 5;
  const vonVoll = 2 * halb, bisVoll = 2 * (letzterDuenn + 1);   // [02:00, 21:30)

  let maxDr = 0, drOk = true, punkte = 0;
  let ersteZeit = 0n, letzteZeit = 0n;
  for (let i = 1; i < voll.blocks.length; i += 2) {             // ausgelassene Epochen
    if (i <= vonVoll || i >= bisVoll) continue;
    const t = rat(voll.blocks[i]!.tTaiNs);
    const a = Wduenn.stateAt(t), b = Wvoll.stateAt(t);
    // Die Schwellenprüfung ist exakt rational, ohne Wurzel (withinDistance
    // vergleicht |a−b|² gegen tol²). Float tritt nur in der Meldung auf.
    if (!withinDistance(a.r, b.r, SCHWELLE_DR)) drOk = false;
    maxDr = Math.max(maxDr, abstand(a.r, b.r));
    if (punkte === 0) ersteZeit = voll.blocks[i]!.tTaiNs;
    letzteZeit = voll.blocks[i]!.tTaiNs;
    punkte++;
  }

  // T-3: die letzte Epoche der Tagesdatei hat rechts keine fünf Stützstellen
  // mehr — nach K-3 muss die Auswertung dort abgelehnt werden, statt still ein
  // unzentriertes Fenster zu benutzen.
  let letzterCode = 'kein Fehler';
  try { Wvoll.stateAt(rat(voll.blocks[voll.blocks.length - 1]!.tTaiNs)); }
  catch (e: any) { letzterCode = e.code; }

  console.log(
    `     ↳ T-L3-SP3-007: ${punkte} Vergleichspunkte, `
    + `|Δr|max = ${maxDr.toExponential(3)} m (Schwelle 2,0e-1)`,
  );

  return {
    status: 'geprüft',
    satellit: SAT,
    // Reale Produktdatei, nicht der eigene Writer: Version, Modus, Bestückung
    version: voll.version,
    modus: voll.mode,
    ohneLuecken: Wvoll.info.gapsTaiNs.length === 0,
    rasterVollS: Number(voll.intervalNs / NS),
    rasterDuennS: Number(duenn.intervalNs / NS),
    knotenDuenn: duenn.blocks.length,
    vergleichspunkte: punkte,
    ersteVergleichsstunde: Number((ersteZeit - voll.blocks[0]!.tTaiNs) / (60n * NS)),
    letzteVergleichsstunde: Number((letzteZeit - voll.blocks[0]!.tTaiNs) / (60n * NS)),
    bahnUnterSchwelle: drOk,
    letzteEpocheAbgelehnt: letzterCode,
  };
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

  { id: 'T-L3-SP3-007', level: 3,
    description: '[L3-C] SP3: Ausdünnung gegen IGS-Final — Bahnlage Δr (echtes Produkt, G01, 900→1800 s)',
    // Der erste Lauf der Gruppe gegen ein echtes IGS-Produkt statt gegen die
    // eigene Fixture. Prüfprinzip: aus jeder zweiten Epoche einen Interpolanten
    // bauen und ihn an den ausgelassenen Epochen gegen den vollen Interpolanten
    // stellen — die ausgelassenen Werte sind tabellierte Wahrheit, an einem
    // Knoten gibt Lagrange den Stützwert zurück (Kronecker, T-RELB-073).
    //
    // Fehlt die Datei, überspringt sich der Test: die IGS-Produkte sind per
    // .gitignore ausgeschlossen, die CI muss trotzdem grün bleiben. Der
    // Unterschied ist am Ergebnisfeld `status` ablesbar, nicht nur am Häkchen.
    run: () => (IGS_VORHANDEN ? ausduennungsprobe() : SP3_007_UEBERSPRUNGEN),
    expected: IGS_VORHANDEN
      ? {
          status: 'geprüft',
          satellit: 'G01',
          version: 'c',                    // IGS Final ist SP3-c, nicht SP3-d (R-2)
          modus: 'P',                      // keine Velocity-Records (R-4/T-L3-SP3-003)
          ohneLuecken: true,
          rasterVollS: 900,
          rasterDuennS: 1800,
          knotenDuenn: 48,
          vergleichspunkte: 39,
          ersteVergleichsstunde: 135,      // 02:15 nach Dateibeginn [min]
          letzteVergleichsstunde: 1275,    // 21:15 nach Dateibeginn [min]
          bahnUnterSchwelle: true,
          letzteEpocheAbgelehnt: 'CG-E-005.003',   // K-3 auf realen Daten
        }
      : SP3_007_UEBERSPRUNGEN },
];
