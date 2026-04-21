/**
 * cg-ctddl/src/parser.ts
 * CTDDL-Domain-Parser — CG-STD-2100 v1.4
 *
 * Normative Anforderungen:
 * - Alle Pflichtfelder gemäß ABNF Kap. 4 prüfen
 * - Fehler als CGError mit normativem Code werfen (Kap. 9)
 * - Kein Netzwerkzugriff, keine externen Zustände (CG-STD-3100 Kap. 2.3)
 * - Pure function: gleicher Input → gleicher Output (I-R3)
 */

import type { CTDDLDomain, DomainSemantics, DomainType, MappingBlock, ScientificDependency } from '../../cg-types/src/domain.ts';
import { Errors } from '../../cg-types/src/errors.ts';

// ── Normative Enum-Listen (CG-STD-2100 Kap. 4) ───────────────────────────────
const VALID_SEMANTICS = new Set<string>(['time', 'address', 'filetype']);
const VALID_TYPES = new Set<string>([
  'linear', 'piecewise-linear', 'nonlinear', 'relativistic', 'discrete',
]);
const VALID_CLASSES = new Set<string>(['A', 'B']);
const VALID_STABILITY = new Set<string>(['high', 'medium', 'low']);

// SemVer-Regex für Domain-Name (CG-STD-2100 Kap. 4.1)
// Format: category/name oder category/subcategory/name
const DOMAIN_NAME_REGEX = /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*){1,3}$/;

// ── Hauptparser (normativ) ────────────────────────────────────────────────────

/**
 * Parst und validiert eine CTDDL-Domain-Definition.
 * Wirft CGError bei Verstößen (CG-STD-2100 Kap. 9).
 * Pure function — keine Seiteneffekte.
 */
export function parseCTDDL(input: string | object): CTDDLDomain {
  // ── Schritt 1: JSON-Parsing ──────────────────────────────────────────────
  let raw: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input) as Record<string, unknown>;
    } catch {
      throw Errors.SyntaxError.InvalidJSON({ input: input.slice(0, 100) });
    }
  } else {
    raw = input as Record<string, unknown>;
  }

  // ── Schritt 2: Pflichtfelder prüfen (CG-E-001.002) ──────────────────────
  const required = ['name', 'version', 'type', 'granularity', 'extent', 'epoch'];
  for (const field of required) {
    if (!(field in raw) || raw[field] === undefined || raw[field] === null) {
      throw Errors.SyntaxError.MissingField(field);
    }
  }

  // ── Schritt 3: Feldtypen prüfen (CG-E-001.003) ──────────────────────────
  if (typeof raw.name !== 'string') {
    throw Errors.SyntaxError.InvalidFieldType('name', 'string', typeof raw.name);
  }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    throw Errors.SyntaxError.InvalidFieldType('version', 'positive integer', String(raw.version));
  }
  if (typeof raw.granularity !== 'string' && typeof raw.granularity !== 'number') {
    throw Errors.SyntaxError.InvalidFieldType('granularity', 'string|number', typeof raw.granularity);
  }

  // ── Schritt 4: Domain-Name ABNF (CG-E-001.007) ──────────────────────────
  if (!DOMAIN_NAME_REGEX.test(raw.name as string)) {
    throw Errors.SyntaxError.ABNFViolation({ field: 'name', value: raw.name });
  }

  // ── Schritt 5: Enum-Felder (CG-E-001.004, 005) ──────────────────────────
  if (!VALID_TYPES.has(raw.type as string)) {
    throw Errors.SyntaxError.InvalidDomainType(String(raw.type));
  }

  // semantics: optional, Standard 'time' (CG-STD-2100 Kap. 3 Rückwärtskompatibilität)
  const semantics: DomainSemantics = (raw.semantics as DomainSemantics) ?? 'time';
  if (!VALID_SEMANTICS.has(semantics)) {
    throw Errors.SyntaxError.InvalidFieldType('semantics', 'time|address|filetype', semantics);
  }

  if (raw.stability !== undefined && !VALID_STABILITY.has(raw.stability as string)) {
    throw Errors.SyntaxError.InvalidFieldType('stability', 'high|medium|low', String(raw.stability));
  }

  // ── Schritt 6: scientific_dependency Pflicht bei stability=low|medium (CG-E-008.001) ─
  if (raw.stability === 'low' || raw.stability === 'medium') {
    if (!raw.scientific_dependency) {
      throw Errors.ConstraintError.MissingScientificDependency(raw.stability as string);
    }
  }

  // ── Schritt 7: extent validieren ────────────────────────────────────────
  const extent = raw.extent as Record<string, unknown>;
  if (typeof extent !== 'object' || extent === null) {
    throw Errors.SyntaxError.InvalidFieldType('extent', 'object', typeof extent);
  }

  let extentMin: bigint | null = null;
  let extentMax: bigint | null = null;

  if (extent.min !== null && extent.min !== undefined) {
    try { extentMin = BigInt(extent.min as string | number); }
    catch { throw Errors.SyntaxError.InvalidFieldType('extent.min', 'BigInt-kompatibel', String(extent.min)); }
  }
  if (extent.max !== null && extent.max !== undefined) {
    try { extentMax = BigInt(extent.max as string | number); }
    catch { throw Errors.SyntaxError.InvalidFieldType('extent.max', 'BigInt-kompatibel', String(extent.max)); }
  }

  // extent.min <= extent.max wenn beide gesetzt (CG-E-003.003)
  if (extentMin !== null && extentMax !== null && extentMin > extentMax) {
    throw Errors.ExtentError.MinGreaterThanMax(extentMin, extentMax);
  }

  // ── Schritt 8: epoch validieren ──────────────────────────────────────────
  const epoch = raw.epoch as Record<string, unknown>;
  if (typeof epoch !== 'object' || epoch === null) {
    throw Errors.SyntaxError.InvalidFieldType('epoch', 'object', typeof epoch);
  }
  if (typeof epoch.reference !== 'string') {
    throw Errors.SyntaxError.MissingField('epoch.reference');
  }
  if (typeof epoch.tai_offset !== 'number') {
    throw Errors.SyntaxError.MissingField('epoch.tai_offset');
  }

  // ── Schritt 9: mappings validieren ──────────────────────────────────────
  if (raw.mappings !== undefined) {
    if (!Array.isArray(raw.mappings)) {
      throw Errors.SyntaxError.InvalidFieldType('mappings', 'array', typeof raw.mappings);
    }
    for (const [i, m] of (raw.mappings as unknown[]).entries()) {
      validateMappingBlock(m, i);
    }

    // Mapping-Kette > 8 Schritte (CG-E-005.010)
    if ((raw.mappings as unknown[]).length > 8) {
      throw Errors.MappingError.ChainTooLong((raw.mappings as unknown[]).length);
    }
  }

  // ── Schritt 10: granularity BigInt-kompatibel ────────────────────────────
  try {
    BigInt(raw.granularity as string | number);
  } catch {
    throw Errors.SyntaxError.InvalidGranularity(raw.granularity);
  }

  // ── Ergebnis zusammenbauen ───────────────────────────────────────────────
  const epochObj: { reference: string; tai_offset: number; rationale?: string } = {
    reference: epoch.reference as string,
    tai_offset: epoch.tai_offset as number,
  };
  if (epoch.rationale !== undefined) {
    epochObj.rationale = epoch.rationale as string;
  }

  const result: CTDDLDomain = {
    name: raw.name as string,
    version: raw.version as number,
    semantics,
    type: raw.type as DomainType,
    granularity: String(raw.granularity),
    extent: {
      min: extent.min !== null && extent.min !== undefined ? String(extent.min) : null,
      max: extent.max !== null && extent.max !== undefined ? String(extent.max) : null,
    },
    epoch: epochObj,
  };

  if (raw.description !== undefined) {
    result.description = raw.description as string;
  }
  if (raw.stability !== undefined) {
    result.stability = raw.stability as 'high' | 'medium' | 'low';
  }
  if (raw.mappings !== undefined) {
    result.mappings = raw.mappings as MappingBlock[];
  }
  if (raw.scientific_dependency !== undefined) {
    result.scientific_dependency = raw.scientific_dependency as ScientificDependency;
  }
  if (raw.deprecated !== undefined) {
    result.deprecated = raw.deprecated as boolean;
  }
  if (raw.migration_to !== undefined) {
    result.migration_to = raw.migration_to as string;
  }

  return result;
}

