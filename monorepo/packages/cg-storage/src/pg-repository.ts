/**
 * cg-storage/src/pg-repository.ts
 * PostgreSQL-Repository — CG-STD-4100 v0.7 Kap. 3
 *
 * Implementiert alle normativen Repository-Interfaces mit echter PostgreSQL-DB.
 * Alle Tabellen sind Insert-only (I-D1, I-S1).
 * BigInt: intern als bigint, an DB-Grenze als string (NUMERIC(30)).
 *
 * Normative Anforderungen:
 * - Kein UPDATE/DELETE auf Kerntabellen — Trigger im Schema erzwingen dies
 * - absolute_value immer NUMERIC(30), nie FLOAT
 * - SHA-256-Hashes auf kanonischer Serialisierung (I-R3)
 * - Idempotenz: INSERT bei bestehender machine_id → bestehenden Eintrag zurückgeben
 */

import { createHash } from 'node:crypto';
import pg from 'pg';
import type { CTDDLDomain } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import type { CGUASegment } from 'cg-cguas/cguas.js';
import type {
  TimepointRow, ManifestRow, RelationRow,
  ITimepointRepository, IDomainRepository,
  IManifestRepository, IRelationRepository,
  ISegmentRepository,
} from './repository.js';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** BigInt → string für PostgreSQL NUMERIC(30) */
function bigintToDb(v: bigint): string {
  return v.toString();
}

/** string aus PostgreSQL NUMERIC(30) → bigint */
function dbToBigint(v: string | null | undefined): bigint | undefined {
  if (v === null || v === undefined) return undefined;
  return BigInt(v);
}

/** string aus PostgreSQL NUMERIC(30) → bigint (Pflichtfeld) */
function dbToBigintRequired(v: string, field: string): bigint {
  try {
    return BigInt(v);
  } catch {
    throw Errors.ExtentError.InvalidExtentUnit({ field, value: v });
  }
}

/** SHA-256 über JSON-String (Integritäts-Hash für domains, mappings) */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── PgTimepointRepository ─────────────────────────────────────────────────────

export class PgTimepointRepository implements ITimepointRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(row: TimepointRow): Promise<void> {
    const sql = `
      INSERT INTO timepoints
        (machine_id, cgta_string, domain_id, absolute_value, granularity, sigma, created_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (machine_id) DO NOTHING
    `;
    // ON CONFLICT DO NOTHING: Idempotenz (CG-STD-4100 Kap. 2.2)
    // Bestehender Eintrag wird nicht überschrieben (I-D1)
    await this.pool.query(sql, [
      row.machine_id,
      row.cgta_string,
      row.domain_id,
      bigintToDb(row.absolute_value),
      row.granularity,
      row.sigma !== undefined ? bigintToDb(row.sigma) : null,
      row.created_at,
      row.created_by,
    ]);
  }

  async findByMachineId(machineId: string): Promise<TimepointRow | null> {
    const res = await this.pool.query(
      'SELECT * FROM timepoints WHERE machine_id = $1',
      [machineId],
    );
    if (res.rows.length === 0) return null;
    return this.rowToTimepointRow(res.rows[0]);
  }

  async findByDomainAndRange(
    domainId: string,
    min: bigint,
    max: bigint,
  ): Promise<TimepointRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM timepoints
       WHERE domain_id = $1
         AND absolute_value >= $2
         AND absolute_value <= $3
       ORDER BY absolute_value ASC`,
      [domainId, bigintToDb(min), bigintToDb(max)],
    );
    return res.rows.map(r => this.rowToTimepointRow(r));
  }

  async list(domainId?: string, limit = 100, after?: string): Promise<TimepointRow[]> {
    let sql = 'SELECT * FROM timepoints';
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (domainId) {
      conditions.push(`domain_id = $${params.length + 1}`);
      params.push(domainId);
    }
    if (after) {
      conditions.push(`machine_id > $${params.length + 1}`);
      params.push(after);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ` ORDER BY machine_id ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await this.pool.query(sql, params);
    return res.rows.map(r => this.rowToTimepointRow(r));
  }

  private rowToTimepointRow(r: Record<string, unknown>): TimepointRow {
    return {
      machine_id:     r['machine_id'] as string,
      cgta_string:    r['cgta_string'] as string,
      domain_id:      r['domain_id'] as string,
      absolute_value: dbToBigintRequired(r['absolute_value'] as string, 'absolute_value'),
      granularity:    r['granularity'] as string,
      sigma:          dbToBigint(r['sigma'] as string | null),
      created_at:     r['created_at'] as string,
      created_by:     r['created_by'] as string,
    };
  }
}

