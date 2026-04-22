/**
 * cg-api/src/middleware.ts
 * JWT-Authentifizierung + RBAC — CG-STD-4100 v0.5 Kap. 7
 * Framework-agnostisch: gibt typed Request-Kontexte zurück.
 * Produktionsimplementierung: RS256/ES256 via jsonwebtoken oder jose.
 */

import { Errors } from 'cg-types/errors.js';
import type { CGError } from 'cg-types/errors.js';

// ── Rollen (CG-STD-4100 Kap. 7.3, normativ) ──────────────────────────────────
export type CGRole = 'reader' | 'contributor' | 'maintainer' | 'tsc' | 'admin';

// Rollenhierarchie: höhere Rollen umfassen alle Rechte niedrigerer Rollen
const ROLE_LEVEL: Record<CGRole, number> = {
  reader: 1, contributor: 2, maintainer: 3, tsc: 4, admin: 5,
};

export function hasRole(actual: CGRole, required: CGRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

// ── JWT-Payload (normativ, Kap. 7.2) ─────────────────────────────────────────
export interface CGJWTPayload {
  iss: string;          // https://auth.chronogrid.org
  sub: string;          // Benutzer- oder Service-ID
  aud: string;          // "chronogrid-api"
  exp: number;          // Unix timestamp (max. 1h ab iat)
  iat: number;          // Ausstellungszeitpunkt
  cg_role: CGRole;
  cg_org?: string;
}

// ── Authentifizierter Request-Kontext ─────────────────────────────────────────
export interface AuthContext {
  sub:     string;
  role:    CGRole;
  org?:    string;
  issuedAt: number;
}

// ── HTTP Request/Response Typen (framework-agnostisch) ────────────────────────
export interface CGRequest {
  method:  string;
  path:    string;
  params:  Record<string, string>;
  query:   Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  body:    unknown;
}

export interface CGResponse {
  status:  number;
  headers: Record<string, string>;
  body:    unknown;
}

// ── Normative Fehler-Response (CG-STD-4100 Kap. 2.4) ─────────────────────────
export function errorResponse(err: CGError | Error, httpStatus?: number): CGResponse {
  const cge = err as CGError;
  const status = httpStatus ?? codeToHttp(cge.code ?? '');
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: {
      error: {
        cg_code:    cge.code    ?? 'CG-E-000.000',
        class:      cge.class   ?? 'UnknownError',
        severity:   cge.severity ?? 'FATAL',
        message:    err.message,
        context:    cge.context,
        cgStd:      cge.cgStd   ?? 'CG-STD-4100-2026 v0.5',
      },
    },
  };
}

// HTTP-Status-Code aus CG-Fehlercode ableiten
function codeToHttp(code: string): number {
  if (!code) return 500;
  const sub = code.split('.')[1];
  // Bekannte Mappings aus CG-STD-2100 Kap. 9
  const map: Record<string, number> = {
    '001': 422, '002': 422, '003': 422, '004': 422, '005': 422,
    '006': 422, '007': 422, '008': 422, '009': 422, '010': 422,
  };
  if (code.startsWith('CG-E-007.001') || code.startsWith('CG-E-005.001')) return 404;
  if (code.startsWith('CG-E-009.001') || code.startsWith('CG-E-002.001')) return 409;
  if (code.startsWith('CG-E-006'))     return 500;
  if (code.startsWith('CG-E-010.001') || code.startsWith('CG-E-010.004') || code.startsWith('CG-E-010.005')) return 400;
  if (code.startsWith('CG-E-010.002') || code.startsWith('CG-E-010.006')) return 404;
  if (code.startsWith('CG-E-010.003') || code.startsWith('CG-E-010.007')) return 500;
  if (code.startsWith('CG-E-011.009')) return 410;
  if (code.startsWith('CG-E-011.008') || code.startsWith('CG-E-011.004')) return 422;
  return 422;
}

// ── JWT-Verifikation (Kap. 7.1) ───────────────────────────────────────────────
// In Produktion: RS256/ES256 via jsonwebtoken. Hier: strukturelle Prüfung.

export function verifyJWT(token: string | undefined): AuthContext {
  if (!token) {
    throw Object.assign(new Error('Authorization Header fehlt (Bearer JWT erforderlich)'), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }

  const bearer = token.startsWith('Bearer ') ? token.slice(7) : token;

  // In Produktion: jose.jwtVerify(bearer, publicKey, { algorithms: ['RS256', 'ES256'] })
  // Für Sprint 4: strukturelle Prüfung (base64url decode des Payload)
  const parts = bearer.split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Ungültiges JWT-Format (3 Teile erwartet)'), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }

  let payload: CGJWTPayload;
  try {
    const padded = parts[1].padEnd(parts[1].length + (4 - parts[1].length % 4) % 4, '=');
    payload = JSON.parse(Buffer.from(padded, 'base64url').toString('utf8')) as CGJWTPayload;
  } catch {
    throw Object.assign(new Error('JWT-Payload konnte nicht dekodiert werden'), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }

  // Normative Claims prüfen (Kap. 7.2)
  if (payload.iss !== 'https://auth.chronogrid.org' &&
      payload.iss !== 'test-issuer') {  // test-issuer für Sprint-4-Tests
    throw Object.assign(new Error(`Ungültiger Issuer: ${payload.iss}`), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }
  if (payload.aud !== 'chronogrid-api') {
    throw Object.assign(new Error(`Ungültige Audience: ${payload.aud}`), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }
  if (Date.now() / 1000 > payload.exp) {
    throw Object.assign(new Error('JWT abgelaufen'), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }

  const validRoles: CGRole[] = ['reader', 'contributor', 'maintainer', 'tsc', 'admin'];
  if (!validRoles.includes(payload.cg_role)) {
    throw Object.assign(new Error(`Ungültige Rolle: ${payload.cg_role}`), {
      code: 'CG-E-000.AUTH', class: 'AuthError', severity: 'FATAL',
      thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5',
    });
  }

  return { sub: payload.sub, role: payload.cg_role, org: payload.cg_org, issuedAt: payload.iat };
}

// ── RBAC-Prüfung ──────────────────────────────────────────────────────────────
export function requireRole(auth: AuthContext, required: CGRole): void {
  if (!hasRole(auth.role, required)) {
    throw Object.assign(
      new Error(`Unzureichende Berechtigung: ${required} erforderlich, ${auth.role} vorhanden`),
      { code: 'CG-E-000.AUTHZ', class: 'AuthzError', severity: 'FATAL',
        thrownBy: 'API', cgStd: 'CG-STD-4100-2026 v0.5' }
    );
  }
}

// ── Standard-Response-Wrapper ──────────────────────────────────────────────────
export function ok(body: unknown, status = 200): CGResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-ChronoGrid-Version': 'CG-STD-4100-2026 v0.5',
    },
    body,
  };
}

// ── Test-JWT erstellen (nur für Sprint 4 Tests) ────────────────────────────────
export function makeTestJWT(role: CGRole, sub = 'test-user', org?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'test-issuer',
    sub, aud: 'chronogrid-api',
    exp: now + 3600, iat: now,
    cg_role: role, cg_org: org,
  })).toString('base64url');
  // Signatur-Platzhalter (in Produktion: echter RSA/EC-Schlüssel)
  const sig = Buffer.from('SPRINT4_TEST_SIGNATURE').toString('base64url');
  return `${header}.${payload}.${sig}`;
}
