# ChronoGrid Reference Implementation — Sprint 9

**Architektur:** CG-APP-0700 v0.3 | **Konformität:** Level 3 (204/204 Tests) | TypeScript + Node.js

## Sprint-Übersicht

| Sprint | Inhalt | Tests |
|---|---|---|
| 1–5 | Engine, CTDDL, CGUAS, REST API, Testkit | 72 |
| 6 | PostgreSQL-Anbindung, HTTP-Server | +12 |
| 7 | GraphQL, Webhooks, Interface-APIContext | +39 |
| 8 | JWT/RBAC, T-API-* HTTP-Integrationstests | +58 |
| 9 | UC1–UC5 (CG-APP-0600), Swagger UI, PG-Test, Report | +23 |
| **Gesamt** | | **204/204** |

## Sprint 9 – Neue Features

### Use Cases UC1–UC5 (CG-APP-0600 v0.5)
| UC | Domain | Granularität | Invariante |
|---|---|---|---|
| UC1 ATC/ACARS | Aviation v1.0 | Millisekunde | I-R1, I-R3 |
| UC2 Legal-AT | LegalAT v1.0 | Sekunde | I-D1, I-S1 |
| UC3 IEC 61850 | IEC61850 v1.0 | Nanosekunde | I-R1, I-R2 |
| UC4 Cosmic | Cosmic v1.1 (Built-in) | Sekunde | CG-E-008 |
| UC5 QKD Photon | QKDPhoton v1.0 | Nanosekunde | I-QKD-1 |

### Neue Endpunkte
- `GET /v1/docs` — Swagger UI (OpenAPI Anlage A, CG-STD-4100 Kap. 8)
- `GET /v1/usecases` — UC1–UC5 Übersicht (public)

### Scripts
- `pnpm pg:test` — PostgreSQL Live-Test (6 Checks: Verbindung, Tabellen, BigInt, Insert)
- `pnpm test:report` — Conformance Report JSON (FFG-Nachweis)

## Schnellstart

```bash
pnpm install
pnpm test                    # 204/204 Tests

pnpm api:dev                 # http://localhost:3000
# → GET /v1/docs             # Swagger UI
# → GET /v1/usecases         # UC1–UC5 Übersicht
# → GET /v1/auth/token?role=writer  # Dev-Token

docker compose up -d         # PostgreSQL
pnpm pg:test                 # DB-Check
STORAGE=postgres pnpm api:pg # API mit PostgreSQL

pnpm test:report             # conformance-report.json
```
