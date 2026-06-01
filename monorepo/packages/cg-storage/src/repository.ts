import type { CGTimepoint, CGDomain, CGManifest, CGRelation, CGUASegment } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import { SegmentRegistry } from 'cg-cguas/cguas.js';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ITimepointRepository {
  insert(tp: CGTimepoint): Promise<void>;
  findById(id: string): Promise<CGTimepoint | null>;
  list(limit?: number, offset?: number): Promise<CGTimepoint[]>;
}

export interface IDomainRepository {
  insert(d: CGDomain): Promise<void>;
  findByNameVersion(n: string, v: string): Promise<CGDomain | null>;
  list(): Promise<CGDomain[]>;
  publish(n: string, v: string): Promise<void>;
}

export interface IManifestRepository {
  insert(m: CGManifest): Promise<void>;
  findByCGFI(cgfi: string): Promise<CGManifest | null>;
  tombstone(cgfi: string): Promise<void>;
}

export interface IRelationRepository {
  insert(r: CGRelation): Promise<void>;
  list(): Promise<CGRelation[]>;
}

export interface ISegmentRepository {
  allocate(g: string, s: bigint, p?: string): Promise<CGUASegment>;
  resolve(id: string): Promise<CGUASegment>;
  revoke(id: string): Promise<void>;
  list(): Promise<CGUASegment[]>;
}

// ─── InMemoryTimepointRepository ─────────────────────────────────────────────

export class InMemoryTimepointRepository implements ITimepointRepository {
  private readonly s = new Map<string, CGTimepoint>();

  async insert(tp: CGTimepoint): Promise<void> {
    this.s.set(tp.machine_id, tp);
  }

  async findById(id: string): Promise<CGTimepoint | null> {
    return this.s.get(id) ?? null;
  }

  async list(l = 100, o = 0): Promise<CGTimepoint[]> {
    return [...this.s.values()].slice(o, o + l);
  }
}

// ─── InMemoryDomainRepository ─────────────────────────────────────────────────
//
// FIX-11 (In-Memory): Statuswechsel werden als Append-only-Ereignisliste
// geführt. publish() fügt einen Eintrag in _events hinzu statt den Domain-
// Datensatz zu mutieren. is_published wird zur Lesezeit abgeleitet.
// (I-S1 gilt normativ für PostgreSQL; In-Memory spiegelt das Muster.)

export class InMemoryDomainRepository implements IDomainRepository {
  private readonly s = new Map<string, CGDomain>();
  private readonly _events: Array<{ entityId: string; event: 'published' }> = [];

  async insert(d: CGDomain): Promise<void> {
    const k = `${d.name}@${d.version}`;
    if (this.s.has(k)) throw Errors.SemanticError.duplicateName(k);
    this.s.set(k, d);
  }

  async findByNameVersion(n: string, v: string): Promise<CGDomain | null> {
    const d = this.s.get(`${n}@${v}`);
    if (!d) return null;
    return this._withPublished(d);
  }

  async list(): Promise<CGDomain[]> {
    return [...this.s.values()].map(d => this._withPublished(d));
  }

  /**
   * FIX-11: kein Mutieren des Domain-Objekts mehr.
   * Publish = Append eines Ereignisses; zweiter Aufruf wirft wormViolation (I-S1).
   */
  async publish(n: string, v: string): Promise<void> {
    const k = `${n}@${v}`;
    if (!this.s.has(k)) throw Errors.VersionError.notFound(k);
    if (this._events.some(e => e.entityId === k && e.event === 'published'))
      throw Errors.CGFSError.wormViolation('Bereits publiziert');
    this._events.push({ entityId: k, event: 'published' });
  }

  private _withPublished(d: CGDomain): CGDomain {
    const k = `${d.name}@${d.version}`;
    const published = d.published ||
      this._events.some(e => e.entityId === k && e.event === 'published');
    return { ...d, published };
  }
}

// ─── InMemoryManifestRepository ───────────────────────────────────────────────
//
// FIX-11 (In-Memory): tombstone() fügt Ereignis in _events ein statt
// das Manifest-Objekt zu überschreiben.

export class InMemoryManifestRepository implements IManifestRepository {
  private readonly s = new Map<string, CGManifest>();
  private readonly _events: Array<{ entityId: string; event: 'tombstoned' }> = [];

  async insert(m: CGManifest): Promise<void> {
    this.s.set(m.cgfi, m);
  }

  async findByCGFI(cgfi: string): Promise<CGManifest | null> {
    const m = this.s.get(cgfi);
    if (!m) return null;
    return this._withTombstone(m);
  }

  /**
   * FIX-11: kein Map.set({...m, tombstone:true}) mehr.
   * Tombstone = Append eines Ereignisses; idempotent (kein Fehler bei Wiederholung).
   */
  async tombstone(cgfi: string): Promise<void> {
    if (!this.s.has(cgfi)) throw Errors.CGFSError.fileNotFound(cgfi);
    if (!this._events.some(e => e.entityId === cgfi && e.event === 'tombstoned'))
      this._events.push({ entityId: cgfi, event: 'tombstoned' });
  }

  private _withTombstone(m: CGManifest): CGManifest {
    const tombstone = m.tombstone ||
      this._events.some(e => e.entityId === m.cgfi && e.event === 'tombstoned');
    return { ...m, tombstone };
  }
}

// ─── InMemoryRelationRepository ───────────────────────────────────────────────

export class InMemoryRelationRepository implements IRelationRepository {
  private readonly s: CGRelation[] = [];

  async insert(r: CGRelation): Promise<void> {
    this.s.push(r);
  }

  async list(): Promise<CGRelation[]> {
    return [...this.s];
  }
}

// ─── InMemorySegmentRepository ────────────────────────────────────────────────

export class InMemorySegmentRepository implements ISegmentRepository {
  private readonly r = new SegmentRegistry();

  async allocate(g: string, s: bigint, p?: string): Promise<CGUASegment> {
    return this.r.allocate(g, s, p);
  }

  async resolve(id: string): Promise<CGUASegment> {
    return this.r.resolve(id);
  }

  async revoke(id: string): Promise<void> {
    this.r.revoke(id);
  }

  async list(): Promise<CGUASegment[]> {
    return this.r.list();
  }
}
