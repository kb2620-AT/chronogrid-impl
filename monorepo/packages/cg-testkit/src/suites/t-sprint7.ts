/**
 * cg-testkit/src/suites/t-sprint7.ts
 * Sprint 7 Tests — GraphQL (CG-STD-4100 Kap. 5), Webhooks (Kap. 6), Interface-APIContext
 */

import type { TestCase } from '../runner.js';
import { handleGraphQL } from 'cg-api/graphql.js';
import { signPayload, verifySignature } from 'cg-api/webhooks.js';
import {
  InMemoryTimepointRepository, InMemoryDomainRepository,
  InMemoryManifestRepository, InMemoryRelationRepository, InMemorySegmentRepository,
} from 'cg-storage/repository.js';
import type { APIContext } from 'cg-api/handlers.js';
import { nowTaiNs } from 'cg-engine/engine.js';

// Minimal APIContext für Tests
function makeCtx(): APIContext {
  return {
    timepoints: new InMemoryTimepointRepository(),
    domains:    new InMemoryDomainRepository(),
    manifests:  new InMemoryManifestRepository(),
    relations:  new InMemoryRelationRepository(),
    segments:   new InMemorySegmentRepository(),
    now:        nowTaiNs,
  };
}

export const sprint7Tests: TestCase[] = [

  // ── GraphQL ────────────────────────────────────────────────────────────────

  { id: 'T-S7-001', level: 2, description: 'GraphQL – health query gibt status=ok',
    run: async () => {
      const result = await handleGraphQL('{ health { status } }', undefined, makeCtx()) as { data: { health: { status: string } } };
      return result.data?.health?.status;
    },
    expected: 'ok' },

  { id: 'T-S7-002', level: 2, description: 'GraphQL – health gibt version zurück',
    run: async () => {
      const result = await handleGraphQL('{ health { version } }', undefined, makeCtx()) as { data: { health: { version: string } } };
      return typeof result.data?.health?.version;
    },
    expected: 'string' },

  { id: 'T-S7-003', level: 2, description: 'GraphQL – domains query gibt Array zurück',
    run: async () => {
      const result = await handleGraphQL('{ domains { name version } }', undefined, makeCtx()) as { data: { domains: unknown[] } };
      return Array.isArray(result.data?.domains);
    },
    expected: true },

  { id: 'T-S7-004', level: 2, description: 'GraphQL – allenRelation BEFORE',
    run: async () => {
      const result = await handleGraphQL(
        '{ allenRelation(a_start:"1" a_end:"5" b_start:"10" b_end:"20") }',
        undefined, makeCtx()
      ) as { data: { allenRelation: string } };
      return result.data?.allenRelation;
    },
    expected: 'BEFORE' },

  { id: 'T-S7-005', level: 2, description: 'GraphQL – allenRelation EQUALS',
    run: async () => {
      const result = await handleGraphQL(
        '{ allenRelation(a_start:"5" a_end:"15" b_start:"5" b_end:"15") }',
        undefined, makeCtx()
      ) as { data: { allenRelation: string } };
      return result.data?.allenRelation;
    },
    expected: 'EQUALS' },

  { id: 'T-S7-006', level: 2, description: 'GraphQL – createTimepoint Mutation',
    run: async () => {
      const result = await handleGraphQL(
        'mutation { createTimepoint(domain:"TAI", value:"1742041937") { cgta } }',
        undefined, makeCtx()
      ) as { data: { createTimepoint: { cgta: string } } };
      return result.data?.createTimepoint?.cgta;
    },
    expected: 'CG:TAI:1742041937/v1' },

  { id: 'T-S7-007', level: 2, description: 'GraphQL – timepoints query nach insert',
    run: async () => {
      const ctx = makeCtx();
      await handleGraphQL('mutation { createTimepoint(domain:"TAI", value:"100") { machine_id } }', undefined, ctx);
      const result = await handleGraphQL('{ timepoints { items { domain_name } total } }', undefined, ctx) as { data: { timepoints: { total: number } } };
      return result.data?.timepoints?.total;
    },
    expected: 1 },

  { id: 'T-S7-008', level: 2, description: 'GraphQL – convert Mutation',
    run: async () => {
      const result = await handleGraphQL(
        'mutation { convert(from_domain:"UTC", to_domain:"TAI", value:"0") { from_domain to_domain } }',
        undefined, makeCtx()
      ) as { data: { convert: { from_domain: string } } };
      return result.data?.convert?.from_domain;
    },
    expected: 'UTC' },

  { id: 'T-S7-009', level: 2, description: 'GraphQL – allocateSegment Mutation',
    run: async () => {
      const result = await handleGraphQL(
        'mutation { allocateSegment(granted_by:"test", size_ns:"1000000") { status } }',
        undefined, makeCtx()
      ) as { data: { allocateSegment: { status: string } } };
      return result.data?.allocateSegment?.status;
    },
    expected: 'active' },

  { id: 'T-S7-010', level: 2, description: 'GraphQL – segments query',
    run: async () => {
      const ctx = makeCtx();
      await handleGraphQL('mutation { allocateSegment(granted_by:"a", size_ns:"1000") { id } }', undefined, ctx);
      const result = await handleGraphQL('{ segments { id status } }', undefined, ctx) as { data: { segments: unknown[] } };
      return result.data?.segments?.length;
    },
    expected: 1 },

  { id: 'T-S7-011', level: 3, description: 'GraphQL – ungültige Query gibt errors zurück',
    run: async () => {
      const result = await handleGraphQL('{ nonExistentField }', undefined, makeCtx()) as { errors?: unknown[] };
      return Array.isArray(result.errors) && result.errors.length > 0;
    },
    expected: true },

  // ── Webhooks ───────────────────────────────────────────────────────────────

  { id: 'T-S7-012', level: 2, description: 'Webhook signPayload erzeugt sha256= Prefix',
    run: () => signPayload('secret', '{"test":true}').startsWith('sha256='),
    expected: true },

  { id: 'T-S7-013', level: 2, description: 'Webhook verifySignature – korrekte Signatur',
    run: () => {
      const body = '{"event":"timepoint.created"}';
      const sig  = signPayload('my-secret', body);
      return verifySignature('my-secret', body, sig);
    },
    expected: true },

  { id: 'T-S7-014', level: 2, description: 'Webhook verifySignature – falsche Signatur',
    run: () => verifySignature('secret', 'body', 'sha256=invalidsignature'),
    expected: false },

  { id: 'T-S7-015', level: 2, description: 'Webhook signPayload – deterministisch',
    run: () => {
      const s1 = signPayload('s', 'b');
      const s2 = signPayload('s', 'b');
      return s1 === s2;
    },
    expected: true },

  { id: 'T-S7-016', level: 2, description: 'Webhook – verschiedene Secrets → verschiedene Signaturen',
    run: () => signPayload('secret1','body') !== signPayload('secret2','body'),
    expected: true },

  { id: 'T-S7-017', level: 3, description: 'Webhook – verschiedene Bodies → verschiedene Signaturen',
    run: () => signPayload('secret','body1') !== signPayload('secret','body2'),
    expected: true },

  // ── APIContext Interface-Tests (Sprint 7 Kern) ─────────────────────────────

  { id: 'T-S7-018', level: 2, description: 'APIContext – Interface-basiert, kein konkreter Typ benötigt',
    run: () => {
      const ctx: APIContext = {
        timepoints: new InMemoryTimepointRepository(),
        domains:    new InMemoryDomainRepository(),
        manifests:  new InMemoryManifestRepository(),
        relations:  new InMemoryRelationRepository(),
        segments:   new InMemorySegmentRepository(),
        now:        () => 1742041937000000000n,
      };
      return typeof ctx.timepoints.insert;
    },
    expected: 'function' },

  { id: 'T-S7-019', level: 2, description: 'APIContext – now() gibt BigInt zurück',
    run: () => typeof makeCtx().now(),
    expected: 'bigint' },

  { id: 'T-S7-020', level: 3, description: 'Sprint 7 – GraphQL Schema hat 5 Query-Felder',
    run: async () => {
      const result = await handleGraphQL(
        '{ __schema { queryType { fields { name } } } }',
        undefined, makeCtx()
      ) as { data: { __schema: { queryType: { fields: unknown[] } } } };
      return (result.data?.__schema?.queryType?.fields?.length ?? 0) >= 5;
    },
    expected: true },

  { id: 'T-S7-021', level: 3, description: 'Sprint 7 – GraphQL Mutation createFile',
    run: async () => {
      const ctx = makeCtx();
      // Erst Zeitpunkt erstellen für tai_timepoint
      const tpResult = await handleGraphQL(
        'mutation { createTimepoint(domain:"TAI", value:"1742041937") { machine_id } }',
        undefined, ctx
      ) as { data: { createTimepoint: { machine_id: string } } };
      const taiId = tpResult.data?.createTimepoint?.machine_id;
      const result = await handleGraphQL(
        `mutation { createFile(tai_timepoint:"${taiId}", content_hash:"abc123", type_id:"pdf", size_bytes:"1024") { cgfi tombstone } }`,
        undefined, ctx
      ) as { data: { createFile: { tombstone: boolean } } };
      return result.data?.createFile?.tombstone;
    },
    expected: false },

  { id: 'T-S7-022', level: 3, description: 'Sprint 7 – GraphQL deleteFile setzt tombstone',
    run: async () => {
      const ctx = makeCtx();
      const tpResult = await handleGraphQL(
        'mutation { createTimepoint(domain:"TAI", value:"999") { machine_id } }', undefined, ctx
      ) as { data: { createTimepoint: { machine_id: string } } };
      const taiId = tpResult.data?.createTimepoint?.machine_id;
      const fileResult = await handleGraphQL(
        `mutation { createFile(tai_timepoint:"${taiId}", content_hash:"xyz", type_id:"txt", size_bytes:"0") { cgfi } }`,
        undefined, ctx
      ) as { data: { createFile: { cgfi: string } } };
      const cgfi = fileResult.data?.createFile?.cgfi;
      const delResult = await handleGraphQL(
        `mutation { deleteFile(cgfi:"${cgfi}") { success } }`, undefined, ctx
      ) as { data: { deleteFile: { success: boolean } } };
      return delResult.data?.deleteFile?.success;
    },
    expected: true },
];
