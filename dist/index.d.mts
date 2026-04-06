interface NurbakWatchConfig {
    apiKey: string;
    ingestUrl?: string;
    enabled?: boolean;
    debug?: boolean;
    sampleRate?: number;
    ignorePaths?: string[];
    flushInterval?: number;
    maxBatchSize?: number;
}
interface ApiCallEvent {
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
interface SdkStatus {
    initialized: boolean;
    queueSize: number;
    config: NurbakWatchConfig | null;
}

declare function initWatch(config: NurbakWatchConfig): void;
declare function flush(): Promise<void>;
declare function getSdkStatus(): Promise<SdkStatus>;

export { type ApiCallEvent, type NurbakWatchConfig, type SdkStatus, flush, getSdkStatus, initWatch };
