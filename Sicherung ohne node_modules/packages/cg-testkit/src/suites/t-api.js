/**
 * cg-testkit/src/suites/t-api.ts
 * T-API + T-CTDDL — CG-STD-4100 v0.5 Kap. 9 + CG-STD-2100 v1.4 Kap. 9
 */
import { parseCTDDL, DomainRegistry } from '../../../cg-ctddl/src/parser.ts';
import { InMemoryTimepointRepository, InMemoryDomainRepository, InMemoryManifestRepository, InMemoryRelationRepository, } from '../../../cg-storage/src/repository.ts';
import { SegmentRegistry } from '../../../cg-cguas/src/cguas.ts';
import { dispatch } from '../../../cg-api/src/handlers.ts';
import { makeTestJWT } from '../../../cg-api/src/middleware.ts';
import { createHash } from 'node:crypto';
function makeCtx(nowNs = 1743585310000000000n) {
    return {
        timepoints: new InMemoryTimepointRepository(),
        domains: new InMemoryDomainRepository(),
        manifests: new InMemoryManifestRepository(),
        relations: new InMemoryRelationRepository(),
        segments: new SegmentRegistry(),
        now: () => nowNs,
    };
}
function h(role = 'contributor') {
    return { authorization: `Bearer ${makeTestJWT(role)}` };
}
function req(overrides = {}) {
    return { method: 'GET', path: '/', params: {}, query: {}, body: {}, headers: {}, ...overrides };
}
// ── T-CTDDL: Parser normative Tests (CG-STD-2100 Kap. 9) ─────────────────────
export const T_CTDDL = [
    {
        id: 'T-CTDDL-001', suite: 'T-CTDDL', level: 1,
        description: 'Gültige Domain wird akzeptiert',
        fn: () => {
            const d = parseCTDDL({
                name: 'test/valid', version: 1, semantics: 'time',
                type: 'linear', granularity: '1000000000',
                extent: { min: '0', max: null },
                epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
            });
            return d.name;
        },
        expected: 'test/valid',
    },
    {
        id: 'T-CTDDL-002', suite: 'T-CTDDL', level: 1,
        description: 'Fehlendes Pflichtfeld → CG-E-001.002',
        fn: () => {
            try {
                parseCTDDL({ version: 1 });
                return 'NO_ERROR';
            }
            catch (e) {
                return e.code;
            }
        },
        expected: 'CG-E-001.002',
    },
    {
        id: 'T-CTDDL-003', suite: 'T-CTDDL', level: 1,
        description: 'Ungültiger Domain-Typ → CG-E-001.004',
        fn: () => {
            try {
                parseCTDDL({
                    name: 'x/y', version: 1, semantics: 'time',
                    type: 'invalid', granularity: '1',
                    extent: { min: '0', max: null },
                    epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
                });
                return 'NO_ERROR';
            }
            catch (e) {
                return e.code;
            }
        },
        expected: 'CG-E-001.004',
    },
    {
        id: 'T-CTDDL-004', suite: 'T-CTDDL', level: 1,
        description: 'Ungültiger Domain-Name (ABNF) → CG-E-001.007',
        fn: () => {
            try {
                parseCTDDL({
                    name: 'INVALID NAME!', version: 1, semantics: 'time',
                    type: 'linear', granularity: '1',
                    extent: { min: '0', max: null },
                    epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
                });
                return 'NO_ERROR';
            }
            catch (e) {
                return e.code;
            }
        },
        expected: 'CG-E-001.007',
    },
    {
        id: 'T-CTDDL-005', suite: 'T-CTDDL', level: 1,
        description: 'I-D1: Registry verhindert Rollback (CG-E-007.004)',
        fn: () => {
            const reg = new DomainRegistry();
            const d2 = parseCTDDL({
                name: 'test/rollback', version: 2, semantics: 'time',
                type: 'linear', granularity: '1',
                extent: { min: '0', max: null },
                epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
            });
            reg.register(d2);
            try {
                const d1 = parseCTDDL({ ...d2, version: 1 });
                reg.register(d1);
                return 'NO_ERROR';
            }
            catch (e) {
                return e.code;
            }
        },
        expected: 'CG-E-007.004',
    },
    {
        id: 'T-CTDDL-006', suite: 'T-CTDDL', level: 1,
        description: 'CG-E-008.001 bei stability=low ohne scientific_dependency',
        fn: () => {
            try {
                parseCTDDL({
                    name: 'test/no-dep', version: 1, semantics: 'time',
                    type: 'linear', granularity: '1',
                    extent: { min: '0', max: null },
                    epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
                    stability: 'low',
                });
                return 'NO_ERROR';
            }
            catch (e) {
                return e.code;
            }
        },
        expected: 'CG-E-008.001',
    },
    {
        id: 'T-CTDDL-007', suite: 'T-CTDDL', level: 1,
        description: 'extent.min > extent.max → CG-E-003.003',
        fn: () => {
            try {
                parseCTDDL({
                    name: 'test/bad-extent', version: 1, semantics: 'time',
                    type: 'linear', granularity: '1',
                    extent: { min: '100', max: '10' }, // min > max
                    epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
                });
                return 'NO_ERROR';
            }
            catch (e) {
                return e.code;
            }
        },
        expected: 'CG-E-003.003',
    },
    {
        id: 'T-CTDDL-008', suite: 'T-CTDDL', level: 2,
        description: 'semantics=address für CGUAS-Domain',
        fn: () => {
            const d = parseCTDDL({
                name: 'cguas/root', version: 1, semantics: 'address',
                type: 'linear', granularity: '1',
                extent: { min: '0', max: String(2n ** 79n - 1n) },
                epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
            });
            return d.semantics;
        },
        expected: 'address',
    },
];
// ── T-API: REST API normative Tests (CG-STD-4100 Kap. 9) ─────────────────────
export const T_API = [
    // Level 1: Basis-Endpoints
    {
        id: 'T-API-001', suite: 'T-API', level: 1,
        description: 'GET /v1/health → 200 mit tai_now',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('GET', '/v1/health', req({ headers: {} }), ctx);
            return res.status;
        },
        expected: 200,
    },
    {
        id: 'T-API-002', suite: 'T-API', level: 1,
        description: 'POST /v1/timepoints → 201',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/timepoints', req({ headers: h(), body: { cgta: 'CG:TAI:1743585310000000000/v1' } }), ctx);
            return res.status;
        },
        expected: 201,
    },
    {
        id: 'T-API-003', suite: 'T-API', level: 1,
        description: 'POST /v1/timepoints idempotent → 200 beim zweiten Aufruf',
        fn: async () => {
            const ctx = makeCtx();
            const body = { cgta: 'CG:TAI:1743585310000000000/v1' };
            await dispatch('POST', '/v1/timepoints', req({ headers: h(), body }), ctx);
            const res2 = await dispatch('POST', '/v1/timepoints', req({ headers: h(), body }), ctx);
            return res2.status;
        },
        expected: 200,
    },
    {
        id: 'T-API-004', suite: 'T-API', level: 1,
        description: 'POST /v1/timepoints/validate → valid:true für korrektes CGTA',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/timepoints/validate', req({ headers: h('reader'), body: { cgta: 'CG:TAI:1743585310000000000/v1' } }), ctx);
            return res.body.valid;
        },
        expected: true,
    },
    {
        id: 'T-API-005', suite: 'T-API', level: 1,
        description: 'POST /v1/timepoints/validate → valid:false für ungültiges CGTA',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/timepoints/validate', req({ headers: h('reader'), body: { cgta: 'KEIN_CGTA' } }), ctx);
            return res.body.valid;
        },
        expected: false,
    },
    {
        id: 'T-API-006', suite: 'T-API', level: 1,
        description: 'POST /v1/timepoints ohne Auth → Fehler',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/timepoints', req({ headers: {}, body: { cgta: 'CG:TAI:1/v1' } }), ctx);
            return res.status >= 400;
        },
        expected: true,
    },
    {
        id: 'T-API-007', suite: 'T-API', level: 1,
        description: 'reader-Rolle kann nicht POST /timepoints (RBAC)',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/timepoints', req({ headers: h('reader'), body: { cgta: 'CG:TAI:1/v1' } }), ctx);
            return res.status >= 400;
        },
        expected: true,
    },
    // Level 2: Vollständige API
    {
        id: 'T-API-011', suite: 'T-API', level: 2,
        description: 'POST /v1/relations/compute before → korrekte Relation',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/relations/compute', req({
                headers: h('reader'),
                body: {
                    interval_a: { start: 'CG:TAI:1000000000000000000/v1', end: 'CG:TAI:2000000000000000000/v1' },
                    interval_b: { start: 'CG:TAI:3000000000000000000/v1', end: 'CG:TAI:4000000000000000000/v1' },
                },
            }), ctx);
            return res.body.relation;
        },
        expected: 'before',
    },
    {
        id: 'T-API-012', suite: 'T-API', level: 2,
        description: 'POST /v1/segments → 201 mit integrity_hash',
        fn: async () => {
            const ctx = makeCtx();
            const res = await dispatch('POST', '/v1/segments', req({
                headers: h(),
                body: { segment_id: 'test.seg', owner_id: 'X', parent_id: 'CG.CGUAS.ROOT', size_ns: '1000000000000000000000' },
            }), ctx);
            return res.status === 201 && typeof res.body.integrity_hash === 'string';
        },
        expected: true,
    },
    {
        id: 'T-API-013', suite: 'T-API', level: 2,
        description: 'POST /v1/files → CGFI deterministisch (I-R3)',
        fn: async () => {
            const ctx1 = makeCtx();
            const ctx2 = makeCtx();
            const body = {
                cgfs_version: '1.0', type_id: 'test/v1', type_schema: 'url',
                created_at: 'CG:TAI:1743585310000000000/v1',
                content_hash: createHash('sha256').update('same').digest('hex'),
                access_level: 'public',
            };
            const r1 = await dispatch('POST', '/v1/files', req({ headers: h(), body }), ctx1);
            const r2 = await dispatch('POST', '/v1/files', req({ headers: h(), body }), ctx2);
            return r1.body.cgfi ===
                r2.body.cgfi;
        },
        expected: true,
    },
    {
        id: 'T-API-014', suite: 'T-API', level: 2,
        description: 'DELETE /v1/files/:cgfi → logisch gelöscht (Tombstone, I-D1)',
        fn: async () => {
            const ctx = makeCtx();
            const content = Buffer.from('delete me');
            const ch = createHash('sha256').update(content).digest('hex');
            const post = await dispatch('POST', '/v1/files', req({
                headers: h(), body: { cgfs_version: '1.0', type_id: 'test/v1', type_schema: 'url',
                    created_at: 'CG:TAI:1/v1', content_hash: ch, access_level: 'public' },
            }), ctx);
            const cgfi = post.body.cgfi;
            const del = await dispatch('DELETE', `/v1/files/${cgfi}`, req({ headers: h('maintainer'), params: { cgfi }, body: { reason: 'dsgvo_art17' } }), ctx);
            // Manifest muss noch vorhanden sein (nur Tombstone, kein hartes Löschen)
            const get = await dispatch('GET', `/v1/files/${cgfi}`, req({ headers: h('reader'), params: { cgfi } }), ctx);
            const body = get.body;
            return del.status === 200 && body.cgfi === cgfi && body.deleted_at !== undefined;
        },
        expected: true,
    },
    // Level 3: Federation
    {
        id: 'T-API-021', suite: 'T-API', level: 3,
        description: 'OpenAPI 3.1 Spec verfügbar (Level 3 Anforderung)',
        fn: async () => {
            const { OPENAPI_SPEC } = await import('cg-api/openapi');
            return OPENAPI_SPEC.openapi === '3.1.0';
        },
        expected: true,
    },
];
// ── T-CGUAS: CGUA-Segment-Tests (CG-STD-6100 Kap. 3) ─────────────────────────
export const T_CGUAS = [
    {
        id: 'T-CGUAS-001', suite: 'T-CGUAS', level: 2,
        description: 'Root-Segment deckt 79-Bit-Adressraum',
        fn: () => {
            const reg = new SegmentRegistry();
            return reg.root.end_address === 2n ** 79n - 1n;
        },
        expected: true,
    },
    {
        id: 'T-CGUAS-002', suite: 'T-CGUAS', level: 2,
        description: 'Zwei Segmente überlappen nicht',
        fn: () => {
            const reg = new SegmentRegistry();
            const SIZE = 1000000000000000000000n;
            const base = { parent_id: 'CG.CGUAS.ROOT', size_ns: SIZE,
                granted_at: 'CG:TAI:1/v1', granted_by: 'X' };
            const s1 = reg.allocate({ ...base, segment_id: 'a', owner_id: 'A' });
            const s2 = reg.allocate({ ...base, segment_id: 'b', owner_id: 'B' });
            return s2.start_address >= s1.end_address;
        },
        expected: true,
    },
    {
        id: 'T-CGUAS-003', suite: 'T-CGUAS', level: 2,
        description: 'CGUA-Auflösung findet korrektes Segment',
        fn: () => {
            const reg = new SegmentRegistry();
            const seg = reg.allocate({
                segment_id: 'resolve.test', owner_id: 'X',
                size_ns: 1000000000000000000000n,
                parent_id: 'CG.CGUAS.ROOT',
                granted_at: 'CG:TAI:1/v1', granted_by: 'X',
            });
            const mid = seg.start_address + seg.size_ns / 2n;
            return reg.resolve(mid).segment_id;
        },
        expected: 'resolve.test',
    },
    {
        id: 'T-CGUAS-004', suite: 'T-CGUAS', level: 2,
        description: 'Integritäts-Hash wird korrekt verifiziert',
        fn: () => {
            const reg = new SegmentRegistry();
            const seg = reg.allocate({
                segment_id: 'integrity.test', owner_id: 'X',
                size_ns: 1000000000000000000000n,
                parent_id: 'CG.CGUAS.ROOT',
                granted_at: 'CG:TAI:1/v1', granted_by: 'X',
            });
            return reg.verifyIntegrity(seg);
        },
        expected: true,
    },
];
export const ALL_T_API = [...T_CTDDL, ...T_API, ...T_CGUAS];
