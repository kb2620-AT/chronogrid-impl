/**
 * cg-storage/src/pg-repository.ts
 * PostgreSQL Repository-Implementierungen — CG-STD-4100 v0.7 Kap. 3.2–3.10
 * Alle Tabellen Insert-only (I-D1, I-S1). BigInt als NUMERIC(30).
 */

import pg from 'pg';
import type { CGTimepoint, CGDomain, CGManifest, CGRelation, CGUASegment } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import type {
  ITimepointRepository, IDomainRepository,
  IManifestRepository, IRelationRepository, ISegmentRepository,
} from './repository.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function bigStr(v: bigint): string { return v.toString(); }
function toBig(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'string') return BigInt(v);
  if (typeof v === 'number') return BigInt(Math.round(v));
  return 0n;
}

// ── PgTimepointRepository ─────────────────────────────────────────────────────

export class PgTimepointRepository implements ITimepointRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(tp: CGTimepoint): Promise<void> {
    await this.pool.query(
      `INSERT INTO timepoints (machine_id, domain_name, domain_version, absolute_value, cgta, labels, created_at)
       VALUES ($1,$2,$3,$4::NUMERIC,$5,$6::jsonb,$7::NUMERIC)
       ON CONFLICT (machine_id) DO NOTHING`,
      [tp.machine_id, tp.domain_name, tp.domain_version, bigStr(tp.absolute_value),
       tp.cgta, JSON.stringify(tp.labels), bigStr(tp.created_at)],
    );
  }

  async findById(machineId: string): Promise<CGTimepoint | null> {
    const res = await this.pool.query(
      'SELECT * FROM timepoints WHERE machine_id = $1', [machineId]);
    if (!res.rows[0]) return null;
    return this.rowToTimepoint(res.rows[0]);
  }

  async list(limit = 100, offset = 0): Promise<CGTimepoint[]> {
    const res = await this.pool.query(
      'SELECT * FROM timepoints ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return res.rows.map(r => this.rowToTimepoint(r));
  }

  private rowToTimepoint(r: Record<string, unknown>): CGTimepoint {
    return {
      machine_id: r['machine_id'] as string,
      domain_name: r['domain_name'] as string,
      domain_version: r['domain_version'] as string,
      absolute_value: toBig(r['absolute_value']),
      cgta: r['cgta'] as string,
      labels: (typeof r['labels'] === 'object' && r['labels'] !== null ? r['labels'] : {}) as Record<string,string>,
      created_at: toBig(r['created_at']),
    };
  }
}

// ── PgDomainRepository ────────────────────────────────────────────────────────

