import { ApiCallEvent } from "./types";

export function getRuntime(): 'nodejs' | 'edge' {
  // @ts-ignore - Next.js runtime detection
  if (process.env.NEXT_RUNTIME === 'edge') {
    return 'edge';
  }
  return 'nodejs';
}

export function getRegion(): string | undefined {
  // Vercel specific environment variable
  return process.env.VERCEL_REGION;
}

export function shouldSample(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

export function normalizePath(path: string): string {
  const segments = path.split('/');

  const normalizedSegments = segments.map((segment) => {
    if (!segment) return segment;

    if (isDynamicIdSegment(segment)) {
      return '[id]';
    }

    return segment;
  });

  return normalizedSegments.join('/');
}

function isDynamicIdSegment(segment: string): boolean {
  if (/^\d{2,}$/.test(segment)) {
    return true;
  }

  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(segment)) {
    return true;
  }

  if (/^[a-f0-9]{24}$/i.test(segment)) {
    return true;
  }

  if (/^[A-Za-z0-9_-]{16,}$/.test(segment)) {
    return true;
  }

  if (/^[A-Za-z0-9-]{10,}$/.test(segment) && /\d/.test(segment)) {
    return true;
  }

  return false;
}

export function getStatusCategory(statusCode: number): ApiCallEvent['statusCategory'] {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  return '5xx';
}

export function debugLog(debug: boolean, ...args: unknown[]): void {
  if (debug) {
    console.log('[nurbak/watch]', ...args);
  }
}