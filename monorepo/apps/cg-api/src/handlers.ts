/**
 * cg-api/src/handlers.ts
 * REST API Handler — CG-STD-4100 v0.7 Kap. 4
 *
 * SPRINT 7: APIContext verwendet nur noch Repository-Interfaces.
 * Kein Unterschied mehr zwischen In-Memory und PostgreSQL aus Handler-Sicht.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { CTDDLDomain, CGTimepoint, CGDomain, CGManifest, CGRelation } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';
import { parseDomain } from 'cg-ctddl/parser.js';
import {
  createTimepoint, registerDomain, getDomain, listDomainKeys,
  allenRelation, nowTaiNs, encodeCGTA, decodeCGTA, computeCGFI,
} from 'cg-engine/engine.js';
import type {
  ITimepointRepository, IDomainRepository,
  IManifestRepository, IRelationRepository, ISegmentRepository,
} from 'cg-storage/repository.js';
import type { CGRequest, CGResponse } from './middleware.js';
import { jsonResponse, errorResponse } from './middleware.js';

// ── APIContext (Sprint 7: Interface-basiert) ──────────────────────────────────

export interface APIContext {
  timepoints: ITimepointRepository;
  domains:    IDomainRepository;
  manifests:  IManifestRepository;
  relations:  IRelationRepository;
  segments:   ISegmentRepository;
  now:        () => bigint;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(_req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  return jsonResponse(200, {
    status: 'ok', service: 'cg-api',
    version: '0.7.0', cgStd: 'CG-STD-4100 v0.7',
    timestamp: new Date().toISOString(),
  });
}

// ── OpenAPI ───────────────────────────────────────────────────────────────────

export async function getOpenApi(_req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  const { openApiSpec } = await import('./openapi.js');
  return jsonResponse(200, openApiSpec);
}

// ── Timepoints ────────────────────────────────────────────────────────────────

export async function postTimepoints(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    if (!b['domain'] || !b['value']) throw Errors.SyntaxError.missingField('domain und value erforderlich');
    const tp = createTimepoint(
      b['domain'] as string,
      (b['version'] as string) ?? '1.0',
      BigInt(b['value'] as string | number),
      (b['labels'] as Record<string,string>) ?? {},
    );
    await ctx.timepoints.insert(tp);
    return jsonResponse(201, serializeTimepoint(tp));
  } catch (e) { return errorResponse(e); }
}

export async function listTimepoints(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const limit  = parseInt(req.query['limit']  ?? '100', 10);
    const offset = parseInt(req.query['offset'] ?? '0', 10);
    const tps = await ctx.timepoints.list(limit, offset);
    return jsonResponse(200, { items: tps.map(serializeTimepoint), limit, offset });
  } catch (e) { return errorResponse(e); }
}

export async function getTimepoint(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const tp = await ctx.timepoints.findById(req.params['machine_id']!);
    if (!tp) return jsonResponse(404, { message: 'Zeitpunkt nicht gefunden' });
    return jsonResponse(200, serializeTimepoint(tp));
  } catch (e) { return errorResponse(e); }
}

export async function convertTimepoint(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    const { convertValue } = await import('cg-engine/engine.js');
    const from   = b['from_domain'] as string;
    const to     = b['to_domain'] as string;
    const value  = BigInt(b['value'] as string | number);
    const result = convertValue(value, from, to);
    return jsonResponse(200, { from_domain: from, to_domain: to, input: value.toString(), output: result.toString() });
  } catch (e) { return errorResponse(e); }
}

export async function validateTimepoint(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    const cgta = decodeCGTA(b['cgta'] as string);
    return jsonResponse(200, { valid: true, parsed: { ...cgta, value: cgta.value.toString() } });
  } catch (e) { return errorResponse(e, 422); }
}

// ── Domains ───────────────────────────────────────────────────────────────────

export async function listDomains(_req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const domains = await ctx.domains.list();
    return jsonResponse(200, { items: domains, total: domains.length });
  } catch (e) { return errorResponse(e); }
}

export async function postDomain(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const raw = req.body as Record<string, unknown>;
    const definition = parseDomain(raw['definition'] ?? raw);
    try { registerDomain(definition); } catch { /* already in engine registry */ }
    const domain: CGDomain = {
      name: definition.name, version: definition.version,
      definition, published: false, created_at: ctx.now(),
    };
    await ctx.domains.insert(domain);
    return jsonResponse(201, domain);
  } catch (e) { return errorResponse(e); }
}

