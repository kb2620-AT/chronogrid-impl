/**
 * cg-testkit/src/suites/t-api.ts
 * T-API-* HTTP-Integrationstests — CG-STD-4100 v0.7 Kap. 4 + 7
 * Sprint 8: Live-Requests gegen internen Test-Server (Port 3099)
 *
 * Der Server wird vor den Tests gestartet und danach gestoppt.
 * Kein externer Prozess nötig – alles in-process.
 */

import type { TestCase } from '../runner.js';
import { TEST_TOKENS } from 'cg-api/auth.js';

const BASE = 'http://127.0.0.1:3099';

// ── Server-Lifecycle ──────────────────────────────────────────────────────────

let _serverRef: { close: (cb?: () => void) => void } | null = null;

async function startTestServer(): Promise<void> {
  if (_serverRef) return;
  // Eigenen Server auf Port 3099 starten (isoliert vom Dev-Server)
  process.env['API_PORT'] = '3099';
  process.env['API_HOST'] = '127.0.0.1';
  process.env['STORAGE'] = 'memory';
  const { server } = await import('cg-api/server.js' as string);
  _serverRef = server as { close: (cb?: () => void) => void };
  // Kurz warten bis Port offen
  await new Promise(r => setTimeout(r, 150));
}

async function stopTestServer(): Promise<void> {
  if (_serverRef) {
    await new Promise<void>(r => _serverRef!.close(() => r()));
    _serverRef = null;
  }
}

// ── HTTP-Helpers ──────────────────────────────────────────────────────────────

