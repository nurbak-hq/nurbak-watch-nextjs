/**
 * Next.js Middleware wrapper for App Router API route monitoring.
 *
 * The http.Server.emit('request') patch does NOT fire for App Router
 * route handlers in Next.js 16 (confirmed via debug logs on Vercel).
 * This middleware provides an alternative capture mechanism.
 *
 * Sends events directly via fetch (not through the shared queue)
 * because middleware and instrumentation.ts run in separate runtimes
 * on Vercel and cannot share in-memory state.
 *
 * Usage:
 *   // middleware.ts
 *   import { withNurbakMiddleware } from '@nurbak/watch';
 *   export default withNurbakMiddleware();
 *   export const config = { matcher: '/api/:path*' };
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

interface MiddlewareEvent {
  eventType: 'api_route';
  method: string;
  path: string;
  statusCode: number;
  statusCategory: '2xx' | '3xx' | '4xx' | '5xx';
  responseBytes: number;
  startedAt: string;
  durationMs: number;
  runtime: 'nodejs' | 'edge';
  region?: string;
}

type MiddlewareFunction = (request: NextRequest) => NextResponse | Response | Promise<NextResponse | Response>;

function getStatusCategory(status: number): MiddlewareEvent['statusCategory'] {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  return '5xx';
}

function normalizePath(path: string): string {
  return path.split('/').map(segment => {
    if (!segment) return segment;
    if (/^\d{2,}$/.test(segment)) return '[id]';
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(segment)) return '[id]';
    if (/^[a-f0-9]{24}$/i.test(segment)) return '[id]';
    if (/^[A-Za-z0-9_-]{16,}$/.test(segment)) return '[id]';
    if (/^[A-Za-z0-9-]{10,}$/.test(segment) && /\d/.test(segment)) return '[id]';
    return segment;
  }).join('/');
}

function getRuntime(): 'nodejs' | 'edge' {
  try {
    if (process.env.NEXT_RUNTIME === 'edge') return 'edge';
  } catch {}
  return 'nodejs';
}

function getApiKey(): string | undefined {
  try {
    const env = process.env;
    if (env.NODE_ENV === 'production') {
      return env.NURBAK_WATCH_KEY_LIVE || env.NURBAK_WATCH_KEY;
    }
    return env.NURBAK_WATCH_KEY_TEST || env.NURBAK_WATCH_KEY;
  } catch {
    return undefined;
  }
}

function getIngestUrl(): string {
  try {
    return process.env.NURBAK_WATCH_INGEST_URL || 'https://ingestion.nurbak.com';
  } catch {
    return 'https://ingestion.nurbak.com';
  }
}

function isDebug(): boolean {
  try {
    return process.env.NURBAK_WATCH_DEBUG === 'true';
  } catch {
    return false;
  }
}

function log(...args: unknown[]): void {
  if (isDebug()) {
    console.log('[nurbak/watch]', ...args);
  }
}

async function sendEvent(event: MiddlewareEvent): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    log('No API key found — skipping event');
    return;
  }

  const ingestUrl = getIngestUrl();
  const payload = {
    batch_id: crypto.randomUUID(),
    sdk_version: '0.0.0', // injected at build time
    events: [event],
  };

  try {
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Nurbak-SDK-Version': payload.sdk_version,
      },
      body: JSON.stringify(payload),
    });

    log(`Event sent: ${event.method} ${event.path} (${event.durationMs}ms) → ${response.status}`);
  } catch (error) {
    log('Event send failed:', error instanceof Error ? error.message : error);
  }
}

export function withNurbakMiddleware(middleware?: MiddlewareFunction) {
  return async function nurbakMiddleware(request: NextRequest): Promise<NextResponse | Response> {
    const path = request.nextUrl.pathname;

    // Skip non-API routes
    if (!path.startsWith('/api')) {
      return middleware
        ? middleware(request)
        : NextResponse.next();
    }

    const startTime = Date.now();

    // Run user's middleware or pass through
    const response = middleware
      ? await middleware(request)
      : NextResponse.next();

    const durationMs = Date.now() - startTime;

    const event: MiddlewareEvent = {
      eventType: 'api_route',
      method: request.method,
      path: normalizePath(path),
      statusCode: response.status,
      statusCategory: getStatusCategory(response.status),
      responseBytes: 0,
      startedAt: new Date(startTime).toISOString(),
      durationMs,
      runtime: getRuntime(),
      ...(process.env.VERCEL_REGION ? { region: process.env.VERCEL_REGION } : {}),
    };

    // Fire and forget — never block the response
    sendEvent(event).catch(() => {});

    return response;
  };
}