export async function validateDomain(req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  try {
    const parsed = parseDomain(req.body);
    return jsonResponse(200, { valid: true, name: parsed.name, version: parsed.version });
  } catch (e) { return errorResponse(e, 422); }
}

// ── Relations ─────────────────────────────────────────────────────────────────

export async function computeRelation(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    const aStart = BigInt((b['a_start'] as string | number) ?? 0);
    const aEnd   = BigInt((b['a_end']   as string | number) ?? 0);
    const bStart = BigInt((b['b_start'] as string | number) ?? 0);
    const bEnd   = BigInt((b['b_end']   as string | number) ?? 0);
    const relation = allenRelation({ start: aStart, end: aEnd }, { start: bStart, end: bEnd });
    const rel: CGRelation = {
      id: randomUUID(), timepoint_a: (b['a_id'] as string) ?? '',
      timepoint_b: (b['b_id'] as string) ?? '', relation, computed_at: ctx.now(),
    };
    await ctx.relations.insert(rel);
    return jsonResponse(200, rel);
  } catch (e) { return errorResponse(e); }
}

// ── Segments (CGUAS) ──────────────────────────────────────────────────────────

export async function postSegment(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    const seg = await ctx.segments.allocate(
      (b['granted_by'] as string) ?? 'api',
      BigInt((b['size_ns'] as string | number) ?? 1_000_000_000n),
      b['parent_id'] as string | undefined,
    );
    return jsonResponse(201, serializeSegment(seg));
  } catch (e) { return errorResponse(e); }
}

export async function resolveCGUA(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const cgua = decodeURIComponent(req.params['cgua']!);
    const { parseCGUA } = await import('cg-cguas/cguas.js');
    const parsed = parseCGUA(cgua);
    const seg = await ctx.segments.resolve(parsed.segmentId);
    return jsonResponse(200, { cgua, segment: serializeSegment(seg), local_offset: parsed.localOffset.toString() });
  } catch (e) { return errorResponse(e); }
}

// ── Files (CGFS) ──────────────────────────────────────────────────────────────

export async function postFile(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    const contentHash = (b['content_hash'] as string) ?? createHash('sha256').update(JSON.stringify(b)).digest('hex');
    const typeId      = (b['type_id'] as string) ?? 'application/octet-stream';
    const sizeBytes   = BigInt((b['size_bytes'] as string | number) ?? 0);
    const taiMachineId = (b['tai_timepoint'] as string) ?? 'none';
    const cgfi = computeCGFI(taiMachineId, contentHash, typeId);
    const manifest: CGManifest = {
      cgfi, tai_timepoint: taiMachineId, content_hash: contentHash, type_id: typeId,
      size_bytes: sizeBytes, metadata: (b['metadata'] as Record<string,string>) ?? {},
      tombstone: false, created_at: ctx.now(),
    };
    await ctx.manifests.insert(manifest);
    return jsonResponse(201, serializeManifest(manifest));
  } catch (e) { return errorResponse(e); }
}

export async function getFile(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    const m = await ctx.manifests.findByCGFI(req.params['cgfi']!);
    if (!m) return jsonResponse(404, { message: 'Datei nicht gefunden' });
    if (m.tombstone) return jsonResponse(410, { message: 'Datei gelöscht (Tombstone)' });
    return jsonResponse(200, serializeManifest(m));
  } catch (e) { return errorResponse(e); }
}

export async function deleteFile(req: CGRequest, ctx: APIContext): Promise<CGResponse> {
  try {
    await ctx.manifests.tombstone(req.params['cgfi']!);
    return jsonResponse(200, { message: 'Tombstone gesetzt (I-S1)' });
  } catch (e) { return errorResponse(e); }
}

// ── Serialisierungs-Helpers ───────────────────────────────────────────────────

function serializeTimepoint(tp: CGTimepoint) {
  return { ...tp, absolute_value: tp.absolute_value.toString(), created_at: tp.created_at.toString() };
}
function serializeSegment(s: ReturnType<import('cg-storage/repository.js').ISegmentRepository['resolve'] extends (...a: unknown[]) => Promise<infer R> ? () => R : never>) {
  return s;
}
function serializeManifest(m: CGManifest) {
  return { ...m, size_bytes: m.size_bytes.toString(), created_at: m.created_at.toString() };
}
