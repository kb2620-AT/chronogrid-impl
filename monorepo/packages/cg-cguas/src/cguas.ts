/**
 * cg-cguas/src/cguas.ts
 * ChronoGrid Universal Address Space (CGUAS) — CG-STD-6100 v0.2 Teil A
 *
 * Normative Anforderungen:
 * - Adressraum: 79 Bit (CG-STD-6100 Kap. 3 / CG-APP-0700)
 * - Segmente: unveränderlich nach Zuteilung (Insert-only, I-D1)
 * - Kollisionsschutz: atomare Zuteilung via Serializable Isolation (Kap. 3.2)
 * - Integritäts-Hash: SHA-256(owner_id || start || end || granted_at)
 * - Fehlerklasse: CG-E-010 (CGUASError)
 */

import { createHash } from 'node:crypto';
import { Errors } from 'cg-types/errors.js';
import { checkCGUARange, cguaSafeAdd, computeMachineID } from 'cg-engine/engine.js';
import { bigIntToBytesBigEndian } from 'cg-engine/engine.js';

// ── Konstanten (normativ, CG-STD-6100 Kap. 3.3) ──────────────────────────────
const CGUAS_TOTAL_NS = BigInt(2) ** BigInt(79) - BigInt(1);

// Segment-Größen je Ebene (normativ, CG-STD-6100 Kap. 3.3)
export const SEGMENT_LIMITS = {
  0: { min: CGUAS_TOTAL_NS, max: CGUAS_TOTAL_NS }, // Root = gesamter Adressraum
  1: { min: BigInt('1000000000000000000000'),   max: BigInt('100000000000000000000000')  }, // ~10²¹–10²³
  2: { min: BigInt('1000000000000000000'),       max: BigInt('1000000000000000000000')   }, // ~10¹⁸–10²¹
  3: { min: BigInt('1000000000000000'),          max: BigInt('1000000000000000000')      }, // ~10¹⁵–10¹⁸
  4: { min: BigInt('1000000000000'),             max: BigInt('1000000000000000')         }, // ~10¹²–10¹⁵
  5: { min: BigInt('1000000000'),                max: BigInt('1000000000000')            }, // ~10⁹–10¹²
  6: { min: BigInt('1'),                         max: BigInt('1000000000')               }, // ~1–10⁹ ns
} as const;

export const MAX_LEVEL = 6;

// ── Segment-Datenstruktur (normativ, CG-STD-4100 Kap. 3.8) ───────────────────
export interface CGUASegment {
  readonly segment_id:     string;    // z.B. "at.gv.staatsarchiv"
  readonly owner_id:       string;    // vollständiger Identifier
  readonly parent_id:      string | null; // null = Root
  readonly start_address:  bigint;    // inklusiv
  readonly end_address:    bigint;    // exklusiv
  readonly size_ns:        bigint;    // = end - start
  readonly granted_at:     string;    // TAI-CGTA des Zuteilungszeitpunkts
  readonly granted_by:     string;    // Registrierungsstelle
  readonly integrity_hash: string;    // SHA-256(owner_id || start || end || granted_at)
  readonly level:          number;    // 0=Root, 1–6 = Unterebenen
  readonly status:         'active' | 'inactive';
}

// ── Integritäts-Hash (normativ) ───────────────────────────────────────────────
// SHA-256(owner_id_bytes || start_bytes || end_bytes || granted_at_bytes)
function computeSegmentHash(
  ownerId:   string,
  start:     bigint,
  end:       bigint,
  grantedAt: string,
): string {
  const h = createHash('sha256');
  h.update(Buffer.from(ownerId, 'utf8'));
  h.update(bigIntToBytesBigEndian(start));
  h.update(bigIntToBytesBigEndian(end));
  h.update(Buffer.from(grantedAt, 'utf8'));
  return h.digest('hex');
}

// ── Segment-Größen-Prüfung (CG-STD-6100 Kap. 3.3) ───────────────────────────
function checkSegmentSize(sizeNs: bigint, level: number): void {
  if (level < 0 || level > MAX_LEVEL) {
    throw new Error(`Ungültige Ebene: ${level} (muss 0–${MAX_LEVEL} sein)`);
  }
  const limits = SEGMENT_LIMITS[level as keyof typeof SEGMENT_LIMITS];
  if (sizeNs < limits.min) {
    throw Errors.CGUASError.SegmentTooSmall(sizeNs, limits.min);
  }
  if (sizeNs > limits.max) {
    throw Errors.CGUASError.SegmentTooLarge(sizeNs, limits.max);
  }
}

