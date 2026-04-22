# ChronoGrid Reference Implementation

**Architektur:** CG-APP-0700 v0.3 | **Konformität:** Level 3 (72/72 Tests) | **Sprache:** TypeScript + Node.js

## Monorepo-Struktur

```
chronogrid-refimpl/
├── packages/
│   ├── cg-types/      # Gemeinsame Typen, Fehlerklassen CG-E-001–011 (CG-STD-2100 Kap. 9)
│   ├── cg-ctddl/      # CTDDL-Parser, 7-Stufen-Validator (CG-STD-2100)
│   ├── cg-engine/     # Encode/Decode, BigInt, Mapping, MachineID, CGFI, Allen (CG-STD-3100)
│   ├── cg-cguas/      # Universal Address Space, Segment-Verwaltung (CG-STD-6100 Teil A)
│   ├── cg-storage/    # Repository-Interface + PostgreSQL-Schema (CG-STD-4100 Kap. 3)
│   └── cg-testkit/    # Normative Test-Suite T-ENG + T-API (CG-STD-5100)
└── apps/
    └── cg-api/        # REST-API Gateway, 16 Endpoints, JWT/RBAC (CG-STD-4100 Kap. 4–8)
```

## Voraussetzungen

- Node.js ≥ 20
- pnpm ≥ 9

## Setup

```bash
pnpm install
```

## Tests ausführen

```bash
# Alle Tests (Level 1–3)
pnpm test

# Nur Level-1-Tests (Basis-Konformität)
pnpm test:level1

# Konformitäts-Report als JSON
pnpm report
```

## Normative Grundlagen

| Package       | Normatives Dokument              |
|---------------|----------------------------------|
| cg-types      | CG-STD-2100 v1.4 Kap. 9         |
| cg-ctddl      | CG-STD-2100 v1.4                 |
| cg-engine     | CG-STD-3100 v1.5                 |
| cg-cguas      | CG-STD-6100 v0.5 Teil A          |
| cg-storage    | CG-STD-4100 v0.7 Kap. 3         |
| cg-api        | CG-STD-4100 v0.7 Kap. 4–8       |
| cg-testkit    | CG-STD-5100 v1.3, CG-STD-3100 Kap. 11 |

## Architekturprinzipien (CG-APP-0700 §2)

1. **Engine ist pure function** — kein Netzwerk, keine DB, keine Systemzeit im Engine-Kern (I-R3)
2. **BigInt überall** — `bigint` intern, `string` an API/DB-Grenzen. Niemals `Number` für Zeitwerte
3. **Insert-only Storage** — kein UPDATE/DELETE auf normativen Tabellen (I-S1, I-D1)
4. **Deterministische Hashes** — SHA-256 auf kanonischer Big-Endian-Serialisierung (CG-STD-3100 Kap. 2.6)
