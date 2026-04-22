/**
 * cg-api/src/openapi.ts
 * OpenAPI 3.1 Spezifikation — CG-STD-4100 v0.7 Kap. 8 (Anlage A)
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'ChronoGrid API',
    version: '0.7.0',
    description: 'ChronoGrid Reference Implementation REST API — CG-STD-4100 v0.7',
    contact: { name: 'ChronoGrid Systems', url: 'https://chronogrid.systems' },
  },
  servers: [{ url: 'http://localhost:3000', description: 'Lokale Entwicklung' }],
  paths: {
    '/v1/health': {
      get: { summary: 'Health Check', operationId: 'getHealth', tags: ['System'],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } } },
    },
    '/v1/timepoints': {
      post: { summary: 'Zeitpunkt erstellen', operationId: 'postTimepoints', tags: ['Timepoints'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['domain', 'value'],
          properties: { domain: { type: 'string' }, value: { type: 'string' },
            version: { type: 'string', default: '1.0' }, labels: { type: 'object' } },
        } } } },
        responses: { '201': { description: 'Erstellt' }, '422': { description: 'Validierungsfehler' } },
      },
      get: { summary: 'Zeitpunkte auflisten', operationId: 'listTimepoints', tags: ['Timepoints'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Liste' } },
      },
    },
    '/v1/timepoints/{machine_id}': {
      get: { summary: 'Zeitpunkt abrufen', operationId: 'getTimepoint', tags: ['Timepoints'],
        parameters: [{ name: 'machine_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Nicht gefunden' } },
      },
    },
    '/v1/timepoints/convert': {
      post: { summary: 'Domain-Konversion', operationId: 'convertTimepoint', tags: ['Timepoints'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['from_domain', 'to_domain', 'value'],
          properties: { from_domain: { type: 'string' }, to_domain: { type: 'string' }, value: { type: 'string' } },
        } } } },
        responses: { '200': { description: 'OK' }, '422': { description: 'Mapping-Fehler' } },
      },
    },
    '/v1/timepoints/validate': {
      post: { summary: 'CGTA validieren', operationId: 'validateTimepoint', tags: ['Timepoints'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['cgta'], properties: { cgta: { type: 'string' } },
        } } } },
        responses: { '200': { description: 'Gültig' }, '422': { description: 'Ungültig' } },
      },
    },
    '/v1/domains': {
      get: { summary: 'Domains auflisten', operationId: 'listDomains', tags: ['Domains'],
        responses: { '200': { description: 'OK' } } },
      post: { summary: 'Domain registrieren', operationId: 'postDomain', tags: ['Domains'],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Erstellt' }, '409': { description: 'Duplikat' } },
      },
    },
    '/v1/domains/validate': {
      post: { summary: 'CTDDL validieren', operationId: 'validateDomain', tags: ['Domains'],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Gültig' }, '422': { description: 'Ungültig' } },
      },
    },
    '/v1/relations/compute': {
      post: { summary: 'Allen-Relation berechnen', operationId: 'computeRelation', tags: ['Relations'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['a_start', 'a_end', 'b_start', 'b_end'],
          properties: { a_start: { type: 'string' }, a_end: { type: 'string' },
            b_start: { type: 'string' }, b_end: { type: 'string' },
            a_id: { type: 'string' }, b_id: { type: 'string' } },
        } } } },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/v1/segments': {
      post: { summary: 'Segment allokieren', operationId: 'postSegment', tags: ['CGUAS'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          properties: { granted_by: { type: 'string' }, size_ns: { type: 'string' }, parent_id: { type: 'string' } },
        } } } },
        responses: { '201': { description: 'Erstellt' } },
      },
    },
    '/v1/segments/resolve/{cgua}': {
      get: { summary: 'CGUA auflösen', operationId: 'resolveCGUA', tags: ['CGUAS'],
        parameters: [{ name: 'cgua', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Nicht gefunden' } },
      },
    },
    '/v1/files': {
      post: { summary: 'Datei-Manifest erstellen', operationId: 'postFile', tags: ['CGFS'],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Erstellt' } },
      },
    },
    '/v1/files/{cgfi}': {
      get: { summary: 'Manifest abrufen', operationId: 'getFile', tags: ['CGFS'],
        parameters: [{ name: 'cgfi', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Nicht gefunden' }, '410': { description: 'Tombstone' } },
      },
      delete: { summary: 'Tombstone setzen', operationId: 'deleteFile', tags: ['CGFS'],
        parameters: [{ name: 'cgfi', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/v1/graphql': {
      post: { summary: 'GraphQL Endpunkt (Sprint 7)', operationId: 'graphql', tags: ['GraphQL'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['query'],
          properties: { query: { type: 'string' }, variables: { type: 'object' } },
        } } } },
        responses: { '200': { description: 'GraphQL-Antwort' } },
      },
    },
    '/v1/webhooks': {
      post: { summary: 'Webhook registrieren (Sprint 7)', operationId: 'postWebhook', tags: ['Webhooks'],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['url', 'events'],
          properties: { url: { type: 'string', format: 'uri' }, events: { type: 'array', items: { type: 'string' } },
            secret: { type: 'string' } },
        } } } },
        responses: { '201': { description: 'Erstellt' } },
      },
      get: { summary: 'Webhooks auflisten', operationId: 'listWebhooks', tags: ['Webhooks'],
        responses: { '200': { description: 'OK' } } },
    },
  },
  tags: [
    { name: 'System' }, { name: 'Timepoints' }, { name: 'Domains' },
    { name: 'Relations' }, { name: 'CGUAS' }, { name: 'CGFS' },
    { name: 'GraphQL', description: 'Sprint 7 — CG-STD-4100 Kap. 5' },
    { name: 'Webhooks', description: 'Sprint 7 — CG-STD-4100 Kap. 6' },
  ],
};