// ── PgDomainRepository ────────────────────────────────────────────────────────

export class PgDomainRepository implements IDomainRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(
    domain: CTDDLDomain,
    publishedAt: string,
    publishedBy: string,
  ): Promise<void> {
    const ctddlJson = JSON.stringify(domain);
    const integrityHash = sha256(ctddlJson);
    const domainId = `${domain.name}/v${domain.version}`;

    const sql = `
      INSERT INTO domains
        (domain_id, domain_name, domain_version, semantics, ctddl_json,
         integrity_hash, stability, published_at, published_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (domain_id) DO NOTHING
    `;
    await this.pool.query(sql, [
      domainId,
      domain.name,
      String(domain.version),
      domain.semantics ?? 'time',
      ctddlJson,
      integrityHash,
      domain.stability ?? 'high',
      publishedAt,
      publishedBy,
    ]);
  }

  async findById(domainId: string): Promise<CTDDLDomain | null> {
    const res = await this.pool.query(
      'SELECT ctddl_json FROM domains WHERE domain_id = $1',
      [domainId],
    );
    if (res.rows.length === 0) return null;
    return JSON.parse(res.rows[0]['ctddl_json'] as string) as CTDDLDomain;
  }

  async findByNameVersion(name: string, version: number): Promise<CTDDLDomain | null> {
    return this.findById(`${name}/v${version}`);
  }

  async list(): Promise<CTDDLDomain[]> {
    const res = await this.pool.query(
      'SELECT ctddl_json FROM domains ORDER BY domain_name, domain_version',
    );
    return res.rows.map(r => JSON.parse(r['ctddl_json'] as string) as CTDDLDomain);
  }

  async exists(domainId: string): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT 1 FROM domains WHERE domain_id = $1',
      [domainId],
    );
    return res.rows.length > 0;
  }
}

// ── PgManifestRepository ──────────────────────────────────────────────────────

