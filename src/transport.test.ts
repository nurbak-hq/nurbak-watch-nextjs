import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendBatch, HttpStatusError } from './transport';
import type { BatchPayload } from './types';

function makePayload(events = 1): BatchPayload {
  return {
    batch_id: 'test-batch-123',
    sdk_version: '1.0.0',
    events: Array.from({ length: events }, (_, i) => ({
      eventType: 'api_route' as const,
      method: 'GET',
      path: `/api/test/${i}`,
      statusCode: 200,
      statusCategory: '2xx' as const,
      responseBytes: 42,
      startedAt: new Date().toISOString(),
      durationMs: 15,
      runtime: 'nodejs' as const,
    })),
  };
}

describe('sendBatch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a POST request with correct headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 202 }), { status: 202 })
    );

    await sendBatch('https://ingestion.nurbak.com', 'nw_test_key', makePayload());

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://ingestion.nurbak.com');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer nw_test_key',
    });
  });

  it('returns flushIntervalMs from 202 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 202, flush_interval_ms: 10000 }), { status: 202 })
    );

    const result = await sendBatch('https://ingestion.nurbak.com', 'nw_test_key', makePayload());
    expect(result.flushIntervalMs).toBe(10000);
  });

  it('throws HttpStatusError on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    await expect(
      sendBatch('https://ingestion.nurbak.com', 'nw_test_key', makePayload())
    ).rejects.toThrow(HttpStatusError);
  });

  it('retries on 5xx errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('error', { status: 500, statusText: 'Internal Server Error' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 202 }), { status: 202 }));

    const result = await sendBatch('https://ingestion.nurbak.com', 'nw_test_key', makePayload());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toBeDefined();
  });
});

describe('HttpStatusError', () => {
  it('has status and message', () => {
    const err = new HttpStatusError(429, 'Too Many Requests');
    expect(err.status).toBe(429);
    expect(err.message).toBe('HTTP 429: Too Many Requests');
    expect(err.name).toBe('HttpStatusError');
  });

  it('includes retryAfterMs', () => {
    const err = new HttpStatusError(429, 'Too Many Requests', 5000);
    expect(err.retryAfterMs).toBe(5000);
  });
});
