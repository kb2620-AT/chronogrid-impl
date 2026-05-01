/**
 * t-cguas.ts -- Normative Testsuite CGUA-Algorithmen (cg-testkit Harness)
 *
 * T-CGUAS-001  allocate               (CG-STD-6100 v0.5 §3.1)
 * T-CGUAS-002  Kollisionsverhinderung (CG-STD-6100 v0.5 §3.2)
 * T-CGUAS-003  N-CGUAS-001 findSegment(CG-STD-6100 v0.5 §3.4)
 *
 * Level: 2 -- erscheint in pnpm test:level2
 */

import type { TestCase } from '../runner.js';
import {
  CGUAS_MAX,
  isCGUAValid,
  cgua_safeAdd,
  toCGUA,
  cgua_toCGTA,
  parseCGTA_CGUAS,
  SegmentRegistry,
} from 'cg-cguas/cguas.js';

// ===================================================================
// T-CGUAS-001: allocate (CG-STD-6100 v0.5 §3.1)
// ===================================================================

export const T_CGUAS_001: TestCase[] = [
  {
    id: 'T-CGUAS-001a',
    suite: 'T-CGUAS',
    level: 2,
    description: 'allocate: base_address=0n, size_ns, granted_by, status korrekt',
    run: () => {
      const r = new SegmentRegistry();
      const sz = 1_000_000_000_000_000n;
      const seg = r.allocate('at.gv.staatsarchiv', sz);
      return (
        seg.base_address === 0n &&
        seg.size_ns === sz &&
        seg.granted_by === 'at.gv.staatsarchiv' &&
        seg.status === 'active'
      );
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-001b',
    suite: 'T-CGUAS',
    level: 2,
    description: 'allocate: zwei sequenzielle Segmente sind zusammenhaengend',
    run: () => {
      const r = new SegmentRegistry();
      const s1 = r.allocate('org.a', 1_000_000_000_000_000n);
      const s2 = r.allocate('org.b', 2_000_000_000_000_000n);
      return s2.base_address === s1.base_address + s1.size_ns;
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-001c',
    suite: 'T-CGUAS',
    level: 2,
    description: 'allocate: Overflow > CGUAS_MAX wirft Fehler (FATAL)',
    run: () => {
      try {
        const r = new SegmentRegistry();
        r.allocate('org.greedy', CGUAS_MAX + 1n);
        return false;
      } catch { return true; }
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-001d',
    suite: 'T-CGUAS',
    level: 2,
    description: 'allocate: sizeNs = 0n wirft Fehler',
    run: () => {
      try {
        const r = new SegmentRegistry();
        r.allocate('org.a', 0n);
        return false;
      } catch { return true; }
    },
    expected: true,
  },
];

// ===================================================================
// T-CGUAS-002: Kollisionsverhinderung (CG-STD-6100 v0.5 §3.2)
// ===================================================================

export const T_CGUAS_002: TestCase[] = [
  {
    id: 'T-CGUAS-002a',
    suite: 'T-CGUAS',
    level: 2,
    description: 'Kollisionsverhinderung: zwei Allokationen -- kein Overlap',
    run: () => {
      const r = new SegmentRegistry();
      const s1 = r.allocate('org.a', 1_000_000_000_000_000n);
      const s2 = r.allocate('org.b', 1_000_000_000_000_000n);
      return s1.base_address + s1.size_ns <= s2.base_address;
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-002b',
    suite: 'T-CGUAS',
    level: 2,
    description: 'Kollisionsverhinderung: drei Segmente lueckenlos und nicht-ueberlappend',
    run: () => {
      const r = new SegmentRegistry();
      const segs = [
        r.allocate('org.a', 500_000_000_000_000n),
        r.allocate('org.b', 300_000_000_000_000n),
        r.allocate('org.c', 200_000_000_000_000n),
      ];
      if (segs[0]!.base_address !== 0n) return false;
      if (segs[1]!.base_address !== segs[0]!.base_address + segs[0]!.size_ns) return false;
      if (segs[2]!.base_address !== segs[1]!.base_address + segs[1]!.size_ns) return false;
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const si = segs[i]!, sj = segs[j]!;
          const overlap =
            si.base_address < sj.base_address + sj.size_ns &&
            sj.base_address < si.base_address + si.size_ns;
          if (overlap) return false;
        }
      }
      return true;
    },
    expected: true,
  },
];

// ===================================================================
// T-CGUAS-003: N-CGUAS-001 -- findSegment Spezifitaet (CG-STD-6100 v0.5 §3.4)
// ===================================================================

export const T_CGUAS_003: TestCase[] = [
  {
    id: 'T-CGUAS-003a',
    suite: 'T-CGUAS',
    level: 2,
    description: 'N-CGUAS-001: kleineres Segment gewinnt bei Adressueberschneidung',
    run: () => {
      const r = new SegmentRegistry();
      const big   = r.allocate('org.big',   1_000_000_000_000_000n);
      const small = r.allocate('org.small', 1_000_000_000n);
      const found = r.findSegment(small.base_address + 1n);
      return found.id === small.id;
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-003b',
    suite: 'T-CGUAS',
    level: 2,
    description: 'N-CGUAS-001 direkt: kleinste size_ns gewinnt',
    run: () => {
      const r = new SegmentRegistry();
      r.allocate('org.large', 1_000_000_000_000n);
      const small = r.allocate('org.small', 500_000_000_000n);
      const found = r.findSegment(small.base_address + 1n);
      return found.id === small.id;
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-003c',
    suite: 'T-CGUAS',
    level: 2,
    description: 'findSegment: kein Segment vorhanden wirft Fehler (CG-E-010.002)',
    run: () => {
      try {
        const r = new SegmentRegistry();
        r.findSegment(42n);
        return false;
      } catch { return true; }
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-003d',
    suite: 'T-CGUAS',
    level: 2,
    description: 'findSegment: localOffset = addr - segment.base_address korrekt',
    run: () => {
      const r = new SegmentRegistry();
      const seg = r.allocate('at.gv.staatsarchiv', 1_000_000_000_000_000n);
      const offset = 7_234_891n;
      const addr = toCGUA(seg.base_address, offset);
      const found = r.findSegment(addr);
      return found.id === seg.id && addr - found.base_address === offset;
    },
    expected: true,
  },
  {
    id: 'T-CGUAS-003e',
    suite: 'T-CGUAS',
    level: 2,
    description: 'findSegment: revoked Segment wird nicht gefunden',
    run: () => {
      try {
        const r = new SegmentRegistry();
        const seg = r.allocate('org.revoked', 1_000_000_000_000n);
        r.revoke(seg.id);
        r.findSegment(seg.base_address + 1n);
        return false;
      } catch { return true; }
    },
    expected: true,
  },
];

// ===================================================================
// Export
// ===================================================================

export const ALL_T_CGUAS: TestCase[] = [
  ...T_CGUAS_001,
  ...T_CGUAS_002,
  ...T_CGUAS_003,
];
