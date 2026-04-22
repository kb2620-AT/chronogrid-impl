/**
 * cg-storage/src/pg-client.ts
 * PostgreSQL Connection Pool — CG-STD-4100 v0.7 Kap. 3
 *
 * Normative Anforderungen:
 * - Pool-basierte Verbindungsverwaltung (Performance, CG-APP-0700 §9)
 * - BigInt aus DB als string lesen, im Code als bigint verwenden
 * - Kein UPDATE/DELETE auf Kerntabellen (I-D1, I-S1)
 * - Deterministische Fehlerbehandlung (I-R3)
 */

import pg from 'pg';
import { Errors } from 'cg-types/errors.js';

const { Pool, types } = pg;

// ── BigInt-Handling (normativ) ────────────────────────────────────────────────
// PostgreSQL gibt NUMERIC(30) als string zurück.
// Wir lassen das so — Konvertierung zu bigint erfolgt im Repository-Layer.
// WICHTIG: NIEMALS PostgreSQL-BIGINT (int8) für Zeitwerte verwenden —
// INT64 reicht nicht für Cosmic Domain (bis 4.35×10²³).

// OID 1700 = NUMERIC — als string belassen (BigInt-sicher)
types.setTypeParser(1700, (val: string) => val);

// OID 20 = INT8/BIGINT — als string belassen (BigInt-sicher)
types.setTypeParser(20, (val: string) => val);

// ── Pool-Singleton ─────────────────────────────────────────────────────────────

let _pool: pg.Pool | null = null;

export interface PgConfig {
  host:     string;
  port:     number;
  database: string;
  user:     string;
  password: string;
  ssl?:     boolean;
  poolMin?: number;
  poolMax?: number;
  idleTimeoutMs?: number;
}

/**
 * Erstellt den Pool aus Umgebungsvariablen oder übergebener Konfiguration.
 * Idempotent: gibt bei wiederholtem Aufruf denselben Pool zurück.
 */
export function createPool(config?: PgConfig): pg.Pool {
  if (_pool) return _pool;

  const cfg: PgConfig = config ?? {
    host:           process.env['PGHOST']     ?? 'localhost',
    port:           parseInt(process.env['PGPORT'] ?? '5432', 10),
    database:       process.env['PGDATABASE'] ?? 'chronogrid',
    user:           process.env['PGUSER']     ?? 'chronogrid',
    password:       process.env['PGPASSWORD'] ?? '',
    ssl:            process.env['PGSSL'] === 'true',
    poolMin:        parseInt(process.env['PG_POOL_MIN'] ?? '2', 10),
    poolMax:        parseInt(process.env['PG_POOL_MAX'] ?? '10', 10),
    idleTimeoutMs:  parseInt(process.env['PG_POOL_IDLE_TIMEOUT_MS'] ?? '30000', 10),
  };

  _pool = new Pool({
    host:            cfg.host,
    port:            cfg.port,
    database:        cfg.database,
    user:            cfg.user,
    password:        cfg.password,
    ssl:             cfg.ssl ? { rejectUnauthorized: false } : false,
    min:             cfg.poolMin,
    max:             cfg.poolMax,
    idleTimeoutMillis: cfg.idleTimeoutMs,
    connectionTimeoutMillis: 5000,
  });

  // Pool-Fehler-Handler (normativ: nie still scheitern)
  _pool.on('error', (err) => {
    console.error('[cg-storage] Unerwarteter PostgreSQL Pool-Fehler:', err.message);
  });

  return _pool;
}

/**
 * Gibt den aktiven Pool zurück. Wirft wenn kein Pool existiert.
 */
export function getPool(): pg.Pool {
  if (!_pool) {
    throw Errors.InvariantError.I_R3({
      reason: 'PostgreSQL Pool nicht initialisiert. createPool() zuerst aufrufen.',
    });
  }
  return _pool;
}

/**
 * Schließt den Pool (für graceful shutdown).
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Führt eine Funktion in einer Transaktion aus.
 * Rollback bei Fehler — atomare Operationen für Segment-Zuteilung etc.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Prüft ob die DB-Verbindung funktioniert.
 * Wird beim Server-Start und in GET /v1/health verwendet.
 */
export async function checkConnection(pool: pg.Pool): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1 || res.rows[0]?.ok === '1';
  } catch {
    return false;
  }
}
