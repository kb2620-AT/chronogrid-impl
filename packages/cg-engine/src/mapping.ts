/**
 * cg-engine/src/mapping.ts
 * Mapping-Ausführung — CG-STD-3100 v1.5 Kap. 8
 * Piecewise-linear (Klasse A) + Lookup (Schaltsekunden)
 * Pure functions — kein Netzwerkzugriff, kein externer Zustand (Kap. 2.3)
 */

import type { CTDDLDomain, MappingBlock } from '../../cg-types/src/domain.ts';
import { Errors } from '../../cg-types/src/errors.ts';
import { LEAP_SECONDS } from './engine.ts';

// ── Mapping-Kontext ────────────────────────────────────────────────────────────
export interface MappingContext {
  sourceDomain: CTDDLDomain;
  targetDomain: CTDDLDomain;
  rule: MappingBlock;
}

// ── Lineares Mapping (Kap. 8.3) ──────────────────────────────────────────────
// Für einfache lineare Relationen: target = slope * source + offset

export interface LinearRule {
  slope: bigint;     // Numerator des Skalierungsfaktors
  denominator: bigint; // Denominator (für rationale Faktoren)
  offset: bigint;    // Additive Konstante
}

export function executeLinearMapping(sourceNs: bigint, rule: LinearRule): bigint {
  if (rule.denominator === 0n) {
    throw Errors.MappingError.DivisionByZero({ rule });
  }
  return (sourceNs * rule.slope) / rule.denominator + rule.offset;
}

// ── Schaltsekunden-Lookup (Kap. 8.5, normativ) ────────────────────────────────
// Binärsuche: größter Eintrag mit entry.utcFrom <= utc