// ── Mapping-Block validieren ──────────────────────────────────────────────────
function validateMappingBlock(m: unknown, index: number): void {
  if (typeof m !== 'object' || m === null) {
    throw Errors.SyntaxError.InvalidFieldType(`mappings[${index}]`, 'object', typeof m);
  }
  const mb = m as Record<string, unknown>;

  for (const field of ['targetDomain', 'targetVersion', 'class', 'function']) {
    if (!(field in mb) || mb[field] === undefined) {
      throw Errors.SyntaxError.MissingField(`mappings[${index}].${field}`);
    }
  }

  if (!VALID_CLASSES.has(mb.class as string)) {
    throw Errors.SyntaxError.InvalidFieldType(`mappings[${index}].class`, 'A|B', String(mb.class));
  }
}

// ── Registry (in-memory, ersetzt Schritt für Schritt durch cg-storage) ────────

/** Einfache In-Memory-Registry für Domains — wird in Sprint 3 durch DB ersetzt */
export class DomainRegistry {
  private readonly store = new Map<string, Map<number, CTDDLDomain>>();

  /** Registriert eine Domain. Wirft CG-E-009.001 bei Duplikat. */
  register(domain: CTDDLDomain): void {
    const key = domain.name;
    if (!this.store.has(key)) {
      this.store.set(key, new Map());
    }
    const versions = this.store.get(key)!;

    // Rollback verhindern (CG-E-007.004)
    const existingVersions = [...versions.keys()];
    const maxExisting = existingVersions.length > 0 ? Math.max(...existingVersions) : 0;
    if (domain.version <= maxExisting) {
      throw Errors.VersionError.RollbackAttempt(`${domain.name} v${domain.version}`);
    }

    if (versions.has(domain.version)) {
      throw Errors.RegistryError.Conflict(`${domain.name}/v${domain.version}`);
    }

    // I-D1: Domain nach Publikation unveränderlich
    versions.set(domain.version, Object.freeze({ ...domain }));
  }

  /** Holt eine Domain. Wirft CG-E-007.001 wenn nicht gefunden. */
  get(name: string, version: number): CTDDLDomain {
    const versions = this.store.get(name);
    if (!versions?.has(version)) {
      throw Errors.VersionError.NotFound(name, version);
    }
    return versions.get(version)!;
  }

  /** Alle registrierten Domain-Namen */
  listNames(): string[] {
    return [...this.store.keys()];
  }

  /** Alle Versionen einer Domain */
  listVersions(name: string): number[] {
    return [...(this.store.get(name)?.keys() ?? [])].sort();
  }
}