async function get(path: string, role?: 'admin' | 'writer' | 'reader'): Promise<{ status: number; body: unknown }> {
  await startTestServer();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (role) headers['Authorization'] = `Bearer ${TEST_TOKENS[role]()}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function post(path: string, data: unknown, role?: 'admin' | 'writer' | 'reader'): Promise<{ status: number; body: unknown }> {
  await startTestServer();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (role) headers['Authorization'] = `Bearer ${TEST_TOKENS[role]()}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function del(path: string, role?: 'admin' | 'writer' | 'reader'): Promise<{ status: number; body: unknown }> {
  await startTestServer();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (role) headers['Authorization'] = `Bearer ${TEST_TOKENS[role]()}`;
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── T-API Tests ───────────────────────────────────────────────────────────────

export const apiTests: TestCase[] = [

  // ── System / Public ────────────────────────────────────────────────────────

  { id: 'T-API-001', level: 2, description: 'GET /v1/health → 200 (public)',
    run: async () => (await get('/v1/health')).status,
    expected: 200 },

  { id: 'T-API-002', level: 2, description: 'GET /v1/health → status=ok',
    run: async () => ((await get('/v1/health')).body as Record<string, unknown>)['status'],
    expected: 'ok' },

  { id: 'T-API-003', level: 2, description: 'GET /v1/openapi.json → 200 (public)',
    run: async () => (await get('/v1/openapi.json')).status,
    expected: 200 },

  { id: 'T-API-004', level: 2, description: 'GET /v1/auth/token?role=reader → 200',
    run: async () => (await get('/v1/auth/token?role=reader')).status,
    expected: 200 },

  { id: 'T-API-005', level: 2, description: 'GET /v1/auth/token → gibt token zurück',
    run: async () => {
      const r = await get('/v1/auth/token?role=writer');
      return typeof ((r.body as Record<string, unknown>)['token']);
    },
    expected: 'string' },

  // ── Auth: 401 ohne Token ───────────────────────────────────────────────────

  { id: 'T-API-006', level: 2, description: 'GET /v1/timepoints ohne Token → 401',
    run: async () => (await get('/v1/timepoints')).status,
    expected: 401 },

  { id: 'T-API-007', level: 2, description: 'POST /v1/timepoints ohne Token → 401',
    run: async () => (await post('/v1/timepoints', { domain: 'TAI', value: '1' })).status,
    expected: 401 },

  { id: 'T-API-008', level: 2, description: 'GET /v1/domains ohne Token → 401',
    run: async () => (await get('/v1/domains')).status,
    expected: 401 },

  // ── Auth: 403 falsche Rolle ────────────────────────────────────────────────

  { id: 'T-API-009', level: 2, description: 'POST /v1/timepoints mit reader → 403',
    run: async () => (await post('/v1/timepoints', { domain: 'TAI', value: '1' }, 'reader')).status,
    expected: 403 },

  { id: 'T-API-010', level: 2, description: '401-Body enthält code=CG-E-012.001',
    run: async () => ((await get('/v1/timepoints')).body as Record<string, unknown>)['code'],
    expected: 'CG-E-012.001' },

  { id: 'T-API-011', level: 2, description: '403-Body enthält code=CG-E-012.002',
    run: async () => ((await post('/v1/timepoints', {domain:'TAI',value:'1'}, 'reader')).body as Record<string, unknown>)['code'],
    expected: 'CG-E-012.002' },

  // ── Timepoints CRUD (mit Authentifizierung) ────────────────────────────────

  { id: 'T-API-012', level: 2, description: 'POST /v1/timepoints writer → 201',
    run: async () => (await post('/v1/timepoints', { domain: 'TAI', value: '1742041937' }, 'writer')).status,
    expected: 201 },

  { id: 'T-API-013', level: 2, description: 'POST /v1/timepoints → gibt machine_id zurück',
    run: async () => {
      const r = await post('/v1/timepoints', { domain: 'TAI', value: '1742041937' }, 'writer');
      return typeof ((r.body as Record<string, unknown>)['machine_id']);
    },
    expected: 'string' },

  { id: 'T-API-014', level: 2, description: 'POST /v1/timepoints → CGTA korrekt',
    run: async () => {
      const r = await post('/v1/timepoints', { domain: 'TAI', value: '1742041937' }, 'writer');
      return ((r.body as Record<string, unknown>)['cgta'] as string)?.startsWith('CG:TAI:');
    },
    expected: true },

  { id: 'T-API-015', level: 2, description: 'GET /v1/timepoints reader → 200',
    run: async () => (await get('/v1/timepoints', 'reader')).status,
    expected: 200 },

  { id: 'T-API-016', level: 2, description: 'GET /v1/timepoints → gibt items-Array zurück',
    run: async () => {
      const r = await get('/v1/timepoints', 'reader');
      return Array.isArray(((r.body as Record<string, unknown>)['items']));
    },
    expected: true },

  { id: 'T-API-017', level: 2, description: 'GET /v1/timepoints/:id → Zeitpunkt abrufbar',
    run: async () => {
      const created = await post('/v1/timepoints', { domain: 'TAI', value: '999000' }, 'writer');
      const id = ((created.body as Record<string, unknown>)['machine_id']) as string;
      const r = await get(`/v1/timepoints/${id}`, 'reader');
      return r.status;
    },
    expected: 200 },

  { id: 'T-API-018', level: 2, description: 'GET /v1/timepoints/nonexistent → 404',
    run: async () => (await get('/v1/timepoints/nonexistent-id-xyz', 'reader')).status,
    expected: 404 },

  // ── Konversion + Validierung ───────────────────────────────────────────────

  { id: 'T-API-019', level: 2, description: 'POST /v1/timepoints/convert UTC→TAI reader → 200',
    run: async () => (await post('/v1/timepoints/convert', { from_domain: 'UTC', to_domain: 'TAI', value: '0' }, 'reader')).status,
    expected: 200 },

  { id: 'T-API-020', level: 2, description: 'POST /v1/timepoints/validate gültige CGTA reader → 200',
    run: async () => (await post('/v1/timepoints/validate', { cgta: 'CG:TAI:1742041937/v1' }, 'reader')).status,
    expected: 200 },

  { id: 'T-API-021', level: 2, description: 'POST /v1/timepoints/validate ungültig → 422',
    run: async () => (await post('/v1/timepoints/validate', { cgta: 'INVALID' }, 'reader')).status,
    expected: 422 },

  // ── Domains ───────────────────────────────────────────────────────────────

  { id: 'T-API-022', level: 2, description: 'GET /v1/domains reader → 200',
    run: async () => (await get('/v1/domains', 'reader')).status,
    expected: 200 },

  { id: 'T-API-023', level: 2, description: 'POST /v1/domains/validate reader → 200',
    run: async () => (await post('/v1/domains/validate', { name: 'TestV', version: '1.0', type: 'linear', granularity: 'second', extent: { min: '0', max: '9999', inclusive: true } }, 'reader')).status,
    expected: 200 },

  { id: 'T-API-024', level: 2, description: 'POST /v1/domains writer → 201',
    run: async () => (await post('/v1/domains', { name: `ApiTestDomain${Date.now()}`, version: '1.0', type: 'linear', granularity: 'second', extent: { min: '0', max: '9999', inclusive: true }, metadata: { stability: 'permanent' } }, 'writer')).status,
    expected: 201 },

  // ── Relationen ────────────────────────────────────────────────────────────

  { id: 'T-API-025', level: 2, description: 'POST /v1/relations/compute reader → 200',
    run: async () => (await post('/v1/relations/compute', { a_start: '1', a_end: '5', b_start: '10', b_end: '20' }, 'reader')).status,
    expected: 200 },

  { id: 'T-API-026', level: 2, description: 'Relations-Ergebnis = BEFORE',
    run: async () => {
      const r = await post('/v1/relations/compute', { a_start: '1', a_end: '5', b_start: '10', b_end: '20' }, 'reader');
      return ((r.body as Record<string, unknown>)['relation']);
    },
    expected: 'BEFORE' },

  // ── CGUAS Segmente ────────────────────────────────────────────────────────

  { id: 'T-API-027', level: 2, description: 'POST /v1/segments writer → 201',
    run: async () => (await post('/v1/segments', { granted_by: 'test', size_ns: '1000000' }, 'writer')).status,
    expected: 201 },

  { id: 'T-API-028', level: 2, description: 'Segment hat status=active',
    run: async () => {
      const r = await post('/v1/segments', { granted_by: 'test', size_ns: '1000' }, 'writer');
      return ((r.body as Record<string, unknown>)['status']);
    },
    expected: 'active' },

  // ── CGFS Dateien ──────────────────────────────────────────────────────────

  { id: 'T-API-029', level: 2, description: 'POST /v1/files writer → 201',
    run: async () => (await post('/v1/files', { content_hash: 'abc123', type_id: 'pdf', size_bytes: '1024' }, 'writer')).status,
    expected: 201 },

  { id: 'T-API-030', level: 2, description: 'GET /v1/files/:cgfi reader → 200',
    run: async () => {
      const created = await post('/v1/files', { content_hash: 'def456', type_id: 'txt', size_bytes: '512' }, 'writer');
      const cgfi = ((created.body as Record<string, unknown>)['cgfi']) as string;
      return (await get(`/v1/files/${cgfi}`, 'reader')).status;
    },
    expected: 200 },

  { id: 'T-API-031', level: 3, description: 'DELETE /v1/files/:cgfi writer → 200 (Tombstone)',
    run: async () => {
      const created = await post('/v1/files', { content_hash: 'del789', type_id: 'csv', size_bytes: '256' }, 'writer');
      const cgfi = ((created.body as Record<string, unknown>)['cgfi']) as string;
      return (await del(`/v1/files/${cgfi}`, 'writer')).status;
    },
    expected: 200 },

  { id: 'T-API-032', level: 3, description: 'GET tombstoned file → 410',
    run: async () => {
      const created = await post('/v1/files', { content_hash: 'tomb111', type_id: 'log', size_bytes: '0' }, 'writer');
      const cgfi = ((created.body as Record<string, unknown>)['cgfi']) as string;
      await del(`/v1/files/${cgfi}`, 'writer');
      return (await get(`/v1/files/${cgfi}`, 'reader')).status;
    },
    expected: 410 },

  // ── GraphQL via HTTP ──────────────────────────────────────────────────────

  { id: 'T-API-033', level: 2, description: 'POST /v1/graphql health reader → 200',
    run: async () => (await post('/v1/graphql', { query: '{ health { status } }' }, 'reader')).status,
    expected: 200 },

  { id: 'T-API-034', level: 2, description: 'GraphQL health.status = ok',
    run: async () => {
      const r = await post('/v1/graphql', { query: '{ health { status } }' }, 'reader');
      return ((r.body as Record<string, unknown>)['data'] as Record<string, unknown>)?.['health'];
    },
    expected: { status: 'ok' } },

  // ── Admin-only (placeholder für future) ───────────────────────────────────

  { id: 'T-API-035', level: 3, description: 'X-ChronoGrid-Version Header vorhanden',
    run: async () => {
      await startTestServer();
      const res = await fetch(`${BASE}/v1/health`);
      return res.headers.get('x-chronogrid-version');
    },
    expected: '0.8.0' },
];

// Export-Hook: Server nach allen Tests stoppen
export async function teardown(): Promise<void> {
  await stopTestServer();
}
