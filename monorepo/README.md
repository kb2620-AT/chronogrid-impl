# ChronoGrid Reference Implementation — Sprint 8

**Architektur:** CG-APP-0700 v0.3 | **Konformität:** Level 3 (181/181 Tests) | TypeScript + Node.js

## Sprint-Übersicht

| Sprint | Inhalt | Tests |
|---|---|---|
| 1–5 | Engine, CTDDL, CGUAS, REST API, Testkit | 72 |
| 6 | PostgreSQL-Anbindung, HTTP-Server, Storage | +12 |
| 7 | GraphQL (Kap. 5), Webhooks (Kap. 6), Interface-APIContext | +39 |
| 8 | JWT/RBAC (Kap. 7), T-API-* HTTP-Integrationstests | +58 |
| **Gesamt** | | **181/181** |

## Sprint 8 – Neue Features

### JWT/RBAC (CG-STD-4100 Kap. 7)
- HS256 ohne externe Bibliothek (nur `node:crypto`)
- Rollen: `admin` > `writer` > `reader`
- Neuer Endpunkt: `GET /v1/auth/token?role=admin|writer|reader` (Dev/Test)
- Neue Fehlerklasse: `CG-E-012 AuthError` (4 Sub-Codes)
- Timing-safe Vergleich (timingSafeEqual)

### RBAC-Tabelle
| Endpunkt | Methode | Mindestrolle |
|---|---|---|
| /v1/health, /v1/openapi.json, /v1/auth/token | GET | public |
| /v1/graphql | GET | public (Playground) |
| /v1/timepoints, /v1/domains, /v1/files, ... | GET | reader |
| /v1/timepoints/validate, /v1/timepoints/convert | POST | reader |
| /v1/domains/validate, /v1/relations/compute | POST | reader |
| /v1/graphql | POST | reader |
| /v1/timepoints, /v1/domains, /v1/files, ... | POST | writer |
| /v1/files/:cgfi | DELETE | writer |

### T-API-* HTTP-Integrationstests (35 Tests)
- Live-HTTP-Requests gegen In-Process-Server (Port 3099)
- Testet: 401 ohne Token, 403 falsche Rolle, CRUD mit auth
- Kein externer Prozess nötig – alles in-process

## Schnellstart

```bash
pnpm install
pnpm test           # 181/181 Tests

# API starten
pnpm api:dev        # In-Memory

# Token holen (Dev)
curl http://localhost:3000/v1/auth/token?role=writer

# Zeitpunkt erstellen
curl -X POST http://localhost:3000/v1/timepoints \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"domain":"TAI","value":"1742041937"}'

# Mit PostgreSQL
docker compose up -d
STORAGE=postgres pnpm api:pg
```
