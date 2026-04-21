# ChronoGrid Reference Implementation — Sprint 1

**Status:** Sprint 1 vollständig  
**Normative Grundlage:** CG-STD-2100 v1.4, CG-STD-3100 v1.5  
**Architektur:** CG-APP-0700 v0.1

---

## Packages

### `cg-types` — Kern-Typen und Fehlerklassen
- **`src/errors.ts`** — 11 Fehlerklassen, 64 normative Sub-Codes (CG-STD-2100 Kap. 9)
- **`src/domain.ts`** — CTDDLDomain, CGTA, CGInterval, MachineID, CGFI

### `cg-ctddl` — CTDDL-Parser
- **`src/parser.ts`** — `parseCTDDL()`: vollständige Validierung gegen ABNF (Kap. 4)  
  `DomainRegistry`: In-Memory-Registry mit I-D1-Durchsetzung

### `cg-engine` — Engine-Kern
- **`src/engine.ts`**
  - BigInt-Arithmetik: `safeAdd()`, `mod()`, `bigIntToBytesBigEndian()` (Kap. 2.6)
  - `computeMachineID()` — SHA-256 über kanonischen TAI-Wert (Kap. 5.1)
  - `computeCGFI()` — SHA-256 mit seq-Parameter (Kap. 5.4)
  - Allen-Relationen: alle 13 implementiert (Kap. 9)
  - TAI↔UTC: normative Schaltsekunden-Tabelle 1972–2017 (CG-STD-2100 Anhang A)
  - CGUA-Adressraum-Prüfung: 79-Bit (CG-STD-6100 Kap. 3)

- **`src/engine.test.ts`** — Normative Testvektoren
  - T-BIG-001..007: BigInt-Arithmetik
  - T-CGTA-001..003: CGTA encode/parse
  - T-ENG-001..007: MachineID, CGFI, Determinismus
  - T-ENG-UC1-001..003: Use Case 1 (OS411/EVINA)
  - T-ENG-UC3-001..002: Use Case 3 (Energiemesswert meets())
  - T-ENG-UC4-001..002: Use Case 4 (Cosmic BigInt)
  - T-CTDDL-001..007: Parser + Registry
  - T-ALLEN: alle 13 Allen-Relationen

---

## Invarianten

| Invariante | Durchsetzung |
|---|---|
| I-R3 (Determinismus) | Pure functions, kein System-State |
| I-D1 (Unveränderlichkeit) | `Object.freeze()` in DomainRegistry |
| I-M1 (Eindeutigkeit) | CGFI: verschiedener Inhalt → verschiedener Hash |
| CG-E-003 (Overflow) | `safeAdd()` mit Level-Parameter |

---

## Sprint 2 (nächster Schritt)

- `cg-engine`: piecewise-linear Mapping (UTC↔TAI mit IERS-Tabelle)
- `cg-engine`: Gregorianischer Encode/Decode-Algorithmus (Kap. 4.1/4.2)
- `cg-cguas`: CGUA-Segment-Verwaltung (CG-STD-6100 Kap. 3)
- `cg-storage`: PostgreSQL-Schema (7 normative Tabellen, CG-STD-4100 Kap. 3)
