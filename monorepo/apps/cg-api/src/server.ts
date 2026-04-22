/**
 * cg-api/src/server.ts
 * HTTP-Server — CG-STD-4100 v0.7 Kap. 4
 * Start: tsx apps/cg-api/src/server.ts
 */

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createPool, closePool } from 'cg-storage/pg-client.js';
import { createRepositories } from 'cg-storage/repository-factory.js';
import {
  InMemoryTimepointRepository,
  InMemoryDomainRepository,
  InMemoryManifestRepository,
  InMemoryRelationRepository,
} from 'cg-storage/repository.js';
import { SegmentRegistry } from 'cg-cguas/cguas.js';
import type { APIContext } from './handlers.js';
import {
  getHealth, postTimepoints, getTimepoint, listTimepoints,
  convertTimepoint, validateTimepoint, computeRelation,
  listDomains, postDomain, postSegment, resolveCGUA,
  postFile, getFile, deleteFile,
} from './handlers.js';
import type { CGRequest, CGResponse } from './middleware.js';

const PORT = parseInt(process.env['API_PORT'] ?? '3000', 10);
const HOST = process.env['API_HOST'] ?? '127.0.0.1';
const STORAGE = process.env['STORAGE'] ?? 'memory';

const repos = createRepositories(
  STORAGE === 'postgres' ? createPool() : undefined,
  STORAGE === 'postgres' ? 'postgres' : 'memory',
);

console.log(`[cg-api] Storage-Backend: ${repos.backend}`);

const ctx: APIContext = {
  timepoints: new InMemoryTimepointRepository(),
  domains:    new InMemoryDomainRepository(),
  manifests:  new InMemoryManifestRepository(),
  relations:  new InMemoryRelationRepository(),
  segments:   new SegmentRegistry(),
  now:        () => BigInt(Date.now()) * 1_000_000n,
};

type HandlerFn = (req: CGRequest, ctx: APIContext) => Promise<CGResponse>;
interface Route { method: string; pattern: string; handler: HandlerFn; }

const routes: Route[] = [
  { method: 'GET',    pattern: '/v1/health',                  handler: getHealth },
  { method: 'POST',   pattern: '/v1/timepoints',              handler: postTimepoints },
  { method: 'GET',    pattern: '/v1/timepoints',              handler: listTimepoints },
  { method: 'GET',    pattern: '/v1/timepoints/:machine_id',  handler: getTimepoint },
  { method: 'POST',   pattern: '/v1/timepoints/convert',      handler: convertTimepoint },
  { method: 'POST',   pattern: '/v1/timepoints/validate',     handler: validateTimepoint },
  { method: 'GET',    pattern: '/v1/domains',                 handler: listDomains },
  { method: 'POST',   pattern: '/v1/domains',                 handler: postDomain },
  { method: 'POST',   pattern: '/v1/relations/compute',       handler: computeRelation },
  { method: 'POST',   pattern: '/v1/segments',                handler: postSegment },
  { method: 'GET',    pattern: '/v1/segments/resolve/:cgua',  handler: resolveCGUA },
  { method: 'POST',   pattern: '/v1/files',                   handler: postFile },
  { method: 'GET',    pattern: '/v1/files/:cgfi',             handler: getFile },
  { method: 'DELETE', pattern: '/v1/files/:cgfi',             handler: deleteFile },
];

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      if (!body) { resolve({}); return; }
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

function parseQuery(url: string): Record<string, string> {
  const q: Record<string, string> = {};
  const idx = url.indexOf('?');
  if (idx === -1) return q;
  for (const part of url.slice(idx + 1).split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = decodeURIComponent(part.slice(0, eq));
    const v = decodeURIComponent(part.slice(eq + 1));
    q[k] = v;
  }
  return q;
}

function parseParams(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/');
  const up = path.split('/');
  if (pp.length !== up.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i] ?? '';
    if (p.startsWith(':')) { params[p.slice(1)] = decodeURIComponent(up[i] ?? ''); }
    else if (p !== up[i]) return null;
  }
  return params;
}

function matchRoute(method: string, path: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.pattern === path) return { route, params: {} as Record<string, string> };
  }
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = parseParams(route.pattern, path);
    if (params !== null) return { route, params };
  }
  return null;
}

function bigintReplacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const rawUrl = req.url ?? '/';
  const path = rawUrl.split('?')[0] ?? rawUrl;
  const method = req.method ?? 'GET';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const match = matchRoute(method, path);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { http_status: 404, message: `${method} ${path} nicht gefunden` } }));
    return;
  }

  try {
    const body = await parseBody(req);
    const cgReq: CGRequest = {
      method, path, params: match.params,
      query: parseQuery(rawUrl),
      headers: req.headers as Record<string, string>,
      body,
    };
    const cgRes = await match.route.handler(cgReq, ctx);
    res.writeHead(cgRes.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cgRes.body, bigintReplacer));
  } catch (err) {
    console.error('[cg-api] Fehler:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { http_status: 500, message: 'Interner Serverfehler' } }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[cg-api] http://${HOST}:${PORT}/v1/health`);
});

process.on('SIGTERM', () => server.close(() => closePool().then(() => process.exit(0))));
process.on('SIGINT',  () => server.close(() => closePool().then(() => process.exit(0))));
