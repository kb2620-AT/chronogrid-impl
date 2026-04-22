/**
 * cg-storage/src/repository.ts
 * Repository-Layer — CG-STD-4100 v0.5 Kap. 3
 * Abstrahiert alle DB-Operationen. Insert-only (I-D1).
 * Produktionsimplementierung: PostgreSQL mit node-postgres (pg).
 * Diese Datei: typsicheres Interface + In-Memory-Implementierung für Tests.
 */

import { createHash } from 'node:crypto';
import type { CTDDLDomain, CGTA, CGInterval } from 'cg-types/domain.js';
import { encodeCGTA } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import type { CGUASegment } from 'cg-cguas/cguas.js';

// ── Gespeicherte Zeitpunkt-Zeile (timepoints-Tabelle) ─────────────────────────
export interface TimepointRow {
  machine_id:     string;    // CHAR(64) — SHA-256 hex
  cgta_string:    string;    // vollständige CGTA
  domain_id:      string;    // "<name>/v<version>"
  absolute_value: bigint;    // NUMERIC(30) — kein Float
  granularity:    string;
  sigma?:         bigint;    // Messunsicherheit (optional)
  created_at:     string;    // TAI-CGTA
  created_by:     string;
}

// ── Manifest-Zeile (manifests-Tabelle) ────────────────────────────────────────
export interface ManifestRow {
  cgfi:           string;   // SHA-256 hex (PK)
  cgfs_version:   string;
  type_id:        string;
  type_schema:    string;
  created_at:     string;
  content_hash:   string;
  size_bytes?:    number;
  prev_version?:  string;
  cgua?:          string;
  valid_from?:    string;
  valid_until?:   string;
  retention?:     string;
  review_after?:  string;
  language?:      string;
  created_by:     string;
  tags?:          string[];
  access_level:   'public' | 'restricted' | 'confidential' | 'secret';
  deleted_at?:    string;
  deleted_reason?: string;
}

// ── Relation-Zeile (relations-Tabelle) ────────────────────────────────────────
export interface RelationRow {
  relation_id:   string;   // SHA-256 hex
  machine_id_a:  string;
  machine_id_b:  string;
  relation_type: string;   // Allen-Relation
  computed_at:   string;   // TAI-CGTA
}

// ── Repository-Interface (normativ) ───────────────────────────────────────────
// Alle Methoden sind Insert-only oder Read-only.
// Keine update()- oder delete()-Methoden auf Kerndaten.

export interface ITimepointRepository {
  insert(row: TimepointRow): Promise<void>;
  findByMachineId(machineId: string): Promise<TimepointRow | null>;
  findByDomainAndRange(domainId: string, min: bigint, max: bigint): Promise<TimepointRow[]>;
}

export interface IDomainRepository {
  insert(domain: CTDDLDomain, publishedAt: string, publishedBy: string): Promise<void>;
  findById(domainId: string): Promise<CTDDLDomain | null>;
  list(): Promise<CTDDLDomain[]>;
}

export interface IManifestRepository {
  insert(row: ManifestRow): Promise<void>;
  findByCGFI(cgfi: string): Promise<ManifestRow | null>;
  // Logisches Löschen (DSGVO Art. 17) — kein hartes DELETE
  softDelete(cgfi: string, deletedAt: string, reason: string): Promise<void>;
  getVersionChain(cgfi: string): Promise<ManifestRow[]>;
}

export interface IRelationRepository {
  insert(row: RelationRow): Promise<void>;
  findByPair(machineIdA: string, machineIdB: string): Promise<RelationRow[]>;
}

// ── In-Memory Implementierung (Tests / Sprint 3) ──────────────────────────────

export class InMemoryTimepointRepository implements ITimepointRepository {
  private readonly store = new Map<string, TimepointRow>();

  async insert(row: TimepointRow): Promise<void> {
    // Insert-only: kein Überschreiben (I-D1)
    if (this.store.has(row.machine_id)) {
      throw Errors.RegistryError.Conflict(row.machine_id);
    }
    // absolute_value darf kein Float sein (normativ)
    if (typeof row.absolute_value !== 'bigint') {
      throw Errors.InvariantError.I_R3({ reason: 'absolute_value muss BigInt sein, kein Float' });
    }
    this.store.set(row.machine_id, Object.freeze({ ...row }));
  }

  async findByMachineId(machineId: string): Promise<TimepointRow | null> {
    return this.store.get(machineId) ?? null;
  }

  async findByDomainAndRange(domainId: string, min: bigint, max: bigint): Promise<TimepointRow[]> {
    return [...this.store.values()].filter(r =>
      r.domain_id === domainId &&
      r.absolute_value >= min &&
      r.absolute_value <= max,
    );
  }

  get count(): number { return this.store.size; }
}

export class InMemoryDomainRepository implements IDomainRepository {
  private readonly store = new Map<string, { domain: CTDDLDomain; publishedAt: string; publishedBy: string }>();

  async insert(domain: CTDDLDomain, publishedAt: string, publishedBy: string): Promise<void> {
    const id = `${domain.name}/v${domain.version}`;
    if (this.store.has(id)) {
      throw Errors.RegistryError.Conflict(id);
    }
    // Integritäts-Hash über CTDDL-JSON
    const ctddlJson = JSON.stringify(domain);
    const integrityHash = createHash('sha256').update(ctddlJson).digest('hex');
    this.store.set(id, { domain: Object.freeze({ ...domain }), publishedAt, publishedBy });
  }

