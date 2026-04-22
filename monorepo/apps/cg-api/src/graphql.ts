/**
 * cg-api/src/graphql.ts
 * GraphQL API — CG-STD-4100 v0.7 Kap. 5
 * Sprint 7: Schema + Resolver für Timepoints, Domains, Relations, Segments
 *
 * Kein externes Framework (Apollo etc.) – nutzt nur das graphql-Paket direkt.
 */

import { buildSchema, graphql as gql } from 'graphql';
import type { APIContext } from './handlers.js';

// ── Schema (SDL) ──────────────────────────────────────────────────────────────

const typeDefs = /* graphql */ `
  """ChronoGrid GraphQL API — CG-STD-4100 v0.7 Kap. 5"""
  type Query {
    """Health-Status der API"""
    health: HealthResult!

    """Einzelner Zeitpunkt per MachineID"""
    timepoint(machine_id: String!): Timepoint

    """Zeitpunkte auflisten"""
    timepoints(limit: Int, offset: Int): TimepointList!

    """Einzelne Domain per Name+Version"""
    domain(name: String!, version: String): Domain

    """Alle Domains auflisten"""
    domains: [Domain!]!

    """Allen-Relation zwischen zwei Intervallen (ohne Speicherung)"""
    allenRelation(
      a_start: String!, a_end: String!,
      b_start: String!, b_end: String!
    ): String!

    """CGUA-Segment auflösen"""
    segment(id: String!): Segment

    """Alle Segmente"""
    segments: [Segment!]!

    """Datei-Manifest per CGFI"""
    file(cgfi: String!): FileManifest
  }

  type Mutation {
    """Zeitpunkt erstellen"""
    createTimepoint(
      domain: String!
      value: String!
      version: String
      labels: String
    ): Timepoint!

    """Domain registrieren (CTDDL-JSON als String)"""
    registerDomain(definition: String!): Domain!

    """Domain-Konversion"""
    convert(
      from_domain: String!
      to_domain: String!
      value: String!
    ): ConvertResult!

    """Segment allokieren"""
    allocateSegment(granted_by: String!, size_ns: String!, parent_id: String): Segment!

    """Datei-Manifest erstellen"""
    createFile(
      tai_timepoint: String!
      content_hash: String!
      type_id: String!
      size_bytes: String!
    ): FileManifest!

    """Tombstone setzen (CGFS DSGVO)"""
    deleteFile(cgfi: String!): DeleteResult!
  }

  type HealthResult {
    status: String!
    version: String!
    timestamp: String!
  }

  type Timepoint {
    machine_id: String!
    domain_name: String!
    domain_version: String!
    absolute_value: String!
    cgta: String!
    labels: String!
    created_at: String!
  }

  type TimepointList {
    items: [Timepoint!]!
    total: Int!
  }

  type Domain {
    name: String!
    version: String!
    published: Boolean!
    created_at: String!
  }

  type ConvertResult {
    from_domain: String!
    to_domain: String!
    input: String!
    output: String!
  }

  type Segment {
    id: String!
    base_address: String!
    size_ns: String!
    granted_by: String!
    status: String!
  }

  type FileManifest {
    cgfi: String!
    tai_timepoint: String!
    content_hash: String!
    type_id: String!
    size_bytes: String!
    tombstone: Boolean!
    created_at: String!
  }

  type DeleteResult {
    success: Boolean!
    message: String!
  }
`;

// ── Resolver-Factory ──────────────────────────────────────────────────────────

