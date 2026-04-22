/**
 * cg-usecases/src/uc4.ts
 * UC4: Cosmic Domain — CG-APP-0600 v0.5 UC 4
 * Domain: Cosmic v1.1 (Pulsar PSR B1919+21)
 * Anwendung: Astrophysikalische Zeitreferenz, kosmologische Ereignisse
 */

import type { CTDDLDomain } from 'cg-types/domain.js';
import { getDomain, createTimepoint, encodeCGTA } from 'cg-engine/engine.js';

// Cosmic v1.1 ist bereits in cg-engine/domains.ts als Built-in definiert
// Hier: Verwendung + erweiterte Beispiele

// ── Pulsar-Periode als Zeiteinheit ────────────────────────────────────────────

/** PSR B1919+21 – erster entdeckter Pulsar (Jocelyn Bell, 1967) */
export const PSR_B1919_21 = {
  name:              'PSR B1919+21',
  period_s:          1.3373,      // Rotationsperiode in Sekunden
  uncertainty_rel:   7.5e-5,      // Relative Unsicherheit
  discovery_year:    1967,
  source_doi:        '10.1071/AS04022',
};

// ── Kosmologisches Ereignis ───────────────────────────────────────────────────

export interface CosmicEvent {
  eventType:    string;   // z.B. 'PULSAR_PULSE', 'GW_EVENT', 'GAMMA_BURST'
  sourceName:   string;   // Astronomische Bezeichnung
  taiSeconds:   bigint;   // Beobachtungszeitpunkt in TAI-Sekunden
  redshift?:    number;   // Kosmologische Rotverschiebung z
  notes?:       string;
}

export interface CosmicTimepoint {
  cgta:         string;
  machine_id:   string;
  cosmic_value: bigint;   // In Cosmic-Sekunden (= TAI-Sekunden für built-in Cosmic)
  event:        CosmicEvent;
}

/**
 * Erstellt einen Cosmic-Zeitpunkt für ein astrophysikalisches Ereignis.
 * Cosmic v1.1 verwendet TAI-Sekunden als Basis mit scientific_dependency.
 */
export function createCosmicTimepoint(event: CosmicEvent): CosmicTimepoint {
  // Cosmic Domain ist built-in (TAI-Sekunden = Cosmic-Sekunden für v1.1)
  const tp = createTimepoint('Cosmic', '1.1', event.taiSeconds, {
    event_type:  event.eventType,
    source_name: event.sourceName,
    redshift:    String(event.redshift ?? 0),
  });

  return {
    cgta:         tp.cgta,
    machine_id:   tp.machine_id,
    cosmic_value: event.taiSeconds,
    event,
  };
}

// ── UC4 Demo: Gravitationswellen-Ereignis (GW-Analogon) ──────────────────────

export const UC4_GW_EXAMPLE: CosmicEvent = {
  eventType:  'GW_MERGER',
  sourceName: 'GW150914-analog',
  taiSeconds: 1126259462n,       // LIGO GW150914 TAI-Zeitstempel (approximiert)
  redshift:   0.09,
  notes:      'Binary Black Hole Merger — Referenzereignis für Cosmic Domain',
};

export const UC4_PULSAR_EXAMPLE: CosmicEvent = {
  eventType:  'PULSAR_PULSE',
  sourceName: 'PSR B1919+21',
  taiSeconds: 1742041937n,       // Demo-Zeitstempel
  notes:      `Periode: ${PSR_B1919_21.period_s}s ± ${PSR_B1919_21.uncertainty_rel * 100}%`,
};

export const UC4_DESCRIPTION = `
UC4 – Cosmic Domain Astrophysik (CG-APP-0600)
═══════════════════════════════════════════════
Domain:      Cosmic v1.1 (Built-in)
Granularität: Sekunde (astrophysikalische Präzision)
Basis:       PSR B1919+21 Pulsar-Periode (T = 1.3373s)
scientific_dependency: ATNF Pulsar Catalogue, DOI: 10.1071/AS04022
Invariante:  CG-E-008.001 (scientific_dependency bei stability=low)
Anwendung:   Gravitationswellen, Pulsar-Timing, Kosmologie
Vorteil:     Domänen-Bewusstsein (σ=time) für physikalische Zeitskalen
`.trim();
