"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/version.ts
function getSdkVersion() {
  if ("1.0.0".length > 0) {
    return "1.0.0";
  }
  return "0.0.0";
}
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
  }
});

// src/transport.ts
async function sendBatch(ingestUrl, apiKey, payload) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    try {
      const response = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "X-Nurbak-SDK-Version": getSdkVersion()
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new HttpStatusError(
          response.status,
          response.statusText,
          parseRetryAfterMs(response.headers.get("retry-after"))
        );
      }
      const maybeJson = await tryParseJson(response);
      if (response.status === 202) {
        const flushIntervalMs = getFlushIntervalMs(maybeJson);
        return typeof flushIntervalMs === "number" ? { flushIntervalMs } : {};
      }
      if (response.status === 200 && typeof maybeJson === "object" && maybeJson !== null && "accepted" in maybeJson) {
        const accepted = maybeJson.accepted;
        if (typeof accepted === "number" && accepted !== payload.events.length) {
          throw new Error(`Only ${accepted} of ${payload.events.length} events were accepted`);
        }
      }
      return {};
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error("Timeout after 5 seconds");
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
  throw lastError instanceof Error ? lastError : new Error("Batch send failed");
}
async function tryParseJson(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}
function shouldRetry(error) {
  if (error instanceof HttpStatusError) {
    return error.status >= 500 && error.status < 600;
  }
  return error instanceof Error && error.message === "Timeout after 5 seconds";
}
function getRetryDelayMs(error, attempt) {
  if (error instanceof HttpStatusError && typeof error.retryAfterMs === "number") {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, error.retryAfterMs));
  }
  const exponential = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(MAX_RETRY_DELAY_MS, exponential + jitter);
}
function parseRetryAfterMs(retryAfterHeader) {
  if (!retryAfterHeader) return void 0;
  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1e3);
  }
  const dateMs = Date.parse(retryAfterHeader);
  if (Number.isNaN(dateMs)) return void 0;
  return Math.max(0, dateMs - Date.now());
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getFlushIntervalMs(maybeJson) {
  if (!maybeJson || typeof maybeJson !== "object") {
    return void 0;
  }
  const raw = maybeJson.flush_interval_ms;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return void 0;
  }
  return Math.floor(raw);
}
var DEFAULT_TIMEOUT, MAX_RETRIES, BASE_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS, HttpStatusError;
var init_transport = __esm({
  "src/transport.ts"() {
    "use strict";
    init_version();
    DEFAULT_TIMEOUT = 5e3;
    MAX_RETRIES = 3;
    BASE_RETRY_DELAY_MS = 400;
    MAX_RETRY_DELAY_MS = 5e3;
    HttpStatusError = class extends Error {
      constructor(status, statusText, retryAfterMs) {
        super(`HTTP ${status}: ${statusText}`);
        this.status = status;
        this.statusText = statusText;
        this.retryAfterMs = retryAfterMs;
        this.name = "HttpStatusError";
      }
    };
  }
});

