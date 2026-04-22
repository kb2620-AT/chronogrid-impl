/**
 * cg-engine/src/mapping.ts
 * Klasse-A-Mappings: TAI↔UTC, TAI↔GPS, Schaltsekunden
 * CG-STD-3100 v1.5 Kap. 8 | CG-STD-2100 v1.4 Kap. 7 (normative Tabelle)
 */

import { iso8601ToSeconds } from './gregorian.js';

/** Normative Schaltsekunden-Tabelle (CG-STD-2100 v1.4 Kap. 7) */
const LEAP_SECONDS: Array<{ utcSeconds: bigint; taiMinusUtc: bigint }> = [
  { utcSeconds: iso8601ToSeconds('1972-01-01T00:00:00Z'), taiMinusUtc: 10n },
  { utcSeconds: iso8601ToSeconds('1972-07-01T00:00:00Z'), taiMinusUtc: 11n },
  { utcSeconds: iso8601ToSeconds('1973-01-01T00:00:00Z'), taiMinusUtc: 12n },
  { utcSeconds: iso8601ToSeconds('1974-01-01T00:00:00Z'), taiMinusUtc: 13n },
  { utcSeconds: iso8601ToSeconds('1975-01-01T00:00:00Z'), taiMinusUtc: 14n },
  { utcSeconds: iso8601ToSeconds('1976-01-01T00:00:00Z'), taiMinusUtc: 15n },
  { utcSeconds: iso8601ToSeconds('1977-01-01T00:00:00Z'), taiMinusUtc: 16n },
  { utcSeconds: iso8601ToSeconds('1978-01-01T00:00:00Z'), taiMinusUtc: 17n },
  { utcSeconds: iso8601ToSeconds('1979-01-01T00:00:00Z'), taiMinusUtc: 18n },
  { utcSeconds: iso8601ToSeconds('1980-01-01T00:00:00Z'), taiMinusUtc: 19n },
  { utcSeconds: iso8601ToSeconds('1981-07-01T00:00:00Z'), taiMinusUtc: 20n },
  { utcSeconds: iso8601ToSeconds('1982-07-01T00:00:00Z'), taiMinusUtc: 21n },
  { utcSeconds: iso8601ToSeconds('1983-07-01T00:00:00Z'), taiMinusUtc: 22n },
  { utcSeconds: iso8601ToSeconds('1985-07-01T00:00:00Z'), taiMinusUtc: 23n },
  { utcSeconds: iso8601ToSeconds('1988-01-01T00:00:00Z'), taiMinusUtc: 24n },
  { utcSeconds: iso8601ToSeconds('1990-01-01T00:00:00Z'), taiMinusUtc: 25n },
  { utcSeconds: iso8601ToSeconds('1991-01-01T00:00:00Z'), taiMinusUtc: 26n },
  { utcSeconds: iso8601ToSeconds('1992-07-01T00:00:00Z'), taiMinusUtc: 27n },
  { utcSeconds: iso8601ToSeconds('1993-07-01T00:00:00Z'), taiMinusUtc: 28n },
  { utcSeconds: iso8601ToSeconds('1994-07-01T00:00:00Z'), taiMinusUtc: 29n },
  { utcSeconds: iso8601ToSeconds('1996-01-01T00:00:00Z'), taiMinusUtc: 30n },
  { utcSeconds: iso8601ToSeconds('1997-07-01T00:00:00Z'), taiMinusUtc: 31n },
  { utcSeconds: iso8601ToSeconds('1999-01-01T00:00:00Z'), taiMinusUtc: 32n },
  { utcSeconds: iso8601ToSeconds('2006-01-01T00:00:00Z'), taiMinusUtc: 33n },
  { utcSeconds: iso8601ToSeconds('2009-01-01T00:00:00Z'), taiMinusUtc: 34n },
  { utcSeconds: iso8601ToSeconds('2012-07-01T00:00:00Z'), taiMinusUtc: 35n },
  { utcSeconds: iso8601ToSeconds('2015-07-01T00:00:00Z'), taiMinusUtc: 36n },
  { utcSeconds: iso8601ToSeconds('2017-01-01T00:00:00Z'), taiMinusUtc: 37n },
];

/** TAI-UTC-Offset für einen gegebenen UTC-Sekundenwert */
export function taiMinusUtcAt(utcSeconds: bigint): bigint {
  let offset = 0n;
  for (const ls of LEAP_SECONDS) {
    if (utcSeconds >= ls.utcSeconds) offset = ls.taiMinusUtc;
    else break;
  }
  return offset;
}

/** UTC-Sekunden → TAI-Sekunden */
export function utcToTai(utcSeconds: bigint): bigint {
  return utcSeconds + taiMinusUtcAt(utcSeconds);
}

/** TAI-Sekunden → UTC-Sekunden (Näherung, iterativ) */
export function taiToUtc(taiSeconds: bigint): bigint {
  // Iterative Korrektur: TAI-Offset hängt von UTC ab
  let utc = taiSeconds - 37n; // Start mit aktuellem Offset
  for (let i = 0; i < 3; i++) {
    utc = taiSeconds - taiMinusUtcAt(utc);
  }
  return utc;
}

/** GPS Epoch: 1980-01-06T00:00:00Z = UTC */
const GPS_EPOCH_UTC = iso8601ToSeconds('1980-01-06T00:00:00Z');
const TAI_MINUS_GPS = 19n; // GPS läuft nicht mit Schaltsekunden

/** GPS-Sekunden → TAI-Sekunden */
export function gpsToTai(gpsSecs: bigint): bigint {
  return GPS_EPOCH_UTC + gpsSecs + TAI_MINUS_GPS;
}

/** TAI-Sekunden → GPS-Sekunden */
export function taiToGps(taiSecs: bigint): bigint {
  return taiSecs - GPS_EPOCH_UTC - TAI_MINUS_GPS;
}

/** Aktueller Schaltsekunden-Offset (TAI−UTC) */
export const CURRENT_TAI_MINUS_UTC = 37n;
