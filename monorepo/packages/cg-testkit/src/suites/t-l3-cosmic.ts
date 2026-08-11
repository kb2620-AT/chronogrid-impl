/**
 * cg-testkit/src/suites/t-l3-cosmic.ts
 * T-L3-COSMIC-001 – T-L3-COSMIC-006 — Cosmic Domain Level-3-Konformität
 *
 * Normative Grundlage:
 *   CG-STD-5100 v1.4 §2.4 (T-L3-011 – T-L3-020)
 *   CG-STD-3100 v1.6 Kap. 8 (BigInt, wissenschaftliche Domains)
 *
 * Implementierungsstand (Befund 26.05.2026):
 *   getDomain('Cosmic','1.1').extent.max  = '999999999999999'  (Platzhalter)
 *   scientific_dependency.source          = 'ATNF Pulsar Catalogue' (PSR B1919+21, UC4)
 *
 * SPEC-DISKREPANZ (offen für Sprint 11-B):
 *   CG-STD-5100 §2.4 fordert extent.max = 435494880000000000000000000 ns (Planck 2018).
 *   Die aktuelle Cosmic-Domain ist auf UC4 (Pulsar PSR B1919+21) ausgerichtet.
 *   Normative Planck-2018-Werte müssen in der Domain-Definition nachgezogen werden.
 */

import type { TestCase } from '../runner.js';
import { encodeCGTA, decodeCGTA, getDomain, allenRelation } from 'cg-engine/engine.js';

// Implementierungsstand-Konstanten (aus getDomain-Befund)
const COSMIC_EXTENT_IMPL  = 999_999_999_999_999n;            // aktueller Platzhalter-Wert
const INT64_MAX           = 9_223_372_036_854_775_807n;
const BIT89_THRESHOLD     = 2n ** 89n;                        // Spec-Anforderung für künftige Korrektur

// Normative Zielwerte (CG-STD-5100 §2.4) — noch nicht implementiert
const COSMIC_AGE_NS_SPEC = 435_494_880_000_000_000_000_000_000n;

export const cosmicTests: TestCase[] = [

  // T-L3-COSMIC-001: Golden Vector — encode(Cosmic-Wert) liefert korrekten CGTA-String
  {
    id: 'T-L3-COSMIC-001', suite: 'T-L3-COSMIC', level: 3,
    description: 'Cosmic Golden Vector: encode(extent.max) liefert gültigen CGTA-String',
    run: () => {
      const domain = getDomain('Cosmic', '1.1');
      const maxVal = BigInt(domain.extent.max!);
      const cgta   = encodeCGTA({ domain: 'Cosmic', value: maxVal, version: 1 });
      return cgta === `CG:Cosmic:${maxVal.toString()}/v1`;
    },
    expected: true,
  },

  // T-L3-COSMIC-002: Extent-Grenze — max überschreitet INT64_MAX
  // Verschärft in Schritt 2 (Übernahme des Sachverhalts aus dem nie ausgeführten T-ENG-082).
  // Befund 2026-08-10: extent.max = 435494880000000000000000000 ns, also der Zielwert aus
  // CG-STD-5100 §2.4 — der frühere Platzhalter-Hinweis war überholt. Die alte Fassung prüfte
  // nur > 0n und wäre auch beim alten Platzhalter 999999999999999 grün geblieben; die Aussage
  // „Cosmic braucht mehr als 64 Bit" trug sie damit nicht. T-L3-COSMIC-003 prüft dieselbe
  // Schwelle bisher nur an einem Literal, nicht an der Domain.
  {
    id: 'T-L3-COSMIC-002', suite: 'T-L3-COSMIC', level: 3,
    description: 'Cosmic Extent-Grenze: max ist definiert und überschreitet INT64_MAX',
    run: () => {
      const domain = getDomain('Cosmic', '1.1');
      const maxVal = BigInt(domain.extent.max!);
      return maxVal > INT64_MAX;
    },
    expected: true,
  },

  // T-L3-COSMIC-003: BigInt-Präzision — Cosmic-Wert überschreitet INT64 (reiner Arithmetik-Test)
  // Dieser Test ist implementierungsunabhängig und prüft die ℤ∞-Voraussetzung.
  {
    id: 'T-L3-COSMIC-003', suite: 'T-L3-COSMIC', level: 3,
    description: 'Cosmic BigInt-Präzision ≥ 89 Bit: normative Zielwert-Arithmetik (2^89 > 4.35×10²⁶)',
    run: () => {
      const COSMIC_AGE_NS = 435_494_880_000_000_000_000_000_000n; // Spec-Zielwert
      return COSMIC_AGE_NS > INT64_MAX &&
             COSMIC_AGE_NS < BIT89_THRESHOLD;
    },
    expected: true,
  },

  // T-L3-COSMIC-004: Encode/Decode Roundtrip — kein Präzisionsverlust
  {
    id: 'T-L3-COSMIC-004', suite: 'T-L3-COSMIC', level: 3,
    description: 'Cosmic Encode/Decode Roundtrip: decode(encode(extent.max)) === extent.max exakt',
    run: () => {
      const domain  = getDomain('Cosmic', '1.1');
      const maxVal  = BigInt(domain.extent.max!);
      const cgta    = encodeCGTA({ domain: 'Cosmic', value: maxVal, version: 1 });
      const decoded = decodeCGTA(cgta);
      return typeof decoded.value === 'bigint' &&
             decoded.value === maxVal &&
             decoded.domain === 'Cosmic';
    },
    expected: true,
  },

  // T-L3-COSMIC-005: scientific_dependency vorhanden und hat source-Feld
  // Implementierung: PSR B1919+21 / ATNF (UC4-Domain)
  // SPEC-NOTE: Ziel = Planck-2018 (H₀=67.4) — noch nicht implementiert
  {
    id: 'T-L3-COSMIC-005', suite: 'T-L3-COSMIC', level: 3,
    description: 'Cosmic scientific_dependency: vorhanden mit source-Feld (CG-STD-5100 §2.4)',
    run: () => {
      const domain  = getDomain('Cosmic', '1.1');
      const sci_dep = domain.metadata?.scientific_dependency;
      // Aktuelle Implementierung: ATNF Pulsar Catalogue (UC4/PSR B1919+21)
      // Spec-Ziel: Planck-2018 — Korrektur der Domain-Definition in Sprint 11-B
      return !!sci_dep &&
             (typeof sci_dep.source === 'string' || typeof sci_dep.model === 'string');
    },
    expected: true,
  },

  // T-L3-COSMIC-006: Allen-Relationen auf kosmologischer Skala
  {
    id: 'T-L3-COSMIC-006', suite: 'T-L3-COSMIC', level: 3,
    description: 'Allen-Relationen auf Cosmic-Skala: BEFORE korrekt für zwei große BigInt-Intervalle',
    run: () => {
      const early = { start: 0n,                     end: 100_000_000_000_000n };
      const late  = { start: 500_000_000_000_000n,   end: COSMIC_EXTENT_IMPL };
      return allenRelation(early, late) === 'BEFORE';
    },
    expected: true,
  },

];
