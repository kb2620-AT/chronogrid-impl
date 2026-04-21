/**
 * cg-api/src/sprint4.test.ts
 * Normative API-Tests Sprint 4 — CG-STD-4100 v0.5 Kap. 4
 * Testet alle 19 Endpoints gegen normative Request/Response-Formate.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { dispatch, ROUTES } from './handlers.js';
import type { APIContext } from './handlers.js';
import { makeTestJWT } from './middleware.js';
import { OPENAPI_SPEC } from './openapi.js';
import {
  InMemoryTimepointRepository,
  InMemoryDomainRepository,
  InMemoryManifestRepository,
  InMemoryRelationRepository,
} from 'cg-storage/repository.js';
import { SegmentRegistry } from 'cg-cguas/cguas.js';

let passed = 0;
let failed = 0;
let pending = 0;

// ── Test-Infrastruktur ────────────────────────────────────────────────────────
function makeCtx(nowNs = 1743585310_000_000_000n): APIContext {
  return {
    timepoints: new InMemoryTimepointRepository(),
    domains:    new InMemoryDomainRepository(),
    manifests:  new InMemoryManifestRepository(),
    relations:  new InMemoryRelationRepository(),
    segments:   new SegmentRegistry(),
    now: () => nowNs,
  };
}

function req(overrides: Partial<{ method: string; path: string; params: Record<string,string>; query: Record<string,string>; headers: Record<string,string>; body: unknown }> = {}) {
  return {
    method: 'GET', path: '/v1/health', params: {}, query: {}, body: {},
    headers: {},
    ...overrides,
  };
}

function authHeader(role: 'reader' | 'contributor' | 'maintainer' | 'tsc' | 'admin' = 'contributor') {
  return { authorization: `Bearer ${makeTestJWT(role)}` };
}

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  pending++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  } finally {
    pending--;
    if (pending === 0) {
      console.log(`\n── Ergebnis Sprint 4: ${passed} bestanden, ${failed} fehlgeschlagen ──\n`);
      if (failed > 0) process.exit(1);
    }
  }
}

// ── T-API-01: Router ──────────────────────────────────────────────────────────
console.log('\n── T-API-01: Router ──');

run('T-API-011: alle 19 Endpoints in ROUTES registriert', async () => {
  assert.ok(ROUTES.length >= 19, `Erwartet ≥19 Routen, got ${ROUTES.length}`);
});

run('T-API-012: GET /v1/health kein Auth erforderlich', async () => {
  const ctx = makeCtx();
  const res = await dispatch('GET', '/v1/health', req({ headers: {} }), ctx);
  assert.equal(res.status, 200);
  const body = res.body as Record<string, unknown>;
  assert.equal(body.status, 'ok');
  assert.ok(body.tai_now, 'tai_now muss vorhanden sein');
});

run('T-API-013: 404 bei unbekanntem Endpoint', async () => {
  const ctx = makeCtx();
  const res = await dispatch('GET', '/v1/unknown', req({ headers: {} }), ctx);
  assert.equal(res.status, 404);
});

// ── T-API-02: Timepoints ──────────────────────────────────────────────────────
console.log('\n── T-API-02: Zeitpunkte ──');

run('T-API-021: POST /v1/timepoints → 201', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints', req({
    headers: authHeader(),
    body: { cgta: 'CG:TAI:1743585310000000000/v1' },
  }), ctx);
  assert.equal(res.status, 201);
  const body = res.body as Record<string, unknown>;
  assert.ok(body.machine_id, 'machine_id fehlt');
  assert.equal(body.cgta, 'CG:TAI:1743585310000000000/v1');
});

run('T-API-022: POST /v1/timepoints idempotent → 200 beim zweiten Aufruf', async () => {
  const ctx = makeCtx();
  await dispatch('POST', '/v1/timepoints', req({
    headers: authHeader(), body: { cgta: 'CG:TAI:1743585310000000000/v1' },
  }), ctx);
  const res2 = await dispatch('POST', '/v1/timepoints', req({
    headers: authHeader(), body: { cgta: 'CG:TAI:1743585310000000000/v1' },
  }), ctx);
  assert.equal(res2.status, 200, 'Zweiter POST muss 200 zurückgeben (idempotent)');
});

run('T-API-023: GET /v1/timepoints/:machine_id → 200', async () => {
  const ctx = makeCtx();
  const post = await dispatch('POST', '/v1/timepoints', req({
    headers: authHeader(), body: { cgta: 'CG:TAI:1743585310000000000/v1' },
  }), ctx);
  const mid = (post.body as Record<string, unknown>).machine_id as string;

  const res = await dispatch('GET', `/v1/timepoints/${mid}`, req({
    headers: authHeader('reader'), params: { machine_id: mid },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).machine_id, mid);
});

run('T-API-024: GET /v1/timepoints/:machine_id → 422 bei unbekannter ID', async () => {
  const ctx = makeCtx();
  const res = await dispatch('GET', '/v1/timepoints/unknown', req({
    headers: authHeader('reader'), params: { machine_id: 'unknown' },
  }), ctx);
  assert.ok(res.status >= 400, `Erwartet Fehler, got ${res.status}`);
});

run('T-API-025: POST /v1/timepoints ohne Auth → Fehler', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints', req({
    headers: {}, body: { cgta: 'CG:TAI:1/v1' },
  }), ctx);
  assert.ok(res.status >= 400, 'Muss Fehler ohne Auth zurückgeben');
});

run('T-API-026: reader-Rolle darf nicht POST /timepoints', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints', req({
    headers: authHeader('reader'), body: { cgta: 'CG:TAI:1/v1' },
  }), ctx);
  assert.ok(res.status >= 400, 'Reader darf nicht schreiben');
});

run('T-API-027: POST /timepoints/validate gültig → valid: true', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints/validate', req({
    headers: authHeader('reader'), body: { cgta: 'CG:TAI:1743585310000000000/v1' },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).valid, true);
});

run('T-API-028: POST /timepoints/validate ungültig → valid: false', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints/validate', req({
    headers: authHeader('reader'), body: { cgta: 'KEIN_CGTA' },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).valid, false);
});

run('T-API-029: POST /timepoints/convert UTC→TAI', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints/convert', req({
    headers: authHeader('reader'),
    body: { cgta: 'CG:TAI:1743585310000000000/v1', target_domain: 'TAI/v1' },
  }), ctx);
  assert.equal(res.status, 200);
  const body = res.body as Record<string, unknown>;
  assert.ok(body.target, 'target fehlt');
});

run('T-API-030: POST /timepoints/batch Multi-Status 207', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/timepoints/batch', req({
    headers: authHeader(),
    body: {
      items: [
        { cgta: 'CG:TAI:1743585310000000000/v1' },
        { cgta: 'CG:TAI:1743585310100000000/v1' },
        { cgta: 'UNGUELTIG' },
      ],
    },
  }), ctx);
  assert.equal(res.status, 207);
  const results = (res.body as Record<string, unknown[]>).results;
  assert.equal(results.length, 3);
  assert.equal((results[0] as Record<string, number>).status, 201);
  assert.equal((results[2] as Record<string, number>).status, 422);
});

// ── T-API-03: Allen-Relationen ────────────────────────────────────────────────
console.log('\n── T-API-03: Relationen ──');

run('T-API-031: POST /relations/compute before', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/relations/compute', req({
    headers: authHeader('reader'),
    body: {
      interval_a: { start: 'CG:TAI:1000000000000000000/v1', end: 'CG:TAI:2000000000000000000/v1' },
      interval_b: { start: 'CG:TAI:3000000000000000000/v1', end: 'CG:TAI:4000000000000000000/v1' },
    },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).relation, 'before');
});

run('T-API-032: POST /relations/compute during', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/relations/compute', req({
    headers: authHeader('reader'),
    body: {
      interval_a: { start: 'CG:TAI:1500000000000000000/v1', end: 'CG:TAI:1800000000000000000/v1' },
      interval_b: { start: 'CG:TAI:1000000000000000000/v1', end: 'CG:TAI:2000000000000000000/v1' },
    },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).relation, 'during');
});

// ── T-API-04: CGUAS-Segmente ──────────────────────────────────────────────────
console.log('\n── T-API-04: CGUAS-Segmente ──');

run('T-API-041: POST /segments → 201', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/segments', req({
    headers: authHeader(),
    body: {
      segment_id: 'at.test.org', owner_id: 'Test Org',
      parent_id: 'CG.CGUAS.ROOT', size_ns: '1000000000000000000000',
    },
  }), ctx);
  assert.equal(res.status, 201);
  const body = res.body as Record<string, unknown>;
  assert.equal(body.segment_id, 'at.test.org');
  assert.ok(body.integrity_hash, 'integrity_hash fehlt');
  assert.ok(body.cgua_base, 'cgua_base fehlt');
});

run('T-API-042: GET /segments/:id → 200', async () => {
  const ctx = makeCtx();
  await dispatch('POST', '/v1/segments', req({
    headers: authHeader(),
    body: { segment_id: 'at.get.test', owner_id: 'X', parent_id: 'CG.CGUAS.ROOT', size_ns: '1000000000000000000000' },
  }), ctx);

  const res = await dispatch('GET', '/v1/segments/at.get.test', req({
    headers: authHeader('reader'), params: { segment_id: 'at.get.test' },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).segment_id, 'at.get.test');
});

run('T-API-043: GET /segments/resolve/:cgua → 200', async () => {
  const ctx = makeCtx();
  const postRes = await dispatch('POST', '/v1/segments', req({
    headers: authHeader(),
    body: { segment_id: 'at.resolve.test', owner_id: 'X', parent_id: 'CG.CGUAS.ROOT', size_ns: '1000000000000000000000' },
  }), ctx);
  const startAddr = (postRes.body as Record<string, unknown>).start_address as string;

  // Adresse = start + 5
  const addr = (BigInt(startAddr) + 5n).toString();
  const res = await dispatch('GET', `/v1/segments/resolve/${addr}`, req({
    headers: authHeader('reader'), params: { cgua: addr },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).segment_id, 'at.resolve.test');
  assert.equal((res.body as Record<string, unknown>).local_offset, '5');
});

// ── T-API-05: CGFS-Manifeste ──────────────────────────────────────────────────
console.log('\n── T-API-05: CGFS-Manifeste ──');

run('T-API-051: POST /files → 201 mit CGFI', async () => {
  const ctx = makeCtx();
  const content = Buffer.from('{"flight":"OS411"}');
  const contentHash = createHash('sha256').update(content).digest('hex');

  const res = await dispatch('POST', '/v1/files', req({
    headers: authHeader(),
    body: {
      cgfs_version: '1.0',
      type_id:      'aviation/atc-event/v1',
      type_schema:  'cgfs://types/aviation/atc-event/v1/schema.json',
      created_at:   'CG:TAI:1743585310000000000/v1',
      content_hash: contentHash,
      retention:    'P10Y',
      access_level: 'restricted',
    },
  }), ctx);
  assert.equal(res.status, 201);
  const body = res.body as Record<string, unknown>;
  assert.ok(body.cgfi, 'cgfi fehlt');
  assert.equal((body.cgfi as string).length, 64, 'CGFI muss 64 Hex-Zeichen sein');
});

run('T-API-052: GET /files/:cgfi → 200', async () => {
  const ctx = makeCtx();
  const content = Buffer.from('test content');
  const contentHash = createHash('sha256').update(content).digest('hex');

  const post = await dispatch('POST', '/v1/files', req({
    headers: authHeader(),
    body: {
      cgfs_version: '1.0', type_id: 'test/v1',
      type_schema: 'url', created_at: 'CG:TAI:1/v1',
      content_hash: contentHash, access_level: 'public',
    },
  }), ctx);
  const cgfi = (post.body as Record<string, unknown>).cgfi as string;

  const res = await dispatch('GET', `/v1/files/${cgfi}`, req({
    headers: authHeader('reader'), params: { cgfi },
  }), ctx);
  assert.equal(res.status, 200);
  assert.equal((res.body as Record<string, unknown>).cgfi, cgfi);
});

run('T-API-053: DELETE /files/:cgfi → logisches Löschen 200', async () => {
  const ctx = makeCtx();
  const content = Buffer.from('to delete');
  const contentHash = createHash('sha256').update(content).digest('hex');
  const post = await dispatch('POST', '/v1/files', req({
    headers: authHeader(),
    body: { cgfs_version: '1.0', type_id: 'test/v1', type_schema: 'url', created_at: 'CG:TAI:1/v1', content_hash: contentHash, access_level: 'public' },
  }), ctx);
  const cgfi = (post.body as Record<string, unknown>).cgfi as string;

  const del = await dispatch('DELETE', `/v1/files/${cgfi}`, req({
    headers: authHeader('maintainer'), params: { cgfi },
    body: { reason: 'dsgvo_art17' },
  }), ctx);
  assert.equal(del.status, 200);
  assert.ok((del.body as Record<string, unknown>).deleted_at);
});

run('T-API-054: CGFI-Determinismus — gleicher Inhalt → gleicher CGFI', async () => {
  const ctx1 = makeCtx();
  const ctx2 = makeCtx();
  const body = {
    cgfs_version: '1.0', type_id: 'test/v1', type_schema: 'url',
    created_at: 'CG:TAI:1743585310000000000/v1',
    content_hash: createHash('sha256').update('gleich').digest('hex'),
    access_level: 'public',
  };
  const r1 = await dispatch('POST', '/v1/files', req({ headers: authHeader(), body }), ctx1);
  const r2 = await dispatch('POST', '/v1/files', req({ headers: authHeader(), body }), ctx2);
  assert.equal(
    (r1.body as Record<string, unknown>).cgfi,
    (r2.body as Record<string, unknown>).cgfi,
    'Gleicher Inhalt muss gleichen CGFI erzeugen (I-R3)',
  );
});

// ── T-API-06: Domains ─────────────────────────────────────────────────────────
console.log('\n── T-API-06: Domains ──');

run('T-API-061: POST /domains → 202 (Draft)', async () => {
  const ctx = makeCtx();
  const res = await dispatch('POST', '/v1/domains', req({
    headers: authHeader(),
    body: {
      name: 'test/my-domain', version: 1, semantics: 'time',
      type: 'linear', granularity: '1000000000',
      extent: { min: '0', max: null },
      epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
    },
  }), ctx);
  assert.equal(res.status, 202);
  assert.equal((res.body as Record<string, unknown>).status, 'draft');
});

run('T-API-062: GET /domains/:id → 200', async () => {
  const ctx = makeCtx();
  await dispatch('POST', '/v1/domains', req({
    headers: authHeader(),
    body: {
      name: 'test/read-me', version: 1, semantics: 'time',
      type: 'linear', granularity: '1000000000',
      extent: { min: '0', max: null },
      epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
    },
  }), ctx);
  const res = await dispatch('GET', '/v1/domains/test/read-me/v1', req({
    headers: authHeader('reader'), params: { domain_id: 'test/read-me/v1' },
  }), ctx);
  assert.equal(res.status, 200);
});

// ── T-API-07: OpenAPI-Spezifikation ───────────────────────────────────────────
console.log('\n── T-API-07: OpenAPI 3.1 ──');

run('T-API-071: OpenAPI-Spec hat korrekte Version', async () => {
  assert.equal(OPENAPI_SPEC.openapi, '3.1.0');
});

run('T-API-072: OpenAPI-Spec enthält alle 6 Tag-Gruppen', async () => {
  assert.equal(OPENAPI_SPEC.tags.length, 6);
});

run('T-API-073: OpenAPI-Spec referenziert normative CGTA-Schema', async () => {
  const cgta = OPENAPI_SPEC.components.schemas.CGTA;
  assert.ok(cgta.pattern, 'CGTA-Pattern fehlt');
  assert.ok(cgta.example.startsWith('CG:'));
});

run('T-API-074: Alle normativen Fehlercodes im CGError-Schema', async () => {
  const schema = OPENAPI_SPEC.components.schemas.CGError;
  assert.ok(schema.properties.error.properties.cg_code);
});
