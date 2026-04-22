/**
 * cg-api/src/webhooks.ts
 * Webhook-System — CG-STD-4100 v0.7 Kap. 6
 * Sprint 7: Subscription, Delivery, HMAC-Signierung
 *
 * Events: timepoint.created, domain.registered, domain.published,
 *         segment.allocated, file.created, file.tombstoned
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { APIContext } from './handlers.js';
import type { CGRequest, CGResponse } from './middleware.js';
import { jsonResponse, errorResponse } from './middleware.js';

// ── Typen ─────────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'timepoint.created'
  | 'domain.registered'
  | 'domain.published'
  | 'segment.allocated'
  | 'file.created'
  | 'file.tombstoned';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  created_at: bigint;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: WebhookEvent;
  payload: unknown;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  delivered_at?: bigint;
  created_at: bigint;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  created_at: string;
  data: unknown;
}

// ── In-Memory Store (für Tests; PostgreSQL-Variante nutzt schema.sql) ─────────

const _subscriptions = new Map<string, WebhookSubscription>();
const _deliveries: WebhookDelivery[] = [];

// ── HMAC-Signierung (CG-STD-4100 Kap. 6.4) ───────────────────────────────────

/** Erstellt HMAC-SHA256-Signatur für Webhook-Payload */
export function signPayload(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/** Verifiziert HMAC-Signatur */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = signPayload(secret, body);
  // Timing-safe Vergleich
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i]! ^ b[i]!);
    return diff === 0;
  } catch { return false; }
}

// ── Delivery-Engine ───────────────────────────────────────────────────────────

/**
 * Sendet ein Event an alle aktiven passenden Subscriptions.
 * Fire-and-forget: Fehler werden geloggt, nicht geworfen.
 * Retry: bis zu 3 Versuche mit exponentiellem Backoff.
 */
export async function dispatchEvent(event: WebhookEvent, data: unknown): Promise<void> {
  const payload: WebhookPayload = {
    id: randomUUID(), event, created_at: new Date().toISOString(), data,
  };
  const body = JSON.stringify(payload);

  for (const sub of _subscriptions.values()) {
    if (!sub.active || !sub.events.includes(event)) continue;

    const delivery: WebhookDelivery = {
      id: randomUUID(), subscription_id: sub.id, event_type: event,
      payload, status: 'pending', attempts: 0, created_at: BigInt(Date.now()) * 1_000_000n,
    };
    _deliveries.push(delivery);

    // Asynchrone Delivery (nicht-blockierend)
    void deliverWithRetry(sub, body, delivery);
  }
}

async function deliverWithRetry(
  sub: WebhookSubscription,
  body: string,
  delivery: WebhookDelivery,
  maxAttempts = 3,
): Promise<void> {
  const signature = signPayload(sub.secret, body);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    delivery.attempts = attempt;
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChronoGrid-Signature': signature,
          'X-ChronoGrid-Event': delivery.event_type,
          'X-ChronoGrid-Delivery': delivery.id,
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (res.ok) {
        delivery.status = 'delivered';
        delivery.delivered_at = BigInt(Date.now()) * 1_000_000n;
        return;
      }
      console.warn(`[webhook] Delivery ${delivery.id} fehlgeschlagen (HTTP ${res.status}), Versuch ${attempt}/${maxAttempts}`);
    } catch (err) {
      console.warn(`[webhook] Delivery ${delivery.id} Netzwerkfehler:`, err);
    }

    // Exponentieller Backoff: 1s, 2s, 4s
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  delivery.status = 'failed';
}

// ── HTTP Handler ──────────────────────────────────────────────────────────────

export async function postWebhook(req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  try {
    const b = req.body as Record<string, unknown>;
    if (!b['url'] || !b['events']) {
      return jsonResponse(422, { message: 'url und events erforderlich' });
    }
    const events = b['events'] as WebhookEvent[];
    const validEvents: WebhookEvent[] = [
      'timepoint.created','domain.registered','domain.published',
      'segment.allocated','file.created','file.tombstoned',
    ];
    for (const e of events) {
      if (!validEvents.includes(e)) return jsonResponse(422, { message: `Unbekanntes Event: ${e}` });
    }
    const sub: WebhookSubscription = {
      id: randomUUID(), url: b['url'] as string, events,
      secret: (b['secret'] as string) || createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32),
      active: true, created_at: BigInt(Date.now()) * 1_000_000n,
    };
    _subscriptions.set(sub.id, sub);
    return jsonResponse(201, {
      id: sub.id, url: sub.url, events: sub.events, active: sub.active,
      // Secret nur bei Erstellung zurückgeben
      secret: sub.secret,
      created_at: sub.created_at.toString(),
    });
  } catch (e) { return errorResponse(e); }
}

export async function listWebhooks(_req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  const items = [..._subscriptions.values()].map(s => ({
    id: s.id, url: s.url, events: s.events, active: s.active,
    created_at: s.created_at.toString(),
    // Secret wird NICHT zurückgegeben
  }));
  return jsonResponse(200, { items, total: items.length });
}

export async function getWebhookDeliveries(_req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  return jsonResponse(200, {
    items: _deliveries.map(d => ({ ...d, payload: undefined, created_at: d.created_at.toString() })),
    total: _deliveries.length,
  });
}

export async function deleteWebhook(req: CGRequest, _ctx: APIContext): Promise<CGResponse> {
  const sub = _subscriptions.get(req.params['id']!);
  if (!sub) return jsonResponse(404, { message: 'Webhook nicht gefunden' });
  _subscriptions.set(sub.id, { ...sub, active: false });
  return jsonResponse(200, { message: 'Webhook deaktiviert' });
}
