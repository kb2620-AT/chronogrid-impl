/**
 * cg-usecases/src/uc5.ts
 * UC5: Satellitengestützte QKD — CG-APP-0600 v0.5 UC 5
 * Domain: QKD-Photon (Nanosekunden, I-QKD-1)
 * Normative Invariante: I-QKD-1 (Photon-Address Uniqueness, CG-STD-6100 §7.4)
 * Fehler: CG-E-011.011 (QKDCollision), CG-E-011.012 (QKDDomainReuse)
 */

import type { CTDDLDomain } from 'cg-types/domain.js';
import { createTimepoint, registerDomain, registerDomain, computeMachineId, computeCGFI } from 'cg-engine/engine.js';
import { Errors } from 'cg-types/errors.js';

// ── CTDDL Domain-Definition (CG-STD-2100 v1.4 §11.4) ─────────────────────────

export const DOMAIN_QKD_PHOTON: CTDDLDomain = {
  name: 'QKDPhoton',
  version: '1.0',
  type: 'linear',
  granularity: 'nanosecond',
  semantics: 'time',
  extent: {
    min: '0',
    max: '99999999999999999', // ~3.17 Jahre in ns (1 QKD-Session)
    inclusive: true,
  },
  format: { type: 'integer' },
  mapping: [{
    targetDomain: 'TAI',
    targetVersion: '1.0',
    type: 'linear',
    refPoints: [{
      source: '0',
      target: '0',
      label: 'QKD-ns → TAI-s (÷10^9)',
    }],
  }],
  metadata: {
    stability: 'medium',
    scientific_dependency: {
      parameter:        'detector_jitter',
      value:            '50',          // 50 ps Jitter (typisch für InGaAs SPD)
      uncertainty_abs:  '10',          // ±10 ps
      uncertainty_rel:  '2.0e-1',      // 20% relative Unsicherheit
      source:           'IEC 62464 (Einzel-Photonen-Detektoren)',
      source_doi:       '10.3390/photonics9030131',
      review_trigger:   'Neue Detektorgenereration < 10ps Jitter',
    },
    notes: 'QKD Photon-Ereignis — I-QKD-1 (Photon-Address Uniqueness, CG-STD-6100 §7.4)',
  },
};

// Auto-Registrierung beim Import (idempotent — CG-APP-0700)
try { registerDomain(DOMAIN_QKD_PHOTON); } catch { /* bereits registriert */ }


// Auto-Registrierung beim Import (idempotent)
try { registerDomain(DOMAIN_QKD_PHOTON); } catch { /* bereits registriert */ }

// ── Photon-Ereignis ───────────────────────────────────────────────────────────

export interface PhotonEvent {
  sessionId:    string;  // QKD-Session-ID
  satelliteId:  string;  // z.B. 'MICIUS-2' oder 'EAGLE-1'
  detectorId:   string;  // Einzelphotonen-Detektor-ID
  polarisation: 'H' | 'V' | 'D' | 'A'; // Horizontal/Vertikal/Diagonal/Anti-diagonal
  tai_ns:       bigint;  // TAI-Nanosekunden (Detektionszeitpunkt)
  basisChoice:  '+'|'x'; // BB84-Basis
}

export interface QKDTimepoint {
  cgta:         string;
  machine_id:   string;
  cgfi:         string;   // Fingerabdruck des Photon-Ereignisses
  event:        PhotonEvent;
}

// Globaler Photon-Index für I-QKD-1 Eindeutigkeitsprüfung
const _photonIndex = new Set<string>();

/**
 * Erstellt einen CGTA-Zeitpunkt für ein QKD-Photon-Ereignis.
 * Durchsetzt I-QKD-1: Jedes Photon-Ereignis hat genau eine CGTA.
 * CG-E-011.011 (QKDCollision) bei Duplikat.
 */
export function createPhotonTimepoint(event: PhotonEvent): QKDTimepoint {
  const tp = createTimepoint('QKDPhoton', '1.0', event.tai_ns, {
    session_id:   event.sessionId,
    satellite_id: event.satelliteId,
    detector_id:  event.detectorId,
    polarisation: event.polarisation,
    basis:        event.basisChoice,
  });

  // I-QKD-1: Eindeutigkeitsprüfung (CG-STD-6100 §7.4)
  if (_photonIndex.has(tp.machine_id)) {
    throw Errors.CGFSError.qkdCollision(
      `Photon-Collision: ${tp.cgta} — TAI-ns ${event.tai_ns} bereits registriert`
    );
  }
  _photonIndex.add(tp.machine_id);

  // CGFI für kryptographische Bindung
  const photonHash = `${event.sessionId}:${event.tai_ns}:${event.polarisation}`;
  const cgfi = computeCGFI(tp.machine_id, photonHash, 'application/qkd-photon');

  return { cgta: tp.cgta, machine_id: tp.machine_id, cgfi, event };
}

/** Löscht den Photon-Index (für Tests) */
export function resetPhotonIndex(): void {
  _photonIndex.clear();
}

/** Gibt Anzahl registrierter Photon-Ereignisse zurück */
export function photonCount(): number {
  return _photonIndex.size;
}

// ── UC5 Demo-Daten ────────────────────────────────────────────────────────────

export const UC5_EXAMPLE: PhotonEvent = {
  sessionId:    'QKD-2026-04-22-LOWW-LEO',
  satelliteId:  'EAGLE-1',           // ESA-QKD-Testsatellit
  detectorId:   'SPD-InGaAs-007',
  polarisation: 'H',
  tai_ns:       1745316600000000000n, // 2026-04-22T10:30:00Z in TAI-ns
  basisChoice:  '+',
};

export const UC5_DESCRIPTION = `
UC5 – Satellitengestützte QKD Photon-Ereignis (CG-APP-0600)
═════════════════════════════════════════════════════════════
Domain:      QKDPhoton v1.0
Granularität: Nanosekunde (Einzelphotonen-Detektor-Jitter: 50ps)
Invariante:  I-QKD-1 (Photon-Address Uniqueness, CG-STD-6100 §7.4)
Fehler:      CG-E-011.011 (QKDCollision), CG-E-011.012 (QKDDomainReuse)
scientific_dependency: IEC 62464, Detektor-Jitter 50±10 ps
Anwendung:   Quantenschlüsselverteilung Satellit↔Boden (BB84-Protokoll)
Vorteil:     Kein anderes System kann Photon-Adressen kollisionsfrei verwalten
`.trim();
