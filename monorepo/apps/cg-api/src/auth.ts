/**
 * cg-api/src/auth.ts
 * JWT/RBAC — CG-STD-4100 v0.7 Kap. 7
 * Sprint 8: HS256 ohne externe Bibliothek (nur node:crypto)
 *
 * Rollen:  admin  > writer  > reader
 * Public:  GET /v1/health, GET /v1/openapi.json, GET /v1/graphql (Playground)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Errors } from 'cg-types/errors.js';

// ── Rollen-Hierarchie (CG-STD-4100 Kap. 7.2) ─────────────────────────────────

export type CGRole = 'admin' | 'writer' | 'reader';

const ROLE_LEVEL: Record<CGRole, number> = { admin: 3, writer: 2, reader: 1 };

export function hasRole(actual: CGRole, required: CGRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

// ── JWT Payload ───────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;
  role: CGRole;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

// ── HS256 Implementierung (RFC 7519) ──────────────────────────────────────────

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}
function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

/** Erzeugt HS256-Signatur für header.payload */
function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Verifiziert HS256-Signatur (timing-safe) */
function verifySignature(data: string, signature: string, secret: string): boolean {
  const expected = sign(data, secret);
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch { return false; }
}

// ── JWT erzeugen ──────────────────────────────────────────────────────────────

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'cg-dev-secret-change-in-production';
const JWT_ISSUER = process.env['JWT_ISSUER'] ?? 'chronogrid';
const JWT_AUDIENCE = process.env['JWT_AUDIENCE'] ?? 'cg-api';
const JWT_TTL_S = 3600; // 1 Stunde

/** Erzeugt ein HS256-JWT für Tests und Entwicklung */
export function issueJWT(sub: string, role: CGRole, ttlSeconds = JWT_TTL_S): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub, role, iss: JWT_ISSUER, aud: JWT_AUDIENCE,
    iat: now, exp: now + ttlSeconds,
  }));
  const signature = sign(`${header}.${payload}`, JWT_SECRET);
  return `${header}.${payload}.${signature}`;
}

/** Verifiziert und dekodiert ein JWT */
export function verifyJWT(token: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw Errors.AuthError.invalidToken('Ungültiges JWT-Format');

  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  // Signatur prüfen
  if (!verifySignature(`${headerB64}.${payloadB64}`, sigB64, JWT_SECRET)) {
    throw Errors.AuthError.invalidToken('JWT-Signatur ungültig');
  }

  // Header prüfen
  let header: Record<string, unknown>;
  try { header = JSON.parse(b64urlDecode(headerB64)); }
  catch { throw Errors.AuthError.invalidToken('JWT-Header nicht parsebar'); }

  if (header['alg'] !== 'HS256') {
    throw Errors.AuthError.invalidToken(`Algorithmus nicht unterstützt: ${header['alg']}`);
  }

  // Payload dekodieren
  let payload: JWTPayload;
  try { payload = JSON.parse(b64urlDecode(payloadB64)); }
  catch { throw Errors.AuthError.invalidToken('JWT-Payload nicht parsebar'); }

  // Ablauf prüfen
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw Errors.AuthError.tokenExpired(`JWT abgelaufen seit ${new Date(payload.exp * 1000).toISOString()}`);
  }

  // Issuer + Audience prüfen (wenn gesetzt)
  if (payload.iss && payload.iss !== JWT_ISSUER) {
    throw Errors.AuthError.invalidToken(`Unbekannter Issuer: ${payload.iss}`);
  }

  // Rolle validieren
  const validRoles: CGRole[] = ['admin', 'writer', 'reader'];
  if (!validRoles.includes(payload.role)) {
    throw Errors.AuthError.invalidToken(`Ungültige Rolle: ${payload.role}`);
  }

  return payload;
}

/** Extrahiert Bearer-Token aus Authorization-Header */
export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]! : null;
}

// ── RBAC Route-Definitionen (CG-STD-4100 Kap. 7.3) ───────────────────────────

export type AuthRequirement = 'public' | 'reader' | 'writer' | 'admin';

/** Gibt die Mindest-Rolle für Method + Path zurück */
export function getRequiredRole(method: string, path: string): AuthRequirement {
  // Public (kein Token nötig)
  if (path === '/v1/health') return 'public';
  if (path === '/v1/openapi.json') return 'public';
  if (path === '/v1/auth/token') return 'public';
  if (method === 'GET' && path === '/v1/graphql') return 'public';

  // Reader: alle GET-Endpunkte
  if (method === 'GET') return 'reader';

  // Lese-POST (Validierung/Berechnung) → reader
  if (path === '/v1/timepoints/validate') return 'reader';
  if (path === '/v1/timepoints/convert')  return 'reader';
  if (path === '/v1/domains/validate')    return 'reader';
  if (path === '/v1/relations/compute')   return 'reader';
  if (method === 'POST' && path === '/v1/graphql') return 'reader';

  // Schreib-POST / DELETE → writer
  if (method === 'DELETE') return 'writer';
  if (method === 'POST') return 'writer';

  return 'reader';
}

// ── Auth-Middleware ───────────────────────────────────────────────────────────

export interface AuthResult {
  authenticated: boolean;
  payload?: JWTPayload;
  error?: string;
}

/**
 * Prüft Authorization-Header gegen required role.
 * Gibt AuthResult zurück – der Aufrufer entscheidet über 401/403.
 */
export function checkAuth(authHeader: string | undefined, required: AuthRequirement): AuthResult {
  if (required === 'public') return { authenticated: true };

  const token = extractBearer(authHeader);
  if (!token) return { authenticated: false, error: 'Authorization: Bearer <token> fehlt' };

  try {
    const payload = verifyJWT(token);
    if (!hasRole(payload.role, required as CGRole)) {
      return { authenticated: false, error: `Rolle '${payload.role}' unzureichend. Benötigt: '${required}'` };
    }
    return { authenticated: true, payload };
  } catch (e) {
    return { authenticated: false, error: e instanceof Error ? e.message : 'Auth-Fehler' };
  }
}

// ── Test-Token-Generator (nur für Entwicklung / T-API-*) ─────────────────────

export const TEST_TOKENS = {
  admin:  () => issueJWT('test-admin',  'admin'),
  writer: () => issueJWT('test-writer', 'writer'),
  reader: () => issueJWT('test-reader', 'reader'),
};