export class PgManifestRepository implements IManifestRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(row: ManifestRow): Promise<void> {
    const sql = `
      INSERT INTO manifests (
        cgfi, cgfs_version, type_id, type_schema, created_at, content_hash,
        size_bytes, prev_version, cgua, valid_from, valid_until,
        retention, review_after, language, created_by, tags, access_level
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (cgfi) DO NOTHING
    `;
    await this.pool.query(sql, [
      row.cgfi,
      row.cgfs_version,
      row.type_id,
      row.type_schema,
      row.created_at,
      row.content_hash,
      row.size_bytes ?? null,
      row.prev_version ?? null,
      row.cgua ?? null,
      row.valid_from ?? null,
      row.valid_until ?? null,
      row.retention ?? null,
      row.review_after ?? null,
      row.language ?? null,
      row.created_by,
      row.tags ? JSON.stringify(row.tags) : null,
      row.access_level,
    ]);
  }

  async findByCGFI(cgfi: string): Promise<ManifestRow | null> {
    const res = await this.pool.query(
      'SELECT * FROM manifests WHERE cgfi = $1',
      [cgfi],
    );
    if (res.rows.length === 0) return null;
    return this.rowToManifestRow(res.rows[0]);
  }

  /**
   * Logisches Löschen (DSGVO Art. 17) — kein hartes DELETE.
   * Trigger im Schema verhindert hartes DELETE (I-D1).
   * Nur deleted_at und deleted_reason werden gesetzt.
   */
  async softDelete(cgfi: string, deletedAt: string, reason: string): Promise<void> {
    // UPDATE nur auf deleted_at/deleted_reason — erlaubt durch Trigger
    const res = await this.pool.query(
      `UPDATE manifests SET deleted_at = $2, deleted_reason = $3
       WHERE cgfi = $1 AND deleted_at IS NULL`,
      [cgfi, deletedAt, reason],
    );
    if (res.rowCount === 0) {
      // Bereits gelöscht oder nicht gefunden
      const existing = await this.findByCGFI(cgfi);
      if (!existing) {
        throw Errors.CGFSError.ManifestMissing();
      }
      // Bereits gelöscht — idempotent, kein Fehler
    }
  }

  async getVersionChain(cgfi: string): Promise<ManifestRow[]> {
    // Rekursive CTE für Versionschain (CG-STD-4100 Kap. 4.7)
    const res = await this.pool.query(`
      WITH RECURSIVE chain AS (
        SELECT * FROM manifests WHERE cgfi = $1
        UNION ALL
        SELECT m.* FROM manifests m
        INNER JOIN chain c ON m.cgfi = c.prev_version
      )
      SELECT * FROM chain ORDER BY created_at DESC
    `, [cgfi]);
    return res.rows.map(r => this.rowToManifestRow(r));
  }

  private rowToManifestRow(r: Record<string, unknown>): ManifestRow {
    return {
      cgfi:           r['cgfi'] as string,
      cgfs_version:   r['cgfs_version'] as string,
      type_id:        r['type_id'] as string,
      type_schema:    r['type_schema'] as string,
      created_at:     r['created_at'] as string,
      content_hash:   r['content_hash'] as string,
      size_bytes:     r['size_bytes'] ? Number(r['size_bytes']) : undefined,
      prev_version:   r['prev_version'] as string | undefined,
      cgua:           r['cgua'] as string | undefined,
      valid_from:     r['valid_from'] as string | undefined,
      valid_until:    r['valid_until'] as string | undefined,
      retention:      r['retention'] as string | undefined,
      review_after:   r['review_after'] as string | undefined,
      language:       r['language'] as string | undefined,
      created_by:     r['created_by'] as string,
      tags:           r['tags'] ? JSON.parse(r['tags'] as string) as string[] : undefined,
      access_level:   r['access_level'] as ManifestRow['access_level'],
      deleted_at:     r['deleted_at'] as string | undefined,
      deleted_reason: r['deleted_reason'] as string | undefined,
    };
  }
}

// ── PgRelationRepository ──────────────────────────────────────────────────────

