export interface NurbakWatchConfig {
  apiKey: string;
  ingestUrl?: string;
  enabled?: boolean;
  debug?: boolean;
  sampleRate?: number;
  ignorePaths?: string[];
  flushInterval?: number;
  maxBatchSize?: number;
}

export interface ApiCallEvent {
  eventType: 'api_route' | 'server_action';
  method: string;
  path: string;
  statusCode: number;
  statusCategory: '2xx' | '3xx' | '4xx' | '5xx';
  responseBytes: number;
  startedAt: string;
  durationMs: number;
  runtime: 'nodejs' | 'edge';
  region?: string;
  errorType?: string;
  errorMessage?: string;
  actionHash?: string;
  actionName?: string;
}

export interface BatchPayload {
  batch_id: string;
  sdk_version: string;
  events: ApiCallEvent[];
}

export interface SdkStatus {
  initialized: boolean;
  queueSize: number;
  config: NurbakWatchConfig | null;
}