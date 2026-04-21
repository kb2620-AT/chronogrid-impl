/**
 * cg-api/src/openapi.ts
 * OpenAPI 3.1 Spezifikation — CG-STD-4100 v0.5 (normativ)
 * GET /v1/openapi.json liefert dieses Dokument.
 */
export const OPENAPI_SPEC = {
    openapi: '3.1.0',
    info: {
        title: 'ChronoGrid API',
        version: '0.5.0',
        description: 'Normative REST API — CG-STD-4100-2026 v0.5. Base URL: https://api.chronogrid.org/v1',
        contact: {
            name: 'ChronoGrid Systems',
            url: 'https://chronogrid.org',
            email: 'spec@chronogrid.org',
        },
        license: { name: 'ChronoGrid Standards License', url: 'https://chronogrid.org/license' },
    },
    servers: [
        { url: 'https://api.chronogrid.org/v1', description: 'Produktion (normativ)' },
        { url: 'http://localhost:3000/v1', description: 'Entwicklung' },
    ],
    security: [{ BearerAuth: [] }],
    components: {
        securitySchemes: {
            BearerAuth: {
                type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
                description: 'JWT RS256/ES256, Issuer: https://auth.chronogrid.org, Audience: chronogrid-api',
            },
        },
        schemas: {
            CGError: {
                type: 'object', required: ['error'],
                properties: {
                    error: {
                        type: 'object', required: ['cg_code', 'message'],
                        properties: {
                            cg_code: { type: 'string', example: 'CG-E-001.002', description: 'Normatives Fehlercode-Format' },
                            class: { type: 'string', example: 'SyntaxError' },
                            severity: { type: 'string', enum: ['FATAL', 'ERROR', 'WARNING'] },
                            message: { type: 'string' },
                            context: { type: 'object' },
                            cgStd: { type: 'string', example: 'CG-STD-2100-2026 v1.4' },
                        },
                    },
                },
            },
            CGTA: {
                type: 'string',
                pattern: '^CG:[^:]+:-?\\d+(/:\\sigma\\d+)?/v\\d+$',
                example: 'CG:TAI:1743585310000000000/v1',
                description: 'ChronoGrid Time Address — normatives Format (CG-STD-2100 Kap. 4.1)',
            },
            Timepoint: {
                type: 'object', required: ['machine_id', 'cgta', 'absolute_value', 'domain', 'granularity'],
                properties: {
                    machine_id: { type: 'string', minLength: 64, maxLength: 64, description: 'SHA-256 hex' },
                    cgta: { $ref: '#/components/schemas/CGTA' },
                    absolute_value: { type: 'string', description: 'BigInt als String (JSON-sicher, kein Float)' },
                    domain: { type: 'string', example: 'TAI/v1' },
                    granularity: { type: 'string', example: 'nanosecond' },
                    created_at: { $ref: '#/components/schemas/CGTA' },
                    created_by: { type: 'string' },
                },
            },
            Segment: {
                type: 'object', required: ['segment_id', 'owner_id', 'start_address', 'end_address', 'size_ns'],
                properties: {
                    segment_id: { type: 'string', example: 'at.gv.staatsarchiv' },
                    owner_id: { type: 'string' },
                    parent_id: { type: 'string', nullable: true },
                    start_address: { type: 'string', description: '79-Bit CGUA-Adresse als String' },
                    end_address: { type: 'string' },
                    size_ns: { type: 'string', description: 'Nanosekunden als String' },
                    level: { type: 'integer', minimum: 0, maximum: 6 },
                    status: { type: 'string', enum: ['active', 'inactive'] },
                    granted_at: { $ref: '#/components/schemas/CGTA' },
                    integrity_hash: { type: 'string', minLength: 64, maxLength: 64 },
                },
            },
            Manifest: {
                type: 'object', required: ['cgfi', 'type_id', 'created_at', 'content_hash'],
                properties: {
                    cgfi: { type: 'string', minLength: 64, maxLength: 64, description: 'SHA-256 hex (CG-STD-3100 Kap. 5.4)' },
                    cgfs_version: { type: 'string', example: '1.0' },
                    type_id: { type: 'string', example: 'legal/contract/v1' },
                    type_schema: { type: 'string', format: 'uri' },
                    created_at: { $ref: '#/components/schemas/CGTA' },
                    content_hash: { type: 'string', minLength: 64, maxLength: 64 },
                    prev_version: { type: 'string', nullable: true },
                    cgua: { $ref: '#/components/schemas/CGTA', nullable: true },
                    retention: { type: 'string', example: 'P30Y', description: 'ISO-8601-Dauer' },
                    access_level: { type: 'string', enum: ['public', 'restricted', 'confidential', 'secret'] },
                    deleted_at: { $ref: '#/components/schemas/CGTA', nullable: true },
                    deleted_reason: { type: 'string', nullable: true },
                },
            },
            Pagination: {
                type: 'object',
                properties: {
                    next_cursor: { type: 'string', nullable: true },
                    has_more: { type: 'boolean' },
                    total_hint: { type: 'integer', description: 'Approximativ, nicht normativ' },
                },
            },
        },
        responses: {
            Unauthorized: {
                description: '401 Unauthorized — JWT fehlt oder ungültig',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/CGError' } } },
            },
            Forbidden: {
                description: '403 Forbidden — Unzureichende Rolle (RBAC)',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/CGError' } } },
            },
            NotFound: {
                description: '404 Not Found',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/CGError' } } },
            },
            UnprocessableEntity: {
                description: '422 Unprocessable Entity — Normative Validierungsfehler (CG-E-001.*)',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/CGError' } } },
            },
        },
    },
    paths: {
        '/timepoints': {
            post: {
                summary: 'Zeitpunkt speichern (idempotent)',
                operationId: 'postTimepoints',
                description: 'Speichert einen CGTA-Zeitpunkt. Idempotent: gleiche MachineID → 200 (nicht 201).',
                tags: ['Zeitpunkte'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object', required: ['cgta'],
                                properties: {
                                    cgta: { $ref: '#/components/schemas/CGTA' },
                                    label: { type: 'string' },
                                    tags: { type: 'array', items: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': { description: 'Erstellt', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timepoint' } } } },
                    '200': { description: 'Bereits vorhanden (idempotent)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Timepoint' } } } },
                    '401': { $ref: '#/components/responses/Unauthorized' },
                    '403': { $ref: '#/components/responses/Forbidden' },
                    '422': { $ref: '#/components/responses/UnprocessableEntity' },
                },
            },
            get: {
                summary: 'Zeitpunkte auflisten (cursor-basiert)',
                operationId: 'listTimepoints',
                tags: ['Zeitpunkte'],
                parameters: [
                    { name: 'domain', in: 'query', schema: { type: 'string' } },
                    { name: 'after', in: 'query', schema: { type: 'string' }, description: 'Cursor (machine_id)' },
                    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } },
                ],
                responses: {
                    '200': {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        data: { type: 'array', items: { $ref: '#/components/schemas/Timepoint' } },
                                        pagination: { $ref: '#/components/schemas/Pagination' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/timepoints/convert': {
            post: {
                summary: 'Zeitpunkt konvertieren (zustandslos)',
                operationId: 'convertTimepoint',
                tags: ['Zeitpunkte'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object', required: ['cgta', 'target_domain'],
                                properties: {
                                    cgta: { $ref: '#/components/schemas/CGTA' },
                                    target_domain: { type: 'string', example: 'TAI/v1' },
                                    worldline_ref: { type: 'string', nullable: true, description: 'Pflicht für Klasse-B-Mappings' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'OK — Konvertierungsergebnis' },
                    '422': { $ref: '#/components/responses/UnprocessableEntity' },
                },
            },
        },
        '/timepoints/validate': {
            post: {
                summary: 'CGTA validieren (zustandslos)',
                operationId: 'validateTimepoint',
                tags: ['Zeitpunkte'],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', required: ['cgta'], properties: { cgta: { type: 'string' } } } } },
                },
                responses: {
                    '200': { description: 'Validierungsergebnis (valid: true|false)' },
                },
            },
        },
        '/segments': {
            post: {
                summary: 'Segment registrieren (CGUAS)',
                operationId: 'postSegment',
                tags: ['CGUAS'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object', required: ['segment_id', 'owner_id', 'parent_id', 'size_ns'],
                                properties: {
                                    segment_id: { type: 'string', example: 'at.gv.staatsarchiv' },
                                    owner_id: { type: 'string' },
                                    parent_id: { type: 'string', example: 'CG.CGUAS.ROOT' },
                                    size_ns: { type: 'string', description: 'Nanosekunden als String (BigInt)' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '201': { description: 'Segment zugeteilt', content: { 'application/json': { schema: { $ref: '#/components/schemas/Segment' } } } },
                    '409': { description: 'Kollision (CG-E-010.003)' },
                    '507': { description: 'Kein Platz (CG-E-010.001)' },
                },
            },
        },
        '/segments/resolve/{cgua}': {
            get: {
                summary: 'CGUA-Adresse auflösen',
                operationId: 'resolveCGUA',
                tags: ['CGUAS'],
                parameters: [{ name: 'cgua', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    '200': { description: 'Segment gefunden' },
                    '404': { description: 'Adresse liegt in keinem Segment (CG-E-010.002)' },
                },
            },
        },
        '/files': {
            post: {
                summary: 'Manifest speichern (CGFS)',
                operationId: 'postFile',
                tags: ['CGFS'],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Manifest' } } },
                },
                responses: {
                    '201': { description: 'Manifest gespeichert, CGFI berechnet' },
                    '422': { description: 'Integritätsfehler (CG-E-011.004)' },
                },
            },
        },
        '/files/{cgfi}': {
            get: {
                summary: 'Manifest abrufen',
                operationId: 'getFile',
                tags: ['CGFS'],
                parameters: [{ name: 'cgfi', in: 'path', required: true, schema: { type: 'string', minLength: 64, maxLength: 64 } }],
                responses: {
                    '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Manifest' } } } },
                    '404': { $ref: '#/components/responses/NotFound' },
                },
            },
            delete: {
                summary: 'Logisch löschen (DSGVO Art. 17)',
                operationId: 'deleteFile',
                tags: ['CGFS'],
                description: 'Logisches Löschen: deleted_at wird gesetzt. CGFI und Metadaten bleiben erhalten (I-D1).',
                parameters: [{ name: 'cgfi', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string', example: 'dsgvo_art17' } } } } },
                },
                responses: {
                    '200': { description: 'Logisch gelöscht' },
                    '410': { description: 'Bereits gelöscht (CG-E-011.009)' },
                },
            },
        },
        '/health': {
            get: {
                summary: 'System-Status',
                operationId: 'getHealth',
                tags: ['System'],
                security: [], // kein Auth erforderlich
                responses: { '200': { description: 'OK' } },
            },
        },
        '/relations/compute': {
            post: {
                summary: 'Allen-Relation berechnen (zustandslos)',
                operationId: 'computeRelation',
                tags: ['Relationen'],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object', required: ['interval_a', 'interval_b'],
                                properties: {
                                    interval_a: { type: 'object', required: ['start', 'end'], properties: { start: { $ref: '#/components/schemas/CGTA' }, end: { $ref: '#/components/schemas/CGTA' } } },
                                    interval_b: { type: 'object', required: ['start', 'end'], properties: { start: { $ref: '#/components/schemas/CGTA' }, end: { $ref: '#/components/schemas/CGTA' } } },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Allen-Relation' },
                    '422': { $ref: '#/components/responses/UnprocessableEntity' },
                },
            },
        },
    },
    tags: [
        { name: 'Zeitpunkte', description: 'CGTA-Zeitpunkt Verwaltung (CG-STD-4100 Kap. 4.2)' },
        { name: 'Relationen', description: 'Allen Interval Algebra (CG-STD-4100 Kap. 4.4)' },
        { name: 'Domains', description: 'CTDDL-Domain-Registry (CG-STD-4100 Kap. 4.3)' },
        { name: 'CGUAS', description: 'Universal Address Space Segments (CG-STD-6100 Teil A)' },
        { name: 'CGFS', description: 'ChronoGrid File System Manifeste (CG-STD-6100 Teil B)' },
        { name: 'System', description: 'Health + OpenAPI' },
    ],
};
