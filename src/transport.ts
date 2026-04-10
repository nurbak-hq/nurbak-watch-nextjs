import { BatchPayload } from './types';
import { getSdkVersion } from './version';

const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 5000;

export interface SendBatchResult {
  flushIntervalMs?: number;
}

export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly retryAfterMs?: number
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpStatusError';
  }
}

export async function sendBatch(
  ingestUrl: string,
  apiKey: string,
  payload: BatchPayload
): Promise<SendBatchResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Nurbak-SDK-Version': getSdkVersion(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpStatusError(
          response.status,
          response.statusText,
          parseRetryAfterMs(response.headers.get('retry-after'))
        );
      }

      const maybeJson = await tryParseJson(response);

      // Current ingestion contract responds with 202 Accepted.
      if (response.status === 202) {
        const flushIntervalMs = getFlushIntervalMs(maybeJson);
        return typeof flushIntervalMs === 'number' ? { flushIntervalMs } : {};
      }

      // Backward compatibility for contracts returning 200 + accepted.
      if (
        response.status === 200 &&
        typeof maybeJson === 'object' &&
        maybeJson !== null &&
        'accepted' in maybeJson
      ) {
        const accepted = (maybeJson as { accepted?: unknown }).accepted;
        if (typeof accepted === 'number' && accepted !== payload.events.length) {
          throw new Error(`Only ${accepted} of ${payload.events.length} events were accepted`);
        }
      }

      return {};
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error('Timeout after 5 seconds');
      } else {
        lastError = error;
      }

      if (shouldRetry(lastError) && attempt < MAX_RETRIES) {
        await delay(getRetryDelayMs(lastError, attempt));
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Batch send failed');
}

async function tryParseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof HttpStatusError) {
    return error.status >= 500 && error.status < 600;
  }

  return error instanceof Error && error.message === 'Timeout after 5 seconds';
}

function getRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof HttpStatusError && typeof error.retryAfterMs === 'number') {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, error.retryAfterMs));
  }

  const exponential = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(MAX_RETRY_DELAY_MS, exponential + jitter);
}

function parseRetryAfterMs(retryAfterHeader: string | null): number | undefined {
  if (!retryAfterHeader) return undefined;

  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(dateMs)) return undefined;

  return Math.max(0, dateMs - Date.now());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFlushIntervalMs(maybeJson: unknown): number | undefined {
  if (!maybeJson || typeof maybeJson !== 'object') {
    return undefined;
  }

  const raw = (maybeJson as { flush_interval_ms?: unknown }).flush_interval_ms;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }

  return Math.floor(raw);
}