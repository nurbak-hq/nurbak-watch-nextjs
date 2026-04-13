import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/server before importing middleware
vi.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    headers: Map<string, string>;
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      this.status = init?.status || 200;
      this.headers = new Map();
    }
    static next() {
      return new MockNextResponse(null, { status: 200 });
    }
    static redirect(url: string | URL) {
      return new MockNextResponse(null, { status: 307 });
    }
  }

  return {
    NextResponse: MockNextResponse,
    after: vi.fn((cb: () => void) => cb()),
  };
});

import { withNurbakMiddleware } from './middleware';
import { after } from 'next/server';

function makeRequest(path: string, method = 'GET') {
  return {
    method,
    nextUrl: { pathname: path },
    headers: new Map(),
  } as any;
}

describe('withNurbakMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up env vars
    process.env.NURBAK_WATCH_KEY_TEST = 'nw_test_abc123';
    process.env.NODE_ENV = 'test';

    // Mock fetch globally
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 202 }), { status: 202 })
    ));
  });

  it('passes through non-API routes without tracking', async () => {
    const handler = withNurbakMiddleware();
    const response = await handler(makeRequest('/about'));

    expect(after).not.toHaveBeenCalled();
  });

  it('tracks /api/* routes', async () => {
    const handler = withNurbakMiddleware();
    await handler(makeRequest('/api/users'));

    expect(after).toHaveBeenCalledTimes(1);
  });

  it('sends event with correct method and path', async () => {
    const handler = withNurbakMiddleware();
    await handler(makeRequest('/api/users', 'POST'));

    // after() was called, which triggers sendEvent, which calls fetch
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.events[0].method).toBe('POST');
    expect(body.events[0].path).toBe('/api/users');
    expect(body.events[0].eventType).toBe('api_route');
  });

  it('normalizes dynamic path segments', async () => {
    const handler = withNurbakMiddleware();
    await handler(makeRequest('/api/users/42'));

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.events[0].path).toBe('/api/users/[id]');
  });

  it('wraps user middleware', async () => {
    const { NextResponse } = await import('next/server');
    const userMiddleware = vi.fn().mockReturnValue(NextResponse.next());

    const handler = withNurbakMiddleware(userMiddleware);
    await handler(makeRequest('/api/users'));

    expect(userMiddleware).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('skips event when no API key', async () => {
    delete process.env.NURBAK_WATCH_KEY_TEST;
    delete process.env.NURBAK_WATCH_KEY;

    const handler = withNurbakMiddleware();
    await handler(makeRequest('/api/users'));

    // after() is called but sendEvent should skip due to no key
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses after() for non-blocking flush', async () => {
    const handler = withNurbakMiddleware();
    await handler(makeRequest('/api/health'));

    // Verify after() was called (not direct fire-and-forget)
    expect(after).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(expect.any(Function));
  });
});