// src/utils.ts
function getRuntime() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return "edge";
  }
  return "nodejs";
}
function getRegion() {
  return process.env.VERCEL_REGION;
}
function shouldSample(sampleRate) {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}
function normalizePath(path) {
  const segments = path.split("/");
  const normalizedSegments = segments.map((segment) => {
    if (!segment) return segment;
    if (isDynamicIdSegment(segment)) {
      return "[id]";
    }
    return segment;
  });
  return normalizedSegments.join("/");
}
function isDynamicIdSegment(segment) {
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
function getStatusCategory(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  return "5xx";
}
function debugLog(debug, ...args) {
  if (debug) {
    console.log("[nurbak/watch]", ...args);
  }
}
var init_utils = __esm({
  "src/utils.ts"() {
    "use strict";
  }
});

// src/queue.ts
var queue_exports = {};
__export(queue_exports, {
  enqueueEvent: () => enqueueEvent,
  flush: () => flush,
  getQueueSize: () => getQueueSize,
  initQueue: () => initQueue
});
function initQueue(cfg) {
  config = cfg;
  startFlushTimer(cfg.flushInterval);
}
async function enqueueEvent(event) {
  if (!config) return;
  if (eventQueue.length >= 1e3) {
    const discarded = eventQueue.splice(0, eventQueue.length - 999);
    debugLog(config.debug, `Queue full (${eventQueue.length + discarded.length} events). Dropping ${discarded.length} oldest events`);
  }
  eventQueue.push(event);
  debugLog(config.debug, `Event enqueued: ${event.eventType} ${event.path} (${event.durationMs}ms)`);
  debugLog(config.debug, `Current queue: ${eventQueue.length} events`);
  if (eventQueue.length >= config.maxBatchSize) {
    debugLog(config.debug, `Flush triggered by max batch size: ${eventQueue.length} events`);
    await flush();
  }
}
async function flush() {
  if (!config) return;
  if (Date.now() < nextFlushAllowedAt) {
    return;
  }
  if (eventQueue.length === 0) {
    return;
  }
  const eventsToSend = [...eventQueue];
  eventQueue = [];
  if (eventsToSend.length === 0) {
    return;
  }
  const payload = {
    batch_id: createBatchId(),
    sdk_version: getSdkVersion(),
    events: eventsToSend
  };
  debugLog(config.debug, `Flush: ${eventsToSend.length} events -> ${config.ingestUrl}`);
  try {
    const result = await sendBatch(config.ingestUrl, config.apiKey, payload);
    if (typeof result.flushIntervalMs === "number" && result.flushIntervalMs > 0 && result.flushIntervalMs !== config.flushInterval) {
      config.flushInterval = result.flushIntervalMs;
      startFlushTimer(config.flushInterval);
      debugLog(config.debug, `Flush interval updated from server: ${config.flushInterval}ms`);
    }
    nextFlushAllowedAt = 0;
    debugLog(config.debug, `Flush: ${eventsToSend.length} events sent successfully`);
  } catch (error) {
    debugLog(config.debug, "Flush failed:", error instanceof Error ? error.message : error);
    if (error instanceof HttpStatusError && error.status === 429) {
      const waitMs = Math.max(config.flushInterval, 1e3);
      nextFlushAllowedAt = Date.now() + waitMs;
      debugLog(config.debug, `Rate limit received (429). Waiting for next scheduled flush in ${waitMs}ms`);
    }
    eventQueue = [...eventsToSend, ...eventQueue].slice(0, 1e3);
  }
}
function getQueueSize() {
  return eventQueue.length;
}
function createBatchId() {
  return (0, import_crypto.randomUUID)();
}
function startFlushTimer(intervalMs) {
  if (flushTimer) {
    clearInterval(flushTimer);
  }
  flushTimer = setInterval(() => {
    flush().catch(() => {
    });
  }, intervalMs);
}
var import_crypto, eventQueue, flushTimer, config, nextFlushAllowedAt;
var init_queue = __esm({
  "src/queue.ts"() {
    "use strict";
    import_crypto = require("crypto");
    init_transport();
    init_utils();
    init_version();
    eventQueue = [];
    flushTimer = null;
    config = null;
    nextFlushAllowedAt = 0;
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  flush: () => flush2,
  getSdkStatus: () => getSdkStatus,
  initWatch: () => initWatch
});
module.exports = __toCommonJS(index_exports);

// src/init.ts
init_queue();

// src/interceptor.ts
var import_node_http = __toESM(require("http"));
var import_node_https = __toESM(require("https"));
init_queue();
init_utils();

// src/action-resolver.ts
var import_fs = require("fs");
var import_path = require("path");
init_utils();
var actionManifest = null;
async function loadActionManifest(debug) {
  if (actionManifest !== null) {
    return actionManifest;
  }
  const manifest = /* @__PURE__ */ new Map();
  try {
    const manifestPath = (0, import_path.join)(process.cwd(), ".next", "server", "server-reference-manifest.json");
    const raw = (0, import_fs.readFileSync)(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    collectManifestEntries(parsed, manifest);
    debugLog(debug, `Action manifest loaded from filesystem: ${manifest.size} entries`);
  } catch (error) {
    debugLog(debug, "Could not read server-reference-manifest.json, trying injected manifest.", error);
    const injected = globalThis.__NURBAK_ACTION_MANIFEST;
    if (injected && typeof injected === "object") {
      for (const [key, value] of Object.entries(injected)) {
        if (typeof value === "string") {
          manifest.set(key, value);
        }
      }
    }
    debugLog(debug, `Action manifest loaded from memory: ${manifest.size} entries`);
  }
  actionManifest = manifest;
  return actionManifest;
}
async function resolveActionName(actionHash, debug) {
  const manifest = await loadActionManifest(debug);
  return manifest.get(actionHash);
}
function collectManifestEntries(input, target) {
  if (!input || typeof input !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && looksLikeActionHash(key)) {
      target.set(key, value);
      continue;
    }
    if (value && typeof value === "object") {
      const maybeEntry = value;
      if (typeof maybeEntry.id === "string" && typeof maybeEntry.name === "string") {
        target.set(maybeEntry.id, maybeEntry.name);
      }
      if (typeof maybeEntry.name === "string" && looksLikeActionHash(key)) {
        target.set(key, maybeEntry.name);
      }
      collectManifestEntries(value, target);
    }
  }
}
function looksLikeActionHash(value) {
  return /^[a-f0-9]{16,}$/i.test(value);
}

// src/interceptor.ts
var INSTRUMENTED_RESPONSE_SYMBOL = /* @__PURE__ */ Symbol.for("@nurbak/watch/instrumented-response");
var originalFetch;
var isPatched = false;
var config2 = null;
var unpatchHttpServers = null;
function initInterceptor(cfg) {
  config2 = cfg;
  if (isPatched) return;
  installIncomingApiInterceptor(cfg);
  installServerActionInterceptor(cfg);
  isPatched = true;
}
function installServerActionInterceptor(cfg) {
  const runtimeGlobal = globalThis;
  if (typeof runtimeGlobal.fetch !== "function") {
    debugLog(cfg.debug, "Global fetch is not available in this environment. Server Actions interceptor disabled.");
    return;
  }
  originalFetch = runtimeGlobal.fetch;
  runtimeGlobal.fetch = async function interceptedFetch(input, init) {
    const startTime = Date.now();
    const request = input instanceof Request ? input : new Request(input, init);
    const actionHash = request.headers.get("Next-Action");
    const isServerAction = !!actionHash;
    const url = new URL(request.url);
    const path = url.pathname;
    if (!isServerAction) {
      return originalFetch(request, init);
    }
    if (config2?.ignorePaths.some((ignorePath) => path.startsWith(ignorePath))) {
      debugLog(config2.debug, `Ignored path: ${path}`);
      return originalFetch(request, init);
    }
    if (config2 && !shouldSample(config2.sampleRate)) {
      debugLog(config2.debug, `Event skipped by sampling: ${path}`);
      return originalFetch(request, init);
    }
    debugLog(config2?.debug, `Intercepting: ${path} (Server Action)`);
    try {
      const response = await originalFetch(request, init);
      const durationMs = Date.now() - startTime;
      const responseClone = response.clone();
      const event = await buildEvent({
        request,
        response: responseClone,
        startTime,
        durationMs,
        isServerAction,
        path,
        ...actionHash ? { actionHash } : {}
      });
      enqueueEvent(event).catch(() => {
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const event = await buildErrorEvent({
        request,
        error,
        startTime,
        durationMs,
        isServerAction,
        path,
        ...actionHash ? { actionHash } : {}
      });
      enqueueEvent(event).catch(() => {
      });
      throw error;
    }
  };
}
function installIncomingApiInterceptor(cfg) {
  if (getRuntime() !== "nodejs") {
    debugLog(cfg.debug, "Edge runtime detected. API routes HTTP interceptor disabled.");
    return;
  }
  if (unpatchHttpServers) {
    return;
  }
  const patchServerPrototype = (prototype) => {
    const originalEmit = prototype.emit;
    prototype.emit = function patchedEmit(eventName, ...args) {
      if (eventName === "request") {
        const request = args[0];
        const response = args[1];
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
  const unpatchHttp = patchServerPrototype(import_node_http.default.Server.prototype);
  const unpatchHttps = patchServerPrototype(import_node_https.default.Server.prototype);
  unpatchHttpServers = () => {
    unpatchHttps();
    unpatchHttp();
    unpatchHttpServers = null;
  };
  debugLog(cfg.debug, "API routes HTTP interceptor installed");
}
function trackIncomingApiRequest(request, response) {
  if (!config2) {
    return;
  }
  const route = getRoutePath(request.url || "/");
  if (!route.startsWith("/api")) {
    return;
  }
  if (config2.ignorePaths.some((ignorePath) => route.startsWith(ignorePath))) {
    return;
  }
  if (!shouldSample(config2.sampleRate)) {
    return;
  }
  const instrumentedResponse = response;
  if (instrumentedResponse[INSTRUMENTED_RESPONSE_SYMBOL]) {
    return;
  }
  instrumentedResponse[INSTRUMENTED_RESPONSE_SYMBOL] = true;
  const startTime = Date.now();
  const method = request.method || "GET";
  let capturedError;
  let completed = false;
  const rememberError = (error) => {
    if (error instanceof Error) {
      capturedError = error;
      return;
    }
    if (error !== void 0) {
      capturedError = new Error(String(error));
    }
  };
  const finalize = (aborted) => {
    if (completed) {
      return;
    }
    completed = true;
    const statusCode = aborted ? Math.max(response.statusCode || 0, 499) : response.statusCode || 200;
    const responseBytes = parseContentLength(response.getHeader("content-length"));
    const durationMs = Date.now() - startTime;
    const normalizedPath = normalizePath(route);
    const region = getRegion();
    const runtime = getRuntime();
    const errorType = capturedError?.constructor?.name;
    const errorMessage = capturedError?.message?.slice(0, 200);
    const event = {
      eventType: "api_route",
      method,
      path: normalizedPath,
      statusCode,
      statusCategory: getStatusCategory(statusCode),
      responseBytes,
      startedAt: new Date(startTime).toISOString(),
      durationMs,
      runtime,
      ...region ? { region } : {},
      ...errorType ? { errorType } : {},
      ...errorMessage ? { errorMessage } : {}
    };
    enqueueEvent(event).catch(() => {
    });
  };
  request.once("error", rememberError);
  response.once("error", rememberError);
  response.once("finish", () => finalize(false));
  response.once("close", () => {
    if (!response.writableEnded) {
      finalize(true);
    }
  });
}
function getRoutePath(requestUrl) {
  try {
    return new URL(requestUrl, "http://localhost").pathname || "/";
  } catch {
    const [pathname] = requestUrl.split("?");
    return pathname || "/";
  }
}
function parseContentLength(contentLengthHeader) {
  if (typeof contentLengthHeader === "number") {
    return Number.isFinite(contentLengthHeader) ? Math.max(contentLengthHeader, 0) : 0;
  }
  if (typeof contentLengthHeader === "string") {
    const parsed = Number.parseInt(contentLengthHeader, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}
async function buildEvent(params) {
  const { request, response, startTime, durationMs, isServerAction, actionHash, path } = params;
  const body = await response.clone().text();
  const responseBytes = Buffer.byteLength(body, "utf-8");
  let actionName;
  if (isServerAction && actionHash && config2) {
    actionName = await resolveActionName(actionHash, config2.debug);
  }
  const normalizedPath = normalizePath(path);
  const region = getRegion();
  return {
    eventType: isServerAction ? "server_action" : "api_route",
    method: request.method,
    path: normalizedPath,
    statusCode: response.status,
    statusCategory: getStatusCategory(response.status),
    responseBytes,
    startedAt: new Date(startTime).toISOString(),
    durationMs,
    runtime: getRuntime(),
    ...region ? { region } : {},
    ...isServerAction && actionHash ? { actionHash } : {},
    ...actionName ? { actionName } : {}
  };
}
async function buildErrorEvent(params) {
  const { request, error, startTime, durationMs, isServerAction, actionHash, path } = params;
  let actionName;
  if (isServerAction && actionHash && config2) {
    actionName = await resolveActionName(actionHash, config2.debug);
  }
  const normalizedPath = normalizePath(path);
  const errorMessage = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
  const errorType = error instanceof Error ? error.constructor.name : "Error";
  const region = getRegion();
  return {
    eventType: isServerAction ? "server_action" : "api_route",
    method: request.method,
    path: normalizedPath,
    statusCode: 500,
    statusCategory: "5xx",
    responseBytes: 0,
    startedAt: new Date(startTime).toISOString(),
    durationMs,
    runtime: getRuntime(),
    ...region ? { region } : {},
    errorType,
    errorMessage,
    ...isServerAction && actionHash ? { actionHash } : {},
    ...actionName ? { actionName } : {}
  };
}

// src/init.ts
init_utils();
var initialized = false;
var currentConfig = null;
function initWatch(config3) {
  try {
    if (initialized) {
      debugLog(!!config3.debug, "SDK already initialized. Ignoring second call.");
      return;
    }
    if (!validateConfig(config3)) {
      return;
    }
    if (process.env.NEXT_PHASE === "phase-production-build") {
      debugLog(!!config3.debug, "Build time detected - SDK initialization skipped");
      return;
    }
    const isTestEnv = process.env.NODE_ENV === "test";
    const enabledByDefault = !isTestEnv;
    const finalConfig = {
      apiKey: config3.apiKey,
      ingestUrl: config3.ingestUrl || "https://ingestion.nurbak.com",
      enabled: config3.enabled !== void 0 ? config3.enabled : enabledByDefault,
      debug: config3.debug || false,
      sampleRate: config3.sampleRate !== void 0 ? config3.sampleRate : 1,
      ignorePaths: config3.ignorePaths || [],
      flushInterval: config3.flushInterval || 5e3,
      maxBatchSize: config3.maxBatchSize || 100
    };
    if (isTestEnv && config3.enabled === void 0) {
      debugLog(finalConfig.debug, "NODE_ENV=test detected. SDK disabled by default.");
    }
    if (!finalConfig.enabled) {
      debugLog(finalConfig.debug, "SDK disabled by configuration");
      return;
    }
    debugLog(finalConfig.debug, `SDK initialized. Endpoint: ${finalConfig.ingestUrl}`);
    initQueue({
      debug: finalConfig.debug,
      ingestUrl: finalConfig.ingestUrl,
      apiKey: finalConfig.apiKey,
      maxBatchSize: finalConfig.maxBatchSize,
      flushInterval: finalConfig.flushInterval
    });
    initInterceptor({
      debug: finalConfig.debug,
      sampleRate: finalConfig.sampleRate,
      ignorePaths: finalConfig.ignorePaths,
      apiKey: finalConfig.apiKey
    });
    initialized = true;
    currentConfig = finalConfig;
    debugLog(finalConfig.debug, "SDK ready to monitor requests");
  } catch (error) {
    console.warn("[nurbak/watch] Error initializing SDK. SDK disabled.", error);
  }
}
function validateConfig(config3) {
  if (!config3.apiKey) {
    console.warn("[nurbak/watch] Missing apiKey. Use NURBAK_WATCH_KEY_LIVE or NURBAK_WATCH_KEY_TEST. SDK disabled.");
    return false;
  }
  if (config3.sampleRate !== void 0 && (config3.sampleRate < 0 || config3.sampleRate > 1)) {
    console.warn("[nurbak/watch] sampleRate must be between 0 and 1. Using 1.0");
    config3.sampleRate = 1;
  }
  return true;
}
async function flush2() {
  if (!initialized) {
    return;
  }
  const { flush: flushQueue } = await Promise.resolve().then(() => (init_queue(), queue_exports));
  await flushQueue();
}
async function getSdkStatus() {
  const { getQueueSize: getQueueSize2 } = await Promise.resolve().then(() => (init_queue(), queue_exports));
  return {
    initialized,
    queueSize: getQueueSize2(),
    config: currentConfig
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  flush,
  getSdkStatus,
  initWatch
});
//# sourceMappingURL=index.js.map