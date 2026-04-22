# ChronoGrid Reference Implementation — Sprint 7

**Architektur:** CG-APP-0700 v0.3 | **Konformität:** Level 3 (123/123 Tests) | TypeScript + Node.js

## Sprint-Übersicht

| Sprint | Inhalt | Tests |
|---|---|---|
| 1–5 | Engine, Parser, CTDDL, CGUAS, API, Testkit | 72 |
| 6 | PostgreSQL-Anbindung, HTTP-Server, Storage-Tests | +12 |
| 7 | GraphQL (Kap. 5), Webhooks (Kap. 6), Interface-APIContext | +39 |
| **Gesamt** | | **123/123** |

## Monorepo-Struktur

```
chronogrid-refimpl/
├── packages/
│   ├── cg-types/      # Typen, Fehlerklassen CG-E-001–011 (64 Sub-Codes)
│   ├── cg-ctddl/      # CTDDL-Parser, 7-Stufen-Validator (CG-STD-2100 v1.4)
│   ├── cg-engine/     # Encode/Decode, BigInt, Mapping, MachineID, CGFI, Allen (CG-STD-3100 v1.5)
│   ├── cg-cguas/      # Universal Address Space, Segment-Verwaltung (CG-STD-6100 Teil A)
│   ├── cg-storage/    # Repository-Interfaces + In-Memory + PostgreSQL (CG-STD-4100 Kap. 3)
│   └── cg-testkit/    # Normative Test-Suite 123 Tests (CG-STD-5100 v1.3)
└── apps/
    └── cg-api/        # REST + GraphQL + Webhooks (CG-STD-4100 Kap. 4–6)
```

## Sprint 7 – Neue Features

### 1. Interface-basierter APIContext (Kap. 3)
`handlers.ts` verwendet nur noch `ITimepointRepository`, `IDomainRepository` etc.
→ PostgreSQL und In-Memory sind aus Handler-Sicht identisch.

### 2. GraphQL API (CG-STD-4100 Kap. 5)
- Endpunkt: `POST /v1/graphql`
- Playground: `GET /v1/graphql`
- Schema: Query (health, timepoint, timepoints, domain, domains, allenRelation, segment, segments, file)
- Mutations (createTimepoint, registerDomain, convert, allocateSegment, createFile, deleteFile)
- Kein externes Framework – nutzt `graphql` Paket direkt

### 3. Webhooks (CG-STD-4100 Kap. 6)
- `POST /v1/webhooks` – Subscription registrieren
- `GET /v1/webhooks` – Subscriptions auflisten
- `DELETE /v1/webhooks/:id` – deaktivieren
- `GET /v1/webhooks/deliveries` – Delivery-Log
- HMAC-SHA256 Signierung (`X-ChronoGrid-Signature`)
- Events: `timepoint.created`, `domain.registered`, `domain.published`, `segment.allocated`, `file.created`, `file.tombstoned`
- Retry: 3 Versuche mit exponentiellem Backoff (1s, 2s, 4s)

## Schnellstart

```bash
# Abhängigkeiten installieren
pnpm install

# Tests (In-Memory, kein Docker nötig)
pnpm test

# API starten (In-Memory)
pnpm api:dev

# API starten (PostgreSQL)
docker compose up -d
STORAGE=postgres pnpm api:pg
```

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | /v1/health | Health Check |
| GET | /v1/openapi.json | OpenAPI 3.1 Spec |
| POST | /v1/timepoints | Zeitpunkt erstellen |
| GET | /v1/timepoints | Zeitpunkte auflisten |
| GET | /v1/timepoints/:id | Zeitpunkt abrufen |
| POST | /v1/timepoints/convert | Domain-Konversion |
| POST | /v1/timepoints/validate | CGTA validieren |
| GET/POST | /v1/graphql | GraphQL API (Sprint 7) |
| POST | /v1/webhooks | Webhook registrieren (Sprint 7) |
| GET | /v1/webhooks | Webhooks auflisten (Sprint 7) |
| DELETE | /v1/webhooks/:id | Webhook deaktivieren (Sprint 7) |

## GraphQL Beispiele

```graphql
# Health
{ health { status version timestamp } }

# Zeitpunkt erstellen
mutation {
  createTimepoint(domain: "TAI", value: "1742041937") {
    machine_id cgta absolute_value
  }
}

# Allen-Relation
{ allenRelation(a_start:"100" a_end:"200" b_start:"150" b_end:"300") }

# Domain-Konversion
mutation {
  convert(from_domain: "UTC", to_domain: "TAI", value: "1742041937") {
    input output
  }
}
```

## Webhook Beispiel

```bash
# Subscription registrieren
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{"url":"https://webhook.site/xyz","events":["timepoint.created"],"secret":"my-secret"}'

# Signatur verifizieren (HMAC-SHA256)
# Header: X-ChronoGrid-Signature: sha256=<hmac>
```

## Normative Referenzen

- CG-STD-4100 v0.7 – Storage & API (Kap. 3: Storage, 4: REST, 5: GraphQL, 6: Webhooks, 8: OpenAPI)
- CG-STD-3100 v1.5 – Engine-Spezifikation
- CG-STD-2100 v1.4 – CTDDL Spezifikation
- CG-STD-5100 v1.3 – Governance & Zertifizierung
- CG-APP-0700 v0.3 – Reference Implementation Architecture
