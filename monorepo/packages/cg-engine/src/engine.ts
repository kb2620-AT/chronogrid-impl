/**
 * cg-engine/src/engine.ts
 * ChronoGrid Engine-Kern — CG-STD-3100 v1.5 Kap. 2–9
 * Encode, Decode, MachineID, CGFI, Allen-Relationen, Invarianten
 */

import { createHash } from 'node:crypto';
import type { CTDDLDomain, CGTA, CGTimepoint, AllenRelation } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import { iso8601ToSeconds, secondsToISO8601 } from './gregorian.js';
import { utcToTai, taiToUtc, gpsToTai, taiToGps, CURRENT_TAI_MINUS_UTC } from './mapping.js';
import { BUILTIN_DOMAINS } from './domains.js';

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<string, CTDDLDomain>();
for (const d of BUILTIN_DOMAINS) _registry.set(`${d.name}@${d.version}`, d);

export function registerDomain(domain: CTDDLDomain): void {
  const key = `${domain.name}@${domain.version}`;
  if (_registry.has(key)) throw Errors.SemanticError.duplicateName(`Domain bereits registriert: ${key}`);
  _registry.set(key, domain);
}

export function getDomain(name: string, version = '1.0'): CTDDLDomain {
  const d = _registry.get(`${name}@${version}`);
  if (!d) throw Errors.VersionError.notFound(`Domain nicht gefunden: ${name}@${version}`);
  return d;
}

export function listDomainKeys(): string[] { return [..._registry.keys()]; }

// ── CGTA encode/decode ────────────────────────────────────────────────────────

/** Erzeugt eine CGTA-Adresse (Serialisierung) */
export function encodeCGTA(cgta: CGTA): string {
  return `CG:${cgta.domain}:${cgta.value}/v${cgta.version}`;
}

/** Parst eine CGTA-Adresse */
export function decodeCGTA(raw: string): CGTA {
  const m = raw.match(/^CG:([^:]+):(-?\d+)\/v(\d+)$/);
  if (!m) throw Errors.SyntaxError.abnfViolation(`Ungültige CGTA: ${raw}`);
  return { domain: m[1]!, value: BigInt(m[2]!), version: Number(m[3]!), timezone: 'none' };
}

// ── MachineID (SHA-256) ───────────────────────────────────────────────────────

/** MachineID = SHA-256(DomainName ‖ AbsoluterWert ‖ Version) — CG-STD-3100 §5.1 */
export function computeMachineId(domainName: string, absoluteValue: bigint, version: string): string {
  return createHash('sha256')
    .update(`${domainName}:${absoluteValue}:${version}`)
    .digest('hex');
}

// ── CGFI (CG-STD-3100 §5.4) ──────────────────────────────────────────────────

/** CGFI = SHA-256(TAI-MachineID ‖ ContentHash ‖ TypeID) */
export function computeCGFI(taiMachineId: string, contentHash: string, typeId: string): string {
  return createHash('sha256')
    .update(`${taiMachineId}:${contentHash}:${typeId}`)
    .digest('hex');
}

// ── Zeitwert-Konversion ───────────────────────────────────────────────────────

/**
 * Konvertiert einen Zeitwert zwischen zwei Domains.
 * Mapping-Chain max. 8 Schritte (R3 / CG-E-005.010).
 */
export function convertValue(
  value: bigint,
  fromDomain: string,
  toDomain: string,
  maxChain = 8,
): bigint {
  if (fromDomain === toDomain) return value;
  if (maxChain <= 0) throw Errors.MappingError.chainTooLong('Mapping-Kette zu lang (> 8 Schritte)');

  // Direkte Built-in Mappings
  if (fromDomain === 'UTC' && toDomain === 'TAI') return utcToTai(value);
  if (fromDomain === 'TAI' && toDomain === 'UTC') return taiToUtc(value);
  if (fromDomain === 'GPS' && toDomain === 'TAI') return gpsToTai(value);
  if (fromDomain === 'TAI' && toDomain === 'GPS') return taiToGps(value);
  if (fromDomain === 'Unix' && toDomain === 'TAI') {
    const greg = value + iso8601ToSeconds('1970-01-01T00:00:00Z');
    return utcToTai(greg);
  }
  if (fromDomain === 'Unix' && toDomain === 'UTC') return value + iso8601ToSeconds('1970-01-01T00:00:00Z');

  throw Errors.MappingError.targetNotFound(`Kein direktes Mapping: ${fromDomain} → ${toDomain}`);
}

