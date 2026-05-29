import { createHash } from 'node:crypto';
import type { CGUASegment } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';

// ─── Normative Konstante ──────────────────────────────────────────────
// CG-STD-6100 v0.5 §2.2, CG-STD-3100 v1.5 §11.1 (NEU v1.2)
// CGUAS_MAX = Cosmic-Age in Nanosekunden (Planck 2018) ≈ 2^79
export const CGUAS_MAX = BigInt('435116774400000000000000');
export const CGUAS_MIN = BigInt(0);

// ─── Bestehende Typen (unverändert) ───────────────────────────────────
export interface CGUAParsed {
  segmentId:   string;
  localOffset: bigint;
  version:     number;
}

// ─── Bestehende Funktionen (unverändert) ──────────────────────────────
export function parseCGUA(uri: string): CGUAParsed {
  const m = uri.match(/^cgua:\/\/([^/]+)\/(\d+)\/v(\d+)$/);
  if (!m) throw Errors.CGUASError.invalidCGUA(uri);
  return { segmentId: m[1]!, localOffset: BigInt(m[2]!), version: Number(m[3]!) };
}

export function encodeCGUA(p: CGUAParsed): string {
  return `cgua://${p.segmentId}/${p.localOffset}/v${p.version}`;
}

// ─── Neue normative Funktionen ─────────────────────────────────────────
// Normativ: CG-STD-3100 v1.5 §11.1 (NEU v1.2), CG-STD-6100 v0.5 §3–4

/**
 * Prüft ob eine CGUA-Adresse im gültigen Adressraum [0, CGUAS_MAX] liegt.
 * Tests: T-ENG-100, T-ENG-101, T-ENG-102, T-ENG-103
 */
export function isCGUAValid(address: bigint): true {
  if (address < CGUAS_MIN || address > CGUAS_MAX) {
    throw Errors.CGUASError.addressOutOfRange(
      `CGUA address ${address} is outside [0, ${CGUAS_MAX}]`
    );
  }
  return true;
}

/**
 * Addiert zwei CGUA-Werte mit Overflow-Prüfung gegen CGUAS_MAX.
 * Tests: T-ENG-104, T-ENG-105
 */
export function cgua_safeAdd(a: bigint, b: bigint): bigint {
  const result = a + b;
  if (result > CGUAS_MAX) {
    throw Errors.CGUASError.addressOutOfRange(
      `cgua_safeAdd(${a}, ${b}) = ${result} exceeds CGUAS_MAX`
    );
  }
  if (result < CGUAS_MIN) {
    throw Errors.CGUASError.addressOutOfRange(
      `cgua_safeAdd(${a}, ${b}) = ${result} is below 0`
    );
  }
  return result;
}

/**
 * Berechnet die absolute CGUA-Adresse aus Segment-Start und lokalem Offset.
 * Tests: T-ENG-106
 */
export function toCGUA(segmentStart: bigint, localOffset: bigint): bigint {
  if (localOffset < 0n) {
    throw Errors.CGUASError.addressOutOfRange(
      `localOffset must be >= 0, got ${localOffset}`
    );
  }
  return cgua_safeAdd(segmentStart, localOffset);
}

/**
 * Repräsentiert eine CGUA-Adresse als CGTA in der CGUAS-Domain.
 * Format: 'CG:CGUAS:{absolute_value}/v1'
 * Tests: T-ENG-107
 */
export function cgua_toCGTA(address: bigint): string {
  isCGUAValid(address);
  return `CG:CGUAS:${address}/v1`;
}

/**
 * Parst eine CGTA in der CGUAS-Domain zurück zur absoluten Adresse.
 * Tests: T-ENG-107
 */
export function parseCGTA_CGUAS(cgta: string): bigint {
  const m = cgta.match(/^CG:CGUAS:(\d+)\/v(\d+)$/);
  if (!m) throw new Error(`Invalid CGUA CGTA: "${cgta}"`);
  const value = BigInt(m[1]!);
  isCGUAValid(value);
  return value;
}

// ─── SegmentRegistry (erweitert) ──────────────────────────────────────
export class SegmentRegistry {
  private readonly s = new Map<string, CGUASegment>();
  private _n = 0n;

  /**
   * Allokiert ein neues Segment.
   * NEU: Overflow-Prüfung gegen CGUAS_MAX (S-O4, CG-STD-3100 §12.4.1).
   * Tests: T-CGUAS-001
   */
  allocate(g: string, sz: bigint, p?: string): CGUASegment {
    if (sz <= 0n) throw Errors.CGUASError.invalidSegmentSize('sizeNs>0');
    const base = this._n;
    // Overflow-Check: neue Endadresse darf CGUAS_MAX nicht überschreiten
    const newEnd = cgua_safeAdd(base, sz);
    const id = createHash('sha256')
      .update(`${g}:${base}:${sz}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
    const seg: CGUASegment = {
      id,
      parent_id:    p ?? null,
      base_address: base,
      size_ns:      sz,
      granted_by:   g,
      status:       'active',
      created_at:   BigInt(Date.now()) * 1_000_000n,
    };
    this.s.set(id, seg);
    this._n = newEnd;
    return seg;
  }

  /**
   * Findet das spezifischste Segment das eine CGUA-Adresse enthält.
   *
   * Normative Regel N-CGUAS-001 (CG-STD-6100 v0.5 §3.4):
   * Bei mehreren Treffern gewinnt das Segment mit der kleinsten size_ns
   * (= tiefstes/spezifischstes Segment in der Hierarchie).
   * Tests: T-CGUAS-003
   */
  findSegment(address: bigint): CGUASegment {
    isCGUAValid(address);
    const candidates = [...this.s.values()].filter(
      (seg) =>
        seg.status === 'active' &&
        address >= seg.base_address &&
        address <  seg.base_address + seg.size_ns
    );
    if (candidates.length === 0) {
      throw Errors.CGUASError.segmentNotFound(`no segment for address ${address}`);
    }
    // N-CGUAS-001: kleinstes (spezifischstes) Segment zurückgeben
    return candidates.reduce((best, cur) =>
      cur.size_ns < best.size_ns ? cur : best
    );
  }

  /** Gibt Segment by ID zurück (unverändert). */
  resolve(id: string): CGUASegment {
    const s = this.s.get(id);
    if (!s) throw Errors.CGUASError.segmentNotFound(id);
    if (s.status === 'revoked') throw Errors.CGUASError.segmentRevoked(id);
    return s;
  }

  /** Widerruft ein Segment (unverändert). */
  revoke(id: string): void {
    const s = this.resolve(id);
    this.s.set(id, { ...s, status: 'revoked' });
  }

  /** Alle Segmente (unverändert). */
  list(): CGUASegment[] { return [...this.s.values()]; }
}