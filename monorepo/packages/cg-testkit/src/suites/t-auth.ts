/**
 * cg-testkit/src/suites/t-auth.ts
 * JWT/RBAC Tests — CG-STD-4100 v0.7 Kap. 7
 * Sprint 8: T-AUTH-001 bis T-AUTH-020
 */

import type { TestCase } from '../runner.js';
import { issueJWT, verifyJWT, hasRole, getRequiredRole, checkAuth, extractBearer, TEST_TOKENS } from 'cg-api/auth.js';
import { Errors } from 'cg-types/errors.js';

export const authTests: TestCase[] = [

  // ── Token-Erzeugung ────────────────────────────────────────────────────────

  { id: 'T-AUTH-001', level: 1, description: 'issueJWT erzeugt 3-teiliges Token',
    run: () => issueJWT('user', 'reader').split('.').length,
    expected: 3 },

  { id: 'T-AUTH-002', level: 1, description: 'issueJWT admin-Token verifizierbar',
    run: () => verifyJWT(issueJWT('admin-test', 'admin')).role,
    expected: 'admin' },

  { id: 'T-AUTH-003', level: 1, description: 'issueJWT writer-Token verifizierbar',
    run: () => verifyJWT(issueJWT('writer-test', 'writer')).role,
    expected: 'writer' },

  { id: 'T-AUTH-004', level: 1, description: 'issueJWT reader-Token verifizierbar',
    run: () => verifyJWT(issueJWT('reader-test', 'reader')).role,
    expected: 'reader' },

  { id: 'T-AUTH-005', level: 1, description: 'verifyJWT gibt korrektes sub zurück',
    run: () => verifyJWT(issueJWT('kurt', 'admin')).sub,
    expected: 'kurt' },

  // ── Token-Verifikation ─────────────────────────────────────────────────────

  { id: 'T-AUTH-006', level: 1, description: 'ungültiges Token → CG-E-012.003',
    run: () => { try { verifyJWT('not.a.token'); return 'no-error'; }
      catch (e) { return (e as { code: string }).code; } },
    expected: 'CG-E-012.003' },

  { id: 'T-AUTH-007', level: 1, description: 'manipuliertes Token → CG-E-012.003',
    run: () => {
      const token = issueJWT('user', 'reader');
      const parts = token.split('.');
      // Payload manipulieren: role reader → admin
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      payload.role = 'admin';
      const fakePayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const fakeToken = `${parts[0]}.${fakePayload}.${parts[2]}`;
      try { verifyJWT(fakeToken); return 'no-error'; }
      catch (e) { return (e as { code: string }).code; }
    },
    expected: 'CG-E-012.003' },

  { id: 'T-AUTH-008', level: 1, description: 'abgelaufenes Token → CG-E-012.004',
    run: () => {
      const token = issueJWT('user', 'reader', -1); // TTL -1s → sofort abgelaufen
      try { verifyJWT(token); return 'no-error'; }
      catch (e) { return (e as { code: string }).code; }
    },
    expected: 'CG-E-012.004' },

  { id: 'T-AUTH-009', level: 2, description: 'leeres Token → CG-E-012.003',
    run: () => { try { verifyJWT(''); return 'no-error'; }
      catch (e) { return (e as { code: string }).code; } },
    expected: 'CG-E-012.003' },

  // ── Rollen-Hierarchie ─────────────────────────────────────────────────────

  { id: 'T-AUTH-010', level: 1, description: 'hasRole: admin >= admin',
    run: () => hasRole('admin', 'admin'),
    expected: true },

  { id: 'T-AUTH-011', level: 1, description: 'hasRole: admin >= writer',
    run: () => hasRole('admin', 'writer'),
    expected: true },

  { id: 'T-AUTH-012', level: 1, description: 'hasRole: admin >= reader',
    run: () => hasRole('admin', 'reader'),
    expected: true },

  { id: 'T-AUTH-013', level: 1, description: 'hasRole: writer >= reader',
    run: () => hasRole('writer', 'reader'),
    expected: true },

  { id: 'T-AUTH-014', level: 1, description: 'hasRole: reader NICHT >= writer',
    run: () => hasRole('reader', 'writer'),
    expected: false },

  { id: 'T-AUTH-015', level: 1, description: 'hasRole: writer NICHT >= admin',
    run: () => hasRole('writer', 'admin'),
    expected: false },

  // ── Route-Anforderungen ───────────────────────────────────────────────────

  { id: 'T-AUTH-016', level: 1, description: 'GET /v1/health ist public',
    run: () => getRequiredRole('GET', '/v1/health'),
    expected: 'public' },

  { id: 'T-AUTH-017', level: 1, description: 'GET /v1/openapi.json ist public',
    run: () => getRequiredRole('GET', '/v1/openapi.json'),
    expected: 'public' },

  { id: 'T-AUTH-018', level: 1, description: 'GET /v1/timepoints erfordert reader',
    run: () => getRequiredRole('GET', '/v1/timepoints'),
    expected: 'reader' },

  { id: 'T-AUTH-019', level: 1, description: 'POST /v1/timepoints erfordert writer',
    run: () => getRequiredRole('POST', '/v1/timepoints'),
    expected: 'writer' },

  { id: 'T-AUTH-020', level: 1, description: 'DELETE /v1/files/:id erfordert writer',
    run: () => getRequiredRole('DELETE', '/v1/files/abc'),
    expected: 'writer' },

  // ── checkAuth ─────────────────────────────────────────────────────────────

  { id: 'T-AUTH-021', level: 2, description: 'checkAuth public ohne Token → authenticated',
    run: () => checkAuth(undefined, 'public').authenticated,
    expected: true },

  { id: 'T-AUTH-022', level: 2, description: 'checkAuth reader ohne Token → nicht authenticated',
    run: () => checkAuth(undefined, 'reader').authenticated,
    expected: false },

  { id: 'T-AUTH-023', level: 2, description: 'checkAuth reader mit gültigem reader-Token → authenticated',
    run: () => checkAuth(`Bearer ${issueJWT('u', 'reader')}`, 'reader').authenticated,
    expected: true },

  { id: 'T-AUTH-024', level: 2, description: 'checkAuth writer mit reader-Token → nicht authenticated (403)',
    run: () => checkAuth(`Bearer ${issueJWT('u', 'reader')}`, 'writer').authenticated,
    expected: false },

  { id: 'T-AUTH-025', level: 2, description: 'checkAuth admin mit admin-Token → authenticated',
    run: () => checkAuth(`Bearer ${issueJWT('u', 'admin')}`, 'admin').authenticated,
    expected: true },

  // ── extractBearer ─────────────────────────────────────────────────────────

  { id: 'T-AUTH-026', level: 2, description: 'extractBearer korrekt',
    run: () => extractBearer('Bearer abc123'),
    expected: 'abc123' },

  { id: 'T-AUTH-027', level: 2, description: 'extractBearer ohne Header → null',
    run: () => extractBearer(undefined),
    expected: null },

  { id: 'T-AUTH-028', level: 2, description: 'extractBearer ohne Bearer-Prefix → null',
    run: () => extractBearer('Basic abc123'),
    expected: null },

  // ── TEST_TOKENS ───────────────────────────────────────────────────────────

  { id: 'T-AUTH-029', level: 2, description: 'TEST_TOKENS.admin() verifizierbar',
    run: () => verifyJWT(TEST_TOKENS.admin()).role,
    expected: 'admin' },

  { id: 'T-AUTH-030', level: 2, description: 'TEST_TOKENS.reader() verifizierbar',
    run: () => verifyJWT(TEST_TOKENS.reader()).role,
    expected: 'reader' },

  // ── Fehlerklasse CG-E-012 ─────────────────────────────────────────────────

  { id: 'T-AUTH-031', level: 2, description: 'CG-E-012.001 HTTP 401 (unauthorized)',
    run: () => Errors.AuthError.unauthorized('t').httpStatus,
    expected: 401 },

  { id: 'T-AUTH-032', level: 2, description: 'CG-E-012.002 HTTP 403 (forbidden)',
    run: () => Errors.AuthError.forbidden('t').httpStatus,
    expected: 403 },

  { id: 'T-AUTH-033', level: 3, description: 'JWT Payload enthält iss=chronogrid',
    run: () => verifyJWT(issueJWT('u', 'reader')).iss,
    expected: 'chronogrid' },

  { id: 'T-AUTH-034', level: 3, description: 'JWT Payload exp > iat',
    run: () => { const p = verifyJWT(issueJWT('u', 'reader')); return (p.exp ?? 0) > (p.iat ?? 0); },
    expected: true },

  { id: 'T-AUTH-035', level: 3, description: 'Verschiedene subs → verschiedene Tokens',
    run: () => issueJWT('alice', 'reader') !== issueJWT('bob', 'reader'),
    expected: true },
];
