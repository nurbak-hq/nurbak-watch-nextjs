import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiCallEvent } from './types';
import { enqueueEvent } from './queue';
import { getRuntime, getRegion, normalizePath, getStatusCategory, shouldSample, debugLog } from './utils';
import { resolveActionName } from './action-resolver';

const INSTRUMENTED_RESPONSE_SYMBOL = Symbol.for('@nurbak/watch/instrumented-response');

let originalFetch: typeof fetch;
let isPatched = false;
let config: { debug: boolean; sampleRate: number; ignorePaths: string[]; apiKey: string } | null = null;

type ServerPrototype = { emit: (...args: unknown[]) => boolean };

let unpatchHttpServers: (() => void) | null = null;

interface InterceptedRequest extends Request {
  _nurbakStartTime?: number;
  _nurbakOriginalUrl?: string;
}

export function initInterceptor(cfg: { debug: boolean; sampleRate: number; ignorePaths: string[]; apiKey: string }): void {
  config = cfg;
  
  if (isPatched) return;

  installIncomingApiInterceptor(cfg);
  installServerActionInterceptor(cfg);

  isPatched = true;
}

function installServerActionInterceptor(cfg: { debug: boolean; sampleRate: number; ignorePaths: string[]; apiKey: string }): void {
  const runtimeGlobal = globalThis as typeof globalThis & { fetch?: typeof fetch };
  if (typeof runtimeGlobal.fetch !== 'function') {
    debugLog(cfg.debug, 'Global fetch is not available in this environment. Server Actions interceptor disabled.');
    return;
  }

  originalFetch = runtimeGlobal.fetch;
  
  runtimeGlobal.fetch = async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const startTime = Date.now();
    const request = input instanceof Request ? input : new Request(input, init);
    
    // Detect if this is a Server Action (Next-Action header)
    const actionHash = request.headers.get('Next-Action');
    const isServerAction = !!actionHash;
    
    // Check if this request should be monitored
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Only server actions are tracked via fetch interception.
    if (!isServerAction) {
      return originalFetch(request, init);
    }
    
    // Check ignore paths
    if (config?.ignorePaths.some(ignorePath => path.startsWith(ignorePath))) {
      debugLog(config.debug, `Ignored path: ${path}`);
      return originalFetch(request, init);
    }
    
    // Apply sampling
    if (config && !shouldSample(config.sampleRate)) {
      debugLog(config.debug, `Event skipped by sampling: ${path}`);
      return originalFetch(request, init);
    }
    
    debugLog(config?.debug as boolean, `Intercepting: ${path} (Server Action)`);
    
    try {
      const response = await originalFetch(request, init);
      const durationMs = Date.now() - startTime;
      const responseClone = response.clone();
      
      // Build event asynchronously - don't block response
      const event = await buildEvent({
        request,
        response: responseClone,
        startTime,
        durationMs,
        isServerAction,
        path,
        ...(actionHash ? { actionHash } : {}),
      });
      
      // Enqueue event (fire-and-forget)
      enqueueEvent(event).catch(() => {});
      
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      // Build error event
      const event = await buildErrorEvent({
        request,
        error,
        startTime,
        durationMs,
        isServerAction,
        path,
        ...(actionHash ? { actionHash } : {}),
      });
      
      enqueueEvent(event).catch(() => {});
      
      throw error;
    }
  };
  
}

function installIncomingApiInterceptor(cfg: { debug: boolean; sampleRate: number; ignorePaths: string[]; apiKey: string }): void {
  if (getRuntime() !== 'nodejs') {
    debugLog(cfg.debug, 'Edge runtime detected. API routes HTTP interceptor disabled.');
    return;
  }

  if (unpatchHttpServers) {
    return;
  }

  const patchServerPrototype = (prototype: ServerPrototype): (() => void) => {
    const originalEmit = prototype.emit;

    prototype.emit = function patchedEmit(this: unknown, eventName: unknown, ...args: unknown[]): boolean {
      if (eventName === 'request') {
        const request = args[0] as IncomingMessage | undefined;
        const response = args[1] as ServerResponse | undefined;
        debugLog(true, `[interceptor] http.Server emit('request') url=${request?.url}`);

        if (request && response) {
          trackIncomingApiRequest(request, response);
        }
      }

      return originalEmit.call(this, eventName, ...args);
    };

    return () => {
      prototype.emit = originalEmit;
    };
  };

  const unpatchHttp = patchServerPrototype(http.Server.prototype as ServerPrototype);
  const unpatchHttps = patchServerPrototype(https.Server.prototype as ServerPrototype);

  unpatchHttpServers = () => {
    unpatchHttps();
    unpatchHttp();
    unpatchHttpServers = null;
  };

  debugLog(cfg.debug, 'API routes HTTP interceptor installed');
}

