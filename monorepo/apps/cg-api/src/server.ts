/**
 * cg-api/src/server.ts
 * HTTP-Server — CG-STD-4100 v0.7 Kap. 4
 * Sprint 7: Interface-basierter APIContext, GraphQL (Kap. 5), Webhooks (Kap. 6)
 *
 * Start (In-Memory):  node --import tsx/esm src/server.ts
 * Start (PostgreSQL): STORAGE=postgres node --import tsx/esm src/server.ts
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
import type { CGRequest, CGResponse } from './middleware.js';
import { jsonResponse, errorResponse } from './middleware.js';

// ── Konfiguration ─────────────────────────────────────────────────────────────

const PORT    = parseInt(process.env['API_PORT'] ?? '3000', 10);
const HOST    = process.env['API_HOST'] ?? '127.0.0.1';
const STORAGE = process.env['STORAGE'] ?? 'memory';

// ── Repository-Setup (Sprint 7: Interface-basiert) ────────────────────────────

const pool = STORAGE === 'postgres' ? createPool() : undefined;
const repos = createRepositories(pool, STORAGE === 'postgres' ? 'postgres' : 'memory');

console.log(`[cg-api] Storage-Backend: ${repos.backend}`);

if (pool) {
  checkConnection(pool).then(ok => {
    if (ok) console.log('[cg-api] PostgreSQL-Verbindung OK');
    else console.error('[cg-api] PostgreSQL nicht erreichbar – weiter mit Fallback');
  });
}

// ── APIContext (Sprint 7: nur Interfaces) ─────────────────────────────────────

const ctx: APIContext = {
  timepoints: repos.timepoints,
  domains:    repos.domains,
  manifests:  repos.manifests,
  relations:  repos.relations,
  segments:   repos.segments,
  now:        nowTaiNs,
};

// ── Route-Tabelle ─────────────────────────────────────────────────────────────

type HandlerFn = (req: CGRequest, ctx: APIContext) => Promise<CGResponse>;
interface Route { method: string; pattern: string; handler: HandlerFn; }

const routes: Route[] = [
  // System
  { method: 'GET',    pattern: '/v1/health',                    handler: handlers.getHealth },
  { method: 'GET',    pattern: '/v1/openapi.json',              handler: handlers.getOpenApi },
  // Timepoints
  { method: 'POST',   pattern: '/v1/timepoints/convert',        handler: handlers.convertTimepoint },
  { method: 'POST',   pattern: '/v1/timepoints/validate',       handler: handlers.validateTimepoint },
  { method: 'POST',   pattern: '/v1/timepoints',                handler: handlers.postTimepoints },
  { method: 'GET',    pattern: '/v1/timepoints',                handler: handlers.listTimepoints },
  { method: 'GET',    pattern: '/v1/timepoints/:machine_id',    handler: handlers.getTimepoint },
  // Domains
  { method: 'POST',   pattern: '/v1/domains/validate',          handler: handlers.validateDomain },
  { method: 'GET',    pattern: '/v1/domains',                   handler: handlers.listDomains },
  { method: 'POST',   pattern: '/v1/domains',                   handler: handlers.postDomain },
  // Relations
  { method: 'POST',   pattern: '/v1/relations/compute',         handler: handlers.computeRelation },
  // CGUAS
  { method: 'POST',   pattern: '/v1/segments',                  handler: handlers.postSegment },
  { method: 'GET',    pattern: '/v1/segments/resolve/:cgua',    handler: handlers.resolveCGUA },
  // CGFS
  { method: 'POST',   pattern: '/v1/files',                     handler: handlers.postFile },
  { method: 'GET',    pattern: '/v1/files/:cgfi',               handler: handlers.getFile },
  { method: 'DELETE', pattern: '/v1/files/:cgfi',               handler: handlers.deleteFile },
  // Sprint 7: GraphQL
  { method: 'POST',   pattern: '/v1/graphql',                   handler: handleGraphQLRequest },
  { method: 'GET',    pattern: '/v1/graphql',                   handler: graphqlPlayground },
  // Sprint 7: Webhooks
  { method: 'POST',   pattern: '/v1/webhooks',                  handler: webhooks.postWebhook },
  { method: 'GET',    pattern: '/v1/webhooks',                  handler: webhooks.listWebhooks },
  { method: 'GET',    pattern: '/v1/webhooks/deliveries',       handler: webhooks.getWebhookDeliveries },
  { method: 'DELETE', pattern: '/v1/webhooks/:id',              handler: webhooks.deleteWebhook },
];

// ── GraphQL Handler ───────────────────────────────────────────────────────────

async function handleGraphQLRequest(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    const result = await handleGraphQL(
      b['query'] as string,
      b['variables'] as Record<string, unknown> | undefined,
      ctx,
    );
    return jsonResponse(200, result);
  } catch (e) { return errorResponse(e); }
}

async function graphqlPlayground(_req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  return {
    status: 200,
    body: `<!DOCTYPE html><html><head><title>ChronoGrid GraphQL</title>
<style>body{font-family:monospace;padding:2rem;background:#1a1a1a;color:#e0e0e0}
pre{background:#2a2a2a;padding:1rem;border-radius:4px;overflow-x:auto}
h1{color:#4fc3f7}a{color:#81d4fa}</style></head><body>
<h1>ChronoGrid GraphQL (Sprint 7)</h1>
<p>Endpunkt: <code>POST /v1/graphql</code> | CG-STD-4100 Kap. 5</p>
<h2>Beispiel-Queries</h2>
<pre>
# Health
{ health { status version timestamp } }

# Zeitpunkt erstellen
mutation {
  createTimepoint(domain: "TAI", value: "1742041937") {
    machine_id cgta absolute_value
  }
}

# Allen-Relation
{ allenRelation(a_start:"100" a_end:"200" b_start:"150" b_end:"300") }

# Alle Domains
{ domains { name version published } }
</pre>
<p>Sende POST-Requests an <a href="/v1/graphql">/v1/graphql</a> mit JSON-Body:
<code>{"query":"{ health { status } }"}</code></p>
</body></html>`,
    headers: { 'Content-Type': 'text/html' },
  };
}

// ── Routing ───────────────────────────────────────────────────────────────────

function matchRoute(method: string, path: string): { handler: HandlerFn; params: Record<string,string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPattern(route.pattern, path);
    if (params !== null) return { handler: route.handler, params };
  }
  return null;
}

function matchPattern(pattern: string, path: string): Record<string,string> | null {
  const pParts = pattern.split('/');
  const uParts = path.split('/');
  if (pParts.length !== uParts.length) return null;
  const params: Record<string,string> = {};
  for (let i = 0; i < pParts.length; i++) {
    const p = pParts[i]!, u = uParts[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(u);
    else if (p !== u) return null;
  }
  return params;
}

// ── Request-Helpers ───────────────────────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      if (!body) { resolve({}); return; }
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Ungültiges JSON im Request-Body')); }
    });
    req.on('error', reject);
  });
}

function parseQuery(url: string): Record<string,string> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const q: Record<string,string> = {};
  new URLSearchParams(url.slice(idx + 1)).forEach((v, k) => { q[k] = v; });
  return q;
}

function sendResponse(res: ServerResponse, cgRes: CGResponse): void {
  const body = typeof cgRes.body === 'string' ? cgRes.body : JSON.stringify(cgRes.body, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v);
  const headers = cgRes.headers ?? { 'Content-Type': 'application/json' };
  res.writeHead(cgRes.status, { ...headers, 'X-ChronoGrid-Version': '0.7.0' });
  res.end(body);
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url    = req.url ?? '/';
  const path   = url.split('?')[0]!;
  const method = req.method ?? 'GET';

  // CORS für GraphQL Playground
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const match = matchRoute(method, path);
  if (!match) {
    sendResponse(res, jsonResponse(404, { message: `${method} ${path} nicht gefunden` }));
    return;
  }

  try {
    const body = await parseBody(req);
    const cgReq: CGRequest = {
      method, path, params: match.params, query: parseQuery(url), body,
      headers: req.headers as Record<string, string | string[] | undefined>,
    };
    const cgRes = await match.handler(cgReq, ctx);
    sendResponse(res, cgRes);
  } catch (err) {
    sendResponse(res, errorResponse(err));
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`[cg-api] Server läuft auf http://${HOST}:${PORT}`);
  console.log(`[cg-api] GraphQL:   http://${HOST}:${PORT}/v1/graphql`);
  console.log(`[cg-api] OpenAPI:   http://${HOST}:${PORT}/v1/openapi.json`);
  console.log(`[cg-api] Health:    http://${HOST}:${PORT}/v1/health`);
  console.log(`[cg-api] Sprint 7:  GraphQL + Webhooks + Interface-basierter APIContext`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[cg-api] SIGTERM – graceful shutdown');
  server.close(async () => { if (pool) await closePool(); process.exit(0); });
});
process.on('SIGINT', async () => {
  server.close(async () => { if (pool) await closePool(); process.exit(0); });
});
