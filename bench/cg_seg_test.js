/**
 * cg_seg_test.js
 * ChronoGrid Systems — I-SEG-1 Segment-Isolation Validierung
 * Normative Invariante: CG-STD-0000 Th. 5.5 / CG-STD-6100 v0.5
 *
 * Anforderung (I-SEG-1):
 *   Operationen in Segment S_i beeinflussen keine anderen Segmente S_j (j ≠ i).
 *   Formal: ∀ op ∈ Ops(S_i), ∀ j ≠ i: state(S_j) nach op = state(S_j) vor op
 *
 * Ausführen: node cg_seg_test.js
 * Keine externen Abhängigkeiten — nur Node.js Standardbibliothek.
 */

'use strict';

const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');

// ═══════════════════════════════════════════════════════════════════════════════
// Minimale CGUA / SegmentRegistry-Implementierung (CG-STD-6100 §3–§7)
// ═══════════════════════════════════════════════════════════════════════════════

class CGUAError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'CGUAError';
  }
}

class Segment {
  constructor(id, baseAddress, sizeNs, grantedBy, parentId = null) {
    this.id          = id;
    this.baseAddress = baseAddress;      // BigInt – inklusiv
    this.endAddress  = baseAddress + sizeNs;  // BigInt – exklusiv
    this.sizeNs      = sizeNs;
    this.grantedBy   = grantedBy;
    this.parentId    = parentId;
    this.status      = 'active';         // 'active' | 'revoked'
    this.timepoints  = new Map();        // machineId → timepoint record
    this.createdAt   = BigInt(Date.now()) * 1_000_000n;
    this.opLog       = [];               // Ops-Log für Isolation-Prüfung
  }

  /** Prüft ob ein Zeitwert (BigInt) in diesem Segment liegt */
  contains(value) {
    return value >= this.baseAddress && value < this.endAddress;
  }

  /** CGUA-URI für einen lokalen Offset */
  cgua(localOffset) {
    if (localOffset < 0n || localOffset >= this.sizeNs)
      throw new CGUAError('CG-E-010.001', `Offset ${localOffset} außerhalb Segment ${this.id}`);
    return `cgua://${this.id}/${localOffset}/v1`;
  }
}

class SegmentRegistry {
  constructor() {
    this._segments = new Map();
    this._nextBase  = 0n;
    this._opLog     = [];   // Globales Op-Log für Isolation-Audit
  }