// ── In-Memory Segment-Registry ─────────────────────────────────────────────────
// Produktionsimplementierung: PostgreSQL mit Serializable Isolation (Kap. 3.2)
// Diese In-Memory-Implementierung ist für Sprint 3 / Testing.

export class SegmentRegistry {
  // Sortiert nach start_address für Binärsuche
  private readonly segments: CGUASegment[] = [];
  private readonly byId = new Map<string, CGUASegment>();

  // Root-Segment: gesamter CGUAS-Adressraum
  readonly root: CGUASegment = Object.freeze({
    segment_id:     'CG.CGUAS.ROOT',
    owner_id:       'ChronoGrid Systems',
    parent_id:      null,
    start_address:  0n,
    end_address:    CGUAS_TOTAL_NS,
    size_ns:        CGUAS_TOTAL_NS,
    granted_at:     'CG:TAI:0/v1',
    granted_by:     'ChronoGrid Systems',
    integrity_hash: computeSegmentHash('ChronoGrid Systems', 0n, CGUAS_TOTAL_NS, 'CG:TAI:0/v1'),
    level:          0,
    status:         'active',
  });

  constructor() {
    this.segments.push(this.root);
    this.byId.set(this.root.segment_id, this.root);
  }

  /**
   * Allocates a new segment. Normative algorithm: CG-STD-6100 Kap. 3.1.
   * In production: wrap in SERIALIZABLE transaction (Kap. 3.2).
   */
  allocate(params: {
    segment_id: string;
    owner_id:   string;
    size_ns:    bigint;
    parent_id:  string;
    granted_at: string;  // TAI-CGTA
    granted_by: string;
  }): CGUASegment {
    // 1. Eltern-Segment holen
    const parent = this.byId.get(params.parent_id);
    if (!parent) {
      throw Errors.CGUASError.SegmentNotFound(0n); // parent not found
    }
    if (parent.status !== 'active') {
      throw Errors.CGUASError.SegmentNotFound(0n);
    }

    // 2. Ebene bestimmen
    const level = parent.level + 1;
    if (level > MAX_LEVEL) {
      throw new Error(`Maximale Hierarchietiefe ${MAX_LEVEL} erreicht`);
    }

    // 3. Größe prüfen (CG-STD-6100 Kap. 3.3)
    checkSegmentSize(params.size_ns, level);

    // 4. Nächste freie Position im Eltern-Segment ermitteln (Kap. 3.1)
    const children = this.segments.filter(s => s.parent_id === params.parent_id);
    const nextFree = children.length > 0
      ? children.reduce((max, s) => s.end_address > max ? s.end_address : max, 0n)
      : parent.start_address;

    // 5. Platz prüfen (CG-E-010.001)
    const newEnd = nextFree + params.size_ns;
    if (newEnd > parent.end_address) {
      throw Errors.CGUASError.SegmentSpaceExhausted(params.parent_id);
    }

    // 6. Adressraum-Grenze prüfen (CG-E-010.008)
    checkCGUARange(nextFree);
    checkCGUARange(newEnd - 1n);

    // 7. Kollisions-Prüfung (CG-E-010.003) — sollte nach atomarer Op nie passieren
    if (this.findSegmentByAddress(nextFree)) {
      throw Errors.CGUASError.SegmentOverlap({
        start: nextFree.toString(),
        owner: params.owner_id,
      });
    }

    // 8. Doppelzuteilung gleicher ID verhindern (I-D1)
    if (this.byId.has(params.segment_id)) {
      throw Errors.RegistryError.Conflict(params.segment_id);
    }

    // 9. Segment erstellen (normatives Format)
    const seg: CGUASegment = Object.freeze({
      segment_id:     params.segment_id,
      owner_id:       params.owner_id,
      parent_id:      params.parent_id,
      start_address:  nextFree,
      end_address:    newEnd,
      size_ns:        params.size_ns,
      granted_at:     params.granted_at,
      granted_by:     params.granted_by,
      integrity_hash: computeSegmentHash(params.owner_id, nextFree, newEnd, params.granted_at),
      level,
      status:         'active',
    });

    // 10. Atomisch eintragen (in-memory: synchron; Production: DB-Transaktion)
    this.segments.push(seg);
    this.segments.sort((a, b) => (a.start_address < b.start_address ? -1 : 1));
    this.byId.set(seg.segment_id, seg);

    return seg;
  }

