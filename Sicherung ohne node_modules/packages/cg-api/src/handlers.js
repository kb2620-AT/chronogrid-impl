/**
 * cg-api/src/handlers.ts
 * REST API Endpoint-Handler — CG-STD-4100 v0.5 Kap. 4
 * 16 normative Endpoints. Framework-agnostisch.
 * Jeder Handler: (request, context) → CGResponse
 *
 * Normative Anforderungen:
 * - Alle Zeitstempel in Responses als CGTA-String (Kap. 4.1)
 * - POST /timepoints ist idempotent (gleiche MachineID → 200, nicht 201)
 * - BigInt-Werte als Strings in JSON (JSON kann kein BigInt)
 * - Insert-only: keine Update/Delete auf Kerndaten (I-D1)
 */
import { verifyJWT, requireRole, ok, errorResponse } from './middleware.ts';
import { parseCGTA, encodeCGTA } from '../../cg-types/src/domain.ts';
import { Errors } from '../../cg-types/src/errors.ts';
import { computeMachineID, computeCGFI, cgfiToHex, machineIdToHex, } from '../../cg-engine/src/engine.ts';
import { Allen } from '../../cg-engine/src/engine.ts';
import { parseCTDDL } from '../../cg-ctddl/src/parser.ts';
import { makeRelationRow, makeDomainId } from '../../cg-storage/src/repository.ts';
import { cguaToString, parseCGUA } from '../../cg-cguas/src/cguas.ts';
// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function taiCGTA(taiNs) {
    return `CG:TAI:${taiNs}/v1`;
}
function bigintSafe(v) {
    return v.toString(); // JSON kennt kein BigInt
}
// ── 1. POST /v1/timepoints ────────────────────────────────────────────────────
// Idempotent: gleiche MachineID → 200, nicht 201 (Kap. 4.2.1)
export const postTimepoints = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'contributor');
    const body = req.body;
    if (!body?.cgta)
        throw Errors.SyntaxError.MissingField('cgta');
    const cgta = parseCGTA(body.cgta);
    const taiNs = ctx.now();
    const machineId = machineIdToHex(computeMachineID(cgta.value));
    // Idempotenz: bereits vorhanden → 200
    const existing = await ctx.timepoints.findByMachineId(machineId);
    if (existing) {
        return ok({
            machine_id: existing.machine_id,
            cgta: existing.cgta_string,
            absolute_value: bigintSafe(existing.absolute_value),
            domain: existing.domain_id,
            granularity: existing.granularity,
            created_at: existing.created_at,
        }, 200);
    }
    const row = {
        machine_id: machineId,
        cgta_string: body.cgta,
        domain_id: makeDomainId(cgta.domain, cgta.version),
        absolute_value: cgta.value,
        granularity: 'nanosecond',
        created_at: taiCGTA(taiNs),
        created_by: auth.sub,
    };
    await ctx.timepoints.insert(row);
    return ok({
        machine_id: machineId,
        cgta: body.cgta,
        absolute_value: bigintSafe(cgta.value),
        domain: makeDomainId(cgta.domain, cgta.version),
        granularity: 'nanosecond',
        created_at: taiCGTA(taiNs),
    }, 201);
};
// ── 2. GET /v1/timepoints/:machine_id ─────────────────────────────────────────
export const getTimepoint = async (req, ctx) => {
    verifyJWT(req.headers.authorization);
    const { machine_id } = req.params;
    const tp = await ctx.timepoints.findByMachineId(machine_id);
    if (!tp)
        throw Errors.VersionError.NotFound(machine_id, 0);
    return ok({
        machine_id: tp.machine_id,
        cgta: tp.cgta_string,
        absolute_value: bigintSafe(tp.absolute_value),
        domain: tp.domain_id,
        granularity: tp.granularity,
        created_at: tp.created_at,
        created_by: tp.created_by,
    });
};
// ── 3. GET /v1/timepoints (gefiltert, cursor-basiert) ─────────────────────────
export const listTimepoints = async (req, ctx) => {
    verifyJWT(req.headers.authorization);
    const domain = req.query.domain;
    const limitRaw = parseInt(req.query.limit ?? '100', 10);
    const limit = Math.min(Math.max(1, limitRaw), 1000); // max. 1000 (Kap. 4.1)
    const after = req.query.after;
    let results = domain
        ? await ctx.timepoints.findByDomainAndRange(domain, BigInt(0), BigInt(2) ** BigInt(79))
        : [];
    // Cursor-Paginierung
    if (after) {
        const idx = results.findIndex(r => r.machine_id === after);
        if (idx >= 0)
            results = results.slice(idx + 1);
    }
    const page = results.slice(0, limit);
    const hasMore = results.length > limit;
    return ok({
        data: page.map(tp => ({
            machine_id: tp.machine_id,
            cgta: tp.cgta_string,
            absolute_value: bigintSafe(tp.absolute_value),
            domain: tp.domain_id,
        })),
        pagination: {
            next_cursor: hasMore ? page[page.length - 1]?.machine_id : null,
            has_more: hasMore,
            total_hint: results.length,
        },
    });
};
// ── 4. POST /v1/timepoints/convert (zustandslos) ──────────────────────────────
export const convertTimepoint = async (req, _ctx) => {
    verifyJWT(req.headers.authorization);
    const body = req.body;
    if (!body?.cgta)
        throw Errors.SyntaxError.MissingField('cgta');
    if (!body?.target_domain)
        throw Errors.SyntaxError.MissingField('target_domain');
    const source = parseCGTA(body.cgta);
    // Nur TAI-Ziel für Sprint 4 (Klasse-B kommt in Sprint 5)
    const targetName = body.target_domain.split('/')[0];
    const targetVer = parseInt(body.target_domain.split('/v')[1] ?? '1', 10);
    // Konvertierung via Mapping-Engine (import aus Sprint 2)
    const { sourceToTaiNs, taiNsToTarget } = await import('cg-ctddl/mapping');
    const taiNs = sourceToTaiNs(source.value, source.domain);
    const targetNs = taiNsToTarget(taiNs, targetName);
    const targetCGTA = encodeCGTA({ domain: targetName, value: targetNs, version: targetVer });
    const targetMid = machineIdToHex(computeMachineID(targetNs));
    return ok({
        source: { cgta: body.cgta, domain: makeDomainId(source.domain, source.version) },
        target: {
            cgta: targetCGTA,
            absolute_value: bigintSafe(targetNs),
            domain: body.target_domain,
            machine_id: targetMid,
        },
        mapping_id: `${source.domain}/v${source.version}->${targetName}/v${targetVer}`,
        mapping_class: 'A',
    });
};
// ── 5. POST /v1/timepoints/validate (zustandslos) ─────────────────────────────
export const validateTimepoint = async (req, _ctx) => {
    verifyJWT(req.headers.authorization);
    const body = req.body;
    try {
        const cgta = parseCGTA(body.cgta);
        const mid = machineIdToHex(computeMachineID(cgta.value));
        return ok({ valid: true, domain: makeDomainId(cgta.domain, cgta.version), machine_id: mid });
    }
    catch (err) {
        return ok({
            valid: false,
            error: {
                cg_code: 'CG-E-001.007',
                message: err.message,
            },
        });
    }
};
// ── 6. POST /v1/timepoints/batch (Multi-Status 207) ──────────────────────────
export const batchTimepoints = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'contributor');
    const body = req.body;
    if (!Array.isArray(body?.items))
        throw Errors.SyntaxError.MissingField('items');
    if (body.items.length > 1000) {
        throw Errors.SyntaxError.InvalidFieldType('items', 'array[max 1000]', String(body.items.length));
    }
    const results = [];
    for (const item of body.items) {
        try {
            const cgta = parseCGTA(item.cgta);
            const taiNs = ctx.now();
            const mid = machineIdToHex(computeMachineID(cgta.value));
            const existing = await ctx.timepoints.findByMachineId(mid);
            if (!existing) {
                await ctx.timepoints.insert({
                    machine_id: mid, cgta_string: item.cgta,
                    domain_id: makeDomainId(cgta.domain, cgta.version),
                    absolute_value: cgta.value, granularity: 'nanosecond',
                    created_at: taiCGTA(taiNs), created_by: auth.sub,
                });
                results.push({ cgta: item.cgta, status: 201, machine_id: mid });
            }
            else {
                results.push({ cgta: item.cgta, status: 200, machine_id: mid });
            }
        }
        catch (err) {
            results.push({ cgta: item.cgta, status: 422, error: err.message });
        }
    }
    return ok({ results }, 207);
};
// ── 7. POST /v1/relations/compute (zustandslos) ───────────────────────────────
export const computeRelation = async (req, _ctx) => {
    verifyJWT(req.headers.authorization);
    const body = req.body;
    const parseInterval = (iv) => {
        const s = parseCGTA(iv.start);
        const e = parseCGTA(iv.end);
        return { start: s.value, end: e.value, domain: s.domain, version: s.version };
    };
    const a = parseInterval(body.interval_a);
    const b = parseInterval(body.interval_b);
    // Alle zutreffenden Allen-Relationen (normativ: genau eine trifft zu)
    const allRels = Allen.all(a, b);
    const primary = allRels[0] ?? 'unknown';
    const SYMBOLS = {
        before: '<', after: '>', meets: 'm', metBy: 'mi',
        overlaps: 'o', overlappedBy: 'oi', starts: 's', startedBy: 'si',
        during: 'd', contains: 'di', finishes: 'f', finishedBy: 'fi', equals: '=',
    };
    return ok({
        relation: primary,
        symbol: SYMBOLS[primary] ?? '?',
        all_holding: allRels,
        description: `Intervall A ${primary} Intervall B`,
    });
};
// ── 8. POST /v1/relations (persistieren) ──────────────────────────────────────
export const postRelation = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'contributor');
    const body = req.body;
    const row = makeRelationRow(body.machine_id_a, body.machine_id_b, body.relation_type, taiCGTA(ctx.now()));
    await ctx.relations.insert(row);
    return ok({ relation_id: row.relation_id, ...body }, 201);
};
// ── 9. GET /v1/domains ────────────────────────────────────────────────────────
export const listDomains = async (req, ctx) => {
    verifyJWT(req.headers.authorization);
    const domains = await ctx.domains.list();
    return ok({
        data: domains.map(d => ({
            domain_id: makeDomainId(d.name, d.version),
            name: d.name, version: d.version, semantics: d.semantics,
            stability: d.stability,
        })),
        total: domains.length,
    });
};
// ── 10. GET /v1/domains/:domain_id ────────────────────────────────────────────
export const getDomain = async (req, ctx) => {
    verifyJWT(req.headers.authorization);
    const domain = await ctx.domains.findById(req.params.domain_id);
    if (!domain)
        throw Errors.VersionError.NotFound(req.params.domain_id, 0);
    return ok(domain);
};
// ── 11. POST /v1/domains ──────────────────────────────────────────────────────
// Einreichung als Draft — 202 Accepted (kein sofortiges Freigeben)
export const postDomain = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'contributor');
    const body = req.body;
    const domain = parseCTDDL(body); // normative Validierung
    await ctx.domains.insert(domain, taiCGTA(ctx.now()), auth.sub);
    return ok({
        domain_id: makeDomainId(domain.name, domain.version),
        status: 'draft',
        message: 'Domain eingereicht. TSC-Vote für Freigabe erforderlich (POST /domains/:id/publish).',
    }, 202);
};
// ── 12. POST /v1/domains/:domain_id/publish ───────────────────────────────────
export const publishDomain = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'tsc'); // TSC-Vote erforderlich (Kap. 4.3)
    const domain = await ctx.domains.findById(req.params.domain_id);
    if (!domain)
        throw Errors.VersionError.NotFound(req.params.domain_id, 0);
    return ok({
        domain_id: req.params.domain_id,
        status: 'published',
        published_at: taiCGTA(ctx.now()),
        published_by: auth.sub,
    });
};
// ── 13. POST /v1/segments ─────────────────────────────────────────────────────
export const postSegment = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'contributor');
    const body = req.body;
    for (const f of ['segment_id', 'owner_id', 'parent_id', 'size_ns']) {
        if (!body[f])
            throw Errors.SyntaxError.MissingField(f);
    }
    const sizeNs = BigInt(body.size_ns);
    const taiNs = ctx.now();
    const seg = ctx.segments.allocate({
        segment_id: body.segment_id,
        owner_id: body.owner_id,
        parent_id: body.parent_id,
        size_ns: sizeNs,
        granted_at: taiCGTA(taiNs),
        granted_by: auth.sub,
    });
    return ok({
        segment_id: seg.segment_id,
        start_address: bigintSafe(seg.start_address),
        end_address: bigintSafe(seg.end_address),
        size_ns: bigintSafe(seg.size_ns),
        level: seg.level,
        granted_at: seg.granted_at,
        integrity_hash: seg.integrity_hash,
        cgua_base: cguaToString(seg.start_address),
    }, 201);
};
// ── 14. GET /v1/segments/:segment_id ─────────────────────────────────────────
export const getSegment = async (req, ctx) => {
    verifyJWT(req.headers.authorization);
    const seg = ctx.segments.getById(req.params.segment_id);
    return ok({
        segment_id: seg.segment_id,
        owner_id: seg.owner_id,
        parent_id: seg.parent_id,
        start_address: bigintSafe(seg.start_address),
        end_address: bigintSafe(seg.end_address),
        size_ns: bigintSafe(seg.size_ns),
        level: seg.level,
        status: seg.status,
        granted_at: seg.granted_at,
        integrity_hash: seg.integrity_hash,
    });
};
// ── 15. GET /v1/segments/resolve/:cgua ───────────────────────────────────────
export const resolveCGUA = async (req, ctx) => {
    verifyJWT(req.headers.authorization);
    const cguaVal = parseCGUA(`CG:CGUAS:${req.params.cgua}/v1`);
    const seg = ctx.segments.resolve(cguaVal);
    const localOffset = cguaVal - seg.start_address;
    return ok({
        cgua: cguaToString(cguaVal),
        segment_id: seg.segment_id,
        owner_id: seg.owner_id,
        local_offset: bigintSafe(localOffset),
        level: seg.level,
    });
};
// ── 16. POST /v1/files ────────────────────────────────────────────────────────
export const postFile = async (req, ctx) => {
    const auth = verifyJWT(req.headers.authorization);
    requireRole(auth, 'contributor');
    const body = req.body;
    for (const f of ['cgfs_version', 'type_id', 'type_schema', 'created_at', 'content_hash']) {
        if (!body[f])
            throw Errors.SyntaxError.MissingField(f);
    }
    // CGFI berechnen (CG-STD-3100 Kap. 5.4)
    // content_hash ist SHA-256 des Dateiinhalts — als Bytes für CGFI-Berechnung
    const createdAt = parseCGTA(body.created_at);
    const contentHashBytes = Buffer.from(body.content_hash, 'hex');
    // CGFI = SHA-256(tai_canonical || content_hash || type_id || seq)
    const cgfi = cgfiToHex(computeCGFI(createdAt.value, contentHashBytes, body.type_id));
    const row = {
        cgfi,
        cgfs_version: body.cgfs_version ?? '1.0',
        type_id: body.type_id,
        type_schema: body.type_schema,
        created_at: body.created_at,
        content_hash: body.content_hash,
        created_by: auth.sub,
        access_level: body.access_level ?? 'restricted',
    };
    if (body.size_bytes !== undefined)
        row.size_bytes = body.size_bytes;
    if (body.prev_version !== undefined)
        row.prev_version = body.prev_version;
    if (body.cgua !== undefined)
        row.cgua = body.cgua;
    if (body.valid_from !== undefined)
        row.valid_from = body.valid_from;
    if (body.valid_until !== undefined)
        row.valid_until = body.valid_until;
    if (body.retention !== undefined)
        row.retention = body.retention;
    if (body.review_after !== undefined)
        row.review_after = body.review_after;
    if (body.language !== undefined)
        row.language = body.language;
    if (body.tags !== undefined)
        row.tags = body.tags;
    await ctx.manifests.insert(row);
    return ok({
        cgfi,
        cgfs_version: row.cgfs_version,
        type_id: row.type_id,
        created_at: row.created_at,
        cgua: row.cgua,
    }, 201);
};
// ── 17. GET /v1/files/:cgfi ───────────────────────────────────────────────────
export const getFile = async (_req, ctx) => {
    verifyJWT(_req.headers.authorization);
    const man = await ctx.manifests.findByCGFI(_req.params.cgfi);
    if (!man)
        throw Errors.CGFSError.ManifestMissing();
    return ok({
        ...man,
        deleted: !!man.deleted_at,
    });
};
// ── 18. DELETE /v1/files/:cgfi (logisches Löschen, DSGVO Art. 17) ───────────
export const deleteFile = async (_req, ctx) => {
    const auth = verifyJWT(_req.headers.authorization);
    requireRole(auth, 'maintainer');
    const body = _req.body;
    const reason = body?.reason ?? 'dsgvo_art17';
    await ctx.manifests.softDelete(_req.params.cgfi, taiCGTA(ctx.now()), reason);
    return ok({
        cgfi: _req.params.cgfi,
        deleted_at: taiCGTA(ctx.now()),
        reason,
        message: 'Logisch gelöscht. CGFI und Metadaten bleiben erhalten (I-D1).',
    });
};
// ── 19. GET /v1/health ────────────────────────────────────────────────────────
export const getHealth = async (_req, ctx) => {
    return ok({
        status: 'ok',
        version: 'CG-STD-4100-2026 v0.5',
        tai_now: taiCGTA(ctx.now()),
        segments: ctx.segments.count,
    });
};
export const ROUTES = [
    { method: 'POST', pattern: '/v1/timepoints', handler: postTimepoints },
    { method: 'GET', pattern: '/v1/timepoints', handler: listTimepoints },
    { method: 'GET', pattern: '/v1/timepoints/:machine_id', handler: getTimepoint },
    { method: 'POST', pattern: '/v1/timepoints/convert', handler: convertTimepoint },
    { method: 'POST', pattern: '/v1/timepoints/validate', handler: validateTimepoint },
    { method: 'POST', pattern: '/v1/timepoints/batch', handler: batchTimepoints },
    { method: 'POST', pattern: '/v1/relations/compute', handler: computeRelation },
    { method: 'POST', pattern: '/v1/relations', handler: postRelation },
    { method: 'GET', pattern: '/v1/domains', handler: listDomains },
    { method: 'GET', pattern: '/v1/domains/:domain_id', handler: getDomain },
    { method: 'POST', pattern: '/v1/domains', handler: postDomain },
    { method: 'POST', pattern: '/v1/domains/:domain_id/publish', handler: publishDomain },
    { method: 'POST', pattern: '/v1/segments', handler: postSegment },
    { method: 'GET', pattern: '/v1/segments/:segment_id', handler: getSegment },
    { method: 'GET', pattern: '/v1/segments/resolve/:cgua', handler: resolveCGUA },
    { method: 'POST', pattern: '/v1/files', handler: postFile },
    { method: 'GET', pattern: '/v1/files/:cgfi', handler: getFile },
    { method: 'DELETE', pattern: '/v1/files/:cgfi', handler: deleteFile },
    { method: 'GET', pattern: '/v1/health', handler: getHealth },
];
// ── Minimaler Request-Dispatcher (für Tests) ──────────────────────────────────
export function matchRoute(method, path) {
    for (const route of ROUTES) {
        if (route.method !== method.toUpperCase())
            continue;
        const params = matchPattern(route.pattern, path);
        if (params !== null)
            return { route, params };
    }
    return null;
}
function matchPattern(pattern, path) {
    const pp = pattern.split('/');
    const rp = path.split('/');
    if (pp.length !== rp.length)
        return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith(':')) {
            params[pp[i].slice(1)] = decodeURIComponent(rp[i]);
        }
        else if (pp[i] !== rp[i]) {
            return null;
        }
    }
    return params;
}
export async function dispatch(method, path, req, ctx) {
    const match = matchRoute(method, path);
    if (!match) {
        return { status: 404, headers: { 'Content-Type': 'application/json' }, body: { error: { cg_code: 'CG-E-000.404', message: `Endpoint nicht gefunden: ${method} ${path}` } } };
    }
    const fullReq = { method, path, params: match.params, ...req };
    try {
        return await match.route.handler(fullReq, ctx);
    }
    catch (err) {
        return errorResponse(err);
    }
}