function makeResolvers(ctx: APIContext) {
  return {
    health: () => ({
      status: 'ok', version: '0.7.0', timestamp: new Date().toISOString(),
    }),

    timepoint: async ({ machine_id }: { machine_id: string }) => {
      const tp = await ctx.timepoints.findById(machine_id);
      return tp ? {
        ...tp, absolute_value: tp.absolute_value.toString(), created_at: tp.created_at.toString(),
        labels: JSON.stringify(tp.labels),
      } : null;
    },

    timepoints: async ({ limit = 100, offset = 0 }: { limit?: number; offset?: number }) => {
      const items = await ctx.timepoints.list(limit, offset);
      return {
        items: items.map(tp => ({
          ...tp, absolute_value: tp.absolute_value.toString(),
          created_at: tp.created_at.toString(), labels: JSON.stringify(tp.labels),
        })),
        total: items.length,
      };
    },

    domain: async ({ name, version = '1.0' }: { name: string; version?: string }) => {
      const d = await ctx.domains.findByNameVersion(name, version);
      return d ? { ...d, created_at: d.created_at.toString() } : null;
    },

    domains: async () => {
      const list = await ctx.domains.list();
      return list.map(d => ({ ...d, created_at: d.created_at.toString() }));
    },

    allenRelation: async ({
      a_start, a_end, b_start, b_end,
    }: { a_start: string; a_end: string; b_start: string; b_end: string }) => {
      const { allenRelation } = await import('cg-engine/engine.js');
      return allenRelation(
        { start: BigInt(a_start), end: BigInt(a_end) },
        { start: BigInt(b_start), end: BigInt(b_end) },
      );
    },

    segment: async ({ id }: { id: string }) => {
      try {
        const seg = await ctx.segments.resolve(id);
        return { ...seg, base_address: seg.base_address.toString(), size_ns: seg.size_ns.toString() };
      } catch { return null; }
    },

    segments: async () => {
      const list = await ctx.segments.list();
      return list.map(s => ({ ...s, base_address: s.base_address.toString(), size_ns: s.size_ns.toString() }));
    },

    file: async ({ cgfi }: { cgfi: string }) => {
      const m = await ctx.manifests.findByCGFI(cgfi);
      return m ? { ...m, size_bytes: m.size_bytes.toString(), created_at: m.created_at.toString() } : null;
    },

    // Mutations
    createTimepoint: async (args: { domain: string; value: string; version?: string; labels?: string }) => {
      const { createTimepoint } = await import('cg-engine/engine.js');
      const labels = args.labels ? JSON.parse(args.labels) : {};
      const tp = createTimepoint(args.domain, args.version ?? '1.0', BigInt(args.value), labels);
      await ctx.timepoints.insert(tp);
      return { ...tp, absolute_value: tp.absolute_value.toString(), created_at: tp.created_at.toString(), labels: JSON.stringify(tp.labels) };
    },

    registerDomain: async ({ definition }: { definition: string }) => {
      const { parseDomain } = await import('cg-ctddl/parser.js');
      const { registerDomain } = await import('cg-engine/engine.js');
      const parsed = parseDomain(JSON.parse(definition));
      try { registerDomain(parsed); } catch { /* already registered */ }
      const domain = { name: parsed.name, version: parsed.version, definition: parsed, published: false, created_at: ctx.now() };
      await ctx.domains.insert(domain);
      return { ...domain, created_at: domain.created_at.toString() };
    },

    convert: async ({ from_domain, to_domain, value }: { from_domain: string; to_domain: string; value: string }) => {
      const { convertValue } = await import('cg-engine/engine.js');
      const output = convertValue(BigInt(value), from_domain, to_domain);
      return { from_domain, to_domain, input: value, output: output.toString() };
    },

    allocateSegment: async ({ granted_by, size_ns, parent_id }: { granted_by: string; size_ns: string; parent_id?: string }) => {
      const seg = await ctx.segments.allocate(granted_by, BigInt(size_ns), parent_id);
      return { ...seg, base_address: seg.base_address.toString(), size_ns: seg.size_ns.toString() };
    },

    createFile: async (args: { tai_timepoint: string; content_hash: string; type_id: string; size_bytes: string }) => {
      const { computeCGFI } = await import('cg-engine/engine.js');
      const cgfi = computeCGFI(args.tai_timepoint, args.content_hash, args.type_id);
      const manifest = { cgfi, ...args, size_bytes: BigInt(args.size_bytes), metadata: {}, tombstone: false, created_at: ctx.now() };
      await ctx.manifests.insert(manifest);
      return { ...manifest, size_bytes: manifest.size_bytes.toString(), created_at: manifest.created_at.toString() };
    },

    deleteFile: async ({ cgfi }: { cgfi: string }) => {
      await ctx.manifests.tombstone(cgfi);
      return { success: true, message: 'Tombstone gesetzt (I-S1)' };
    },
  };
}

// ── Schema-Instanz ────────────────────────────────────────────────────────────

const schema = buildSchema(typeDefs);

// ── Handler (nutzt APIContext) ────────────────────────────────────────────────

export async function handleGraphQL(
  query: string,
  variables: Record<string, unknown> | undefined,
  ctx: APIContext,
): Promise<unknown> {
  const rootValue = makeResolvers(ctx);
  const result = await gql({ schema, source: query, rootValue, variableValues: variables });
  return result;
}
