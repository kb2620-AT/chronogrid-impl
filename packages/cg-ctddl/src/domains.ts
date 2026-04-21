/**
 * cg-engine/src/domains.ts
 * Normative Built-in Domain-Definitionen — CG-STD-2100 v1.4 Kap. 6
 * Diese Domains sind Teil jeder Level-1-konformen Implementierung.
 */

import type { CTDDLDomain, MappingBlock } from '../../cg-types/src/domain.ts';

// ── Gregorianische Domain v2 (Kap. 6.1) ──────────────────────────────────────
export const DOMAIN_GREGORIAN_V2: CTDDLDomain = Object.freeze({
  name: 'Gregorian',
  version: 2,
  semantics: 'time',
  type: 'piecewise-linear',
  granularity: '1000000000',       // 1 Sekunde in Nanosekunden
  description: 'Proleptic Gregorian calendar, UTC-referenced, piecewise-linear TAI mapping',
  stability: 'high',
  extent: {
    min: '-62135596800000000000',  // 0001-01-01T00:00:00Z in ns (relativ TAI-Epoche)
    max: null,                     // unbegrenzt
  },
  epoch: {
    reference: '1970-01-01T00:00:00Z',
    tai_offset: 8,                 // TAI-UTC 1970-01-01 = 8s
    rationale: 'Unix-kompatible Epoche; TAI wird intern verwendet',
  },
  mappings: [{
    targetDomain: 'TAI',
    targetVersion: 1,
    class: 'A' as const,
    function: 'utc_to_tai_piecewise',
    leapSecondsRef: 'CG-STD-2100-AnnexA-v1.0',
  }],
});

// ── TAI-Domain v1 (Kap. 6.2) ─────────────────────────────────────────────────
export const DOMAIN_TAI_V1: CTDDLDomain = Object.freeze({
  name: 'TAI',
  version: 1,
  semantics: 'time',
  type: 'linear',
  granularity: '1',               // 1 Nanosekunde
  description: 'International Atomic Time — monoton, keine Schaltsekunden, ℤ∞-Werte',
  stability: 'high',
  extent: {
    min: null,                    // unbegrenzt rückwärts
    max: null,                    // unbegrenzt vorwärts
  },
  epoch: {
    reference: '1958-01-01T00:00:00Z',
    tai_offset: 0,                // TAI = TAI, kein Offset
    rationale: 'IAU-Referenz; Basis aller ChronoGrid-Berechnungen',
  },
  mappings: [],                   // TAI ist Basisdomäne — kein Mapping nötig
});

// ── Unix-Domain v1 (Kap. 6.3) ────────────────────────────────────────────────
export const DOMAIN_UNIX_V1: CTDDLDomain = Object.freeze({
  name: 'Unix',
  version: 1,
  semantics: 'time',
  type: 'piecewise-linear',
  granularity: '1000000000',      // 1 Sekunde in Nanosekunden
  description: 'POSIX/Unix time — Sekunden seit 1970-01-01T00:00:00Z, ignoriert Schaltsekunden',
  stability: 'high',
  extent: {
    min: '-2208988800000000000',  // 1900-01-01 (POSIX-Grenze)
    max: null,
  },
  epoch: {
    reference: '1970-01-01T00:00:00Z',
    tai_offset: 8,
    rationale: 'POSIX-Standard; kein Schaltsekunden-Zähler (wie UTC)',
  },
  mappings: [{
    targetDomain: 'TAI',
    targetVersion: 1,
    class: 'A' as const,
    function: 'utc_to_tai_piecewise',
    leapSecondsRef: 'CG-STD-2100-AnnexA-v1.0',
  }],
});