// ── Zeitpunkt erzeugen ────────────────────────────────────────────────────────

/** Erzeugt einen vollständigen CGTimepoint */
export function createTimepoint(
  domainName: string,
  domainVersion: string,
  value: bigint,
  labels: Record<string, string> = {},
): CGTimepoint {
  const domain = getDomain(domainName, domainVersion);
  void domain; // Validierung: Domain muss existieren

  // Absoluten TAI-Wert berechnen (für MachineID)
  let absoluteValue: bigint;
  try {
    absoluteValue = convertValue(value, domainName, 'TAI');
  } catch {
    absoluteValue = value; // Fallback für Domains ohne TAI-Mapping
  }

  const machineId  = computeMachineId(domainName, absoluteValue, domainVersion);
  const cgta       = encodeCGTA({ domain: domainName, value, version: Number(domainVersion.split('.')[0]), timezone: 'none' });
  const created_at = BigInt(Date.now()) * 1_000_000n; // ms → ns

  return { machine_id: machineId, domain_name: domainName, domain_version: domainVersion,
    absolute_value: absoluteValue, cgta, labels, created_at };
}

// ── Allen-Relationen (CG-STD-3100 Kap. 9) ────────────────────────────────────

export interface Interval { start: bigint; end: bigint; }

/** Berechnet die Allen-Relation zwischen zwei Intervallen */
export function allenRelation(a: Interval, b: Interval): AllenRelation {
  if (a.end < b.start)  return 'BEFORE';
  if (b.end < a.start)  return 'AFTER';
  if (a.end === b.start) return 'MEETS';
  if (b.end === a.start) return 'MET_BY';
  if (a.start === b.start && a.end === b.end) return 'EQUALS';
  if (a.start < b.start && a.end < b.end && a.end > b.start) return 'OVERLAPS';
  if (b.start < a.start && b.end < a.end && b.end > a.start) return 'OVERLAPPED_BY';
  if (a.start === b.start && a.end < b.end) return 'STARTS';
  if (b.start === a.start && b.end < a.end) return 'STARTED_BY';
  if (a.start > b.start && a.end < b.end) return 'DURING';
  if (b.start > a.start && b.end < a.end) return 'CONTAINS';
  if (a.end === b.end && a.start > b.start) return 'FINISHES';
  if (b.end === a.end && b.start > a.start) return 'FINISHED_BY';
  return 'OVERLAPS';
}

// ── Invarianten-Checks ────────────────────────────────────────────────────────

/** I-R2: Totale Ordnung auf ℤ∞ */
export function compareValues(a: bigint, b: bigint): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** I-R3: Determinismus – MachineID ist deterministisch */
export function verifyDeterminism(domainName: string, value: bigint, version: string): boolean {
  const id1 = computeMachineId(domainName, value, version);
  const id2 = computeMachineId(domainName, value, version);
  return id1 === id2;
}

// ── Label-Formatierung ────────────────────────────────────────────────────────

/** ISO-8601-Label für einen TAI-Sekundenwert */
export function taiToLabel(taiSeconds: bigint): string {
  const utc = taiToUtc(taiSeconds);
  return secondsToISO8601(utc);
}

/** Aktuellen TAI-Nanosekunden-Wert */
export function nowTaiNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n + CURRENT_TAI_MINUS_UTC * 1_000_000_000n;
}
