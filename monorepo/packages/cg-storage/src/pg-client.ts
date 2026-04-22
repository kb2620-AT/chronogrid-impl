import pg from 'pg';
pg.types.setTypeParser(pg.types.builtins.NUMERIC,(v:string)=>BigInt(v));
pg.types.setTypeParser(pg.types.builtins.INT8,(v:string)=>BigInt(v));
let _pool:pg.Pool|null=null;
export function createPool():pg.Pool{if(_pool)return _pool;_pool=new pg.Pool({host:process.env['PG_HOST']??'localhost',port:parseInt(process.env['PG_PORT']??'5432',10),database:process.env['PG_DATABASE']??'chronogrid',user:process.env['PG_USER']??'cg_user',password:process.env['PG_PASSWORD']??'cg_secret',max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:2000});_pool.on('error',e=>console.error('[pg] Pool-Fehler:',e));return _pool;}
export function getPool():pg.Pool{if(!_pool)throw new Error('Pool nicht init');return _pool;}
export async function closePool():Promise<void>{if(_pool){await _pool.end();_pool=null;}}
export async function checkConnection(pool:pg.Pool):Promise<boolean>{try{const r=await pool.query('SELECT 1 AS ok');return r.rows[0]?.ok===1n||r.rows[0]?.ok===1;}catch{return false;}}
export async function withTransaction<T>(pool:pg.Pool,fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