  /** Segment allozieren (I-SEG-1: Überlappungsprüfung) */
  allocate(grantedBy, sizeNs, parentId = null) {
    if (sizeNs <= 0n)
      throw new CGUAError('CG-E-010.003', `sizeNs muss > 0 sein, erhalten: ${sizeNs}`);

    const base = this._nextBase;
    const end  = base + sizeNs;

    // I-SEG-1 Vorbedingung: kein aktives Segment darf überlappen
    for (const seg of this._segments.values()) {
      if (seg.status !== 'active') continue;
      if (base < seg.endAddress && end > seg.baseAddress) {
        throw new CGUAError(
          'CG-E-010.002',
          `I-SEG-1 Verletzung: Überlappung mit Segment ${seg.id} [${seg.baseAddress}–${seg.endAddress})`
        );
      }
    }

    const id = createHash('sha256')
      .update(`${grantedBy}:${base}:${sizeNs}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 16);

    const seg = new Segment(id, base, sizeNs, grantedBy, parentId);
    this._segments.set(id, seg);
    this._nextBase = end;

    this._log('allocate', id, { base, sizeNs, grantedBy });
    return seg;
  }

  /** Segment auflösen — wirft bei revoked oder nicht vorhanden */
  resolve(segmentId) {
    const seg = this._segments.get(segmentId);
    if (!seg)
      throw new CGUAError('CG-E-010.002', `Segment nicht gefunden: ${segmentId}`);
    if (seg.status === 'revoked')
      throw new CGUAError('CG-E-010.004', `Segment widerrufen: ${segmentId}`);
    return seg;
  }

  /** Widerruft ein Segment (I-SEG-1: andere Segmente unberührt) */
  revoke(segmentId) {
    const seg = this.resolve(segmentId);
    seg.status = 'revoked';
    this._log('revoke', segmentId, {});
  }

  /** Zeitpunkt in ein Segment schreiben */
  writeTimepoint(segmentId, machineId, value, domain) {
    const seg = this.resolve(segmentId);
    if (!seg.contains(value))
      throw new CGUAError('CG-E-010.001', `Wert ${value} liegt nicht in Segment ${segmentId}`);
    const record = { machineId, value, domain, writtenAt: Date.now() };
    seg.timepoints.set(machineId, record);
    seg.opLog.push({ op: 'write', machineId, value });
    this._log('write', segmentId, { machineId, value, domain });
    return record;
  }

  /** Zeitpunkt aus einem Segment lesen */
  readTimepoint(segmentId, machineId) {
    const seg = this.resolve(segmentId);
    const rec = seg.timepoints.get(machineId);
    if (!rec)
      throw new CGUAError('CG-E-010.005', `Zeitpunkt ${machineId} nicht in Segment ${segmentId}`);
    seg.opLog.push({ op: 'read', machineId, value: rec.value });
    this._log('read', segmentId, { machineId });
    return rec;
  }

  /** Alle Segmente als Array */
  list() {
    return [...this._segments.values()];
  }

  _log(op, target, meta) {
    this._opLog.push({ op, target, meta, ts: Date.now() });
  }

  /** Snapshot aller Segment-States (für Vorher/Nachher-Vergleich) */
  snapshot() {
    const snap = {};
    for (const [id, seg] of this._segments) {
      snap[id] = {
        status:      seg.status,
        tpCount:     seg.timepoints.size,
        tpKeys:      [...seg.timepoints.keys()],
        baseAddress: seg.baseAddress,
        endAddress:  seg.endAddress,
      };
    }
    return snap;
  }

  /** Prüft ob zwei Snapshots für ein spezifisches Segment identisch sind */
  snapshotEqual(s1, s2, segmentId) {
    const a = s1[segmentId];
    const b = s2[segmentId];
    if (!a || !b) return false;
    return (
      a.status      === b.status &&
      a.tpCount     === b.tpCount &&
      a.baseAddress === b.baseAddress &&
      a.endAddress  === b.endAddress &&
      JSON.stringify(a.tpKeys.sort()) === JSON.stringify(b.tpKeys.sort())
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test-Runner
// ═══════════════════════════════════════════════════════════════════════════════

let passed = 0, failed = 0;
const results = [];

function assert(condition, id, description, details = '') {
  if (condition) {
    passed++;
    results.push({ id, status: 'PASS', description });
    process.stdout.write(`  ✓  ${id}  ${description}\n`);
  } else {
    failed++;
    results.push({ id, status: 'FAIL', description, details });
    process.stdout.write(`  ✗  ${id}  ${description}${details ? '  →  ' + details : ''}\n`);
  }
}

function assertThrows(fn, expectedCode, id, description) {
  try {
    fn();
    failed++;
    results.push({ id, status: 'FAIL', description, details: 'Kein Fehler geworfen' });
    process.stdout.write(`  ✗  ${id}  ${description}  →  Kein Fehler geworfen\n`);
  } catch (e) {
    const ok = e.code === expectedCode;
    if (ok) {
      passed++;
      results.push({ id, status: 'PASS', description });
      process.stdout.write(`  ✓  ${id}  ${description}  [${e.code}]\n`);
    } else {
      failed++;
      results.push({ id, status: 'FAIL', description, details: `Erwartet ${expectedCode}, erhalten ${e.code}` });
      process.stdout.write(`  ✗  ${id}  ${description}  →  Erwartet ${expectedCode}, erhalten ${e.code}\n`);
    }
  }
}

function section(title) {
  process.stdout.write(`\n── ${title} ─────────────────────────────────────\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTGRUPPE 1: Segment-Allokation & Nicht-Überlappung (I-SEG-1 Vorbedingung)
// ═══════════════════════════════════════════════════════════════════════════════

section('T-SEG-1xx  Allokation & Nicht-Überlappung');

const reg = new SegmentRegistry();

const S1 = reg.allocate('domain:TAI',    1_000_000_000_000n);   // 1 s in ns
const S2 = reg.allocate('domain:GPS',    500_000_000_000n);
const S3 = reg.allocate('domain:UTC',    2_000_000_000_000n);

assert(S1 !== null, 'T-SEG-101', 'Segment S1 erfolgreich alloziert');
assert(S2 !== null, 'T-SEG-102', 'Segment S2 erfolgreich alloziert');
assert(S3 !== null, 'T-SEG-103', 'Segment S3 erfolgreich alloziert');

assert(S2.baseAddress === S1.endAddress, 'T-SEG-104',
  'S2 beginnt exakt am Ende von S1 (keine Lücke)');
assert(S3.baseAddress === S2.endAddress, 'T-SEG-105',
  'S3 beginnt exakt am Ende von S2 (keine Lücke)');

// Keine Adressraumüberlappung
const noOverlap = S1.endAddress <= S2.baseAddress && S2.endAddress <= S3.baseAddress;
assert(noOverlap, 'T-SEG-106', 'Kein Adressraumüberlapp zwischen S1, S2, S3');

// Ungültige Allokation (sizeNs = 0)
assertThrows(
  () => reg.allocate('domain:X', 0n),
  'CG-E-010.003',
  'T-SEG-107',
  'sizeNs = 0 wirft CG-E-010.003'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TESTGRUPPE 2: Schreiboperationen isoliert (I-SEG-1 Kerntests)
// ═══════════════════════════════════════════════════════════════════════════════

section('T-SEG-2xx  Schreib-Isolation (I-SEG-1 Kern)');

// Werte innerhalb der Segmente
const v1 = S1.baseAddress + 100n;
const v2 = S2.baseAddress + 200n;
const v3 = S3.baseAddress + 300n;

const m1 = createHash('sha256').update('TAI:' + v1.toString()).digest('hex');
const m2 = createHash('sha256').update('GPS:' + v2.toString()).digest('hex');
const m3 = createHash('sha256').update('UTC:' + v3.toString()).digest('hex');

// Snapshot VOR Schreiboperationen in S1
const snapBefore = reg.snapshot();

// Schreibe Zeitpunkt in S1
reg.writeTimepoint(S1.id, m1, v1, 'TAI');

// Snapshot NACH Schreiboperation in S1
const snapAfterS1Write = reg.snapshot();

// I-SEG-1: S2 und S3 müssen unverändert sein
assert(
  reg.snapshotEqual(snapBefore, snapAfterS1Write, S2.id),
  'T-SEG-201',
  'Schreiben in S1 verändert S2 nicht (I-SEG-1)'
);
assert(
  reg.snapshotEqual(snapBefore, snapAfterS1Write, S3.id),
  'T-SEG-202',
  'Schreiben in S1 verändert S3 nicht (I-SEG-1)'
);

// Schreibe in S2, S3 – S1 darf sich nicht ändern
const snapBeforeS2 = reg.snapshot();
reg.writeTimepoint(S2.id, m2, v2, 'GPS');
reg.writeTimepoint(S3.id, m3, v3, 'UTC');
const snapAfterAll = reg.snapshot();

assert(
  reg.snapshotEqual(snapBeforeS2, snapAfterAll, S1.id),
  'T-SEG-203',
  'Schreiben in S2+S3 verändert S1 nicht (I-SEG-1)'
);

// Wert außerhalb Segment → Fehler
assertThrows(
  () => reg.writeTimepoint(S1.id, m2, S2.baseAddress, 'GPS'),
  'CG-E-010.001',
  'T-SEG-204',
  'Zeitwert außerhalb S1 wirft CG-E-010.001'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TESTGRUPPE 3: Lese-Isolation
// ═══════════════════════════════════════════════════════════════════════════════

section('T-SEG-3xx  Lese-Isolation');

// Lesen aus S1 – S2 und S3 unverändert
const snapBeforeRead = reg.snapshot();
const rec1 = reg.readTimepoint(S1.id, m1);
const snapAfterRead = reg.snapshot();

assert(rec1.value === v1, 'T-SEG-301', 'Gelesener Wert korrekt aus S1');
assert(
  reg.snapshotEqual(snapBeforeRead, snapAfterRead, S2.id),
  'T-SEG-302',
  'Lesen aus S1 verändert S2 nicht (I-SEG-1)'
);
assert(
  reg.snapshotEqual(snapBeforeRead, snapAfterRead, S3.id),
  'T-SEG-303',
  'Lesen aus S1 verändert S3 nicht (I-SEG-1)'
);

// Lesen aus falschem Segment → Fehler
assertThrows(
  () => reg.readTimepoint(S1.id, m2),  // m2 liegt in S2
  'CG-E-010.005',
  'T-SEG-304',
  'Lesen fremder MachineID aus S1 wirft CG-E-010.005'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TESTGRUPPE 4: Revoke-Isolation (I-SEG-1: Widerrufen isoliert)
// ═══════════════════════════════════════════════════════════════════════════════

section('T-SEG-4xx  Revoke-Isolation');

// Neues Segment S4 allozieren und widerrufen
const S4 = reg.allocate('domain:TEST', 100_000_000n);
reg.writeTimepoint(S4.id,
  createHash('sha256').update('TEST:' + (S4.baseAddress + 1n).toString()).digest('hex'),
  S4.baseAddress + 1n, 'TEST');

const snapBeforeRevoke = reg.snapshot();
reg.revoke(S4.id);
const snapAfterRevoke = reg.snapshot();

// S1, S2, S3 unverändert nach Revoke von S4
assert(
  reg.snapshotEqual(snapBeforeRevoke, snapAfterRevoke, S1.id),
  'T-SEG-401',
  'Revoke S4 verändert S1 nicht (I-SEG-1)'
);
assert(
  reg.snapshotEqual(snapBeforeRevoke, snapAfterRevoke, S2.id),
  'T-SEG-402',
  'Revoke S4 verändert S2 nicht (I-SEG-1)'
);
assert(
  reg.snapshotEqual(snapBeforeRevoke, snapAfterRevoke, S3.id),
  'T-SEG-403',
  'Revoke S4 verändert S3 nicht (I-SEG-1)'
);

// Zugriff auf revoziertes Segment → Fehler
assertThrows(
  () => reg.resolve(S4.id),
  'CG-E-010.004',
  'T-SEG-404',
  'Zugriff auf revoziertes Segment wirft CG-E-010.004'
);

// Doppeltes Revoke → Fehler (bereits revoziert)
assertThrows(
  () => reg.revoke(S4.id),
  'CG-E-010.004',
  'T-SEG-405',
  'Doppeltes Revoke wirft CG-E-010.004'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TESTGRUPPE 5: CGUA-URI Encoding / Parsing
// ═══════════════════════════════════════════════════════════════════════════════

section('T-SEG-5xx  CGUA-URI Encoding');

const cgua1 = S1.cgua(100n);
assert(
  cgua1.startsWith(`cgua://${S1.id}/100/v1`),
  'T-SEG-501',
  'CGUA-URI korrekt formatiert'
);

// Parsen
const parsed = cgua1.match(/^cgua:\/\/([^/]+)\/(\d+)\/v(\d+)$/);
assert(
  parsed && parsed[1] === S1.id && BigInt(parsed[2]) === 100n && Number(parsed[3]) === 1,
  'T-SEG-502',
  'CGUA-URI korrekt geparsed (segmentId, offset, version)'
);

// Offset außerhalb → Fehler
assertThrows(
  () => S1.cgua(S1.sizeNs),    // = sizeNs, also exklusiv → ungültig
  'CG-E-010.001',
  'T-SEG-503',
  'Offset = sizeNs (exklusive Grenze) wirft CG-E-010.001'
);

// ═══════════════════════════════════════════════════════════════════════════════
// TESTGRUPPE 6: Massenlast – 1000 Segmente (Performance + Isolation)
// ═══════════════════════════════════════════════════════════════════════════════

section('T-SEG-6xx  Massenlast & Gesamtintegrität');

const massReg = new SegmentRegistry();
const segCount = 1000;
const segs = [];
const t0 = performance.now();

for (let i = 0; i < segCount; i++) {
  segs.push(massReg.allocate(`domain:MASS-${i}`, BigInt(1_000_000 * (i + 1))));
}
const allocMs = performance.now() - t0;

assert(segs.length === segCount, 'T-SEG-601', `${segCount} Segmente erfolgreich alloziert`);
assert(allocMs < 200, 'T-SEG-602', `Allokation < 200 ms (effektiv: ${allocMs.toFixed(2)} ms)`);

// Alle Adressen disjunkt prüfen
let disjoint = true;
for (let i = 0; i < segs.length - 1; i++) {
  if (segs[i].endAddress !== segs[i + 1].baseAddress) { disjoint = false; break; }
  if (segs[i].endAddress > segs[i + 1].baseAddress)   { disjoint = false; break; }
}
assert(disjoint, 'T-SEG-603', `Alle ${segCount} Segmentgrenzen disjunkt und lückenlos`);

// Stichprobe: Schreibe in Segment 500 → Snapshot von 0 und 999 unverändert
const sSnap1 = massReg.snapshot();
const sMid   = segs[500];
const midVal = sMid.baseAddress + 1n;
const midId  = createHash('sha256').update('MASS:' + midVal).digest('hex');
massReg.writeTimepoint(sMid.id, midId, midVal, 'MASS-500');
const sSnap2 = massReg.snapshot();

assert(
  massReg.snapshotEqual(sSnap1, sSnap2, segs[0].id),
  'T-SEG-604',
  'Schreiben in Segment 500 verändert Segment 0 nicht'
);
assert(
  massReg.snapshotEqual(sSnap1, sSnap2, segs[999].id),
  'T-SEG-605',
  'Schreiben in Segment 500 verändert Segment 999 nicht'
);

// ═══════════════════════════════════════════════════════════════════════════════
// ERGEBNIS
// ═══════════════════════════════════════════════════════════════════════════════

const total = passed + failed;
process.stdout.write('\n');
process.stdout.write('═'.repeat(60) + '\n');
process.stdout.write(`ChronoGrid I-SEG-1 Segment-Isolation Validierung\n`);
process.stdout.write(`CG-STD-0000 Th. 5.5 / CG-STD-6100 v0.5 § 4\n`);
process.stdout.write('─'.repeat(60) + '\n');
process.stdout.write(`Ergebnis:  ${passed}/${total} Tests bestanden\n`);
process.stdout.write(`Status:    ${failed === 0 ? 'BESTANDEN ✓' : 'FEHLER ✗'}\n`);
process.stdout.write(`Datum:     ${new Date().toISOString()}\n`);
process.stdout.write(`Node.js:   ${process.version}\n`);
process.stdout.write(`Plattform: ${process.platform} / ${process.arch}\n`);
process.stdout.write('═'.repeat(60) + '\n');

// Maschinenlesbares JSON-Summary für Dokumentenerzeugung
const summary = {
  invariant:   'I-SEG-1',
  theorem:     'Th. 5.5',
  standard:    'CG-STD-0000 / CG-STD-6100 v0.5',
  passed, failed, total,
  status:      failed === 0 ? 'PASS' : 'FAIL',
  timestamp:   new Date().toISOString(),
  nodeVersion: process.version,
  platform:    `${process.platform}/${process.arch}`,
  testGroups: [
    { id: 'T-SEG-1xx', title: 'Allokation & Nicht-Überlappung', count: 7 },
    { id: 'T-SEG-2xx', title: 'Schreib-Isolation',              count: 4 },
    { id: 'T-SEG-3xx', title: 'Lese-Isolation',                 count: 4 },
    { id: 'T-SEG-4xx', title: 'Revoke-Isolation',               count: 5 },
    { id: 'T-SEG-5xx', title: 'CGUA-URI Encoding',              count: 3 },
    { id: 'T-SEG-6xx', title: 'Massenlast & Gesamtintegrität',  count: 5 },
  ],
  results,
};

process.stdout.write('\nJSON_SUMMARY_START\n');
process.stdout.write(JSON.stringify(summary, null, 2));
process.stdout.write('\nJSON_SUMMARY_END\n');

process.exit(failed > 0 ? 1 : 0);