function trackIncomingApiRequest(request: IncomingMessage, response: ServerResponse): void {
  if (!config) {
    debugLog(true, `[interceptor] trackIncomingApiRequest called but no config`);
    return;
  }

  const route = getRoutePath(request.url || '/');
  debugLog(config.debug, `[interceptor] request received: ${request.method} ${route}`);

  if (!route.startsWith('/api')) {
    return;
  }

  if (config.ignorePaths.some((ignorePath) => route.startsWith(ignorePath))) {
    return;
  }

  if (!shouldSample(config.sampleRate)) {
    return;
  }

  const instrumentedResponse = response as ServerResponse & {
    [INSTRUMENTED_RESPONSE_SYMBOL]?: boolean;
  };

  if (instrumentedResponse[INSTRUMENTED_RESPONSE_SYMBOL]) {
    return;
  }

  instrumentedResponse[INSTRUMENTED_RESPONSE_SYMBOL] = true;

  const startTime = Date.now();
  const method = request.method || 'GET';
  let capturedError: Error | undefined;
  let completed = false;

  const rememberError = (error: unknown): void => {
    if (error instanceof Error) {
      capturedError = error;
      return;
    }

    if (error !== undefined) {
      capturedError = new Error(String(error));
    }
  };

  const finalize = (aborted: boolean): void => {
    if (completed) {
      return;
    }

    completed = true;
    debugLog(config?.debug ?? false, `[interceptor] finalize: ${method} ${route} aborted=${aborted} status=${response.statusCode}`);

    const statusCode = aborted ? Math.max(response.statusCode || 0, 499) : response.statusCode || 200;
    const responseBytes = parseContentLength(response.getHeader('content-length'));
    const durationMs = Date.now() - startTime;
    const normalizedPath = normalizePath(route);
    const region = getRegion();
    const runtime = getRuntime();
    const errorType = capturedError?.constructor?.name;
    const errorMessage = capturedError?.message?.slice(0, 200);

    const event: ApiCallEvent = {
      eventType: 'api_route',
      method,
      path: normalizedPath,
      statusCode,
      statusCategory: getStatusCategory(statusCode),
      responseBytes,
      startedAt: new Date(startTime).toISOString(),
      durationMs,
      runtime,
      ...(region ? { region } : {}),
      ...(errorType ? { errorType } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    };

    enqueueEvent(event).catch(() => {});
  };

  request.once('error', rememberError);
  response.once('error', rememberError);
  response.once('finish', () => finalize(false));
  response.once('close', () => {
    if (!response.writableEnded) {
      finalize(true);
    }
  });
}

function getRoutePath(requestUrl: string): string {
  try {
    return new URL(requestUrl, 'http://localhost').pathname || '/';
  } catch {
    const [pathname] = requestUrl.split('?');
    return pathname || '/';
  }
}

function parseContentLength(contentLengthHeader: unknown): number {
  if (typeof contentLengthHeader === 'number') {
    return Number.isFinite(contentLengthHeader) ? Math.max(contentLengthHeader, 0) : 0;
  }

  if (typeof contentLengthHeader === 'string') {
    const parsed = Number.parseInt(contentLengthHeader, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  return 0;
}

async function buildEvent(params: {
  request: Request;
  response: Response;
  startTime: number;
  durationMs: number;
  isServerAction: boolean;
  actionHash?: string;
  path: string;
}): Promise<ApiCallEvent> {
  const { request, response, startTime, durationMs, isServerAction, actionHash, path } = params;


  
  const body = await response.clone().text();
  const responseBytes = Buffer.byteLength(body, 'utf-8');
  
  let actionName: string | undefined;
  if (isServerAction && actionHash && config) {
    actionName = await resolveActionName(actionHash, config.debug);
  }
  
  const normalizedPath = normalizePath(path);
  const region = getRegion();
  
  return {
    eventType: isServerAction ? 'server_action' : 'api_route',
    method: request.method,
    path: normalizedPath,
    statusCode: response.status,
    statusCategory: getStatusCategory(response.status),
    responseBytes,
    startedAt: new Date(startTime).toISOString(),
    durationMs,
    runtime: getRuntime(),
    ...(region ? { region } : {}),
    ...(isServerAction && actionHash ? { actionHash } : {}),
    ...(actionName ? { actionName } : {}),
  };
}

async function buildErrorEvent(params: {
  request: Request;
  error: unknown;
  startTime: number;
  durationMs: number;
  isServerAction: boolean;
  actionHash?: string;
  path: string;
}): Promise<ApiCallEvent> {
  const { request, error, startTime, durationMs, isServerAction, actionHash, path } = params;
  
  let actionName: string | undefined;
  if (isServerAction && actionHash && config) {
    actionName = await resolveActionName(actionHash, config.debug);
  }
  
  const normalizedPath = normalizePath(path);
  const errorMessage = error instanceof Error ? error.message.slice(0, 200) : 'Unknown error';
  const errorType = error instanceof Error ? error.constructor.name : 'Error';
  const region = getRegion();
  
  return {
    eventType: isServerAction ? 'server_action' : 'api_route',
    method: request.method,
    path: normalizedPath,
    statusCode: 500,
    statusCategory: '5xx',
    responseBytes: 0,
    startedAt: new Date(startTime).toISOString(),
    durationMs,
    runtime: getRuntime(),
    ...(region ? { region } : {}),
    errorType,
    errorMessage,
    ...(isServerAction && actionHash ? { actionHash } : {}),
    ...(actionName ? { actionName } : {}),
  };
}