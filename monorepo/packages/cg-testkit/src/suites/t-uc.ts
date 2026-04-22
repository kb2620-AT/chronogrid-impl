/**
 * cg-testkit/src/suites/t-uc.ts
 * Use Case Tests UC1–UC5 — CG-APP-0600 v0.5
 * Sprint 9: T-UC-001 bis T-UC-025
 */

import type { TestCase } from '../runner.js';
import { parseDomain } from 'cg-ctddl/parser.js';
import { getDomain, encodeCGTA, computeMachineId } from 'cg-engine/engine.js';
import { iso8601ToSeconds } from 'cg-engine/gregorian.js';
import { utcToTai } from 'cg-engine/mapping.js';
import { Errors } from 'cg-types/errors.js';

// UC Imports
import {
  DOMAIN_AVIATION, createAviationTimepoint, UC1_EXAMPLE,
} from 'cg-usecases/uc1.js';
import {
  DOMAIN_LEGAL_AT, createLegalTimepoint, UC2_EXAMPLE,
} from 'cg-usecases/uc2.js';
import {
  DOMAIN_IEC61850, createEnergyTimepoint, sumPhases, UC3_EXAMPLE,
} from 'cg-usecases/uc3.js';
import {
  createCosmicTimepoint, UC4_GW_EXAMPLE, UC4_PULSAR_EXAMPLE,
} from 'cg-usecases/uc4.js';
import {
  DOMAIN_QKD_PHOTON, createPhotonTimepoint, resetPhotonIndex, photonCount, UC5_EXAMPLE,
} from 'cg-usecases/uc5.js';

