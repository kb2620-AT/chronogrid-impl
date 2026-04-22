/**
 * cg-types/src/domain.ts
 * CTDDL Domain-Typen — CG-STD-2100 v1.4
 */

export type DomainType = 'linear' | 'piecewise-linear' | 'nonlinear' | 'relativistic' | 'discrete';
export type Granularity = 'nanosecond'|'microsecond'|'millisecond'|'second'|'minute'|'hour'|'day'|'week'|'month'|'year'|'decade'|'century'|'millennium'|'megayear'|'gigayear';
export type Semantics = 'time' | 'address' | 'filetype';
export type Stability = 'permanent' | 'high' | 'medium' | 'low';

export interface Extent {
  min: string | number;
  max: string | number;
  inclusive: boolean;
}

export interface HierarchyEntry {
  unit: string;
  factor: number | { type: 'variable'; rule: string };
  baseSeconds?: number;
}

export interface FormatSpec {
  type: 'iso8601' | 'integer' | 'decimal' | 'custom';
  pattern?: string;
}

export interface RefPoint {
  source: string;
  target: string;
  label?: string;
}

export interface MappingRule {
  targetDomain: string;
  targetVersion: string;
  type: 'linear' | 'piecewise-linear' | 'nonlinear' | 'relativistic';
  refPoints?: RefPoint[];
  segments?: Array<{ from: string; to: string; refPoints: RefPoint[] }>;
  expr?: string;
}

export interface ScientificDependency {
  parameter: string;
  value: string;
  uncertainty_abs?: string;
  uncertainty_rel: string;
  source: string;
  source_doi: string;
  review_trigger: string;
}

export interface Metadata {
  stability: Stability;
  scientific_dependency?: ScientificDependency;
  notes?: string;
}

export interface CTDDLDomain {
  name: string;
  version: string;
  type: DomainType;
  granularity: Granularity;
  semantics?: Semantics;
  extent: Extent;
  hierarchy?: HierarchyEntry[];
  format?: FormatSpec;
  mapping?: MappingRule[];
  metadata?: Metadata;
}

/** CGTA – ChronoGrid Time Address */
export interface CGTA {
  domain: string;
  value: bigint;
  timezone?: 'UTC' | 'TAI' | 'none';
  version: number;
}

/** CGTimepoint – normatives Datenmodell (CG-STD-4100 Kap. 3.2) */
export interface CGTimepoint {
  machine_id: string;        // SHA-256 Primärschlüssel
  domain_name: string;
  domain_version: string;
  absolute_value: bigint;    // ℤ∞ – BigInt
  cgta: string;              // Serialisierte CGTA
  labels: Record<string, string>;
  created_at: bigint;        // TAI-Nanosekunden
}

/** CGDomain – Registry-Eintrag */
export interface CGDomain {
  name: string;
  version: string;
  definition: CTDDLDomain;
  published: boolean;
  published_at?: bigint;
  created_at: bigint;
}

/** CGManifest – Datei-Fingerabdruck (CGFI) */
export interface CGManifest {
  cgfi: string;              // SHA-256 Fingerabdruck
  tai_timepoint: string;     // MachineID des TAI-Zeitpunkts
  content_hash: string;      // SHA-256 des Datei-Inhalts
  type_id: string;           // FileType-ID
  size_bytes: bigint;
  metadata: Record<string, string>;
  tombstone: boolean;
  created_at: bigint;
}

/** CGRelation – Allen-Relation Ergebnis */
export interface CGRelation {
  id: string;
  timepoint_a: string;
  timepoint_b: string;
  relation: AllenRelation;
  computed_at: bigint;
}

/** Allen-Relationen (CG-STD-3100 Kap. 9) */
export type AllenRelation =
  | 'BEFORE' | 'AFTER'
  | 'MEETS' | 'MET_BY'
  | 'OVERLAPS' | 'OVERLAPPED_BY'
  | 'STARTS' | 'STARTED_BY'
  | 'DURING' | 'CONTAINS'
  | 'FINISHES' | 'FINISHED_BY'
  | 'EQUALS';

/** CGUASegment – Adressraum-Segment (CG-STD-6100 Teil A) */
export interface CGUASegment {
  id: string;
  parent_id: string | null;
  base_address: bigint;
  size_ns: bigint;
  granted_by: string;
  status: 'active' | 'reserved' | 'revoked';
  created_at: bigint;
}
