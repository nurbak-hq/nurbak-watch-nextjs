import { NurbakWatchConfig, SdkStatus } from './types';
import { initQueue } from './queue';
import { initInterceptor } from './interceptor';
import { debugLog } from './utils';

let initialized = false;
let currentConfig: NurbakWatchConfig | null = null;

export function initWatch(config: NurbakWatchConfig): void {
  try {
    // Idempotent: if already initialized, do nothing
    if (initialized) {
      debugLog(!!config.debug, 'SDK already initialized. Ignoring second call.');
      return;
    }

    // Validate config
    if (!validateConfig(config)) {
      return;
    }

    // Check if we're in build time
    // @ts-ignore - Next.js build phase detection
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      debugLog(!!config.debug, 'Build time detected - SDK initialization skipped');
      return;
    }

    const isTestEnv = process.env.NODE_ENV === 'test';
    const enabledByDefault = !isTestEnv;

    // Apply defaults
    const finalConfig: Required<NurbakWatchConfig> = {
      apiKey: config.apiKey,
      ingestUrl: config.ingestUrl || 'https://ingestion.nurbak.com',
      enabled: config.enabled !== undefined ? config.enabled : enabledByDefault,
      debug: config.debug || false,
      sampleRate: config.sampleRate !== undefined ? config.sampleRate : 1.0,
      ignorePaths: config.ignorePaths || [],
      flushInterval: config.flushInterval || 5000,
      maxBatchSize: config.maxBatchSize || 100,
    };

    if (isTestEnv && config.enabled === undefined) {
      debugLog(finalConfig.debug, 'NODE_ENV=test detected. SDK disabled by default.');
    }

    // If disabled, don't initialize
    if (!finalConfig.enabled) {
      debugLog(finalConfig.debug, 'SDK disabled by configuration');
      return;
    }

    debugLog(finalConfig.debug, `SDK initialized. Endpoint: ${finalConfig.ingestUrl}`);

    // Initialize queue
    initQueue({
      debug: finalConfig.debug,
      ingestUrl: finalConfig.ingestUrl,
      apiKey: finalConfig.apiKey,
      maxBatchSize: finalConfig.maxBatchSize,
      flushInterval: finalConfig.flushInterval,
    });

    // Initialize fetch interceptor
    initInterceptor({
      debug: finalConfig.debug,
      sampleRate: finalConfig.sampleRate,
      ignorePaths: finalConfig.ignorePaths,
      apiKey: finalConfig.apiKey,
    });

    initialized = true;
    currentConfig = finalConfig;

    debugLog(finalConfig.debug, 'SDK ready to monitor requests');
  } catch (error) {
    console.warn('[nurbak/watch] Error initializing SDK. SDK disabled.', error);
  }
}

function validateConfig(config: NurbakWatchConfig): boolean {
  if (!config.apiKey) {
    console.warn('[nurbak/watch] Missing apiKey. Use NURBAK_WATCH_KEY_LIVE or NURBAK_WATCH_KEY_TEST. SDK disabled.');
    return false;
  }
  
  if (config.sampleRate !== undefined && (config.sampleRate < 0 || config.sampleRate > 1)) {
    console.warn('[nurbak/watch] sampleRate must be between 0 and 1. Using 1.0');
    config.sampleRate = 1;
  }
  
  return true;
}

export async function flush(): Promise<void> {
  if (!initialized) {
    return;
  }
  
  const { flush: flushQueue } = await import('./queue');
  await flushQueue();
}

export async function getSdkStatus(): Promise<SdkStatus> {
  const { getQueueSize } = await import('./queue');

  return {
    initialized,
    queueSize: getQueueSize(),
    config: currentConfig,
  };
}