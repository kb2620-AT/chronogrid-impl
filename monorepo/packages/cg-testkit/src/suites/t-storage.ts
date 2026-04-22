/**
 * cg-testkit/src/suites/t-storage.ts
 * Storage + API Tests — CG-STD-4100 v0.7 Kap. 3
 */

import type { TestCase } from '../runner.js';
import {
  InMemoryTimepointRepository, InMemoryDomainRepository,
  InMemoryManifestRepository, InMemoryRelationRepository, InMemorySegmentRepository,
} from 'cg-storage/repository.js';
import { createRepositories } from 'cg-storage/repository-factory.js';
import { createTimepoint, computeCGFI } from 'cg-engine/engine.js';
import type { CGDomain, CGManifest, CGRelation } from 'cg-types/domain.js';

export const storageTests: TestCase[] = [

  { id: 'T-STORAGE-001', level: 1, description: 'InMemory createRepositories – backend=memory',
    run: () => createRepositories(undefined, 'memory').backend,
    expected: 'memory' },

  { id: 'T-STORAGE-002', level: 1, description: 'TimepointRepository – insert + findById',
    run: async () => {
      const repo = new InMemoryTimepointRepository();
      const tp = createTimepoint('TAI', '1.0', 1742041937n);
      await repo.insert(tp);
      const found = await repo.findById(tp.machine_id);
      return found?.machine_id === tp.machine_id;
    },
    expected: true },

  { id: 'T-STORAGE-003', level: 1, description: 'TimepointRepository – findById nicht gefunden → null',
    run: async () => {
      const repo = new InMemoryTimepointRepository();
      return await repo.findById('nonexistent');
    },
    expected: null },

  { id: 'T-STORAGE-004', level: 1, description: 'TimepointRepository – list gibt Array zurück',
    run: async () => {
      const repo = new InMemoryTimepointRepository();
      const tp1 = createTimepoint('TAI','1.0',1n);
      const tp2 = createTimepoint('TAI','1.0',2n);
      await repo.insert(tp1); await repo.insert(tp2);
      const list = await repo.list();
      return list.length;
    },
    expected: 2 },

  { id: 'T-STORAGE-005', level: 1, description: 'DomainRepository – insert + findByNameVersion',
    run: async () => {
      const repo = new InMemoryDomainRepository();
      const d: CGDomain = { name:'TestD', version:'1.0', definition:{} as never, published:false, created_at:1n };
      await repo.insert(d);
      const found = await repo.findByNameVersion('TestD','1.0');
      return found?.name;
    },
    expected: 'TestD' },

  { id: 'T-STORAGE-006', level: 1, description: 'DomainRepository – Duplikat → SemanticError',
    run: async () => {
      const repo = new InMemoryDomainRepository();
      const d: CGDomain = { name:'DupD', version:'1.0', definition:{} as never, published:false, created_at:1n };
      await repo.insert(d);
      try { await repo.insert(d); return false; }
      catch(e) { return (e as {code:string}).code === 'CG-E-002.001'; }
    },
    expected: true },

  { id: 'T-STORAGE-007', level: 1, description: 'DomainRepository – publish setzt published=true',
    run: async () => {
      const repo = new InMemoryDomainRepository();
      const d: CGDomain = { name:'PubD', version:'1.0', definition:{} as never, published:false, created_at:1n };
      await repo.insert(d);
      await repo.publish('PubD','1.0');
      const found = await repo.findByNameVersion('PubD','1.0');
      return found?.published;
    },
    expected: true },

  { id: 'T-STORAGE-008', level: 1, description: 'ManifestRepository – insert + findByCGFI',
    run: async () => {
      const repo = new InMemoryManifestRepository();
      const cgfi = computeCGFI('tai','hash','pdf');
      const m: CGManifest = { cgfi, tai_timepoint:'tai', content_hash:'hash', type_id:'pdf',
        size_bytes:1024n, metadata:{}, tombstone:false, created_at:1n };
      await repo.insert(m);
      const found = await repo.findByCGFI(cgfi);
      return found?.cgfi === cgfi;
    },
    expected: true },

  { id: 'T-STORAGE-009', level: 1, description: 'ManifestRepository – tombstone',
    run: async () => {
      const repo = new InMemoryManifestRepository();
      const cgfi = computeCGFI('t','h','pdf');
      const m: CGManifest = { cgfi, tai_timepoint:'t', content_hash:'h', type_id:'pdf',
        size_bytes:0n, metadata:{}, tombstone:false, created_at:1n };
      await repo.insert(m);
      await repo.tombstone(cgfi);
      const found = await repo.findByCGFI(cgfi);
      return found?.tombstone;
    },
    expected: true },

  { id: 'T-STORAGE-010', level: 1, description: 'TimepointRepository – absolute_value als BigInt',
    run: async () => {
      const repo = new InMemoryTimepointRepository();
      const tp = createTimepoint('TAI','1.0',9999999999n);
      await repo.insert(tp);
      const found = await repo.findById(tp.machine_id);
      if (typeof found?.absolute_value !== 'bigint') throw new Error('absolute_value muss bigint sein');
      return true;
    },
    expected: true },

  { id: 'T-STORAGE-011', level: 1, description: 'RelationRepository – insert + list',
    run: async () => {
      const repo = new InMemoryRelationRepository();
      const r: CGRelation = { id:'r1', timepoint_a:'a', timepoint_b:'b', relation:'BEFORE', computed_at:1n };
      await repo.insert(r);
      const list = await repo.list();
      return list.length;
    },
    expected: 1 },

  { id: 'T-STORAGE-012', level: 1, description: 'SegmentRepository – allocate + resolve',
    run: async () => {
      const repo = new InMemorySegmentRepository();
      const seg = await repo.allocate('test', 1_000_000n);
      const found = await repo.resolve(seg.id);
      return found.status;
    },
    expected: 'active' },

  { id: 'T-STORAGE-013', level: 2, description: 'SegmentRepository – revoke',
    run: async () => {
      const repo = new InMemorySegmentRepository();
      const seg = await repo.allocate('test', 1_000_000n);
      await repo.revoke(seg.id);
      try { await repo.resolve(seg.id); return false; }
      catch(e) { return (e as {code:string}).code === 'CG-E-010.004'; }
    },
    expected: true },

  { id: 'T-STORAGE-014', level: 2, description: 'SegmentRepository – list',
    run: async () => {
      const repo = new InMemorySegmentRepository();
      await repo.allocate('a', 1_000n);
      await repo.allocate('b', 2_000n);
      const list = await repo.list();
      return list.length;
    },
    expected: 2 },

  { id: 'T-STORAGE-015', level: 2, description: 'DomainRepository – list nach insert',
    run: async () => {
      const repo = new InMemoryDomainRepository();
      const d1: CGDomain = { name:'A', version:'1.0', definition:{} as never, published:false, created_at:1n };
      const d2: CGDomain = { name:'B', version:'1.0', definition:{} as never, published:false, created_at:2n };
      await repo.insert(d1); await repo.insert(d2);
      return (await repo.list()).length;
    },
    expected: 2 },

  { id: 'T-STORAGE-016', level: 3, description: 'I-S1: Tombstone ist nicht reversibel (Insert-only)',
    run: async () => {
      const repo = new InMemoryManifestRepository();
      const cgfi = computeCGFI('x','y','z');
      const m: CGManifest = { cgfi, tai_timepoint:'x', content_hash:'y', type_id:'z',
        size_bytes:0n, metadata:{}, tombstone:false, created_at:1n };
      await repo.insert(m);
      await repo.tombstone(cgfi);
      // I-S1: kein Update zurück – Tombstone bleibt
      const found = await repo.findByCGFI(cgfi);
      return found?.tombstone === true;
    },
    expected: true },
];
