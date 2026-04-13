import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSendBatch } = vi.hoisted(() => ({
  mockSendBatch: vi.fn().mockResolvedValue({}),
}));

vi.mock('./transport', () => ({
  sendBatch: mockSendBatch,
  HttpStatusError: class HttpStatusError extends Error {
    status: number;
    constructor(status: number, statusText: string) {
      super(`HTTP ${status}: ${statusText}`);
      this.name = 'HttpStatusError';
      this.status = status;
    }
  },
}));

import { initQueue, enqueueEvent, flush, getQueueSize, _resetQueue } from './queue';
import type { ApiCallEvent } from './types';

let eventCounter = 0;

function makeEvent(overrides: Partial<ApiCallEvent> = {}): ApiCallEvent {
  eventCounter++;
  return {
    eventType: 'api_route',
    method: 'GET',
    path: '/api/users',
    statusCode: 200,
    statusCategory: '2xx',
    responseBytes: 42,
    startedAt: new Date(1700000000000 + eventCounter * 1000).toISOString(),
    durationMs: 15,
    runtime: 'nodejs',
    ...overrides,
  };
}

function setup() {
  _resetQueue();
  mockSendBatch.mockClear();
  mockSendBatch.mockResolvedValue({});
  initQueue({
    debug: false,
    ingestUrl: 'https://ingestion.nurbak.com',
    apiKey: 'nw_test_abc123',
    maxBatchSize: 100,
    flushInterval: 999999,
  });
}

describe('queue', () => {
  beforeEach(setup);
  afterEach(() => _resetQueue());

  it('enqueues and flushes an event', async () => {
    await enqueueEvent(makeEvent());

    expect(mockSendBatch).toHaveBeenCalledTimes(1);
    const call = mockSendBatch.mock.calls[0];
    expect(call[0]).toBe('https://ingestion.nurbak.com');
    expect(call[1]).toBe('nw_test_abc123');
    expect(call[2].events).toHaveLength(1);
  });

  it('queue is empty after successful flush', async () => {
    await enqueueEvent(makeEvent());
    expect(getQueueSize()).toBe(0);
  });

  it('re-queues events when flush fails', async () => {
    mockSendBatch.mockRejectedValue(new Error('network error'));
    await enqueueEvent(makeEvent());
    expect(getQueueSize()).toBe(1);
  });

  it('retries on 429 with delay', async () => {
    const { HttpStatusError } = await import('./transport');
    mockSendBatch
      .mockRejectedValueOnce(new HttpStatusError(429, 'Too Many Requests'))
      .mockResolvedValueOnce({});

    await enqueueEvent(makeEvent());

    expect(mockSendBatch).toHaveBeenCalledTimes(2);
    expect(getQueueSize()).toBe(0);
  });

  it('does not flush empty queue', async () => {
    await flush();
    expect(mockSendBatch).not.toHaveBeenCalled();
  });

  it('includes batch_id and sdk_version in payload', async () => {
    await enqueueEvent(makeEvent());

    const payload = mockSendBatch.mock.calls[0][2];
    expect(payload.batch_id).toBeDefined();
    expect(typeof payload.batch_id).toBe('string');
    expect(payload.sdk_version).toBeDefined();
  });
});

describe('deduplication', () => {
  beforeEach(setup);
  afterEach(() => _resetQueue());

  it('deduplicates events with same method+path+startedAt', async () => {
    const timestamp = '2099-01-01T00:00:00.000Z';
    await enqueueEvent(makeEvent({ startedAt: timestamp, path: '/api/dedup1' }));
    await enqueueEvent(makeEvent({ startedAt: timestamp, path: '/api/dedup1' }));

    expect(mockSendBatch).toHaveBeenCalledTimes(1);
    expect(mockSendBatch.mock.calls[0][2].events).toHaveLength(1);
  });

  it('does not deduplicate events with different paths', async () => {
    const timestamp = '2099-01-01T00:00:01.000Z';
    await enqueueEvent(makeEvent({ startedAt: timestamp, path: '/api/aaa' }));
    await enqueueEvent(makeEvent({ startedAt: timestamp, path: '/api/bbb' }));

    expect(mockSendBatch).toHaveBeenCalledTimes(2);
  });

  it('does not deduplicate events with different timestamps', async () => {
    await enqueueEvent(makeEvent({ startedAt: '2099-02-01T00:00:00.000Z', path: '/api/ttt' }));
    await enqueueEvent(makeEvent({ startedAt: '2099-02-01T00:00:01.000Z', path: '/api/ttt' }));

    expect(mockSendBatch).toHaveBeenCalledTimes(2);
  });
});
