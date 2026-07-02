import pg from 'pg';
import type { CGTimepoint, CGDomain, CGManifest, CGRelation, CGUASegment } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import type {
  ITimepointRepository, IDomainRepository, IManifestRepository,
  IRelationRepository, ISegmentRepository,
} from './repository.js';

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** BigInt → NUMERIC-String für PostgreSQL */
const bs = (v: bigint) => v.toString();

/** DB-Wert → BigInt */
const tb = (v: unknown): bigint => {
  if (typeof v === 'bigint')  return v;
  if (typeof v === 'string')  return BigInt(v);
  if (typeof v === 'number')  return BigInt(Math.round(v));
  return 0n;
};

/** TAI-Nanosekunden jetzt (für lifecycle_events.created_at) */
const nowNs = () => bs(BigInt(Date.now()) * 1_000_000n);

// ─── PgTimepointRepository ────────────────────────────────────────────────────

export class PgTimepointRepository implements ITimepointRepository {
  constructor(private p: pg.Pool) {}

  async insert(tp: CGTimepoint): Promise<void> {
    await this.p.query(
      `INSERT INTO timepoints(machine_id,domain_name,domain_version,absolute_value,cgta,labels,created_at)
       VALUES($1,$2,$3,$4::NUMERIC,$5,$6::jsonb,$7::NUMERIC)
       ON CONFLICT DO NOTHING`,
      [tp.machine_id, tp.domain_name, tp.domain_version,
       bs(tp.absolute_value), tp.cgta,
       JSON.stringify(tp.labels), bs(tp.created_at)],
    );
  }

  async findById(id: string): Promise<CGTimepoint | null> {
    const r = await this.p.query('SELECT * FROM timepoints WHERE machine_id=$1', [id]);
    if (!r.rows[0]) return null;
    return this._map(r.rows[0] as Record<string, unknown>);
  }

  async list(l = 100, o = 0): Promise<CGTimepoint[]> {
    const r = await this.p.query(
      'SELECT * FROM timepoints ORDER BY created_at DESC LIMIT $1 OFFSET $2', [l, o],
    );
    return r.rows.map(row => this._map(row as Record<string, unknown>));
  }

  private _map(row: Record<string, unknown>): CGTimepoint {
    return {
      machine_id:     row['machine_id']     as string,
      domain_name:    row['domain_name']    as string,
      domain_version: row['domain_version'] as string,
      absolute_value: tb(row['absolute_value']),
      cgta:           row['cgta']           as string,
      labels:         (row['labels'] ?? {}) as Record<string, string>,
      created_at:     tb(row['created_at']),
    };
  }
}

// ─── PgDomainRepository ───────────────────────────────────────────────────────

export class PgDomainRepository implements IDomainRepository {
  constructor(private p: pg.Pool) {}

  async insert(d: CGDomain): Promise<void> {
    try {
      await this.p.query(
        `INSERT INTO domains(name,version,definition,published,created_at)
         VALUES($1,$2,$3::jsonb,$4,$5::NUMERIC)`,
        [d.name, d.version, JSON.stringify(d.definition), d.published, bs(d.created_at)],
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('unique'))
        throw Errors.SemanticError.duplicateName(`${d.name}@${d.version}`);
      throw e;
    }
  }

