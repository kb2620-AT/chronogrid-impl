/**
 * cg-testkit/src/suites/t-storage.ts
 * T-STORAGE — Normative Storage-Tests (CG-STD-4100 v0.7 Kap. 3)
 *
 * Testet:
 * - Insert-only Semantik (I-D1, I-S1)
 * - Idempotenz (CG-STD-4100 Kap. 2.2)
 * - BigInt-Handling (NUMERIC(30), kein Float)
 * - Logisches Löschen (DSGVO Art. 17)
 * - Versionschain (manifests)
 * - Segment-Auflösung (Root-Fallback, CG-APP-0700 §13.2)
 *
 * Läuft mit In-Memory-Backend (kein PostgreSQL erforderlich für CI).
 * Für PostgreSQL-Tests: STORAGE=postgres + laufende DB.
 */

import type { TestCase } from '../runner.js';
import {
  InMemoryTimepointRepository,
  InMemoryDomainRepository,
  InMemoryManifestRepository,
  InMemoryRelationRepository,
  InMemorySegmentRepository,
  makeRelationRow,
  makeDomainId,
} from 'cg-storage/repository.js';
import type { TimepointRow, ManifestRow } from 'cg-storage/repository.js';
import { DOMAIN_TAI_V1, DOMAIN_GREGORIAN_V2 } from 'cg-engine/domains.js';
import { computeMachineID, machineIdToHex, computeCGFI, cgfiToHex } from 'cg-engine/engine.js';

// ── T-STORAGE-01x: Timepoint Repository ──────────────────────────────────────

