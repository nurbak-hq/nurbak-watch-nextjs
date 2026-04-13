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

  // Flush immediately after every enqueue for serverless compatibility
  // (setInterval does not fire reliably on Vercel/Lambda)
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

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      return; // success — exit
    } catch (error) {
      debugLog(config.debug, `Flush attempt ${attempt}/${maxAttempts} failed:`, error instanceof Error ? error.message : error);

      if (error instanceof HttpStatusError && error.status === 429 && attempt < maxAttempts) {
        debugLog(config.debug, `Rate limited (429). Retrying in 1100ms...`);
        await new Promise(resolve => setTimeout(resolve, 1100));
        continue;
      }

      if (attempt === maxAttempts) {
        // Re-queue failed events only after all attempts exhausted
        eventQueue = [...eventsToSend, ...eventQueue].slice(0, 1000);
        debugLog(config.debug, `All ${maxAttempts} attempts failed. ${eventsToSend.length} events re-queued.`);
      }
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