  async findByNameVersion(n: string, v: string): Promise<CGDomain | null> {
    // Liest is_published aus v_domains (berücksichtigt lifecycle_events)
    const r = await this.p.query(
      `SELECT d.*, COALESCE(v.is_published, false) AS is_published
       FROM domains d
       LEFT JOIN v_domains v ON v.name=d.name AND v.version=d.version
       WHERE d.name=$1 AND d.version=$2`,
      [n, v],
    );
    if (!r.rows[0]) return null;
    return this._map(r.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<CGDomain[]> {
    const r = await this.p.query(
      `SELECT d.*, COALESCE(v.is_published, false) AS is_published
       FROM domains d
       LEFT JOIN v_domains v ON v.name=d.name AND v.version=d.version
       ORDER BY d.created_at`,
    );
    return r.rows.map(row => this._map(row as Record<string, unknown>));
  }

  /**
   * FIX-11: kein UPDATE mehr. Statuswechsel = INSERT in lifecycle_events.
   * Idempotenz: zweiter publish-Aufruf wirft wormViolation (I-S1).
   */
  async publish(n: string, v: string): Promise<void> {
    const entityId = `${n}@${v}`;

    // Prüfen ob Domain existiert
    const exists = await this.p.query(
      'SELECT 1 FROM domains WHERE name=$1 AND version=$2', [n, v],
    );
    if (!exists.rows[0]) throw Errors.VersionError.notFound(entityId);

    // Prüfen ob bereits publiziert (Idempotenzschutz / I-S1)
    const alreadyPublished = await this.p.query(
      `SELECT 1 FROM lifecycle_events
       WHERE entity_type='domain' AND entity_id=$1 AND event='published'
       LIMIT 1`,
      [entityId],
    );
    if (alreadyPublished.rows[0]) throw Errors.CGFSError.wormViolation(entityId);

    // Insert-only Statuswechsel
    await this.p.query(
      `INSERT INTO lifecycle_events(entity_type,entity_id,event,payload,created_at)
       VALUES('domain',$1,'published',$2::jsonb,$3::NUMERIC)`,
      [entityId, JSON.stringify({ name: n, version: v }), nowNs()],
    );
  }

  private _map(row: Record<string, unknown>): CGDomain {
    return {
      name:        row['name']        as string,
      version:     row['version']     as string,
      definition:  typeof row['definition'] === 'string'
                     ? JSON.parse(row['definition'])
                     : row['definition'] as CGDomain['definition'],
      published:   !!(row['is_published'] ?? row['published']),
      created_at:  tb(row['created_at']),
    };
  }
}

// ─── PgManifestRepository ─────────────────────────────────────────────────────

export class PgManifestRepository implements IManifestRepository {
  constructor(private p: pg.Pool) {}

  async insert(m: CGManifest): Promise<void> {
    await this.p.query(
      `INSERT INTO manifests(cgfi,tai_timepoint,content_hash,type_id,size_bytes,metadata,tombstone,created_at)
       VALUES($1,$2,$3,$4,$5::NUMERIC,$6::jsonb,$7,$8::NUMERIC)`,
      [m.cgfi, m.tai_timepoint, m.content_hash, m.type_id,
       bs(m.size_bytes), JSON.stringify(m.metadata), m.tombstone, bs(m.created_at)],
    );
  }

  async findByCGFI(cgfi: string): Promise<CGManifest | null> {
    // LEFT JOIN: Manifest ohne lifecycle_events-Eintrag (= frisch eingefügt, nicht tombstoned)
    // wird korrekt gefunden. COALESCE liefert false wenn kein Tombstone-Event existiert.
    // M-8 fix: INNER JOIN schlug fehl wenn kein lifecycle_event für das Manifest existierte.
    const r = await this.p.query(
      `SELECT m.*, COALESCE(v.is_tombstoned, false) AS is_tombstoned
       FROM manifests m
       LEFT JOIN v_manifests v ON v.cgfi=m.cgfi
       WHERE m.cgfi=$1`,
      [cgfi],
    );
    if (!r.rows[0]) return null;
    return this._map(r.rows[0] as Record<string, unknown>);
  }

  /**
   * FIX-11: kein UPDATE mehr. Tombstone = INSERT in lifecycle_events.
   * Zweiter tombstone-Aufruf ist idempotent (kein Fehler, kein doppelter Eintrag via INSERT ... WHERE NOT EXISTS).
   */
  async tombstone(cgfi: string): Promise<void> {
    const exists = await this.p.query('SELECT 1 FROM manifests WHERE cgfi=$1', [cgfi]);
    if (!exists.rows[0]) throw Errors.CGFSError.fileNotFound(cgfi);

    await this.p.query(
      `INSERT INTO lifecycle_events(entity_type,entity_id,event,payload,created_at)
       SELECT 'manifest',$1,'tombstoned','{}',${nowNs()}
       WHERE NOT EXISTS(
         SELECT 1 FROM lifecycle_events
         WHERE entity_type='manifest' AND entity_id=$1 AND event='tombstoned'
       )`,
      [cgfi],
    );
  }

  private _map(row: Record<string, unknown>): CGManifest {
    return {
      cgfi:          row['cgfi']          as string,
      tai_timepoint: row['tai_timepoint'] as string,
      content_hash:  row['content_hash']  as string,
      type_id:       row['type_id']       as string,
      size_bytes:    tb(row['size_bytes']),
      tombstone:     !!(row['is_tombstoned'] ?? row['tombstone']),
      metadata:      (row['metadata'] ?? {}) as Record<string, string>,
      created_at:    tb(row['created_at']),
    };
  }
}

// ─── PgRelationRepository ─────────────────────────────────────────────────────

export class PgRelationRepository implements IRelationRepository {
  constructor(private p: pg.Pool) {}

  async insert(r: CGRelation): Promise<void> {
    await this.p.query(
      `INSERT INTO relations(id,timepoint_a,timepoint_b,relation,computed_at)
       VALUES($1,$2,$3,$4,$5::NUMERIC)`,
      [r.id, r.timepoint_a, r.timepoint_b, r.relation, bs(r.computed_at)],
    );
  }

  async list(): Promise<CGRelation[]> {
    const r = await this.p.query('SELECT * FROM relations ORDER BY computed_at DESC');
    return r.rows.map((row: Record<string, unknown>) => ({
      id:          row['id']          as string,
      timepoint_a: row['timepoint_a'] as string,
      timepoint_b: row['timepoint_b'] as string,
      relation:    row['relation']    as CGRelation['relation'],
      computed_at: tb(row['computed_at']),
    }));
  }
}

// ─── PgSegmentRepository ──────────────────────────────────────────────────────

export class PgSegmentRepository implements ISegmentRepository {
  constructor(private p: pg.Pool) {}

  async allocate(g: string, sz: bigint, parent?: string): Promise<CGUASegment> {
    const base = await this._next();
    const { createHash } = await import('node:crypto');
    const id = createHash('sha256')
      .update(`${g}:${base}:${sz}:${Date.now()}`)
      .digest('hex').slice(0, 16);

    const seg: CGUASegment = {
      id,
      parent_id:    parent ?? null,
      base_address: base,
      size_ns:      sz,
      granted_by:   g,
      status:       'active',
      created_at:   BigInt(Date.now()) * 1_000_000n,
    };

    await this.p.query(
      `INSERT INTO segments(id,parent_id,base_address,size_ns,granted_by,status,created_at)
       VALUES($1,$2,$3::NUMERIC,$4::NUMERIC,$5,$6,$7::NUMERIC)`,
      [seg.id, seg.parent_id, bs(seg.base_address), bs(seg.size_ns),
       seg.granted_by, seg.status, bs(seg.created_at)],
    );
    return seg;
  }

  async resolve(id: string): Promise<CGUASegment> {
    // effective_status aus v_segments (berücksichtigt lifecycle_events)
    const r = await this.p.query(
      `SELECT s.*, COALESCE(v.effective_status, s.status) AS effective_status
       FROM segments s
       LEFT JOIN v_segments v ON v.id=s.id
       WHERE s.id=$1`,
      [id],
    );
    if (!r.rows[0]) throw Errors.CGUASError.segmentNotFound(id);
    return this._map(r.rows[0] as Record<string, unknown>);
  }

  /**
   * FIX-11: kein UPDATE mehr. Revoke = INSERT in lifecycle_events.
   * Idempotent: doppelter Revoke wird ignoriert (NOT EXISTS-Guard).
   */
  async revoke(id: string): Promise<void> {
    await this.p.query(
      `INSERT INTO lifecycle_events(entity_type,entity_id,event,payload,created_at)
       SELECT 'segment',$1,'revoked','{}',${nowNs()}
       WHERE NOT EXISTS(
         SELECT 1 FROM lifecycle_events
         WHERE entity_type='segment' AND entity_id=$1 AND event='revoked'
       )`,
      [id],
    );
  }

  async list(): Promise<CGUASegment[]> {
    const r = await this.p.query(
      `SELECT s.*, COALESCE(v.effective_status, s.status) AS effective_status
       FROM segments s
       LEFT JOIN v_segments v ON v.id=s.id
       ORDER BY s.base_address`,
    );
    return r.rows.map(row => this._map(row as Record<string, unknown>));
  }

  private async _next(): Promise<bigint> {
    const r = await this.p.query('SELECT MAX(base_address+size_ns) AS n FROM segments');
    return tb(r.rows[0]?.['n'] ?? 0);
  }

  private _map(r: Record<string, unknown>): CGUASegment {
    return {
      id:           r['id']           as string,
      parent_id:    r['parent_id']    as string | null,
      base_address: tb(r['base_address']),
      size_ns:      tb(r['size_ns']),
      granted_by:   r['granted_by']   as string,
      // effective_status (aus View) hat Vorrang vor gespeichertem status
      status:       (r['effective_status'] ?? r['status']) as CGUASegment['status'],
      created_at:   tb(r['created_at']),
    };
  }
}
