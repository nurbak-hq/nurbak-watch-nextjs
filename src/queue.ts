import { randomUUID } from 'crypto';
import { HttpStatusError, sendBatch } from './transport';
import { ApiCallEvent, BatchPayload } from './types';
import { debugLog } from './utils';
import { getSdkVersion } from './version';

interface QueueConfig {
  debug: boolean;
  ingestUrl: string;
  apiKey: string;
  maxBatchSize: number;
  flushInterval: number;
}

let eventQueue: ApiCallEvent[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let config: QueueConfig | null = null;
let nextFlushAllowedAt = 0;

export function initQueue(cfg: QueueConfig): void {
  config = cfg;
  startFlushTimer(cfg.flushInterval);
}

export async function enqueueEvent(event: ApiCallEvent): Promise<void> {
  if (!config) return;

  if (eventQueue.length >= 1000) {
    const discarded = eventQueue.splice(0, eventQueue.length - 999);
    debugLog(config.debug, `Queue full (${eventQueue.length + discarded.length} events). Dropping ${discarded.length} oldest events`);
  }
  
  eventQueue.push(event);

  debugLog(config.debug, `Event enqueued: ${event.eventType} ${event.path} (${event.durationMs}ms)`);
  debugLog(config.debug, `Current queue: ${eventQueue.length} events`);

  // Flush immediately after every enqueue. In serverless environments
  // (Vercel, AWS Lambda) the process freezes between invocations so
  // setInterval-based flushing is unreliable. The Lambda rate limiter
  // (min_interval_ms) already prevents flooding. If a flush is
  // rate-limited (nextFlushAllowedAt guard), events stay in the queue
  // and go out on the next request's flush.
  await flush();

}

export async function flush(): Promise<void> {
  if (!config) return;

  if (Date.now() < nextFlushAllowedAt) {
    return;
  }
  
  if (eventQueue.length === 0) {
    return;
  }
  
  // Atomic flush: capture current queue and create new empty array
  const eventsToSend = [...eventQueue];
  eventQueue = [];
  
  if (eventsToSend.length === 0) {
    return;
  }
  
  const payload: BatchPayload = {
    batch_id: createBatchId(),
    sdk_version: getSdkVersion(),
    events: eventsToSend,
  };
  
  debugLog(config.debug, `Flush: ${eventsToSend.length} events -> ${config.ingestUrl}`);
  
  try {
    const result = await sendBatch(config.ingestUrl, config.apiKey, payload);

    if (
      typeof result.flushIntervalMs === 'number' &&
      result.flushIntervalMs > 0 &&
      result.flushIntervalMs !== config.flushInterval
    ) {
      config.flushInterval = result.flushIntervalMs;
      startFlushTimer(config.flushInterval);
      debugLog(config.debug, `Flush interval updated from server: ${config.flushInterval}ms`);
    }

    nextFlushAllowedAt = 0;
    debugLog(config.debug, `Flush: ${eventsToSend.length} events sent successfully`);
  } catch (error) {
    debugLog(config.debug, 'Flush failed:', error instanceof Error ? error.message : error);

    if (error instanceof HttpStatusError && error.status === 429) {
      const waitMs = Math.max(config.flushInterval, 1000);
      nextFlushAllowedAt = Date.now() + waitMs;
      debugLog(config.debug, `Rate limit received (429). Waiting for next scheduled flush in ${waitMs}ms`);
    }

    // Re-queue failed events (at the front) to avoid dropping telemetry.
    eventQueue = [...eventsToSend, ...eventQueue].slice(0, 1000);
  }
}

export function getQueueSize(): number {
  return eventQueue.length;
}

function createBatchId(): string {
  return randomUUID();
}

function startFlushTimer(intervalMs: number): void {
  if (flushTimer) {
    clearInterval(flushTimer);
  }

  flushTimer = setInterval(() => {
    flush().catch(() => {});
  }, intervalMs);
}