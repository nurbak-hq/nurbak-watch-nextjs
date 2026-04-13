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
  
  // Check if we need to flush due to batch size
  if (eventQueue.length >= config.maxBatchSize) {
    debugLog(config.debug, `Flush triggered by max batch size: ${eventQueue.length} events`);
    await flush();
  }
  
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
  
  // In serverless (Vercel, Lambda), re-queuing failed events is useless
  // because the container freezes and the queue is lost. Instead, retry
  // inline with a short delay if we get a 429.
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      return;
    } catch (error) {
      debugLog(config.debug, `Flush attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error);

      if (error instanceof HttpStatusError && error.status === 429) {
        // Wait 1.1s (just above the Lambda min_interval_ms of 1000ms)
        // then retry so the event isn't lost in serverless.
        if (attempt < maxAttempts - 1) {
          debugLog(config.debug, `Rate limited. Retrying in 1.1s (attempt ${attempt + 2}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1100));
          continue;
        }
      }

      // Final attempt failed or non-429 error: re-queue as last resort
      // (helps in long-running servers, lost in serverless — acceptable)
      eventQueue = [...eventsToSend, ...eventQueue].slice(0, 1000);
      debugLog(config.debug, `Flush failed after ${attempt + 1} attempts. ${eventsToSend.length} events re-queued.`);
      return;
    }
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