  async findById(domainId: string): Promise<CTDDLDomain | null> {
    return this.store.get(domainId)?.domain ?? null;
  }

  async list(): Promise<CTDDLDomain[]> {
    return [...this.store.values()].map(v => v.domain);
  }

  get count(): number { return this.store.size; }
}

export class InMemoryManifestRepository implements IManifestRepository {
  private readonly store = new Map<string, ManifestRow>();

  async insert(row: ManifestRow): Promise<void> {
    if (this.store.has(row.cgfi)) {
      throw Errors.CGFSError.NamespaceConflict(row.cgfi, row.type_id);
    }
    this.store.set(row.cgfi, Object.freeze({ ...row }));
  }

  async findByCGFI(cgfi: string): Promise<ManifestRow | null> {
    return this.store.get(cgfi) ?? null;
  }

  async softDelete(cgfi: string, deletedAt: string, reason: string): Promise<void> {
    const existing = this.store.get(cgfi);
    if (!existing) throw Errors.CGFSError.ManifestMissing();
    if (existing.deleted_at) {
      throw Errors.CGFSError.TombstoneExists(cgfi);
    }
    // Nur deleted_at und deleted_reason setzen — alle anderen Felder bleiben (I-D1)
    this.store.set(cgfi, Object.freeze({ ...existing, deleted_at: deletedAt, deleted_reason: reason }));
  }

  async getVersionChain(cgfi: string): Promise<ManifestRow[]> {
    const chain: ManifestRow[] = [];
    let current = this.store.get(cgfi);
    while (current) {
      chain.push(current);
      current = current.prev_version ? this.store.get(current.prev_version) : undefined;
    }
    return chain;
  }

  get count(): number { return this.store.size; }
  get activeCount(): number {
    return [...this.store.values()].filter(r => !r.deleted_at).length;
  }
}

export class InMemoryRelationRepository implements IRelationRepository {
  private readonly store = new Map<string, RelationRow>();

  async insert(row: RelationRow): Promise<void> {
    // relation_id = SHA-256(a || b || type) — deterministisch
    const expected = createHash('sha256')
      .update(row.machine_id_a + row.machine_id_b + row.relation_type)
      .digest('hex');
    if (row.relation_id !== expected) {
      throw Errors.InvariantError.I_R3({ reason: `relation_id muss SHA-256(a||b||type) sein` });
    }
    this.store.set(row.relation_id, Object.freeze({ ...row }));
  }

  async findByPair(machineIdA: string, machineIdB: string): Promise<RelationRow[]> {
    return [...this.store.values()].filter(
      r => r.machine_id_a === machineIdA && r.machine_id_b === machineIdB,
    );
  }
}

// ── Hilfsfunktion: Domain-ID aus Name + Version ────────────────────────────────
export function makeDomainId(name: string, version: number): string {
  return `${name}/v${version}`;
}

// ── Hilfsfunktion: RelationRow erstellen ──────────────────────────────────────
export function makeRelationRow(
  machineIdA: string,
  machineIdB: string,
  relationType: string,
  computedAt: string,
): RelationRow {
  const relation_id = createHash('sha256')
    .update(machineIdA + machineIdB + relationType)
    .digest('hex');
  return { relation_id, machine_id_a: machineIdA, machine_id_b: machineIdB, relation_type: relationType, computed_at: computedAt };
}

// ── ISegmentRepository Interface ──────────────────────────────────────────────
// Hier definiert damit repository-factory.ts es importieren kann
// ohne auf pg-repository.ts angewiesen zu sein.

export interface ISegmentRepository {
  insert(segment: CGUASegment, grantedAt: string, grantedBy: string): Promise<void>;
  findById(segmentId: string): Promise<CGUASegment | null>;
  findByAddress(cgua: bigint): Promise<CGUASegment | null>;
  listByOwner(ownerId: string): Promise<CGUASegment[]>;
  deactivate(segmentId: string): Promise<void>;
}

// ── InMemorySegmentRepository ─────────────────────────────────────────────────

export class InMemorySegmentRepository implements ISegmentRepository {
  private readonly store = new Map<string, CGUASegment>();

  async insert(segment: CGUASegment, _grantedAt: string, _grantedBy: string): Promise<void> {
    if (this.store.has(segment.segment_id)) return; // Idempotent
    this.store.set(segment.segment_id, Object.freeze({ ...segment }));
  }

  async findById(segmentId: string): Promise<CGUASegment | null> {
    return this.store.get(segmentId) ?? null;
  }

  async findByAddress(cgua: bigint): Promise<CGUASegment | null> {
    // Non-Root zuerst (spezifischstes Segment)
    const nonRoot = [...this.store.values()].filter(
      s => s.segment_id !== 'CG.CGUAS.ROOT' &&
           s.start_address <= cgua && cgua < s.end_address,
    );
    if (nonRoot.length > 0) {
      // Kleinstes (spezifischstes) Segment
      return nonRoot.sort((a, b) =>
        a.end_address - a.start_address < b.end_address - b.start_address ? -1 : 1,
      )[0] ?? null;
    }
    // Root als Fallback
    const root = this.store.get('CG.CGUAS.ROOT');
    if (root && root.start_address <= cgua && cgua < root.end_address) return root;
    return null;
  }

  async listByOwner(ownerId: string): Promise<CGUASegment[]> {
    return [...this.store.values()].filter(s => s.owner_id === ownerId);
  }

  async deactivate(_segmentId: string): Promise<void> {
    // In-Memory: kein Status-Tracking nötig
  }

  get count(): number { return this.store.size; }
}
