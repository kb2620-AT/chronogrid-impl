/**
 * cg-storage/src/pg-client.ts
 * PostgreSQL Connection Pool — CG-STD-4100 v0.7 Kap. 3.1
 * BigInt: NUMERIC(30) ↔ string ↔ bigint (pg-Konfiguration)
 */

import pg from 'pg';

// pg gibt NUMERIC als string zurück – BigInt-Parser
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => BigInt(val));
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => BigInt(val));

let _pool: pg.Pool | null = null;

export function createPool(): pg.Pool {
  if (_pool) return _pool;
  _pool = new pg.Pool({
    host:            process.env['PG_HOST']            ?? 'localhost',
    port:            parseInt(process.env['PG_PORT']   ?? '5432', 10),
    database:        process.env['PG_DATABASE']        ?? 'chronogrid',
    user:            process.env['PG_USER']            ?? 'cg_user',
    password:        process.env['PG_PASSWORD']        ?? 'cg_secret',
    max:             parseInt(process.env['PG_MAX_CONNECTIONS'] ?? '10', 10),
    idleTimeoutMillis: parseInt(process.env['PG_IDLE_TIMEOUT_MS'] ?? '30000', 10),
    connectionTimeoutMillis: parseInt(process.env['PG_CONNECTION_TIMEOUT_MS'] ?? '2000', 10),
  });
  _pool.on('error', (err) => console.error('[cg-storage] Pool-Fehler:', err));
  return _pool;
}

export function getPool(): pg.Pool {
  if (!_pool) throw new Error('Pool nicht initialisiert. createPool() zuerst aufrufen.');
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) { await _pool.end(); _pool = null; }
}

export async function checkConnection(pool: pg.Pool): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1n || res.rows[0]?.ok === 1;
  } catch { return false; }
}

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
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
