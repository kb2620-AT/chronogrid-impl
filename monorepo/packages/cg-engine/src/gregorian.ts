/**
 * cg-engine/src/gregorian.ts
 * Gregorianischer Algorithmus — CG-STD-3100 v1.5 Kap. 4
 * Alle Operationen arbeiten mit BigInt (ℤ∞).
 */

const SECONDS_PER_MINUTE = 60n;
const SECONDS_PER_HOUR   = 3600n;
const SECONDS_PER_DAY    = 86400n;

/** Ist ein Jahr ein Schaltjahr? */
export function isLeapYear(year: bigint): boolean {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Tage im Monat */
export function daysInMonth(year: bigint, month: bigint): bigint {
  const m = Number(month);
  const d = [0,31,28,31,30,31,30,31,31,30,31,30,31];
  if (m === 2 && isLeapYear(year)) return 29n;
  return BigInt(d[m] ?? 30);
}

/** Tage von Epoche (0001-01-01) bis Jahresbeginn */
export function daysSinceEpochToYearStart(year: bigint): bigint {
  const y = year - 1n;
  return y * 365n + y / 4n - y / 100n + y / 400n;
}

/** Gregorianisches Datum → Sekunden seit 0001-01-01T00:00:00 */
export function gregorianToSeconds(
  year: bigint, month: bigint, day: bigint,
  hour = 0n, minute = 0n, second = 0n,
): bigint {
  let days = daysSinceEpochToYearStart(year);
  for (let m = 1n; m < month; m++) days += daysInMonth(year, m);
  days += day - 1n;
  return days * SECONDS_PER_DAY + hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE + second;
}

/** Sekunden seit 0001-01-01 → ISO-8601-String */
export function secondsToISO8601(secs: bigint): string {
  let rem = secs;
  const second = rem % 60n; rem /= 60n;
  const minute = rem % 60n; rem /= 60n;
  const hour   = rem % 24n; rem /= 24n;
  // Tage → Jahr/Monat/Tag
  let year = 1n;
  while (true) {
    const daysInYear = isLeapYear(year) ? 366n : 365n;
    if (rem < daysInYear) break;
    rem -= daysInYear;
    year++;
  }
  let month = 1n;
  while (true) {
    const d = daysInMonth(year, month);
    if (rem < d) break;
    rem -= d;
    month++;
  }
  const day = rem + 1n;
  const pad = (n: bigint, w: number) => n.toString().padStart(w, '0');
  return `${pad(year,4)}-${pad(month,2)}-${pad(day,2)}T${pad(hour,2)}:${pad(minute,2)}:${pad(second,2)}Z`;
}

/** ISO-8601-String → Sekunden seit 0001-01-01 */
export function iso8601ToSeconds(iso: string): bigint {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Ungültiges ISO-8601: ${iso}`);
  return gregorianToSeconds(
    BigInt(m[1]!), BigInt(m[2]!), BigInt(m[3]!),
    BigInt(m[4]!), BigInt(m[5]!), BigInt(m[6]!),
  );
}
