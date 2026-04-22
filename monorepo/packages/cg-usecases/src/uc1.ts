/**
 * cg-usecases/src/uc1.ts
 * UC1: ATC/ACARS Flugereignis — CG-APP-0600 v0.5 UC 1
 * Domain: Aviation TAI-basiert, Granularität Millisekunde
 * Anwendung: Eindeutige Zeitstempelung von Flugereignissen (ACARS-Nachrichten)
 */

import type { CTDDLDomain } from 'cg-types/domain.js';
import { createTimepoint, registerDomain, registerDomain, encodeCGTA, computeMachineId } from 'cg-engine/engine.js';
import { iso8601ToSeconds, secondsToISO8601 } from 'cg-engine/gregorian.js';
import { utcToTai } from 'cg-engine/mapping.js';

// ── CTDDL Domain-Definition ───────────────────────────────────────────────────

export const DOMAIN_AVIATION: CTDDLDomain = {
  name: 'Aviation',
  version: '1.0',
  type: 'linear',
  granularity: 'millisecond',
  semantics: 'time',
  extent: {
    min: '0',
    max: '99999999999999', // ~3170 Jahre in ms ab TAI-Epoch
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
      label: 'Aviation Epoch = TAI Epoch (ms→s: ÷1000)',
    }],
  }],
  metadata: {
    stability: 'high',
    notes: 'ACARS/ATC Flugereignisse — TAI-basiert, keine Schaltsekunden, ms-Granularität',
  },
};

// Auto-Registrierung beim Import (idempotent — CG-APP-0700)
try { registerDomain(DOMAIN_AVIATION); } catch { /* bereits registriert */ }


// Auto-Registrierung beim Import (idempotent)
try { registerDomain(DOMAIN_AVIATION); } catch { /* bereits registriert */ }

// ── UC1 Beispiel-Zeitpunkt ────────────────────────────────────────────────────

export interface AviationEvent {
  flight:      string;   // IATA Flugnummer
  eventType:   string;   // ACARS-Ereignistyp
  utcTime:     string;   // ISO-8601 UTC
  airport?:    string;   // ICAO-Code
}

export interface AviationTimepoint {
  cgta:        string;
  machine_id:  string;
  tai_ms:      bigint;   // TAI-Millisekunden
  utc_label:   string;
  event:       AviationEvent;
}

/**
 * Erstellt einen CGTA-Zeitpunkt für ein ACARS-Flugereignis.
 * TAI-Millisekunden = (UTC-Sekunden + TAI-Offset) × 1000
 */
export function createAviationTimepoint(event: AviationEvent): AviationTimepoint {
  const utcSecs = iso8601ToSeconds(event.utcTime);
  const taiSecs = utcToTai(utcSecs);
  const tai_ms  = taiSecs * 1000n;

  const tp = createTimepoint('Aviation', '1.0', tai_ms, {
    flight:     event.flight,
    event_type: event.eventType,
    airport:    event.airport ?? '',
  });

  return {
    cgta:       tp.cgta,
    machine_id: tp.machine_id,
    tai_ms,
    utc_label:  event.utcTime,
    event,
  };
}

// ── UC1 Demo-Daten ────────────────────────────────────────────────────────────

export const UC1_EXAMPLE: AviationEvent = {
  flight:    'OS 099',
  eventType: 'ACARS_OUT',       // Aircraft Communications Addressing and Reporting
  utcTime:   '2026-04-22T10:30:00Z',
  airport:   'LOWW',            // Wien Schwechat
};

export const UC1_DESCRIPTION = `
UC1 – ATC/ACARS Flugereignis (CG-APP-0600)
═══════════════════════════════════════════
Domain:      Aviation v1.0
Granularität: Millisekunde (für Sub-Sekunden ATC-Präzision)
Mapping:     Aviation-ms → TAI-s (÷1000, keine Schaltsekunden)
Anwendung:   Eindeutige CGTA für jede ACARS-Nachricht
Vorteil:     Kollisionsfrei über alle ATC-Systeme weltweit (I-R1)
Invariante:  I-R3 (Determinismus), I-E1 (keine universale Epoch)
`.trim();