export class PgRelationRepository implements IRelationRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(row: RelationRow): Promise<void> {
    const sql = `
      INSERT INTO relations (relation_id, machine_id_a, machine_id_b, relation_type, computed_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (relation_id) DO NOTHING
    `;
    await this.pool.query(sql, [
      row.relation_id,
      row.machine_id_a,
      row.machine_id_b,
      row.relation_type,
      row.computed_at,
    ]);
  }

  async findByPair(machineIdA: string, machineIdB: string): Promise<RelationRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM relations
       WHERE machine_id_a = $1 AND machine_id_b = $2
       ORDER BY computed_at DESC`,
      [machineIdA, machineIdB],
    );
    return res.rows.map(r => ({
      relation_id:   r['relation_id'] as string,
      machine_id_a:  r['machine_id_a'] as string,
      machine_id_b:  r['machine_id_b'] as string,
      relation_type: r['relation_type'] as string,
      computed_at:   r['computed_at'] as string,
    }));
  }
}

// ── PgSegmentRepository ───────────────────────────────────────────────────────

export class PgSegmentRepository implements ISegmentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async insert(
    segment: CGUASegment,
    grantedAt: string,
    grantedBy: string,
  ): Promise<void> {
    const sql = `
      INSERT INTO segments (
        segment_id, owner_id, parent_id, start_address, end_address,
        size_ns, granted_at, granted_by, integrity_hash, level, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
      ON CONFLICT (segment_id) DO NOTHING
    `;
    await this.pool.query(sql, [
      segment.segment_id,
      segment.owner_id,
      segment.parent_id ?? null,
      bigintToDb(segment.start_address),
      bigintToDb(segment.end_address),
      bigintToDb(segment.end_address - segment.start_address),
      grantedAt,
      grantedBy,
      segment.integrity_hash,
      segment.level,
    ]);
  }

  async findById(segmentId: string): Promise<CGUASegment | null> {
    const res = await this.pool.query(
      'SELECT * FROM segments WHERE segment_id = $1',
      [segmentId],
    );
    if (res.rows.length === 0) return null;
    return this.rowToSegment(res.rows[0]);
  }

  /**
   * Findet das spezifischste Segment für eine CGUA-Adresse.
   * Binärsuche via SQL: start_address <= cgua < end_address,
   * Root-Segment nur als Fallback (CG-APP-0700 §13.2 Korrektur 1).
   */
  async findByAddress(cgua: bigint): Promise<CGUASegment | null> {
    const cguaStr = bigintToDb(cgua);

    // Zuerst: spezifisches Non-Root-Segment suchen
    const res = await this.pool.query(
      `SELECT * FROM segments
       WHERE start_address <= $1::NUMERIC
         AND end_address   >  $1::NUMERIC
         AND status = 'active'
         AND segment_id != 'CG.CGUAS.ROOT'
       ORDER BY (end_address - start_address) ASC
       LIMIT 1`,
      [cguaStr],
    );

    if (res.rows.length > 0) return this.rowToSegment(res.rows[0]);

    // Fallback: Root-Segment
    const rootRes = await this.pool.query(
      `SELECT * FROM segments
       WHERE start_address <= $1::NUMERIC
         AND end_address   >  $1::NUMERIC
         AND status = 'active'
         AND segment_id = 'CG.CGUAS.ROOT'
       LIMIT 1`,
      [cguaStr],
    );

    if (rootRes.rows.length > 0) return this.rowToSegment(rootRes.rows[0]);
    return null;
  }

  async listByOwner(ownerId: string): Promise<CGUASegment[]> {
    const res = await this.pool.query(
      `SELECT * FROM segments WHERE owner_id = $1 AND status = 'active'
       ORDER BY start_address ASC`,
      [ownerId],
    );
    return res.rows.map(r => this.rowToSegment(r));
  }

  /** Segment deaktivieren (Insert-only: kein DELETE, nur status='inactive') */
  async deactivate(segmentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE segments SET status = 'inactive' WHERE segment_id = $1`,
      [segmentId],
    );
  }

  private rowToSegment(r: Record<string, unknown>): CGUASegment {
    const start = dbToBigintRequired(r['start_address'] as string, 'start_address');
    const end   = dbToBigintRequired(r['end_address']   as string, 'end_address');
    return {
      segment_id:     r['segment_id'] as string,
      owner_id:       r['owner_id'] as string,
      parent_id:      (r['parent_id'] as string | null) ?? null,
      start_address:  start,
      end_address:    end,
      size_ns:        end - start,
      granted_at:     r['granted_at'] as string,
      granted_by:     r['granted_by'] as string,
      integrity_hash: r['integrity_hash'] as string,
      level:          Number(r['level']),
      status:         (r['status'] as 'active' | 'inactive') ?? 'active',
    };
  }
}

// ── PgRepositoryBundle ────────────────────────────────────────────────────────
// Bündelt alle Repositories für bequeme Weitergabe an cg-api.

export interface PgRepositoryBundle {
  timepoints: PgTimepointRepository;
  domains:    PgDomainRepository;
  manifests:  PgManifestRepository;
  relations:  PgRelationRepository;
  segments:   PgSegmentRepository;
}

export function createPgRepositories(pool: pg.Pool): PgRepositoryBundle {
  return {
    timepoints: new PgTimepointRepository(pool),
    domains:    new PgDomainRepository(pool),
    manifests:  new PgManifestRepository(pool),
    relations:  new PgRelationRepository(pool),
    segments:   new PgSegmentRepository(pool),
  };
}
