/**
 * cg-storage/src/repository.ts
 * Repository-Interfaces und In-Memory-Implementierungen
 * CG-STD-4100 v0.7 Kap. 3 | I-D1 + I-S1 (Insert-only)
 *
 * SPRINT 7: Interfaces sind jetzt klar getrennt von Implementierungen.
 * APIContext in handlers.ts verwendet nur noch Interfaces.
 */

import type { CGTimepoint, CGDomain, CGManifest, CGRelation, CGUASegment, AllenRelation } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import { SegmentRegistry } from 'cg-cguas/cguas.js';

// ── Repository-Interfaces (Sprint 7) ─────────────────────────────────────────

export interface ITimepointRepository {
  insert(tp: CGTimepoint): Promise<void>;
  findById(machineId: string): Promise<CGTimepoint | null>;
  list(limit?: number, offset?: number): Promise<CGTimepoint[]>;
}

export interface IDomainRepository {
  insert(domain: CGDomain): Promise<void>;
  findByNameVersion(name: string, version: string): Promise<CGDomain | null>;
  list(): Promise<CGDomain[]>;
  publish(name: string, version: string): Promise<void>;
}

export interface IManifestRepository {
  insert(manifest: CGManifest): Promise<void>;
  findByCGFI(cgfi: string): Promise<CGManifest | null>;
  tombstone(cgfi: string): Promise<void>;
}

export interface IRelationRepository {
  insert(relation: CGRelation): Promise<void>;
  list(): Promise<CGRelation[]>;
}

export interface ISegmentRepository {
  allocate(grantedBy: string, sizeNs: bigint, parentId?: string): Promise<CGUASegment>;
  resolve(segmentId: string): Promise<CGUASegment>;
  revoke(segmentId: string): Promise<void>;
  list(): Promise<CGUASegment[]>;
}

// ── In-Memory-Implementierungen ───────────────────────────────────────────────

export class InMemoryTimepointRepository implements ITimepointRepository {
  private readonly store = new Map<string, CGTimepoint>();
  async insert(tp: CGTimepoint): Promise<void> { this.store.set(tp.machine_id, tp); }
  async findById(id: string): Promise<CGTimepoint | null> { return this.store.get(id) ?? null; }
  async list(limit = 100, offset = 0): Promise<CGTimepoint[]> {
    return [...this.store.values()].slice(offset, offset + limit);
  }
}

export class InMemoryDomainRepository implements IDomainRepository {
  private readonly store = new Map<string, CGDomain>();
  async insert(d: CGDomain): Promise<void> {
    const key = `${d.name}@${d.version}`;
    if (this.store.has(key)) throw Errors.SemanticError.duplicateName(`Domain bereits registriert: ${key}`);
    this.store.set(key, d);
  }
  async findByNameVersion(name: string, version: string): Promise<CGDomain | null> {
    return this.store.get(`${name}@${version}`) ?? null;
  }
  async list(): Promise<CGDomain[]> { return [...this.store.values()]; }
  async publish(name: string, version: string): Promise<void> {
    const d = this.store.get(`${name}@${version}`);
    if (!d) throw Errors.VersionError.notFound(`${name}@${version}`);
    if (d.published) throw Errors.CGFSError.wormViolation('Domain bereits publiziert (I-D1)');
    this.store.set(`${name}@${version}`, { ...d, published: true, published_at: BigInt(Date.now()) * 1_000_000n });
  }
}

export class InMemoryManifestRepository implements IManifestRepository {
  private readonly store = new Map<string, CGManifest>();
  async insert(m: CGManifest): Promise<void> { this.store.set(m.cgfi, m); }
  async findByCGFI(cgfi: string): Promise<CGManifest | null> { return this.store.get(cgfi) ?? null; }
  async tombstone(cgfi: string): Promise<void> {
    const m = this.store.get(cgfi);
    if (!m) throw Errors.CGFSError.fileNotFound(cgfi);
    this.store.set(cgfi, { ...m, tombstone: true });
  }
}

export class InMemoryRelationRepository implements IRelationRepository {
  private readonly store: CGRelation[] = [];
  async insert(r: CGRelation): Promise<void> { this.store.push(r); }
  async list(): Promise<CGRelation[]> { return [...this.store]; }
}

export class InMemorySegmentRepository implements ISegmentRepository {
  private readonly registry = new SegmentRegistry();
  async allocate(g: string, s: bigint, p?: string): Promise<CGUASegment> { return this.registry.allocate(g, s, p); }
  async resolve(id: string): Promise<CGUASegment> { return this.registry.resolve(id); }
  async revoke(id: string): Promise<void> { this.registry.revoke(id); }
  async list(): Promise<CGUASegment[]> { return this.registry.list(); }
}
