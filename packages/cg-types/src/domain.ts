/**
 * cg-types/src/domain.ts
 * Kerndatentypen für CTDDL-Domains — CG-STD-2100 v1.4
 * Alle Typen sind normativ. Kommentare referenzieren Kapitel.
 */

// ── Domain-Semantik (CG-STD-2100 Kap. 4.1) ──────────────────────────────────
export type DomainSemantics = 'time' | 'address' | 'filetype';

// ── Domain-Typ (CG-STD-2100 Kap. 4.2) ────────────────────────────────────────
export type DomainType =
  | 'linear'
  | 'piecewise-linear'
  | 'nonlinear'
  | 'relativistic'
  | 'discrete';

// ── Mapping-Klasse (CG-STD-2100 Kap. 5) ──────────────────────────────────────
export type MappingClass = 'A' | 'B';

// ── Stability (CG-STD-2100 Kap. 6.4) ─────────────────────────────────────────
export type DomainStability = 'high' | 'medium' | 'low';

// ── scientific_dependency (CG-STD-2100 Kap. 6.4) ─────────────────────────────
export interface ScientificDependency {
  model: string;           // z.B. "Planck-2018"
  reference: string;       // Vollständige Literaturangabe
  [key: string]: unknown;  // weitere Parameter (H0, etc.)
}

// ── Mapping-Block (CG-STD-2100 Kap. 5) ───────────────────────────────────────
export interface MappingBlock {
  targetDomain: string;     // Name der Ziel-Domain
  targetVersion: number;    // Version der Ziel-Domain
  class: MappingClass;      // A = piecewise-linear, B = relativistisch
  function: string;         // Name der Mapping-Funktion
  leapSecondsRef?: string;  // für piecewise-linear UTC↔TAI
  accuracy?: number;        // für Klasse-B (Fehlertoleranz s/s)
  [key: string]: unknown;
}

// ── CTDDL-Domain-Definition (CG-STD-2100 Kap. 4) ─────────────────────────────
export interface CTDDLDomain {
  name: string;             // Pflicht: Domain-Name z.B. "aviation/atc-event"
  version: number;          // Pflicht: positive integer
  semantics: DomainSemantics; // Pflicht (NEU v1.2): 'time' | 'address' | 'filetype'
  type: DomainType;         // Pflicht
  granularity: string;      // Pflicht: Nanosekunden als String (BigInt-sicher)
  description?: string;     // Optional
  stability?: DomainStability; // Optional
  extent: {
    min: string | null;     // BigInt als String, null = unbegrenzt rückwärts
    max: string | null;     // BigInt als String, null = unbegrenzt vorwärts
  };
  epoch: {
    reference: string;      // ISO 8601 UTC-String
    tai_offset: number;     // TAI-UTC-Offset zum Referenzzeitpunkt (Sekunden)
    rationale?: string;     // Optional
  };
  mappings?: MappingBlock[];  // Optional: Klasse-A oder Klasse-B
  scientific_dependency?: ScientificDependency; // Pflicht wenn stability=low|medium
  deprecated?: boolean;       // Optional, Standard: false
  migration_to?: string;      // Optional, wenn deprecated=true
  [key: string]: unknown;
}

// ── CGTA — ChronoGrid Time Address (CG-STD-3100 Kap. 3.3) ───────────────────
// Format: "CG:<domain>:<value>/v<version>"
// Beispiel: "CG:TAI:1743585310000000000/v1"
export interface CGTA {
  domain: string;        // Domain-Name
  value: bigint;         // ℤ∞ — Zeitwert in Nanosekunden (granularitätsnormiert)
  version: number;       // Domain-Version
  sigma?: bigint;        // Messunsicherheit in Nanosekunden (optional, CG-STD-6100)
}

// ── String-Kodierung (normativ) ───────────────────────────────────────────────
export function encodeCGTA(cgta: CGTA): string {
  const sig = cgta.sigma !== undefined ? `:σ${cgta.sigma}` : '';
  return `CG:${cgta.domain}:${cgta.value}${sig}/v${cgta.version}`;
}

// Regex für CGTA-Parsing (ABNF CG-STD-2100 Kap. 4.1)
const CGTA_REGEX = /^CG:([^:]+):(-?\d+)(?::σ(\d+))?\/v(\d+)$/;

export function parseCGTA(raw: string): CGTA {
  const m = CGTA_REGEX.exec(raw);
  if (!m) {
    throw new Error(`CG-E-001.007: Ungültiges CGTA-Format: ${raw}`);
  }
  const result: CGTA = {
    domain: m[1],
    value: BigInt(m[2]),
    version: parseInt(m[4], 10),
  };
  if (m[3] !== undefined) {
    result.sigma = BigInt(m[3]);
  }
  return result;
}

// ── Allen-Intervall (CG-STD-3100 Kap. 9) ─────────────────────────────────────
export interface CGInterval {
  start: bigint;  // Inklusiv
  end: bigint;    // Inklusiv (für Punktereignisse: start === end)
  domain: string;
  version: number;
}

// ── MachineID-Struktur (CG-STD-3100 Kap. 5.1) ────────────────────────────────
// SHA-256 über kanonisch serialisierten TAI-Wert (BigInt, Big-Endian)
export type MachineID = Uint8Array; // 32 Bytes

// ── CGFI (CG-STD-3100 Kap. 5.4) ──────────────────────────────────────────────
// SHA-256 über: tai_prefix || tai_sign || tai_bytes || content_hash || type_bytes
export type CGFI = Uint8Array; // 32 Bytes

// ── Konformitätslevel (CG-STD-3100 Kap. 11) ──────────────────────────────────
export type ConformanceLevel = 1 | 2 | 3;

// ── Fehlerstruktur re-export ──────────────────────────────────────────────────
export { CGError, Errors } from './errors.ts';