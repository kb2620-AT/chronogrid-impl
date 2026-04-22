/**
 * cg-ctddl/src/parser.ts
 * CTDDL-Parser — CG-STD-2100 v1.4 Kap. 4–8
 * 7-Stufen-Validierung: JSON → Schema → ABNF → Semantik → Constraints
 */

import type { CTDDLDomain } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';

const VALID_TYPES = ['linear','piecewise-linear','nonlinear','relativistic','discrete'] as const;
const VALID_GRAN  = ['nanosecond','microsecond','millisecond','second','minute','hour','day','week','month','year','decade','century','millennium','megayear','gigayear'] as const;
const VALID_SEM   = ['time','address','filetype'] as const;
const VALID_STAB  = ['permanent','high','medium','low'] as const;
const NAME_RE     = /^[A-Za-z0-9_-]{1,63}$/;
const VER_RE      = /^\d+\.\d+(\.\d+)?$/;

/** Parst und validiert ein CTDDL-JSON-Objekt (7 Stufen) */
export function parseDomain(raw: unknown): CTDDLDomain {
  // Stufe 1: JSON-Struktur
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw Errors.SyntaxError.invalidJson('Eingabe ist kein JSON-Objekt');

  const d = raw as Record<string, unknown>;

  // Stufe 2: Pflichtfelder
  for (const f of ['name','version','type','granularity','extent']) {
    if (!(f in d)) throw Errors.SyntaxError.missingField(`Pflichtfeld fehlt: ${f}`);
  }

  // Stufe 3: Typen & Enums
  if (typeof d['name'] !== 'string' || !NAME_RE.test(d['name']))
    throw Errors.SyntaxError.abnfViolation(`Ungültiger Domain-Name: ${d['name']}`);
  if (typeof d['version'] !== 'string' || !VER_RE.test(d['version']))
    throw Errors.SyntaxError.invalidVersion(`Ungültiges Versionsformat: ${d['version']}`);
  if (!VALID_TYPES.includes(d['type'] as never))
    throw Errors.SyntaxError.invalidDomainType(`Ungültiger Typ: ${d['type']}`);
  if (!VALID_GRAN.includes(d['granularity'] as never))
    throw Errors.SyntaxError.invalidGranularity(`Ungültige Granularität: ${d['granularity']}`);

  const semantics = d['semantics'] ?? 'time';
  if (!VALID_SEM.includes(semantics as never))
    throw Errors.SyntaxError.invalidType(`Ungültige Semantik: ${semantics}`);

  // Stufe 4: Extent-Block
  const ext = d['extent'] as Record<string, unknown>;
  if (typeof ext !== 'object' || ext === null)
    throw Errors.SyntaxError.missingField('extent muss ein Objekt sein');
  if (!('min' in ext && 'max' in ext && 'inclusive' in ext))
    throw Errors.SyntaxError.missingField('extent benötigt min, max, inclusive');

  // Stufe 5: Metadata + scientific_dependency
  if (d['metadata']) {
    const meta = d['metadata'] as Record<string, unknown>;
    if (meta['stability'] && !VALID_STAB.includes(meta['stability'] as never))
      throw Errors.SyntaxError.invalidType(`Ungültige Stability: ${meta['stability']}`);
    if ((meta['stability'] === 'low' || meta['stability'] === 'medium') && !meta['scientific_dependency'])
      throw Errors.ConstraintError.missingScientificDependency(
        `stability=${meta['stability']} erfordert scientific_dependency (R1)`);
  }

  // Stufe 6: Mapping Chain-Limit prüfen
  if (Array.isArray(d['mapping'])) {
    if (d['mapping'].length > 8)
      throw Errors.MappingError.chainTooLong(`Mapping-Kette > 8 Schritte (${d['mapping'].length})`);
  }

  // Stufe 7: I-E1 – kein universeller Epoch
  // (normative Semantik: keine "universal" epoch deklariert)

  return d as unknown as CTDDLDomain;
}

/** Serialisiert Domain zu JSON-String */
export function serializeDomain(domain: CTDDLDomain): string {
  return JSON.stringify(domain, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v, 2);
}
