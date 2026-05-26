/**
 * cg-testkit/src/black-box.ts
 * Black-box-Testsuite für den Hybrid-Konformitäts-CLI
 *
 * Läuft gegen einen externen REST-Endpoint (--target <url>).
 * Kein lokaler Server, kein In-Process-Import — nur HTTP-Requests.
 *
 * Normative Grundlage: CG-STD-4100 v1.1 (REST-API), CG-STD-5100 v1.4 §2.3–2.4
 */

import type { TestCase } from './runner.js';

// ── HTTP-Hilfsfunktionen ──────────────────────────────────────────────────────

async function bbGet(base: string, path: string, token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { headers: h });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}

async function bbPost(base: string, path: string, data: unknown, token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: h, body: JSON.stringify(data) });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}

// ── Black-box-Testsuite erzeugen ──────────────────────────────────────────────

export function buildBlackBoxTests(target: string): TestCase[] {
  // Token wird vom /v1/auth/token-Endpoint des Targets geholt
  let writerToken = '';
  let readerToken = '';

  return [

    // ── Basis-Erreichbarkeit ─────────────────────────────────────────────────

    { id:'BB-001', suite:'BlackBox', level:1,
      description:'BB: GET /v1/health → 200',
      run: async () => (await bbGet(target, '/v1/health')).status,
      expected: 200 },

    { id:'BB-002', suite:'BlackBox', level:1,
      description:'BB: health.status = "ok"',
      run: async () => (await bbGet(target, '/v1/health')).body['status'],
      expected: 'ok' },

    { id:'BB-003', suite:'BlackBox', level:1,
      description:'BB: GET /v1/openapi.json → 200',
      run: async () => (await bbGet(target, '/v1/openapi.json')).status,
      expected: 200 },

    // ── Auth / Token-Endpoint ────────────────────────────────────────────────

    { id:'BB-010', suite:'BlackBox', level:2,
      description:'BB: GET /v1/auth/token?role=writer → 200 mit token',
      run: async () => {
        const r = await bbGet(target, '/v1/auth/token?role=writer');
        writerToken = r.body['token'] as string ?? '';
        return r.status === 200 && typeof writerToken === 'string' && writerToken.length > 0;
      },
      expected: true },

    { id:'BB-011', suite:'BlackBox', level:2,
      description:'BB: GET /v1/auth/token?role=reader → 200 mit token',
      run: async () => {
        const r = await bbGet(target, '/v1/auth/token?role=reader');
        readerToken = r.body['token'] as string ?? '';
        return r.status === 200 && typeof readerToken === 'string' && readerToken.length > 0;
      },
      expected: true },

    // ── Auth-Schutz ──────────────────────────────────────────────────────────

    { id:'BB-020', suite:'BlackBox', level:2,
      description:'BB: GET /v1/timepoints ohne Token → 401',
      run: async () => (await bbGet(target, '/v1/timepoints')).status,
      expected: 401 },

    { id:'BB-021', suite:'BlackBox', level:2,
      description:'BB: 401 enthält CG-E-012.001',
      run: async () => (await bbGet(target, '/v1/timepoints')).body['code'],
      expected: 'CG-E-012.001' },

    { id:'BB-022', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints mit reader-Token → 403',
      run: async () => (await bbPost(target, '/v1/timepoints', { domain:'TAI', value:'1' }, readerToken)).status,
      expected: 403 },

    // ── Timepoints: CRUD ─────────────────────────────────────────────────────

    { id:'BB-030', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints writer → 201',
      run: async () => (await bbPost(target, '/v1/timepoints', { domain:'TAI', value:'1742041937' }, writerToken)).status,
      expected: 201 },

    { id:'BB-031', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints → CGTA korrekt',
      run: async () => {
        const r = await bbPost(target, '/v1/timepoints', { domain:'TAI', value:'1742041937' }, writerToken);
        return String(r.body['cgta'] ?? '').startsWith('CG:TAI:');
      },
      expected: true },

    { id:'BB-032', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints → machine_id vorhanden (64 Zeichen)',
      run: async () => {
        const r = await bbPost(target, '/v1/timepoints', { domain:'TAI', value:'1742041937' }, writerToken);
        return String(r.body['machine_id'] ?? '').length === 64;
      },
      expected: true },

    { id:'BB-033', suite:'BlackBox', level:2,
      description:'BB: GET /v1/timepoints reader → 200 mit items-Array',
      run: async () => {
        const r = await bbGet(target, '/v1/timepoints', readerToken);
        return r.status === 200 && Array.isArray(r.body['items']);
      },
      expected: true },

    // ── Validierung & Konvertierung ───────────────────────────────────────────

    { id:'BB-040', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints/validate gültige CGTA → 200',
      run: async () => (await bbPost(target, '/v1/timepoints/validate', { cgta:'CG:TAI:1742041937/v1' }, readerToken)).status,
      expected: 200 },

    { id:'BB-041', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints/validate ungültige CGTA → 422',
      run: async () => (await bbPost(target, '/v1/timepoints/validate', { cgta:'INVALID' }, readerToken)).status,
      expected: 422 },

    { id:'BB-042', suite:'BlackBox', level:2,
      description:'BB: POST /v1/timepoints/convert UTC→TAI → 200',
      run: async () => (await bbPost(target, '/v1/timepoints/convert', { from_domain:'UTC', to_domain:'TAI', value:'0' }, readerToken)).status,
      expected: 200 },

    // ── Domains ───────────────────────────────────────────────────────────────

    { id:'BB-050', suite:'BlackBox', level:2,
      description:'BB: GET /v1/domains reader → 200',
      run: async () => (await bbGet(target, '/v1/domains', readerToken)).status,
      expected: 200 },

    { id:'BB-051', suite:'BlackBox', level:2,
      description:'BB: POST /v1/domains/validate gültige Domain → 200',
      run: async () => (await bbPost(target, '/v1/domains/validate',
        { name:'TV', version:'1.0', type:'linear', granularity:'second', extent:{ min:'0', max:'9999', inclusive:true } },
        readerToken)).status,
      expected: 200 },

    // ── Allen-Relationen ──────────────────────────────────────────────────────

    { id:'BB-060', suite:'BlackBox', level:2,
      description:'BB: POST /v1/relations/compute → 200 mit BEFORE',
      run: async () => {
        const r = await bbPost(target, '/v1/relations/compute',
          { a_start:'1', a_end:'5', b_start:'10', b_end:'20' }, readerToken);
        return r.status === 200 && r.body['relation'] === 'BEFORE';
      },
      expected: true },

    // ── GraphQL (Basis) ───────────────────────────────────────────────────────

    { id:'BB-070', suite:'BlackBox', level:2,
      description:'BB: POST /v1/graphql health query → 200',
      run: async () => (await bbPost(target, '/v1/graphql', { query:'{ health { status } }' }, readerToken)).status,
      expected: 200 },

    { id:'BB-071', suite:'BlackBox', level:2,
      description:'BB: GraphQL health.status = "ok"',
      run: async () => {
        const r = await bbPost(target, '/v1/graphql', { query:'{ health { status } }' }, readerToken);
        return (r.body['data'] as Record<string, unknown>)?.['health'];
      },
      expected: { status:'ok' } },

    // ── Segments ──────────────────────────────────────────────────────────────

    { id:'BB-080', suite:'BlackBox', level:2,
      description:'BB: POST /v1/segments writer → 201 status=active',
      run: async () => {
        const r = await bbPost(target, '/v1/segments', { granted_by:'bb-test', size_ns:'1000000' }, writerToken);
        return r.status === 201 && r.body['status'] === 'active';
      },
      expected: true },

    // ── Files / CGFS ──────────────────────────────────────────────────────────

    { id:'BB-090', suite:'BlackBox', level:2,
      description:'BB: POST /v1/files writer → 201 mit cgfi',
      run: async () => {
        const r = await bbPost(target, '/v1/files', { content_hash:'bb-hash-001', type_id:'pdf', size_bytes:'1024' }, writerToken);
        return r.status === 201 && typeof r.body['cgfi'] === 'string' && r.body['cgfi'].length === 64;
      },
      expected: true },

    { id:'BB-091', suite:'BlackBox', level:3,
      description:'BB: DELETE /v1/files/:cgfi → 200 (Tombstone)',
      run: async () => {
        const c = await bbPost(target, '/v1/files', { content_hash:'bb-hash-tomb', type_id:'txt', size_bytes:'0' }, writerToken);
        const cgfi = c.body['cgfi'] as string;
        const h: Record<string, string> = { 'Content-Type':'application/json', 'Authorization':`Bearer ${writerToken}` };
        const r = await fetch(`${target}/v1/files/${cgfi}`, { method:'DELETE', headers:h });
        return r.status;
      },
      expected: 200 },

    { id:'BB-092', suite:'BlackBox', level:3,
      description:'BB: GET tombstoned file → 410 Gone',
      run: async () => {
        const c = await bbPost(target, '/v1/files', { content_hash:'bb-hash-410', type_id:'log', size_bytes:'0' }, writerToken);
        const cgfi = c.body['cgfi'] as string;
        const hw: Record<string, string> = { 'Content-Type':'application/json', 'Authorization':`Bearer ${writerToken}` };
        await fetch(`${target}/v1/files/${cgfi}`, { method:'DELETE', headers:hw });
        return (await bbGet(target, `/v1/files/${cgfi}`, readerToken)).status;
      },
      expected: 410 },

    // ── Version-Header ────────────────────────────────────────────────────────

    { id:'BB-099', suite:'BlackBox', level:3,
      description:'BB: X-ChronoGrid-Version Header vorhanden',
      run: async () => {
        const r = await fetch(`${target}/v1/health`);
        const v = r.headers.get('x-chronogrid-version');
        return typeof v === 'string' && v.length > 0;
      },
      expected: true },

  ];
}