// ── GPS-Domain v1 ─────────────────────────────────────────────────────────────
export const DOMAIN_GPS_V1: CTDDLDomain = Object.freeze({
  name: 'GPS',
  version: 1,
  semantics: 'time',
  type: 'linear',
  granularity: '1000000000',      // 1 Sekunde
  description: 'GPS-Zeit — linear, TAI - 19s, keine Schaltsekunden nach GPS-Epoche',
  stability: 'high',
  extent: {
    min: '0',                     // GPS-Epoche: 1980-01-06T00:00:00Z
    max: null,
  },
  epoch: {
    reference: '1980-01-06T00:00:00Z',
    tai_offset: 19,               // TAI-GPS = 19s (konstant seit GPS-Epoche)
    rationale: 'GPS-Systemzeit; TAI-GPS-Offset konstant = 19s',
  },
  mappings: [{
    targetDomain: 'TAI',
    targetVersion: 1,
    class: 'A' as const,
    function: 'gps_to_tai_linear',
    // GPS → TAI: TAI = GPS + 19s (exakt linear, keine Schaltsekunden)
  }] as MappingBlock[],
});

// ── UTC-Domain v1 (Level 2+) ──────────────────────────────────────────────────
export const DOMAIN_UTC_V1: CTDDLDomain = Object.freeze({
  name: 'UTC',
  version: 1,
  semantics: 'time',
  type: 'piecewise-linear',
  granularity: '1000000000',      // 1 Sekunde
  description: 'Coordinated Universal Time — piecewise-linear, mit Schaltsekunden (IERS)',
  stability: 'medium',
  scientific_dependency: {
    model: 'IERS',
    reference: 'IERS Bulletin C — Leap Second Announcements',
    rationale: 'Schaltsekunden werden durch IERS mit 6-Monats-Vorlauf angekündigt',
  },
  extent: {
    min: '63072000000000000',     // 1972-01-01T00:00:00Z in ns (UTC normiert ab 1972)
    max: null,
  },
  epoch: {
    reference: '1970-01-01T00:00:00Z',
    tai_offset: 8,
    rationale: 'UTC ist ab 1972 normiert (CCIR Rec. 460)',
  },
  mappings: [{
    targetDomain: 'TAI',
    targetVersion: 1,
    class: 'A' as const,
    function: 'utc_to_tai_piecewise',
    leapSecondsRef: 'CG-STD-2100-AnnexA-v1.0',
  }],
});

// ── Cosmic Domain v1.1 (Kap. 6.4) — Level 2/3 ────────────────────────────────
export const DOMAIN_COSMIC_V1: CTDDLDomain = Object.freeze({
  name: 'Cosmic',
  version: 1,
  semantics: 'time',
  type: 'linear',
  granularity: '1000000000',      // 1 Sekunde (Level 2) oder 1 ns (Level 3)
  description: 'Kosmologische Zeitskala seit Big Bang — BigInt erforderlich',
  stability: 'low',
  scientific_dependency: {
    model: 'Planck-2018',
    H0: 67.4,
    reference: 'Planck Collaboration 2020, A&A 641 A6',
    cosmic_age_s: '435116774400000',  // 13.8 Mrd. Jahre in Sekunden
    rationale: 'Cosmic-Age basiert auf Planck 2018 H0=67.4 km/s/Mpc',
  },
  extent: {
    min: '0',
    max: '435116774400000000000000',  // Cosmic-Age in Nanosekunden (~4.35×10²³)
  },
  epoch: {
    reference: '1970-01-01T00:00:00Z',
    tai_offset: 8,
    rationale: 'Cosmic-Werte sind relativ zur TAI-Epoche ausgedrückt',
  },
  mappings: [{
    targetDomain: 'TAI',
    targetVersion: 1,
    class: 'A' as const,
    function: 'cosmic_to_tai_linear',
  }] as MappingBlock[],
});

// ── Built-in Domain Registry ──────────────────────────────────────────────────

export const BUILTIN_DOMAINS: ReadonlyArray<CTDDLDomain> = [
  DOMAIN_TAI_V1,
  DOMAIN_GREGORIAN_V2,
  DOMAIN_UNIX_V1,
  DOMAIN_GPS_V1,
  DOMAIN_UTC_V1,
  DOMAIN_COSMIC_V1,
];

export function getBuiltinDomain(name: string, version: number): CTDDLDomain | undefined {
  return BUILTIN_DOMAINS.find(d => d.name === name && d.version === version);
}