  /**
   * Resolves a CGUA address to its owning segment.
   * Binärsuche: CG-STD-6100 Kap. 3.4
   * Root-Segment wird aus der Binärsuche ausgeschlossen und nur als Fallback
   * verwendet, wenn kein spezifischeres Segment gefunden wird.
   * (CG-APP-0700 §13.2 Korrektur 1)
   * Wirft CG-E-010.002 wenn nicht gefunden.
   */
  resolve(cgua: bigint): CGUASegment {
    checkCGUARange(cgua);

    // Binärsuche nur auf Nicht-Root-Segmenten (CG-APP-0700 §13.2 Korrektur 1)
    const nonRoot = this.segments.filter(s => s.segment_id !== this.root.segment_id);
    let lo = 0;
    let hi = nonRoot.length - 1;
    let found: CGUASegment | null = null;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const seg = nonRoot[mid];
      if (seg.start_address <= cgua && cgua < seg.end_address) {
        found = seg;
        break;
      } else if (cgua < seg.start_address) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    // Root als Fallback: deckt gesamten 79-Bit-Adressraum ab
    if (!found) {
      if (this.root.start_address <= cgua && cgua < this.root.end_address) {
        return this.root;
      }
      throw Errors.CGUASError.SegmentNotFound(cgua);
    }
    return found;
  }

  /** Sucht Segment an Adresse (für Kollisions-Prüfung) */
  private findSegmentByAddress(addr: bigint): CGUASegment | null {
    try {
      const seg = this.resolve(addr);
      // Nur echte Überlappung, nicht Root
      return seg.segment_id === this.root.segment_id ? null : seg;
    } catch {
      return null;
    }
  }

  /** Holt Segment by ID */
  getById(segmentId: string): CGUASegment {
    const seg = this.byId.get(segmentId);
    if (!seg) throw new Error(`Segment nicht gefunden: ${segmentId}`);
    return seg;
  }

  /** Alle Segmente eines Eigentümers */
  getByOwner(ownerId: string): CGUASegment[] {
    return this.segments.filter(s => s.owner_id === ownerId);
  }

  /** Alle aktiven Segmente auf einer Ebene */
  getByLevel(level: number): CGUASegment[] {
    return this.segments.filter(s => s.level === level && s.status === 'active');
  }

  /** Segment inaktiv setzen (kein hartes Löschen, I-D1) */
  deactivate(segmentId: string): void {
    const seg = this.byId.get(segmentId);
    if (!seg) throw new Error(`Segment nicht gefunden: ${segmentId}`);
    // Erstelle neue Version mit status=inactive (Insert-only-Semantik)
    const inactive = Object.freeze({ ...seg, status: 'inactive' as const });
    this.byId.set(segmentId, inactive);
    const idx = this.segments.findIndex(s => s.segment_id === segmentId);
    if (idx >= 0) this.segments[idx] = inactive;
  }

  get count(): number { return this.segments.length; }

  /** Verifiziert Integritäts-Hash eines Segments (Manipulationsschutz) */
  verifyIntegrity(seg: CGUASegment): boolean {
    const expected = computeSegmentHash(seg.owner_id, seg.start_address, seg.end_address, seg.granted_at);
    if (expected !== seg.integrity_hash) {
      throw Errors.CGUASError.IntegrityViolation({
        segment_id: seg.segment_id,
        expected,
        got: seg.integrity_hash,
      });
    }
    return true;
  }
}

// ── CGUA-Adresse ↔ CGTA-String (CG-STD-6100 Kap. 4) ─────────────────────────
// CGUA-Adresse ist technisch eine CGTA in der CGUAS-Domain.
// Format: "CG:CGUAS:<value>/v1"

export function cguaToString(value: bigint): string {
  checkCGUARange(value);
  return `CG:CGUAS:${value}/v1`;
}

export function parseCGUA(raw: string): bigint {
  const m = /^CG:CGUAS:(\d+)\/v1$/.exec(raw);
  if (!m) throw new Error(`Ungültiges CGUA-Format: ${raw}`);
  const value = BigInt(m[1]);
  checkCGUARange(value);
  return value;
}

// ── CGUA-Adressierung einer Datei innerhalb eines Segments ────────────────────
// Jede Datei belegt exakt 1 Nanosekunde im CGUAS-Adressraum (CG-STD-6100 Kap. 3.3)

export function allocateFileAddress(
  segment: CGUASegment,
  localOffset: bigint,  // Position innerhalb des Segments
): string {
  const addr = cguaSafeAdd(segment.start_address, localOffset);
  if (addr >= segment.end_address) {
    throw Errors.CGUASError.SegmentSpaceExhausted(segment.segment_id);
  }
  return cguaToString(addr);
}
