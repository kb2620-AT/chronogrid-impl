/**
 * cg-api/src/server.ts — CG-STD-4100 v0.7 Kap. 4 + 7
 * Sprint 8: JWT/RBAC Middleware in allen Routen aktiv
 * Start: node --import tsx/esm src/server.ts
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createPool, closePool, checkConnection } from 'cg-storage/pg-client.js';
import { createRepositories } from 'cg-storage/repository-factory.js';
import { nowTaiNs } from 'cg-engine/engine.js';
import type { APIContext } from './handlers.js';
import * as handlers from './handlers.js';
import { handleGraphQL } from './graphql.js';
import * as webhooks from './webhooks.js';
import { checkAuth, getRequiredRole, issueJWT } from './auth.js';
import type { CGRequest, CGResponse } from './middleware.js';
import { jsonResponse, errorResponse } from './middleware.js';

const PORT    = parseInt(process.env['API_PORT'] ?? '3000', 10);
const HOST    = process.env['API_HOST'] ?? '127.0.0.1';
const STORAGE = process.env['STORAGE'] ?? 'memory';

const pool  = STORAGE === 'postgres' ? createPool() : undefined;
const repos = createRepositories(pool, STORAGE === 'postgres' ? 'postgres' : 'memory');
console.log(`[cg-api] Storage: ${repos.backend} | Sprint 8: JWT/RBAC aktiv`);
if (pool) checkConnection(pool).then(ok => console.log(ok ? '[cg-api] PostgreSQL OK' : '[cg-api] PostgreSQL nicht erreichbar'));

// ── Base Context ──────────────────────────────────────────────────────────────
const baseCtx: APIContext = {
  timepoints: repos.timepoints, domains: repos.domains,
  manifests:  repos.manifests,  relations: repos.relations,
  segments:   repos.segments,   now: nowTaiNs,
};

// ── Route-Tabelle ─────────────────────────────────────────────────────────────
type HandlerFn = (req: CGRequest, ctx: APIContext) => Promise<CGResponse>;
interface Route { method: string; pattern: string; handler: HandlerFn; }

const routes: Route[] = [
  { method: 'GET',    pattern: '/v1/auth/token',             handler: devTokenHandler },
  { method: 'GET',    pattern: '/v1/health',                 handler: handlers.getHealth },
  { method: 'GET',    pattern: '/v1/openapi.json',           handler: handlers.getOpenApi },
  { method: 'POST',   pattern: '/v1/timepoints/convert',     handler: handlers.convertTimepoint },
  { method: 'POST',   pattern: '/v1/timepoints/validate',    handler: handlers.validateTimepoint },
  { method: 'POST',   pattern: '/v1/timepoints',             handler: handlers.postTimepoints },
  { method: 'GET',    pattern: '/v1/timepoints',             handler: handlers.listTimepoints },
  { method: 'GET',    pattern: '/v1/timepoints/:machine_id', handler: handlers.getTimepoint },
  { method: 'POST',   pattern: '/v1/domains/validate',       handler: handlers.validateDomain },
  { method: 'GET',    pattern: '/v1/domains',                handler: handlers.listDomains },
  { method: 'POST',   pattern: '/v1/domains',                handler: handlers.postDomain },
  { method: 'POST',   pattern: '/v1/relations/compute',      handler: handlers.computeRelation },
  { method: 'POST',   pattern: '/v1/segments',               handler: handlers.postSegment },
  { method: 'GET',    pattern: '/v1/segments/resolve/:cgua', handler: handlers.resolveCGUA },
  { method: 'POST',   pattern: '/v1/files',                  handler: handlers.postFile },
  { method: 'GET',    pattern: '/v1/files/:cgfi',            handler: handlers.getFile },
  { method: 'DELETE', pattern: '/v1/files/:cgfi',            handler: handlers.deleteFile },
  { method: 'GET',    pattern: '/v1/graphql',                handler: graphqlPlayground },
  { method: 'POST',   pattern: '/v1/graphql',                handler: graphqlHandler },
  { method: 'POST',   pattern: '/v1/webhooks',               handler: webhooks.postWebhook },
  { method: 'GET',    pattern: '/v1/webhooks',               handler: webhooks.listWebhooks },
  { method: 'GET',    pattern: '/v1/webhooks/deliveries',    handler: webhooks.getWebhookDeliveries },
  { method: 'DELETE', pattern: '/v1/webhooks/:id',           handler: webhooks.deleteWebhook },
];

// ── Handler ───────────────────────────────────────────────────────────────────
async function devTokenHandler(req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  const role = (req.query['role'] ?? 'reader') as 'admin' | 'writer' | 'reader';
  if (!['admin', 'writer', 'reader'].includes(role))
    return jsonResponse(422, { message: 'role muss admin|writer|reader sein' });
  const token = issueJWT(`dev-${role}`, role);
  return jsonResponse(200, { token, role, expires_in: 3600, note: 'Nur für Entwicklung/Tests (CG-STD-4100 Kap. 7)' });
}

async function graphqlHandler(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    return jsonResponse(200, await handleGraphQL(b['query'] as string, b['variables'] as Record<string, unknown> | undefined, ctx));
  } catch (e) { return errorResponse(e); }
}

async function graphqlPlayground(_req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  return { status: 200, headers: { 'Content-Type': 'text/html' }, body: `<!DOCTYPE html><html><head><title>CG GraphQL</title><style>body{font-family:monospace;padding:2rem;background:#1a1a1a;color:#e0e0e0}pre{background:#2a2a2a;padding:1rem;border-radius:4px}h1{color:#4fc3f7}</style></head><body><h1>ChronoGrid GraphQL — Sprint 8</h1><p>Token: <code>GET /v1/auth/token?role=writer</code></p><p>Dann: <code>Authorization: Bearer &lt;token&gt;</code></p><pre>{ health { status version } }\nmutation { createTimepoint(domain:"TAI", value:"1742041937") { machine_id cgta } }</pre></body></html>` };
}

// ── Auth Middleware (Sprint 8) ────────────────────────────────────────────────
function applyAuth(req: CGRequest, path: string): { ctx: APIContext; error?: CGResponse } {
  const required = getRequiredRole(req.method, path);
  const authHeader = req.headers['authorization'] as string | undefined;
  const result = checkAuth(authHeader, required);
  if (!result.authenticated) {
    const status = authHeader ? 403 : 401;
    const code   = authHeader ? 'CG-E-012.002' : 'CG-E-012.001';
    return { ctx: baseCtx, error: jsonResponse(status, { code, class: 'AuthError', severity: 'FATAL', thrownBy: 'Auth', message: result.error ?? 'Nicht autorisiert', cgStd: 'CG-STD-4100 v0.7 Kap. 7' }) };
  }
  return { ctx: { ...baseCtx, principal: result.payload } };
}

// ── Routing ───────────────────────────────────────────────────────────────────
function matchRoute(method: string, path: string) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const params = matchPattern(r.pattern, path);
    if (params !== null) return { handler: r.handler, params };
  }
  return null;
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/'), up = path.split('/');
  if (pp.length !== up.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!, u = up[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(u);
    else if (p !== u) return null;
  }
  return params;
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', () => { if (!body) { resolve({}); return; } try { resolve(JSON.parse(body)); } catch { reject(new Error('Ungültiges JSON')); } });
    req.on('error', reject);
  });
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?'); if (idx === -1) return {};
  const q: Record<string, string> = {};
  new URLSearchParams(url.slice(idx + 1)).forEach((v, k) => { q[k] = v; });
  return q;
}

function send(res: ServerResponse, cgRes: CGResponse): void {
  const body = typeof cgRes.body === 'string' ? cgRes.body : JSON.stringify(cgRes.body, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
  res.writeHead(cgRes.status, { ...(cgRes.headers ?? { 'Content-Type': 'application/json' }), 'X-ChronoGrid-Version': '0.8.0' });
  res.end(body);
}

// ── HTTP-Server ───────────────────────────────────────────────────────────────
export const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? '/';
  const path = url.split('?')[0]!;
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
    res.end(); return;
  }

  const match = matchRoute(method, path);
  if (!match) { send(res, jsonResponse(404, { message: `${method} ${path} nicht gefunden` })); return; }

  try {
    const body = await parseBody(req);
    const cgReq: CGRequest = { method, path, params: match.params, query: parseQuery(url), body, headers: req.headers as Record<string, string | string[] | undefined> };
    const { ctx, error } = applyAuth(cgReq, path);
    if (error) { send(res, error); return; }
    send(res, await match.handler(cgReq, ctx));
  } catch (err) { send(res, errorResponse(err)); }
});

server.listen(PORT, HOST, () => {
  console.log(`[cg-api] http://${HOST}:${PORT}`);
  console.log(`[cg-api] Token:   GET /v1/auth/token?role=admin`);
  console.log(`[cg-api] Health:  GET /v1/health`);
  console.log(`[cg-api] GraphQL: GET /v1/graphql`);
});

process.on('SIGTERM', async () => { server.close(async () => { if (pool) await closePool(); process.exit(0); }); });
process.on('SIGINT',  async () => { server.close(async () => { if (pool) await closePool(); process.exit(0); }); });
