/**
 * cg-cguas/src/cguas.ts
 * CGUAS — Universal Address Space — CG-STD-6100 v0.5 Teil A
 * Segment-Verwaltung, CGUA-Adressierung, I-SEG-1 (Segment-Isolation)
 */

import { createHash } from 'node:crypto';
import type { CGUASegment } from 'cg-types/domain.js';
import { Errors } from 'cg-types/errors.js';

// ── CGUA-URI-Parsing ──────────────────────────────────────────────────────────

export interface CGUAParsed {
  segmentId: string;
  localOffset: bigint;
  version: number;
}

/** Parst eine CGUA-URI: cgua://segment-id/local-offset/v1 */
export function parseCGUA(uri: string): CGUAParsed {
  const m = uri.match(/^cgua:\/\/([^/]+)\/(\d+)\/v(\d+)$/);
  if (!m) throw Errors.CGUASError.invalidCGUA(`Ungültige CGUA-URI: ${uri}`);
  return { segmentId: m[1]!, localOffset: BigInt(m[2]!), version: Number(m[3]!) };
}

/** Serialisiert eine CGUA-URI */
export function encodeCGUA(parsed: CGUAParsed): string {
  return `cgua://${parsed.segmentId}/${parsed.localOffset}/v${parsed.version}`;
}

// ── SegmentRegistry ───────────────────────────────────────────────────────────

export interface ISegmentRegistry {
  allocate(grantedBy: string, sizeNs: bigint, parentId?: string): CGUASegment;
  resolve(segmentId: string): CGUASegment;
  revoke(segmentId: string): void;
  list(): CGUASegment[];
}

export class SegmentRegistry implements ISegmentRegistry {
  private readonly segments = new Map<string, CGUASegment>();
  private _nextBase = 0n;

  allocate(grantedBy: string, sizeNs: bigint, parentId?: string): CGUASegment {
    if (sizeNs <= 0n) throw Errors.CGUASError.invalidSegmentSize(`sizeNs muss > 0 sein`);

    // I-SEG-1: Überlappungsprüfung
    const base = this._nextBase;
    for (const seg of this.segments.values()) {
      if (seg.status === 'active') {
        const segEnd = seg.base_address + seg.size_ns;
        const newEnd = base + sizeNs;
        if (base < segEnd && newEnd > seg.base_address)
          throw Errors.CGUASError.segmentOverlap(`Überlappung mit Segment ${seg.id}`);
      }
    }

    const id = createHash('sha256')
      .update(`${grantedBy}:${base}:${sizeNs}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16);

    const seg: CGUASegment = {
      id, parent_id: parentId ?? null, base_address: base, size_ns: sizeNs,
      granted_by: grantedBy, status: 'active',
      created_at: BigInt(Date.now()) * 1_000_000n,
    };

    this.segments.set(id, seg);
    this._nextBase = base + sizeNs;
    return seg;
  }

  resolve(segmentId: string): CGUASegment {
    const seg = this.segments.get(segmentId);
    if (!seg) throw Errors.CGUASError.segmentNotFound(`Segment nicht gefunden: ${segmentId}`);
    if (seg.status === 'revoked') throw Errors.CGUASError.segmentRevoked(`Segment widerrufen: ${segmentId}`);
    return seg;
  }

  revoke(segmentId: string): void {
    const seg = this.resolve(segmentId);
    this.segments.set(segmentId, { ...seg, status: 'revoked' });
  }

  list(): CGUASegment[] { return [...this.segments.values()]; }
}