export const ucTests: TestCase[] = [

  // ── UC1: Aviation ─────────────────────────────────────────────────────────

  { id: 'T-UC-001', level: 1, description: 'UC1: Aviation CTDDL gültig',
    run: () => { parseDomain(DOMAIN_AVIATION); return true; },
    expected: true },

  { id: 'T-UC-002', level: 1, description: 'UC1: Aviation Granularität = millisecond',
    run: () => DOMAIN_AVIATION.granularity,
    expected: 'millisecond' },

  { id: 'T-UC-003', level: 1, description: 'UC1: Aviation CGTA-Prefix korrekt',
    run: () => createAviationTimepoint(UC1_EXAMPLE).cgta.startsWith('CG:Aviation:'),
    expected: true },

  { id: 'T-UC-004', level: 2, description: 'UC1: Aviation Zeitwert in ms (TAI×1000)',
    run: () => {
      const tp = createAviationTimepoint(UC1_EXAMPLE);
      return tp.tai_ms > 0n && tp.tai_ms % 1000n === 0n; // volle Sekunden × 1000
    },
    expected: true },

  { id: 'T-UC-005', level: 2, description: 'UC1: Aviation zwei Events → verschiedene CGTAs',
    run: () => {
      const t1 = createAviationTimepoint({ ...UC1_EXAMPLE, utcTime: '2026-04-22T10:30:00Z' });
      const t2 = createAviationTimepoint({ ...UC1_EXAMPLE, utcTime: '2026-04-22T10:30:01Z' });
      return t1.cgta !== t2.cgta;
    },
    expected: true },

  // ── UC2: Legal-AT ─────────────────────────────────────────────────────────

  { id: 'T-UC-006', level: 1, description: 'UC2: LegalAT CTDDL gültig',
    run: () => { parseDomain(DOMAIN_LEGAL_AT); return true; },
    expected: true },

  { id: 'T-UC-007', level: 1, description: 'UC2: LegalAT Granularität = second',
    run: () => DOMAIN_LEGAL_AT.granularity,
    expected: 'second' },

  { id: 'T-UC-008', level: 2, description: 'UC2: Notarieller Akt hat CGFI',
    run: () => {
      const tp = createLegalTimepoint(UC2_EXAMPLE);
      return tp.cgfi.length === 64; // SHA-256 hex
    },
    expected: true },

  { id: 'T-UC-009', level: 2, description: 'UC2: Versionschain wächst',
    run: () => {
      const v1 = createLegalTimepoint({ ...UC2_EXAMPLE, actNumber: '2026/AT/NW/001', utcTimestamp: '2026-04-22T09:00:00Z' });
      const v2 = createLegalTimepoint({ ...UC2_EXAMPLE, actNumber: '2026/AT/NW/002', utcTimestamp: '2026-04-22T10:00:00Z' }, v1.versionChain);
      return v2.versionChain.length;
    },
    expected: 2 },

  { id: 'T-UC-010', level: 3, description: 'UC2: I-D1 – zwei Akte verschiedene Zeiten → verschiedene MachineIDs',
    run: () => {
      const a1 = createLegalTimepoint({ ...UC2_EXAMPLE, actNumber: 'A1', utcTimestamp: '2026-04-22T09:00:00Z' });
      const a2 = createLegalTimepoint({ ...UC2_EXAMPLE, actNumber: 'A2', utcTimestamp: '2026-04-22T10:00:00Z' });
      return a1.machine_id !== a2.machine_id;
    },
    expected: true },

  // ── UC3: IEC 61850 ────────────────────────────────────────────────────────

  { id: 'T-UC-011', level: 1, description: 'UC3: IEC61850 CTDDL gültig',
    run: () => { parseDomain(DOMAIN_IEC61850); return true; },
    expected: true },

  { id: 'T-UC-012', level: 1, description: 'UC3: IEC61850 Granularität = nanosecond',
    run: () => DOMAIN_IEC61850.granularity,
    expected: 'nanosecond' },

  { id: 'T-UC-013', level: 2, description: 'UC3: Shelly-Messwert → TAI-ns korrekt',
    run: () => {
      const tp = createEnergyTimepoint(UC3_EXAMPLE);
      return tp.tai_ns > 0n && tp.cgta.startsWith('CG:IEC61850:');
    },
    expected: true },

  { id: 'T-UC-014', level: 2, description: 'UC3: 3-Phasen Σ-Summation korrekt',
    run: () => {
      const base = { deviceId: 'test', utcMs: 1745316600000n };
      const l1 = { ...base, phase: 'L1' as const, powerW: 1000, voltageV: 230, currentA: 4.35 };
      const l2 = { ...base, phase: 'L2' as const, powerW: 1500, voltageV: 229, currentA: 6.55 };
      const l3 = { ...base, phase: 'L3' as const, powerW:  800, voltageV: 231, currentA: 3.46 };
      const sum = sumPhases(l1, l2, l3);
      return sum.phase === 'SUM' && Math.round(sum.powerW) === 3300;
    },
    expected: true },

  // ── UC4: Cosmic ───────────────────────────────────────────────────────────

  { id: 'T-UC-015', level: 1, description: 'UC4: Cosmic v1.1 ist Built-in',
    run: () => { getDomain('Cosmic', '1.1'); return true; },
    expected: true },

  { id: 'T-UC-016', level: 1, description: 'UC4: Cosmic scientific_dependency vorhanden',
    run: () => !!getDomain('Cosmic', '1.1').metadata?.scientific_dependency,
    expected: true },

  { id: 'T-UC-017', level: 2, description: 'UC4: GW-Ereignis CGTA korrekt',
    run: () => createCosmicTimepoint(UC4_GW_EXAMPLE).cgta.startsWith('CG:Cosmic:'),
    expected: true },

  { id: 'T-UC-018', level: 2, description: 'UC4: Pulsar-Ereignis eindeutige MachineID',
    run: () => createCosmicTimepoint(UC4_PULSAR_EXAMPLE).machine_id.length === 64,
    expected: true },

  { id: 'T-UC-019', level: 3, description: 'UC4: Cosmic stability=low → scientific_dependency (CG-E-008.001)',
    run: () => {
      try {
        parseDomain({ name: 'CosmicBad', version: '1.0', type: 'linear', granularity: 'second',
          extent: { min: '0', max: '999', inclusive: true }, metadata: { stability: 'low' } });
        return false;
      } catch (e) { return (e as { code: string }).code === 'CG-E-008.001'; }
    },
    expected: true },

  // ── UC5: QKD ─────────────────────────────────────────────────────────────

  { id: 'T-UC-020', level: 1, description: 'UC5: QKDPhoton CTDDL gültig',
    run: () => { parseDomain(DOMAIN_QKD_PHOTON); return true; },
    expected: true },

  { id: 'T-UC-021', level: 1, description: 'UC5: QKDPhoton Granularität = nanosecond',
    run: () => DOMAIN_QKD_PHOTON.granularity,
    expected: 'nanosecond' },

  { id: 'T-UC-022', level: 2, description: 'UC5: Photon-Ereignis wird registriert (I-QKD-1)',
    run: () => {
      resetPhotonIndex();
      createPhotonTimepoint({ ...UC5_EXAMPLE, tai_ns: 9999999999999999000n });
      return photonCount();
    },
    expected: 1 },

  { id: 'T-UC-023', level: 2, description: 'UC5: Duplikat-Photon → CG-E-011.011 (QKDCollision)',
    run: () => {
      resetPhotonIndex();
      const event = { ...UC5_EXAMPLE, tai_ns: 8888888888888888000n };
      createPhotonTimepoint(event); // Erstes Mal OK
      try {
        createPhotonTimepoint(event); // Duplikat → Fehler
        return false;
      } catch (e) { return (e as { code: string }).code === 'CG-E-011.011'; }
    },
    expected: true },

  { id: 'T-UC-024', level: 3, description: 'UC5: QKD scientific_dependency vorhanden',
    run: () => !!DOMAIN_QKD_PHOTON.metadata?.scientific_dependency,
    expected: true },

  { id: 'T-UC-025', level: 3, description: 'UC5: Photon CGTA hat ns-Präzision (sehr große Zahl)',
    run: () => {
      resetPhotonIndex();
      const tp = createPhotonTimepoint({ ...UC5_EXAMPLE, tai_ns: 1745316600000000123n });
      return tp.cgta.includes('1745316600000000123');
    },
    expected: true },
];
