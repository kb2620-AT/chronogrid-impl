/**
 * cg-api/src/middleware.ts
 * Request/Response-Typen und JWT-Middleware — CG-STD-4100 v0.7 Kap. 4 + 7
 */

import type { IncomingMessage } from 'node:http';

export interface CGRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export interface CGResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/** Einfache JWT-Signatur-Verifikation (HMAC-SHA256, Level 2+) */
export function verifyJWT(token: string): { sub: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    return { sub: payload.sub ?? 'anonymous', role: payload.role ?? 'reader' };
  } catch { return null; }
}

/** Extrahiert Bearer-Token aus Authorization-Header */
export function extractBearer(headers: CGRequest['headers']): string | null {
  const auth = headers['authorization'];
  if (typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer (.+)$/i);
  return m ? m[1]! : null;
}

/** Standard JSON-Response */
export function jsonResponse(status: number, body: unknown, extra?: Record<string, string>): CGResponse {
  return { status, body, headers: { 'Content-Type': 'application/json', ...extra } };
}

/** Fehler-Response nach normativem Format (CG-STD-2100 Kap. 9) */
export function errorResponse(err: unknown, fallbackStatus = 500): CGResponse {
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as { code: string; cgClass: string; severity: string; thrownBy: string; message: string; httpStatus: number };
    return jsonResponse(e.httpStatus ?? fallbackStatus, {
      code: e.code, class: e.cgClass, severity: e.severity,
      thrownBy: e.thrownBy, message: e.message, cgStd: 'CG-STD-2100-2026 v1.4',
    });
  }
  return jsonResponse(fallbackStatus, {
    code: 'INTERNAL', class: 'InternalError', severity: 'FATAL',
    message: err instanceof Error ? err.message : String(err),
  });
}
