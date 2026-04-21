/**
 * cg-engine/src/gregorian.ts
 * Gregorianischer Encode/Decode-Algorithmus — CG-STD-3100 v1.5 Kap. 4
 * Pure functions, BigInt-Arithmetik, deterministic (I-R3)
 */

import { mod } from './engine.js';

// ── Konstanten (normativ, Kap. 4.3) ──────────────────────────────────────────
const DAYS_IN_MONTH = [31n, 28n, 31n, 30n, 31n, 30n, 31n, 31n, 30n, 31n, 30n, 31n];
const SEC_PER_MIN   = 60n;
const SEC_PER_HOUR  = 3600n;
const SEC_PER_DAY   = 86400n;

// 400-Jahres-Zyklus = 146097 Tage (Gregorianischer Kalender)
const DAYS_PER_400Y = 146097n;
const SEC_PER_400Y  = DAYS_PER_400Y * SEC_PER_DAY; // = 12622780800n

// ── Schaltjahr-Prüfung (Kap. 4.3.1, normativ) ────────────────────────────────
export function isLeapYear(year: bigint): boolean {
  if (mod(year, 400n) === 0n) return true;
  if (mod(year, 100n) === 0n) return false;
  if (mod(year, 4n)   === 0n) return true;
  return false;
}

// ── Monatslängen (Kap. 4.3.2, normativ) ──────────────────────────────────────
export function daysInMonth(month: bigint, year: bigint): bigint {
  if (month < 1n || month > 12n) throw new Error(`Ungültiger Monat: ${month}`);
  if (month === 2n && isLeapYear(year)) return 29n;
  return DAYS_IN_MONTH[Number(month) - 1];
}

export function daysInYear(year: bigint): bigint {
  return isLeapYear(year) ? 366n : 365n;
}

// ── Gregorianische Komponenten ────────────────────────────────────────────────
export interface GregorianComponents {
  year:   bigint;
  month:  bigint;  // 1–12
  day:    bigint;  // 1–31
  hour:   bigint;  // 0–23
  minute: bigint;  // 0–59
  second: bigint;  // 0–59 (Schaltsekunden werden in piecewise-linear behandelt)
}

// ── Encode: Komponenten → Sekunden seit Epoche (Kap. 4.1) ────────────────────
// Epoche: 0001-01-01T00:00:00 (proleptic Gregorian)
// Rückgabe: Sekunden seit Epoche als BigInt

export function encodeGregorian(c: GregorianComponents): bigint {
  // Jahre → Tage (mit 400-Jahres-Optimierung)
  const y = c.year - 1n;  // Epoche Jahr 1
  const cycles400 = y / 400n;
  let remaining = mod(y, 400n);

  let days = cycles400 * DAYS_PER_400Y;

  // Restjahre einzeln (max. 399 Iterationen — akzeptabel)
  let yr = 1n;
  while (yr <= remaining) {
    days += daysInYear(yr);
    yr++;
  }

  // Monate → Tage
  for (let m = 1n; m < c.month; m++) {
    days += daysInMonth(m, c.year);
  }

  // Tage (1-basiert → 0-basiert)
  days += c.day - 1n;

  return days * SEC_PER_DAY
    + c.hour   * SEC_PER_HOUR
    + c.minute * SEC_PER_MIN
    + c.second;
}

// ── Decode: Sekunden → Komponenten (Kap. 4.2 + 4.3.3) ───────────────────────
export function decodeGregorian(seconds: bigint): GregorianComponents {
  if (seconds < 0n) throw new Error('Negative Sekunden nicht unterstützt in Gregorian v1');

  // Schritt 1: Jahr (mit 400-Jahres-Optimierung, Kap. 4.3.3)
  const cycles = seconds / SEC_PER_400Y;
  let rem = mod(seconds, SEC_PER_400Y);
  let year = 1n + cycles * 400n;

  while (rem >= daysInYear(year) * SEC_PER_DAY) {
    rem -= daysInYear(year) * SEC_PER_DAY;
    year++;
  }

  // Schritt 2: Monat
  let month = 1n;
  while (month <= 12n && rem >= daysInMonth(month, year) * SEC_PER_DAY) {
    rem -= daysInMonth(month, year) * SEC_PER_DAY;
    month++;
  }

  // Schritt 3: Tag
  const day = rem / SEC_PER_DAY + 1n;
  rem = mod(rem, SEC_PER_DAY);

  // Schritt 4: Uhrzeit
  const hour   = rem / SEC_PER_HOUR;
  rem = mod(rem, SEC_PER_HOUR);
  const minute = rem / SEC_PER_MIN;
  const second = mod(rem, SEC_PER_MIN);

  return { year, month, day, hour, minute, second };
}

// ── ISO-8601-Label (CG-STD-3100 Kap. 6.2) ────────────────────────────────────
export function toISO8601(c: GregorianComponents): string {
  const pad = (n: bigint, w: number) => n.toString().padStart(w, '0');
  return `${pad(c.year, 4)}-${pad(c.month, 2)}-${pad(c.day, 2)}` +
         `T${pad(c.hour, 2)}:${pad(c.minute, 2)}:${pad(c.second, 2)}Z`;
}

// ── Roundtrip-Verifikation (normativ für T-ENG-011) ──────────────────────────
export function verifyGregorianRoundtrip(c: GregorianComponents): boolean {
  const encoded = encodeGregorian(c);
  const decoded = decodeGregorian(encoded);
  return (
    decoded.year   === c.year   &&
    decoded.month  === c.month  &&
    decoded.day    === c.day    &&
    decoded.hour   === c.hour   &&
    decoded.minute === c.minute &&
    decoded.second === c.second
  );
}
