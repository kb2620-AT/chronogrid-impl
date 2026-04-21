/**
 * cg-cguas + cg-storage / sprint3.test.ts
 * Normative Testvektoren Sprint 3 — CG-STD-6100 v0.2 + CG-STD-4100 v0.5
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  SegmentRegistry, cguaToString, parseCGUA, allocateFileAddress,
  SEGMENT_LIMITS, MAX_LEVEL,
} from './cguas.ts';
import {
  InMemoryTimepointRepository,
  InMemoryDomainRepository,
  InMemoryManifestRepository,
  InMemoryRelationRepository,
  makeRelationRow, makeDomainId,
  type TimepointRow, type ManifestRow,
} from './repository.ts';
import { computeMachineID, computeCGFI, cgfiToHex } from 'cg-engine/engine.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve().then(fn).then(() => {
    console.log(`  ✓ ${name}`);
    passed++;
  }).catch(err => {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }).finally(() => {
    if (passed + failed === TOTAL_TESTS) {
      console.log(`\n── Ergebnis Sprint 3: ${passed} bestanden, ${failed} fehlgeschlagen ──\n`);
      if (failed > 0) process.exit(1);
    }
  });
}

const TOTAL_TESTS = 40; // wird unten gezählt

// ── T-CGUAS: Segment-Verwaltung ───────────────────────────────────────────────
console.log('\n── T-CGUAS: Segment-Verwaltung (CG-STD-6100 Kap. 3) ──');

test('T-CGUAS-001: Root-Segment deckt gesamten 79-Bit-Adressraum', () => {
  const reg = new SegmentRegistry();
  const EXPECTED_MAX = BigInt(2) ** BigInt(79) - BigInt(1);
  assert.equal(reg.root.end_address, EXPECTED_MAX);
  assert.equal(reg.root.start_address, 0n);
  assert.equal(reg.root.level, 0);
});

test('T-CGUAS-002: Segment-Allokation erzeugt korrekte Grenzen', () => {
  const reg = new SegmentRegistry();
  const seg = reg.allocate({
    segment_id: 'at.gv.staatsarchiv',
    owner_id:   'Österreichisches Staatsarchiv',
    size_ns:    BigInt('1000000000000000000000'), // 10^21 ns
    parent_id:  'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1',
    granted_by: 'ChronoGrid Systems',
  });
  assert.equal(seg.start_address, 0n);
  assert.equal(seg.end_address, BigInt('1000000000000000000000'));
  assert.equal(seg.size_ns, BigInt('1000000000000000000000'));
  assert.equal(seg.level, 1);
  assert.equal(seg.status, 'active');
});

test('T-CGUAS-003: Zwei Segmente sind nicht überlappend', () => {
  const reg = new SegmentRegistry();
  const SIZE = BigInt('1000000000000000000000');
  const seg1 = reg.allocate({
    segment_id: 'org.a', owner_id: 'Org A', size_ns: SIZE,
    parent_id: 'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1', granted_by: 'CG',
  });
  const seg2 = reg.allocate({
    segment_id: 'org.b', owner_id: 'Org B', size_ns: SIZE,
    parent_id: 'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585311000000000/v1', granted_by: 'CG',
  });
  assert.ok(seg2.start_address >= seg1.end_address, 'Segmente dürfen nicht überlappen');
  assert.equal(seg2.start_address, seg1.end_address);
});

test('T-CGUAS-004: CGUA-Auflösung (resolve) findet korrektes Segment', () => {
  const reg = new SegmentRegistry();
  const SIZE = BigInt('1000000000000000000000');
  const seg = reg.allocate({
    segment_id: 'at.chronogrid.demo', owner_id: 'Demo', size_ns: SIZE,
    parent_id: 'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1', granted_by: 'CG',
  });
  // Adresse in der Mitte des Segments
  const mid = seg.start_address + SIZE / 2n;
  const found = reg.resolve(mid);
  assert.equal(found.segment_id, 'at.chronogrid.demo');
});

test('T-CGUAS-005: resolve() wirft CG-E-010.002 für nicht belegte Adresse', () => {
  const reg = new SegmentRegistry();
  // Adresse außerhalb aller Sub-Segmente (nur Root existiert)
  // Root umfasst alles, also brauchen wir eine Adresse > CGUAS_MAX
  let threw = false;
  try {
    reg.resolve(BigInt(2) ** BigInt(79)); // über CGUAS_MAX
  } catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.ok(
        (e as { code: string }).code.startsWith('CG-E-010'),
        `Erwartet CG-E-010.*, got ${(e as { code: string }).code}`
      );
    }
  }
  assert.ok(threw);
});

test('T-CGUAS-006: Integritäts-Hash wird korrekt verifiziert', () => {
  const reg = new SegmentRegistry();
  const seg = reg.allocate({
    segment_id: 'at.verify.test', owner_id: 'Test', size_ns: BigInt('1000000000000000000000'),
    parent_id: 'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1', granted_by: 'CG',
  });
  assert.ok(reg.verifyIntegrity(seg), 'Integritäts-Hash muss korrekt sein');
});

test('T-CGUAS-007: I-D1 — gleiche segment_id wirft Fehler', () => {
  const reg = new SegmentRegistry();
  const params = {
    segment_id: 'at.doppelt', owner_id: 'X', size_ns: BigInt('1000000000000000000000'),
    parent_id: 'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1', granted_by: 'CG',
  };
  reg.allocate(params);
  let threw = false;
  try { reg.allocate({ ...params, segment_id: 'at.doppelt' }); }
  catch { threw = true; }
  assert.ok(threw);
});

test('T-CGUAS-008: cguaToString/parseCGUA Roundtrip', () => {
  const val = 219847362910000000042n;
  const str = cguaToString(val);
  assert.equal(str, `CG:CGUAS:${val}/v1`);
  assert.equal(parseCGUA(str), val);
});

test('T-CGUAS-009: allocateFileAddress gibt korrekte CGUA', () => {
  const reg = new SegmentRegistry();
  const seg = reg.allocate({
    segment_id: 'at.file.test', owner_id: 'Test', size_ns: BigInt('1000000000000000000000'),
    parent_id: 'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1', granted_by: 'CG',
  });
  const cgua = allocateFileAddress(seg, 42n);
  assert.equal(cgua, cguaToString(seg.start_address + 42n));
});

test('T-CGUAS-010: UC3 Messstellen-Adresse (CG-APP-0600)', () => {
  const reg = new SegmentRegistry();
  const seg = reg.allocate({
    segment_id: 'at.chronogrid.demo.energy',
    owner_id:   'ChronoGrid Demo Energy',
    size_ns:    BigInt('1000000000000000000000'),
    parent_id:  'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1744035862300000000/v1',
    granted_by: 'CG',
  });
  // Messstelle L1 = offset 42
  const cgua_L1 = allocateFileAddress(seg, 42n);
  assert.ok(cgua_L1.startsWith('CG:CGUAS:'));
  // Resolve zurück
  const addr = parseCGUA(cgua_L1);
  const resolved = reg.resolve(addr);
  assert.equal(resolved.segment_id, 'at.chronogrid.demo.energy');
});

// ── T-STOR: Storage-Repositories ──────────────────────────────────────────────
console.log('\n── T-STOR: Storage-Repositories (CG-STD-4100 Kap. 3) ──');

test('T-STOR-001: TimepointRepository Insert + FindById', async () => {
  const repo = new InMemoryTimepointRepository();
  const taiNs = 1743585310_000_000_000n;
  const machineId = Buffer.from(computeMachineID(taiNs)).toString('hex');
  const row: TimepointRow = {
    machine_id:     machineId,
    cgta_string:    `CG:TAI:${taiNs}/v1`,
    domain_id:      'TAI/v1',
    absolute_value: taiNs,
    granularity:    'nanosecond',
    created_at:     `CG:TAI:${taiNs}/v1`,
    created_by:     'test',
  };
  await repo.insert(row);
  const found = await repo.findByMachineId(machineId);
  assert.ok(found, 'Muss gefunden werden');
  assert.equal(found!.absolute_value, taiNs);
});

test('T-STOR-002: I-D1 — doppelter Insert wirft Fehler', async () => {
  const repo = new InMemoryTimepointRepository();
  const row: TimepointRow = {
    machine_id: 'a'.repeat(64), cgta_string: 'CG:TAI:1/v1',
    domain_id: 'TAI/v1', absolute_value: 1n,
    granularity: 'nanosecond', created_at: 'CG:TAI:1/v1', created_by: 'test',
  };
  await repo.insert(row);
  let threw = false;
  try { await repo.insert(row); } catch { threw = true; }
  assert.ok(threw, 'Doppelter Insert muss Fehler werfen (I-D1)');
});

test('T-STOR-003: absolute_value muss BigInt sein', async () => {
  const repo = new InMemoryTimepointRepository();
  const row: TimepointRow = {
    machine_id: 'b'.repeat(64), cgta_string: 'CG:TAI:1/v1',
    domain_id: 'TAI/v1', absolute_value: 1.5 as unknown as bigint, // Float — verboten
    granularity: 'nanosecond', created_at: 'CG:TAI:1/v1', created_by: 'test',
  };
  let threw = false;
  try { await repo.insert(row); } catch { threw = true; }
  assert.ok(threw, 'Float als absolute_value muss Fehler werfen');
});

test('T-STOR-004: Bereichsabfrage auf timepoints', async () => {
  const repo = new InMemoryTimepointRepository();
  const base = 1743585310_000_000_000n;
  for (let i = 0; i < 5; i++) {
    const t = base + BigInt(i) * 100_000_000n;
    const mid = Buffer.from(computeMachineID(t)).toString('hex');
    await repo.insert({
      machine_id: mid, cgta_string: `CG:TAI:${t}/v1`,
      domain_id: 'TAI/v1', absolute_value: t,
      granularity: 'nanosecond', created_at: `CG:TAI:${t}/v1`, created_by: 'test',
    });
  }
  const results = await repo.findByDomainAndRange('TAI/v1', base, base + 200_000_000n);
  assert.equal(results.length, 3, 'Bereichsabfrage muss 3 Ergebnisse liefern');
});

test('T-STOR-005: DomainRepository Insert + FindById', async () => {
  const repo = new InMemoryDomainRepository();
  const domain = {
    name: 'test/domain', version: 1, semantics: 'time' as const,
    type: 'linear' as const, granularity: '1000000000',
    extent: { min: '0', max: null },
    epoch: { reference: '1970-01-01T00:00:00Z', tai_offset: 0 },
  };
  await repo.insert(domain, 'CG:TAI:1/v1', 'test');
  const found = await repo.findById('test/domain/v1');
  assert.ok(found);
  assert.equal(found!.name, 'test/domain');
});

test('T-STOR-006: ManifestRepository Insert + FindByCGFI', async () => {
  const repo = new InMemoryManifestRepository();
  const content = Buffer.from('{"flight":"OS411"}');
  const cgfi = cgfiToHex(computeCGFI(1743585310_000_000_000n, content, 'aviation/atc-event/v1'));
  const contentHash = createHash('sha256').update(content).digest('hex');
  const row: ManifestRow = {
    cgfi, cgfs_version: '1.0',
    type_id: 'aviation/atc-event/v1',
    type_schema: 'cgfs://types/aviation/atc-event/v1/schema.json',
    created_at: 'CG:TAI:1743585310000000000/v1',
    content_hash: contentHash,
    created_by: 'at.austro-control.atc',
    access_level: 'restricted',
  };
  await repo.insert(row);
  const found = await repo.findByCGFI(cgfi);
  assert.ok(found);
  assert.equal(found!.content_hash, contentHash);
});

test('T-STOR-007: logisches Löschen (Tombstone) setzt deleted_at', async () => {
  const repo = new InMemoryManifestRepository();
  const content = Buffer.from('test content');
  const cgfi = cgfiToHex(computeCGFI(1743585310_000_000_000n, content, 'legal/contract/v1'));
  await repo.insert({
    cgfi, cgfs_version: '1.0', type_id: 'legal/contract/v1',
    type_schema: 'cgfs://types/legal/contract/v1/schema.json',
    created_at: 'CG:TAI:1743585310000000000/v1',
    content_hash: createHash('sha256').update(content).digest('hex'),
    created_by: 'at.notar.reiter',
    access_level: 'restricted',
  });
  await repo.softDelete(cgfi, 'CG:TAI:1800000000000000000/v1', 'dsgvo_art17');
  const found = await repo.findByCGFI(cgfi);
  assert.ok(found!.deleted_at, 'deleted_at muss gesetzt sein');
  assert.equal(found!.deleted_reason, 'dsgvo_art17');
  assert.ok(found!.cgfi, 'CGFI muss erhalten bleiben (I-D1)');
  assert.ok(found!.content_hash, 'content_hash muss erhalten bleiben');
});

test('T-STOR-008: doppelter Tombstone wirft CG-E-011.009', async () => {
  const repo = new InMemoryManifestRepository();
  const content = Buffer.from('x');
  const cgfi = cgfiToHex(computeCGFI(1n, content, 'test/v1'));
  await repo.insert({
    cgfi, cgfs_version: '1.0', type_id: 'test/v1',
    type_schema: 'url', created_at: 'CG:TAI:1/v1',
    content_hash: createHash('sha256').update(content).digest('hex'),
    created_by: 'test', access_level: 'public',
  });
  await repo.softDelete(cgfi, 'CG:TAI:2/v1', 'dsgvo_art17');
  let threw = false;
  try { await repo.softDelete(cgfi, 'CG:TAI:3/v1', 'dsgvo_art17'); }
  catch (e: unknown) {
    threw = true;
    if (e && typeof e === 'object' && 'code' in e) {
      assert.equal((e as { code: string }).code, 'CG-E-011.009');
    }
  }
  assert.ok(threw);
});

test('T-STOR-009: Versions-Chain funktioniert korrekt', async () => {
  const repo = new InMemoryManifestRepository();
  const c1 = Buffer.from('v1');
  const c2 = Buffer.from('v2');
  const cgfi1 = cgfiToHex(computeCGFI(1_000_000_000n, c1, 'legal/contract/v1'));
  const cgfi2 = cgfiToHex(computeCGFI(2_000_000_000n, c2, 'legal/contract/v1'));

  await repo.insert({
    cgfi: cgfi1, cgfs_version: '1.0', type_id: 'legal/contract/v1',
    type_schema: 'url', created_at: 'CG:TAI:1000000000/v1',
    content_hash: createHash('sha256').update(c1).digest('hex'),
    created_by: 'notar', access_level: 'restricted',
  });
  await repo.insert({
    cgfi: cgfi2, cgfs_version: '1.0', type_id: 'legal/contract/v1',
    type_schema: 'url', created_at: 'CG:TAI:2000000000/v1',
    prev_version: cgfi1,  // Versions-Chain (I-D1)
    content_hash: createHash('sha256').update(c2).digest('hex'),
    created_by: 'notar', access_level: 'restricted',
  });

  const chain = await repo.getVersionChain(cgfi2);
  assert.equal(chain.length, 2, 'Chain muss 2 Versionen enthalten');
  assert.equal(chain[0].cgfi, cgfi2);
  assert.equal(chain[1].cgfi, cgfi1);
});

test('T-STOR-010: RelationRepository mit normativem relation_id', async () => {
  const repo = new InMemoryRelationRepository();
  const mid_a = 'a'.repeat(64);
  const mid_b = 'b'.repeat(64);
  const row = makeRelationRow(mid_a, mid_b, 'before', 'CG:TAI:1743585310000000000/v1');

  await repo.insert(row);
  const found = await repo.findByPair(mid_a, mid_b);
  assert.equal(found.length, 1);
  assert.equal(found[0].relation_type, 'before');
});

// ── Integration: UC1 vollständig gespeichert ──────────────────────────────────
console.log('\n── T-INT: UC1 vollständig (Insert + Verify) ──');

test('T-INT-001: UC1 OS411/EVINA — vollständiger Pfad', async () => {
  const tpRepo  = new InMemoryTimepointRepository();
  const manRepo = new InMemoryManifestRepository();
  const segReg  = new SegmentRegistry();

  // 1. Segment für Austro Control
  const seg = segReg.allocate({
    segment_id: 'at.austro-control.atc',
    owner_id:   'Austro Control GmbH',
    size_ns:    BigInt('1000000000000000000000'),
    parent_id:  'CG.CGUAS.ROOT',
    granted_at: 'CG:TAI:1743585310000000000/v1',
    granted_by: 'ChronoGrid Systems',
  });

  // 2. TAI-Zeitpunkt
  const taiNs = 1743585310_000_000_000n;
  const machineId = Buffer.from(computeMachineID(taiNs)).toString('hex');
  await tpRepo.insert({
    machine_id:     machineId,
    cgta_string:    `CG:TAI:${taiNs}/v1`,
    domain_id:      'TAI/v1',
    absolute_value: taiNs,
    granularity:    'nanosecond',
    created_at:     `CG:TAI:${taiNs}/v1`,
    created_by:     'at.austro-control.atc.lovv/system',
  });

  // 3. CGUA-Adresse
  const cgua = allocateFileAddress(seg, 7n);

  // 4. CGFI berechnen
  const content = Buffer.from(JSON.stringify({ flight: 'OS411', waypoint: 'EVINA' }));
  const cgfi = cgfiToHex(computeCGFI(taiNs, content, 'aviation/atc-event/v1'));

  // 5. Manifest speichern
  await manRepo.insert({
    cgfi,
    cgfs_version: '1.0',
    type_id:      'aviation/atc-event/v1',
    type_schema:  'cgfs://types/aviation/atc-event/v1/schema.json',
    created_at:   `CG:TAI:${taiNs}/v1`,
    content_hash: createHash('sha256').update(content).digest('hex'),
    cgua,
    retention:    'P10Y',
    created_by:   'at.austro-control.atc.lovv/system',
    tags:         ['OS411', 'EVINA', 'LOVV'],
    access_level: 'restricted',
  });

  // 6. Verifikation
  const tp   = await tpRepo.findByMachineId(machineId);
  const man  = await manRepo.findByCGFI(cgfi);
  const resolved = segReg.resolve(parseCGUA(cgua));

  assert.ok(tp,  'Zeitpunkt muss gespeichert sein');
  assert.ok(man, 'Manifest muss gespeichert sein');
  assert.equal(resolved.segment_id, 'at.austro-control.atc');
  assert.equal(man!.retention, 'P10Y');
  assert.ok(!man!.deleted_at, 'Manifest darf nicht gelöscht sein');
});

// Gesamtergebnis (async — wird in test() geloggt)
setTimeout(() => {}, 200);