export function lookupTaiOffset(utcSeconds: bigint): number {
  // Vor 1972-01-01: kein normierter Offset (Fehler)
  if (utcSeconds < BigInt('63072000')) { // 1972-01-01 00:00:00 UTC
    throw Errors.MappingError.RefPointOutOfExtent({
      reason: 'UTC vor 1972-01-01 — kein normierter TAI-Offset',
      utcSeconds: utcSeconds.toString(),
    });
  }

  let lo = 0;
  let hi = LEAP_SECONDS.length - 1;
  let result = 10; // TAI-UTC 1972-01-01 Basiswert

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (LEAP_SECONDS[mid].utcSeconds <= utcSeconds) {
      result = LEAP_SECONDS[mid].taiOffset;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

// ── Piecewise-linear Mapping (Kap. 8.4, normativ) ────────────────────────────

export interface PiecewiseSegment {
  utcFrom: bigint;   // UTC-Sekunden Beginn dieses Segments
  taiOffset: number; // TAI-UTC in diesem Segment (Sekunden)
}

/** UTC-Sekunden → TAI-Sekunden (piecewise-linear via normative Schaltsekunden-Tabelle) */
export function utcToTai(utcSeconds: bigint): bigint {
  const offset = lookupTaiOffset(utcSeconds);
  return utcSeconds + BigInt(offset);
}

/** TAI-Sekunden → UTC-Sekunden (inverse piecewise-linear) */
export function taiToUtc(taiSeconds: bigint): bigint {
  // Iterativ konvergieren (max. 3 Iterationen ausreichend)
  let offset = 37; // Heuristik: aktueller Wert
  for (let i = 0; i < 3; i++) {
    const approxUtc = taiSeconds - BigInt(offset);
    try {
      offset = lookupTaiOffset(approxUtc);
    } catch {
      break; // vor 1972 — offset bleibt bei Heuristik
    }
  }
  return taiSeconds - BigInt(offset);
}

/** UTC-Nanosekunden → TAI-Nanosekunden */
export function utcNsToTaiNs(utcNs: bigint): bigint {
  const utcSec = utcNs / BigInt(1_000_000_000);
  const utcSubNs = utcNs % BigInt(1_000_000_000);
  const offset = BigInt(lookupTaiOffset(utcSec));
  return (utcSec + offset) * BigInt(1_000_000_000) + utcSubNs;
}

/** TAI-Nanosekunden → UTC-Nanosekunden */
export function taiNsToUtcNs(taiNs: bigint): bigint {
  const taiSec = taiNs / BigInt(1_000_000_000);
  const taiSubNs = taiNs % BigInt(1_000_000_000);
  const utcSec = taiToUtc(taiSec);
  return utcSec * BigInt(1_000_000_000) + taiSubNs;
}

// ── GPS ↔ TAI (linear, konstant +19s) ────────────────────────────────────────
// GPS-Epoche: 1980-01-06T00:00:00Z = TAI + 19s (kein Schaltsekunden-Update nötig)

const GPS_TAI_OFFSET_S = 19n;
const GPS_TAI_OFFSET_NS = GPS_TAI_OFFSET_S * BigInt(1_000_000_000);

/** GPS-Nanosekunden → TAI-Nanosekunden */
export function gpsNsToTaiNs(gpsNs: bigint): bigint {
  return gpsNs + GPS_TAI_OFFSET_NS;
}

/** TAI-Nanosekunden → GPS-Nanosekunden */
export function taiNsToGpsNs(taiNs: bigint): bigint {
  return taiNs - GPS_TAI_OFFSET_NS;
}

// ── Unix ↔ TAI (piecewise-linear) ────────────────────────────────────────────
// Unix ignoriert Schaltsekunden (POSIX) — TAI ist linear und korrekt.
// Hinweis: Unix → TAI ist nicht bijektiv an Schaltsekunden-Punkten.

/** Unix-Nanosekunden → TAI-Nanosekunden */
export function unixNsToTaiNs(unixNs: bigint): bigint {
  // Unix ist identisch UTC aus ChronoGrid-Sicht (piecewise-linear)
  return utcNsToTaiNs(unixNs);
}

/** TAI-Nanosekunden → Unix-Nanosekunden */
export function taiNsToUnixNs(taiNs: bigint): bigint {
  return taiNsToUtcNs(taiNs);
}

// ── Mapping-Dispatcher ────────────────────────────────────────────────────────
// Wählt die korrekte Mapping-Funktion basierend auf Domain-Namen.

export type KnownDomain = 'TAI' | 'UTC' | 'Unix' | 'GPS' | 'Gregorian';

/**
 * Konvertiert einen TAI-Nanosekunden-Wert in eine Ziel-Domain.
 * Dies ist das zentrale Interface für alle Level-1/2-Konvertierungen.
 */
export function taiNsToTarget(taiNs: bigint, targetDomain: string): bigint {
  switch (targetDomain.toLowerCase()) {
    case 'tai':       return taiNs;
    case 'utc':       return taiNsToUtcNs(taiNs);
    case 'unix':      return taiNsToUnixNs(taiNs);
    case 'gps':       return taiNsToGpsNs(taiNs);
    default:
      throw Errors.MappingError.TargetDomainNotFound(targetDomain);
  }
}

/**
 * Konvertiert einen Quell-Domain-Wert zu TAI-Nanosekunden.
 */
export function sourceToTaiNs(sourceNs: bigint, sourceDomain: string): bigint {
  switch (sourceDomain.toLowerCase()) {
    case 'tai':  return sourceNs;
    case 'utc':  return utcNsToTaiNs(sourceNs);
    case 'unix': return unixNsToTaiNs(sourceNs);
    case 'gps':  return gpsNsToTaiNs(sourceNs);
    default:
      throw Errors.MappingError.TargetDomainNotFound(sourceDomain);
  }
}

/**
 * Vollständige Konvertierung: Quelle → TAI → Ziel (normativ).
 * Mapping-Kette: source → TAI → target (max. 2 Schritte für Level 1/2).
 * Längere Ketten: CG-STD-3100 Kap. 8, max. 8 Schritte (CG-E-005.010).
 */
export function convert(
  valueNs: bigint,
  sourceDomain: string,
  targetDomain: string,
): bigint {
  const taiNs = sourceToTaiNs(valueNs, sourceDomain);
  return taiNsToTarget(taiNs, targetDomain);
}