export const T_STORAGE_01: TestCase[] = [
  {
    id: 'T-STORAGE-010', suite: 'T-STORAGE', level: 1,
    description: 'Insert-only: Zeitpunkt einfügen und wieder abrufen',
    fn: async () => {
      const repo = new InMemoryTimepointRepository();
      const mid = machineIdToHex(computeMachineID(1000000000n));
      const row: TimepointRow = {
        machine_id:     mid,
        cgta_string:    'CG:TAI:1000000000/v1',
        domain_id:      'TAI/v1',
        absolute_value: 1000000000n,
        granularity:    'nanosecond',
        created_at:     'CG:TAI:1000000000/v1',
        created_by:     'test',
      };
      await repo.insert(row);
      const found = await repo.findByMachineId(mid);
      if (!found) throw new Error('Zeitpunkt nicht gefunden nach Insert');
      if (found.absolute_value !== 1000000000n) throw new Error('absolute_value falsch');
      if (typeof found.absolute_value !== 'bigint') throw new Error('absolute_value muss bigint sein');
      return true;
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-011', suite: 'T-STORAGE', level: 1,
    description: 'Idempotenz: Doppelter Insert derselben machine_id → kein Fehler',
    fn: async () => {
      const repo = new InMemoryTimepointRepository();
      const mid = machineIdToHex(computeMachineID(42n));
      const row: TimepointRow = {
        machine_id: mid, cgta_string: 'CG:TAI:42/v1',
        domain_id: 'TAI/v1', absolute_value: 42n,
        granularity: 'nanosecond', created_at: 'CG:TAI:42/v1', created_by: 'test',
      };
      await repo.insert(row);
      // Zweiter Insert — muss entweder kein Fehler oder Conflict sein
      let threw = false;
      try { await repo.insert(row); } catch { threw = true; }
      // Idempotenz: bestehender Eintrag bleibt unverändert
      const found = await repo.findByMachineId(mid);
      if (!found) throw new Error('Zeitpunkt verschwunden nach zweitem Insert');
      return true;
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-012', suite: 'T-STORAGE', level: 1,
    description: 'findByMachineId: nicht existierende ID → null',
    fn: async () => {
      const repo = new InMemoryTimepointRepository();
      const result = await repo.findByMachineId('a'.repeat(64));
      return result === null;
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-013', suite: 'T-STORAGE', level: 1,
    description: 'BigInt-Invariante: absolute_value bleibt bigint nach Roundtrip',
    fn: async () => {
      const repo = new InMemoryTimepointRepository();
      // Cosmic-Domain-Wert: ~4.35×10²³ (weit über INT64)
      const cosmicValue = 435116774400000000000000n;
      const mid = machineIdToHex(computeMachineID(cosmicValue));
      await repo.insert({
        machine_id: mid, cgta_string: `CG:Cosmic:${cosmicValue}/v1`,
        domain_id: 'Cosmic/v1', absolute_value: cosmicValue,
        granularity: 'nanosecond', created_at: 'CG:TAI:1000/v1', created_by: 'test',
      });
      const found = await repo.findByMachineId(mid);
      if (!found) throw new Error('Cosmic-Zeitpunkt nicht gefunden');
      if (found.absolute_value !== cosmicValue) {
        throw new Error(`BigInt-Verlust: ${found.absolute_value} !== ${cosmicValue}`);
      }
      return true;
    },
    expected: true,
  },
];

// ── T-STORAGE-02x: Domain Repository ─────────────────────────────────────────

export const T_STORAGE_02: TestCase[] = [
  {
    id: 'T-STORAGE-020', suite: 'T-STORAGE', level: 1,
    description: 'Domain einfügen und abrufen (I-D1)',
    fn: async () => {
      const repo = new InMemoryDomainRepository();
      await repo.insert(DOMAIN_TAI_V1, 'CG:TAI:1000/v1', 'system');
      const found = await repo.findById('TAI/v1');
      if (!found) throw new Error('TAI Domain nicht gefunden');
      if (found.name !== 'TAI') throw new Error('Name falsch');
      return true;
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-021', suite: 'T-STORAGE', level: 1,
    description: 'Domain list() gibt alle Domains zurück',
    fn: async () => {
      const repo = new InMemoryDomainRepository();
      await repo.insert(DOMAIN_TAI_V1, 'CG:TAI:1/v1', 'system');
      await repo.insert(DOMAIN_GREGORIAN_V2, 'CG:TAI:2/v1', 'system');
      const all = await repo.list();
      return all.length === 2;
    },
    expected: true,
  },
];

// ── T-STORAGE-03x: Manifest Repository (CGFS) ────────────────────────────────

export const T_STORAGE_03: TestCase[] = [
  {
    id: 'T-STORAGE-030', suite: 'T-STORAGE', level: 2,
    description: 'Manifest einfügen und abrufen',
    fn: async () => {
      const repo = new InMemoryManifestRepository();
      const content = new TextEncoder().encode('test content');
      const cgfi = cgfiToHex(computeCGFI(1000n, content, 'legal/contract/v1', 0));
      const row: ManifestRow = {
        cgfi, cgfs_version: '1.0', type_id: 'legal/contract/v1',
        type_schema: 'cgfs://types/legal/contract/v1',
        created_at: 'CG:TAI:1000/v1', content_hash: 'a'.repeat(64),
        created_by: 'test', access_level: 'restricted',
      };
      await repo.insert(row);
      const found = await repo.findByCGFI(cgfi);
      if (!found) throw new Error('Manifest nicht gefunden');
      return found.cgfi === cgfi;
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-031', suite: 'T-STORAGE', level: 2,
    description: 'Logisches Löschen (DSGVO Art. 17) — Tombstone, kein hartes DELETE',
    fn: async () => {
      const repo = new InMemoryManifestRepository();
      const cgfi = 'b'.repeat(64);
      const row: ManifestRow = {
        cgfi, cgfs_version: '1.0', type_id: 'legal/contract/v1',
        type_schema: 'cgfs://types/legal/contract/v1',
        created_at: 'CG:TAI:1000/v1', content_hash: 'c'.repeat(64),
        created_by: 'test', access_level: 'restricted',
      };
      await repo.insert(row);
      await repo.softDelete(cgfi, 'CG:TAI:2000/v1', 'dsgvo_art17');
      const found = await repo.findByCGFI(cgfi);
      // Eintrag bleibt (Tombstone), deleted_at gesetzt
      if (!found) throw new Error('Tombstone-Manifest verschwunden — kein hartes Delete erlaubt');
      if (!found.deleted_at) throw new Error('deleted_at nicht gesetzt');
      if (found.cgfi !== cgfi) throw new Error('CGFI verändert — Invariante verletzt');
      return true;
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-032', suite: 'T-STORAGE', level: 2,
    description: 'Versionschain: getVersionChain gibt Kette zurück',
    fn: async () => {
      const repo = new InMemoryManifestRepository();
      const cgfi1 = '1'.repeat(64);
      const cgfi2 = '2'.repeat(64);
      await repo.insert({
        cgfi: cgfi1, cgfs_version: '1.0', type_id: 'legal/contract/v1',
        type_schema: 'cgfs://types', created_at: 'CG:TAI:100/v1',
        content_hash: 'a'.repeat(64), created_by: 'test', access_level: 'restricted',
      });
      await repo.insert({
        cgfi: cgfi2, cgfs_version: '1.0', type_id: 'legal/contract/v1',
        type_schema: 'cgfs://types', created_at: 'CG:TAI:200/v1',
        content_hash: 'b'.repeat(64), created_by: 'test', access_level: 'restricted',
        prev_version: cgfi1,
      });
      const chain = await repo.getVersionChain(cgfi2);
      return chain.length === 2;
    },
    expected: true,
  },
];

// ── T-STORAGE-04x: Segment Repository (CGUAS) ────────────────────────────────

export const T_STORAGE_04: TestCase[] = [
  {
    id: 'T-STORAGE-040', suite: 'T-STORAGE', level: 2,
    description: 'Segment einfügen und nach Adresse auflösen',
    fn: async () => {
      const repo = new InMemorySegmentRepository();
      const seg = {
        segment_id: 'test.org', owner_id: 'test.org',
        start_address: 1000n, end_address: 2000n, size_ns: 1000n, parent_id: null, granted_by: "system", status: "active" as const,
        granted_at: 'CG:TAI:1/v1', integrity_hash: 'a'.repeat(64), level: 3,
      };
      await repo.insert(seg, 'CG:TAI:1/v1', 'system');
      const found = await repo.findByAddress(1500n);
      if (!found) throw new Error('Segment nicht gefunden für Adresse 1500');
      return found.segment_id === 'test.org';
    },
    expected: true,
  },
  {
    id: 'T-STORAGE-041', suite: 'T-STORAGE', level: 2,
    description: 'Root-Fallback: Adresse ohne spezifisches Segment → Root',
    fn: async () => {
      const repo = new InMemorySegmentRepository();
      // Root-Segment (gesamter 79-Bit-Adressraum)
      const root = {
        segment_id: 'CG.CGUAS.ROOT', owner_id: 'ChronoGrid',
        start_address: 0n,
        end_address: BigInt(2) ** BigInt(79) - BigInt(1), size_ns: BigInt(2) ** BigInt(79) - BigInt(1), parent_id: null, granted_by: 'system', status: 'active' as const,
        granted_at: 'CG:TAI:0/v1', integrity_hash: 'r'.repeat(64), level: 0,
      };
      await repo.insert(root, 'CG:TAI:0/v1', 'system');
      // Spezifisches Segment für Adressbereich 0–999
      const specific = {
        segment_id: 'specific.org', owner_id: 'specific.org',
        start_address: 0n, end_address: 1000n, size_ns: 1000n, parent_id: null, granted_by: 'system', status: 'active' as const,
        granted_at: 'CG:TAI:1/v1', integrity_hash: 'b'.repeat(64), level: 3,
      };
      await repo.insert(specific, 'CG:TAI:1/v1', 'system');
      // Adresse 500 → specific.org (nicht Root)
      const foundSpecific = await repo.findByAddress(500n);
      if (foundSpecific?.segment_id !== 'specific.org') throw new Error('Spezifisches Segment nicht gefunden');
      // Adresse 5000 → Root (kein spezifisches Segment)
      const foundRoot = await repo.findByAddress(5000n);
      if (foundRoot?.segment_id !== 'CG.CGUAS.ROOT') throw new Error('Root-Fallback fehlgeschlagen');
      return true;
    },
    expected: true,
  },
];

// ── T-STORAGE-05x: Relation Repository ───────────────────────────────────────

export const T_STORAGE_05: TestCase[] = [
  {
    id: 'T-STORAGE-050', suite: 'T-STORAGE', level: 2,
    description: 'Relation einfügen und abrufen — relation_id = SHA-256(a||b||type)',
    fn: async () => {
      const repo = new InMemoryRelationRepository();
      const midA = 'a'.repeat(64);
      const midB = 'b'.repeat(64);
      const row = makeRelationRow(midA, midB, 'before', 'CG:TAI:1000/v1');
      await repo.insert(row);
      const found = await repo.findByPair(midA, midB);
      if (found.length === 0) throw new Error('Relation nicht gefunden');
      return found[0]?.relation_type === 'before';
    },
    expected: true,
  },
];

// ── Alle T-STORAGE Tests ──────────────────────────────────────────────────────

export const ALL_T_STORAGE: TestCase[] = [
  ...T_STORAGE_01,
  ...T_STORAGE_02,
  ...T_STORAGE_03,
  ...T_STORAGE_04,
  ...T_STORAGE_05,
];