export class PgDomainRepository implements IDomainRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(d: CGDomain): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO domains (name, version, definition, published, created_at)
         VALUES ($1,$2,$3::jsonb,$4,$5::NUMERIC)`,
        [d.name, d.version, JSON.stringify(d.definition), d.published, bigStr(d.created_at)],
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('unique')) {
        throw Errors.SemanticError.duplicateName(`Domain bereits registriert: ${d.name}@${d.version}`);
      }
      throw err;
    }
  }

  async findByNameVersion(name: string, version: string): Promise<CGDomain | null> {
    const res = await this.pool.query(
      'SELECT * FROM domains WHERE name=$1 AND version=$2', [name, version]);
    if (!res.rows[0]) return null;
    const r = res.rows[0] as Record<string, unknown>;
    return {
      name: r['name'] as string, version: r['version'] as string,
      definition: typeof r['definition'] === 'string' ? JSON.parse(r['definition']) : r['definition'],
      published: r['published'] as boolean,
      published_at: r['published_at'] ? toBig(r['published_at']) : undefined,
      created_at: toBig(r['created_at']),
    };
  }

  async list(): Promise<CGDomain[]> {
    const res = await this.pool.query('SELECT * FROM domains ORDER BY created_at');
    return res.rows.map(r => ({
      name: r['name'] as string, version: r['version'] as string,
      definition: typeof r['definition'] === 'string' ? JSON.parse(r['definition']) : r['definition'],
      published: r['published'] as boolean,
      published_at: r['published_at'] ? toBig(r['published_at']) : undefined,
      created_at: toBig(r['created_at']),
    }));
  }

  async publish(name: string, version: string): Promise<void> {
    const res = await this.pool.query(
      `UPDATE domains SET published=true, published_at=$1::NUMERIC WHERE name=$2 AND version=$3 AND published=false`,
      [bigStr(BigInt(Date.now()) * 1_000_000n), name, version]);
    if (res.rowCount === 0) throw Errors.CGFSError.wormViolation(`${name}@${version} bereits publiziert`);
  }
}

// ── PgManifestRepository ──────────────────────────────────────────────────────

export class PgManifestRepository implements IManifestRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(m: CGManifest): Promise<void> {
    await this.pool.query(
      `INSERT INTO manifests (cgfi, tai_timepoint, content_hash, type_id, size_bytes, metadata, tombstone, created_at)
       VALUES ($1,$2,$3,$4,$5::NUMERIC,$6::jsonb,$7,$8::NUMERIC)`,
      [m.cgfi, m.tai_timepoint, m.content_hash, m.type_id, bigStr(m.size_bytes),
       JSON.stringify(m.metadata), m.tombstone, bigStr(m.created_at)],
    );
  }

  async findByCGFI(cgfi: string): Promise<CGManifest | null> {
    const res = await this.pool.query('SELECT * FROM manifests WHERE cgfi=$1', [cgfi]);
    if (!res.rows[0]) return null;
    const r = res.rows[0] as Record<string, unknown>;
    return {
      cgfi: r['cgfi'] as string, tai_timepoint: r['tai_timepoint'] as string,
      content_hash: r['content_hash'] as string, type_id: r['type_id'] as string,
      size_bytes: toBig(r['size_bytes']), tombstone: r['tombstone'] as boolean,
      metadata: (typeof r['metadata'] === 'object' ? r['metadata'] : {}) as Record<string,string>,
      created_at: toBig(r['created_at']),
    };
  }

  async tombstone(cgfi: string): Promise<void> {
    const res = await this.pool.query('UPDATE manifests SET tombstone=true WHERE cgfi=$1', [cgfi]);
    if (res.rowCount === 0) throw Errors.CGFSError.fileNotFound(cgfi);
  }
}

// ── PgRelationRepository ──────────────────────────────────────────────────────

export class PgRelationRepository implements IRelationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(r: CGRelation): Promise<void> {
    await this.pool.query(
      `INSERT INTO relations (id, timepoint_a, timepoint_b, relation, computed_at)
       VALUES ($1,$2,$3,$4,$5::NUMERIC)`,
      [r.id, r.timepoint_a, r.timepoint_b, r.relation, bigStr(r.computed_at)],
    );
  }

  async list(): Promise<CGRelation[]> {
    const res = await this.pool.query('SELECT * FROM relations ORDER BY computed_at DESC');
    return res.rows.map(r => ({
      id: r['id'] as string, timepoint_a: r['timepoint_a'] as string,
      timepoint_b: r['timepoint_b'] as string, relation: r['relation'] as CGRelation['relation'],
      computed_at: toBig(r['computed_at']),
    }));
  }
}

// ── PgSegmentRepository ───────────────────────────────────────────────────────

export class PgSegmentRepository implements ISegmentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async allocate(grantedBy: string, sizeNs: bigint, parentId?: string): Promise<CGUASegment> {
    const base = await this._nextBase();
    const id = require('node:crypto').createHash('sha256')
      .update(`${grantedBy}:${base}:${sizeNs}:${Date.now()}`).digest('hex').slice(0, 16);

    const seg: CGUASegment = {
      id, parent_id: parentId ?? null, base_address: base, size_ns: sizeNs,
      granted_by: grantedBy, status: 'active', created_at: BigInt(Date.now()) * 1_000_000n,
    };
    await this.pool.query(
      `INSERT INTO segments (id, parent_id, base_address, size_ns, granted_by, status, created_at)
       VALUES ($1,$2,$3::NUMERIC,$4::NUMERIC,$5,$6,$7::NUMERIC)`,
      [seg.id, seg.parent_id, bigStr(seg.base_address), bigStr(seg.size_ns),
       seg.granted_by, seg.status, bigStr(seg.created_at)],
    );
    return seg;
  }

  async resolve(segmentId: string): Promise<CGUASegment> {
    const res = await this.pool.query('SELECT * FROM segments WHERE id=$1', [segmentId]);
    if (!res.rows[0]) throw Errors.CGUASError.segmentNotFound(segmentId);
    return this.rowToSeg(res.rows[0] as Record<string, unknown>);
  }

  async revoke(segmentId: string): Promise<void> {
    await this.pool.query(`UPDATE segments SET status='revoked' WHERE id=$1`, [segmentId]);
  }

  async list(): Promise<CGUASegment[]> {
    const res = await this.pool.query('SELECT * FROM segments ORDER BY base_address');
    return res.rows.map(r => this.rowToSeg(r as Record<string, unknown>));
  }

  private async _nextBase(): Promise<bigint> {
    const res = await this.pool.query('SELECT MAX(base_address + size_ns) AS next FROM segments');
    return toBig(res.rows[0]?.['next'] ?? 0);
  }

  private rowToSeg(r: Record<string, unknown>): CGUASegment {
    return {
      id: r['id'] as string, parent_id: r['parent_id'] as string | null,
      base_address: toBig(r['base_address']), size_ns: toBig(r['size_ns']),
      granted_by: r['granted_by'] as string, status: r['status'] as CGUASegment['status'],
      created_at: toBig(r['created_at']),
    };
  }
}
