/**
 * cg-usecases/src/uc2.ts
 * UC2: Notarieller Akt mit Versionschain — CG-APP-0600 v0.5 UC 2
 * Domain: Legal-AT (Österreichisches Rechtssystem)
 * Namespace: urn:cgns:legal-at
 * Anwendung: Unveränderliche Zeitstempelung notarieller Akte (I-D1, I-S1)
 */

import type { CTDDLDomain } from 'cg-types/domain.js';
import { createTimepoint, registerDomain, registerDomain, computeMachineId, computeCGFI } from 'cg-engine/engine.js';
import { iso8601ToSeconds } from 'cg-engine/gregorian.js';
import { utcToTai } from 'cg-engine/mapping.js';

// ── CTDDL Domain-Definition ───────────────────────────────────────────────────

export const DOMAIN_LEGAL_AT: CTDDLDomain = {
  name: 'LegalAT',
  version: '1.0',
  type: 'linear',
  granularity: 'second',
  semantics: 'time',
  extent: {
    min: '2000-01-01T00:00:00Z',     // Ab Jahrtausendwende für AT-Recht
    max: '2999-12-31T23:59:59Z',
    inclusive: true,
  },
  format: { type: 'iso8601', pattern: 'YYYY-MM-DDTHH:mm:ssZ' },
  mapping: [{
    targetDomain: 'TAI',
    targetVersion: '1.0',
    type: 'piecewise-linear',
    refPoints: [{
      source: '2017-01-01T00:00:00Z',
      target: '2017-01-01T00:00:37Z',
      label: 'TAI = LegalAT + 37s (aktuell)',
    }],
  }],
  metadata: {
    stability: 'high',
    notes: 'Österreichisches Rechtssystem — TAI-basiert für Unveränderlichkeit (I-D1)',
  },
};

// Auto-Registrierung beim Import (idempotent — CG-APP-0700)
try { registerDomain(DOMAIN_LEGAL_AT); } catch { /* bereits registriert */ }


// Auto-Registrierung beim Import (idempotent)
try { registerDomain(DOMAIN_LEGAL_AT); } catch { /* bereits registriert */ }

// ── Notarieller Akt ───────────────────────────────────────────────────────────

export interface NotarialAct {
  actNumber:    string;   // z.B. '2026/AT/NW/001'
  notaryId:     string;   // Notar-ID (Österreich)
  actType:      string;   // Urkundentyp
  parties:      string[]; // Beteiligte Parteien
  utcTimestamp: string;   // ISO-8601 UTC
  contentHash:  string;   // SHA-256 des Urkundentexts
}

export interface LegalTimepoint {
  cgta:         string;
  machine_id:   string;
  cgfi:         string;   // Datei-Fingerabdruck des Akts
  act:          NotarialAct;
  versionChain: string[]; // Kette von MachineIDs (Versionshistorie)
}

/**
 * Erstellt einen CGTA-Zeitpunkt für einen notariellen Akt.
 * CGFI sichert den Inhalt kryptographisch (I-S1: keine nachträgliche Änderung).
 */
export function createLegalTimepoint(act: NotarialAct, previousChain: string[] = []): LegalTimepoint {
  const utcSecs = iso8601ToSeconds(act.utcTimestamp);
  const taiSecs = utcToTai(utcSecs);

  const tp = createTimepoint('LegalAT', '1.0', taiSecs, {
    act_number:  act.actNumber,
    notary_id:   act.notaryId,
    act_type:    act.actType,
    parties:     act.parties.join(','),
  });

  // CGFI = SHA-256(TAI-MachineID ‖ ContentHash ‖ TypeID)
  const cgfi = computeCGFI(tp.machine_id, act.contentHash, 'application/legal-at+pdf');

  // Versionschain: unveränderlich (I-D1) – neue Akte referenzieren vorherige
  const versionChain = [...previousChain, tp.machine_id];

  return { cgta: tp.cgta, machine_id: tp.machine_id, cgfi, act, versionChain };
}

// ── UC2 Demo-Daten ────────────────────────────────────────────────────────────

export const UC2_EXAMPLE: NotarialAct = {
  actNumber:    '2026/AT/NW/0047',
  notaryId:     'AT-NW-042',
  actType:      'Kaufvertrag_Immobilien',
  parties:      ['Bauer, Kurt', 'Mustermann, Max'],
  utcTimestamp: '2026-04-22T09:00:00Z',
  contentHash:  'a'.repeat(64), // Placeholder – echte SHA-256 des PDF
};

export const UC2_DESCRIPTION = `
UC2 – Notarieller Akt mit Versionschain (CG-APP-0600)
═══════════════════════════════════════════════════════
Domain:      LegalAT v1.0 (urn:cgns:legal-at)
Granularität: Sekunde (österreichisches Rechtssystem)
CGFI:        SHA-256(TAI-MachineID ‖ ContentHash ‖ TypeID)
Invarianten: I-D1 (Unveränderlichkeit), I-S1 (kein DELETE)
Anwendung:   Notarielle Akte, Grundbuch, Firmenbuch
Vorteil:     Manipulationssicherer Zeitnachweis ohne externe CA
`.trim();
