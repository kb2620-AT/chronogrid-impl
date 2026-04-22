/**
 * cg-usecases/src/uc3.ts
 * UC3: Energiemesswert Sub-Sekunden — CG-APP-0600 v0.5 UC 3
 * Domain: IEC-61850-NS (Nanosekunden-Granularität)
 * Hardware: Shelly Pro 3EM (3-phasiger Energiemesser)
 * Anwendung: Eindeutige Zeitstempelung von Netzmesswerten (Schutzrelais)
 */

import type { CTDDLDomain } from 'cg-types/domain.js';
import { createTimepoint, registerDomain, registerDomain } from 'cg-engine/engine.js';
import { utcToTai } from 'cg-engine/mapping.js';

// ── CTDDL Domain-Definition ───────────────────────────────────────────────────

export const DOMAIN_IEC61850: CTDDLDomain = {
  name: 'IEC61850',
  version: '1.0',
  type: 'linear',
  granularity: 'nanosecond',
  semantics: 'time',
  extent: {
    min: '0',
    max: '9999999999999999999', // ~317 Jahre in Nanosekunden
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
      label: 'IEC61850-ns → TAI-s (÷1_000_000_000)',
    }],
  }],
  metadata: {
    stability: 'permanent',
    notes: 'IEC 61850-9-3 Precision Time Protocol — TAI-basiert, ns-Granularität für Schutzrelais',
  },
};

// Auto-Registrierung beim Import (idempotent — CG-APP-0700)
try { registerDomain(DOMAIN_IEC61850); } catch { /* bereits registriert */ }


// Auto-Registrierung beim Import (idempotent)
try { registerDomain(DOMAIN_IEC61850); } catch { /* bereits registriert */ }

// ── Energiemessung ────────────────────────────────────────────────────────────

export interface EnergyMeasurement {
  deviceId:    string;   // Shelly Pro 3EM Geräte-ID
  phase:       'L1' | 'L2' | 'L3' | 'SUM';
  powerW:      number;   // Wirkleistung in Watt
  voltageV:    number;   // Spannung in Volt
  currentA:    number;   // Strom in Ampere
  utcMs:       bigint;   // UTC-Millisekunden (aus Shelly CSV)
}

export interface EnergyTimepoint {
  cgta:        string;
  machine_id:  string;
  tai_ns:      bigint;   // TAI-Nanosekunden
  measurement: EnergyMeasurement;
}

/**
 * Konvertiert einen Shelly-Messwert (UTC-ms) in eine ChronoGrid-CGTA.
 * UTC-ms → TAI-s → TAI-ns (×1_000_000)
 */
export function createEnergyTimepoint(m: EnergyMeasurement): EnergyTimepoint {
  const utcSecs = m.utcMs / 1000n;
  const taiSecs = utcToTai(utcSecs);
  // Nanosekunden: TAI-Sekunden × 10^9 + verbleibende ms × 10^6
  const tai_ns  = taiSecs * 1_000_000_000n + (m.utcMs % 1000n) * 1_000_000n;

  const tp = createTimepoint('IEC61850', '1.0', tai_ns, {
    device_id: m.deviceId,
    phase:     m.phase,
    power_w:   String(m.powerW),
    voltage_v: String(m.voltageV),
    current_a: String(m.currentA),
  });

  return { cgta: tp.cgta, machine_id: tp.machine_id, tai_ns, measurement: m };
}

// ── 3-Phasen Σ-Summation (Shelly Pro 3EM) ────────────────────────────────────

export function sumPhases(l1: EnergyMeasurement, l2: EnergyMeasurement, l3: EnergyMeasurement): EnergyMeasurement {
  return {
    deviceId: l1.deviceId,
    phase:    'SUM',
    powerW:   l1.powerW + l2.powerW + l3.powerW,
    voltageV: (l1.voltageV + l2.voltageV + l3.voltageV) / 3,
    currentA: l1.currentA + l2.currentA + l3.currentA,
    utcMs:    l1.utcMs,
  };
}

// ── UC3 Demo-Daten ────────────────────────────────────────────────────────────

export const UC3_EXAMPLE: EnergyMeasurement = {
  deviceId: 'shellyPro3EM-A0DD6C',
  phase:    'L1',
  powerW:   2347.5,
  voltageV: 230.2,
  currentA: 10.2,
  utcMs:    1745316600000n, // 2026-04-22T10:30:00.000Z in ms
};

export const UC3_DESCRIPTION = `
UC3 – Energiemesswert Sub-Sekunden IEC 61850 (CG-APP-0600)
══════════════════════════════════════════════════════════════
Domain:      IEC61850 v1.0
Granularität: Nanosekunde (IEC 61850-9-3 PTP-Präzision)
Hardware:    Shelly Pro 3EM (3-phasig, L1+L2+L3+Σ)
Mapping:     IEC61850-ns → TAI-s (÷10^9)
Anwendung:   Netzschutzrelais, Einspeisepunkte, Smart Grid
Vorteil:     Sub-Millisekunden-Kollisionsvermeidung (I-R1, I-R2)
`.trim();
