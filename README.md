# @nurbak/watch

> Lightweight monitoring SDK for Next.js API routes and Server Actions.

[![npm version](https://img.shields.io/npm/v/@nurbak/watch)](https://www.npmjs.com/package/@nurbak/watch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-13.4%2B-black)](https://nextjs.org)

Nurbak Watch monitors every Next.js API route and Server Action automatically — no external pings, no agents, no YAML. Health checks run inside your server process, catching issues that external monitors miss.

Dashboard, docs and early access at [nurbak.com](https://nurbak.com)

---

## Table of Contents

- [Why Nurbak Watch](#why-nurbak-watch)
- [Quick Start](#quick-start)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Middleware](#middleware)
- [What Gets Monitored](#what-gets-monitored)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [CLI Reference](#cli-reference)
- [Deployment](#deployment)
- [Comparison](#nurbak-watch-vs-alternatives)
- [Requirements](#requirements)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why Nurbak Watch

External monitors ping your URL from outside. They tell you your server responded. They don't tell you:

- Why `/api/checkout` is 4x slower than yesterday
- That 3% of `/api/users` requests are returning 500
- That your database connection pool is exhausted

Nurbak Watch runs **inside** your Next.js server process, capturing real request data on every API route and Server Action — not synthetic pings.

---

## Quick Start

The fastest way to get started is with the CLI:

```bash
npx @nurbak/watch init
```

The CLI will automatically:

1. Detect your Next.js project (TypeScript/JavaScript, `src/` directory, package manager)
2. Ask for your API key
3. Create `instrumentation.ts` with the SDK initialized
4. Create `middleware.ts` with the monitoring wrapper
5. Add your API key to `.env.local`
6. Install the package

You can also run it non-interactively:

```bash
npx @nurbak/watch init --key nw_test_your_key_here
```

That's it. Start your dev server and events will appear in your dashboard within 30 seconds.

---

## Manual Installation

If you prefer to set things up yourself, follow these steps.

### 1. Install the package

```bash
# npm
npm install @nurbak/watch

# yarn
yarn add @nurbak/watch

# pnpm
pnpm add @nurbak/watch

# bun
bun add @nurbak/watch
```

### 2. Create `instrumentation.ts`

This file hooks into the Next.js instrumentation API and initializes the SDK when your server starts.

**App Router with `src/` directory** — create `src/instrumentation.ts`:

```ts
import { initWatch } from '@nurbak/watch'

export async function register() {
  initWatch({
    apiKey: process.env.NODE_ENV === 'production'
      ? process.env.NURBAK_WATCH_KEY_LIVE!
      : process.env.NURBAK_WATCH_KEY_TEST!,
  })
}
```

**Without `src/` directory** — create `instrumentation.ts` at the project root.

**JavaScript projects** — use the same code in `instrumentation.js` (remove the `!` non-null assertions).

### 3. Create `middleware.ts`

The middleware captures App Router API route requests, including latency, status codes, and response metadata.

**Create `src/middleware.ts`** (or `middleware.ts` at the root if not using `src/`):

```ts
import { withNurbakMiddleware } from '@nurbak/watch'

export default withNurbakMiddleware()

export const config = { matcher: '/api/:path*' }
```

### 4. Add your API key

Add your key to `.env.local`:

```env
# For development
NURBAK_WATCH_KEY_TEST=nw_test_your_key_here

# For production
NURBAK_WATCH_KEY_LIVE=nw_live_your_key_here
```

### 5. Enable instrumentation hook (Next.js < 15 only)

If you're on Next.js 13.4–14.x, enable the experimental instrumentation hook in `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
}
module.exports = nextConfig
```

Next.js 15+ has instrumentation enabled by default — no config change needed.

---

## Configuration

Pass options to `initWatch()` to customize the SDK behavior:

```ts
import { initWatch } from '@nurbak/watch'

export async function register() {
  initWatch({
    // Required
    apiKey: process.env.NURBAK_WATCH_KEY_LIVE!,

    // Optional
    enabled: true,              // Enable/disable the SDK (default: true, false in test env)
    debug: false,               // Log internal SDK activity to console (default: false)
    sampleRate: 1.0,            // Fraction of requests to capture: 0.0 to 1.0 (default: 1.0)
    ignorePaths: ['/api/health'], // Array of path prefixes to exclude from monitoring
    flushInterval: 5000,        // How often to flush the event queue in ms (default: 5000)
    maxBatchSize: 100,          // Max events per batch sent to the ingest API (default: 100)
    ingestUrl: 'https://ingestion.nurbak.com', // Custom ingest endpoint (default: Nurbak cloud)
  })
}
```

### Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | — | **Required.** Your Nurbak Watch API key. |
| `enabled` | `boolean` | `true` | Set to `false` to disable monitoring. Automatically disabled in `NODE_ENV=test`. |
| `debug` | `boolean` | `false` | Enables verbose console logging for troubleshooting. |
| `sampleRate` | `number` | `1.0` | Fraction of requests to monitor (0.0 = none, 1.0 = all). Useful for high-traffic apps. |
| `ignorePaths` | `string[]` | `[]` | Path prefixes to exclude (e.g., `['/api/health', '/api/internal']`). |
| `flushInterval` | `number` | `5000` | Milliseconds between automatic queue flushes. |
| `maxBatchSize` | `number` | `100` | Maximum number of events per batch. |
| `ingestUrl` | `string` | `https://ingestion.nurbak.com` | Override the ingest endpoint (for self-hosted or testing). |

---

## Environment Variables

The SDK reads these environment variables:

| Variable | Description |
|---|---|
| `NURBAK_WATCH_KEY_LIVE` | API key for production. Used when `NODE_ENV=production`. |
| `NURBAK_WATCH_KEY_TEST` | API key for development/staging. Used when `NODE_ENV` is not `production`. |
| `NURBAK_WATCH_KEY` | Fallback API key used if the environment-specific key is not set. |
| `NURBAK_WATCH_DEBUG` | Set to `"true"` to enable debug logging in the middleware layer. |
| `NURBAK_WATCH_INGEST_URL` | Override the default ingest endpoint from the middleware layer. |

**Recommended setup in `.env.local`:**

```env
NURBAK_WATCH_KEY_TEST=nw_test_xxxxxxxxxxxxx
NURBAK_WATCH_KEY_LIVE=nw_live_xxxxxxxxxxxxx
```

---

## Middleware

### Basic usage

If you don't have an existing middleware:

```ts
import { withNurbakMiddleware } from '@nurbak/watch'

export default withNurbakMiddleware()

export const config = { matcher: '/api/:path*' }
```

### Wrapping an existing middleware

If you already have a `middleware.ts`, wrap your existing function:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withNurbakMiddleware } from '@nurbak/watch'

function myMiddleware(request: NextRequest) {
  // Your existing middleware logic
  const response = NextResponse.next()
  response.headers.set('x-custom-header', 'value')
  return response
}

export default withNurbakMiddleware(myMiddleware)

export const config = { matcher: '/api/:path*' }
```

The wrapper passes the request through your middleware first, then captures the response metadata (status, latency, size) and sends it to Nurbak after the response is delivered to the client.

### How the middleware matcher works

The `config.matcher` controls which routes the middleware runs on. We recommend `/api/:path*` to monitor all API routes. You can narrow this if needed:

```ts
export const config = {
  matcher: ['/api/v1/:path*', '/api/v2/:path*']
}
```

Non-API routes that hit the middleware are automatically skipped by Nurbak Watch.

---

## What Gets Monitored

### API Routes (App Router & Pages Router)

Every request to `/api/*` is automatically captured via two mechanisms:

- **Middleware layer** — captures App Router route handlers with `after()` for serverless-safe flushing.
- **HTTP interceptor** — patches `http.Server.emit('request')` to capture Pages Router API routes in Node.js runtime.

### Server Actions

Server Actions are detected via the `Next-Action` HTTP header and captured through a `fetch` interceptor. The SDK resolves action names from Next.js's `server-reference-manifest.json` when available.

### Data captured per event

| Field | Description |
|---|---|
| `method` | HTTP method (GET, POST, PUT, DELETE, etc.) |
| `path` | Normalized route path (dynamic segments replaced with `[id]`) |
| `statusCode` | HTTP status code |
| `statusCategory` | `2xx`, `3xx`, `4xx`, or `5xx` |
| `durationMs` | Request duration in milliseconds |
| `responseBytes` | Response body size in bytes |
| `runtime` | `nodejs` or `edge` |
| `region` | Vercel region (when available via `VERCEL_REGION`) |
| `errorType` | Error class name (on failures) |
| `errorMessage` | Error message, truncated to 200 chars (on failures) |
| `actionHash` | Server Action hash (for Server Actions) |
| `actionName` | Resolved Server Action function name (when manifest is available) |

### Path normalization

Dynamic segments are automatically replaced with `[id]` to group related routes:

- `/api/users/12345` → `/api/users/[id]`
- `/api/orders/550e8400-e29b-41d4-a716-446655440000` → `/api/orders/[id]`
- `/api/posts/abc123def456` → `/api/posts/[id]`

---

## How It Works

```
Your Next.js App
├── instrumentation.ts
│   └── initWatch()
│       ├── Initializes event queue with batching + retry
│       ├── Patches http.Server to capture Pages Router API requests
│       └── Patches global fetch to capture Server Actions
│
└── middleware.ts
    └── withNurbakMiddleware()
        ├── Captures App Router API route requests
        ├── Measures latency and response status
        └── Uses after() to flush events after response is sent
```

**Event lifecycle:**

1. A request hits your API route or Server Action
2. The SDK captures method, path, status, latency, and error info
3. The event is added to an in-memory queue
4. The queue flushes to Nurbak's ingest API every 5 seconds (configurable) or immediately after each event in serverless environments
5. Failed flushes retry up to 3 times with backoff on 429 (rate limit)
6. On Vercel, `after()` and `waitUntil()` ensure flushes complete before the container freezes

---

## API Reference

### `initWatch(config: NurbakWatchConfig): void`

Initializes the SDK. Call this inside `register()` in your `instrumentation.ts`. Idempotent — calling it multiple times has no effect.

```ts
import { initWatch } from '@nurbak/watch'

initWatch({
  apiKey: process.env.NURBAK_WATCH_KEY_LIVE!,
  debug: true,
})
```

### `withNurbakMiddleware(middleware?: MiddlewareFunction)`

Wraps your Next.js middleware to capture API route monitoring data. Returns a new middleware function.

```ts
import { withNurbakMiddleware } from '@nurbak/watch'

// Without existing middleware
export default withNurbakMiddleware()

// With existing middleware
export default withNurbakMiddleware(myMiddleware)
```

### `flush(): Promise<void>`

Manually flushes the event queue. Useful in edge cases where you need to ensure all events are sent before a process exits.

```ts
import { flush } from '@nurbak/watch'

await flush()
```

### `getSdkStatus(): Promise<SdkStatus>`

Returns the current SDK status for debugging.

```ts
import { getSdkStatus } from '@nurbak/watch'

const status = await getSdkStatus()
// { initialized: true, queueSize: 0, config: { ... } }
```

### Types

```ts
interface NurbakWatchConfig {
  apiKey: string
  ingestUrl?: string
  enabled?: boolean
  debug?: boolean
  sampleRate?: number
  ignorePaths?: string[]
  flushInterval?: number
  maxBatchSize?: number
}

interface SdkStatus {
  initialized: boolean
  queueSize: number
  config: NurbakWatchConfig | null
}

interface ApiCallEvent {
  eventType: 'api_route' | 'server_action'
  method: string
  path: string
  statusCode: number
  statusCategory: '2xx' | '3xx' | '4xx' | '5xx'
  responseBytes: number
  startedAt: string
  durationMs: number
  runtime: 'nodejs' | 'edge'
  region?: string
  errorType?: string
  errorMessage?: string
  actionHash?: string
  actionName?: string
}
```

---

## CLI Reference

### `npx @nurbak/watch init`

Interactive setup wizard that detects your project and creates all necessary files.

```bash
npx @nurbak/watch init
```

**What it does:**

1. Detects Next.js version, TypeScript/JavaScript, `src/` directory, and package manager
2. Prompts for your API key
3. Creates `instrumentation.ts` (or `.js`)
4. Creates `middleware.ts` (or `.js`)
5. Adds API key to `.env.local`
6. Warns if `instrumentationHook` needs enabling (Next.js < 15)
7. Installs `@nurbak/watch`

**Non-interactive mode (for CI or AI assistants):**

```bash
npx @nurbak/watch init --key nw_test_xxxxxxxxxxxxx
```

**Options:**

| Flag | Description |
|---|---|
| `--key <key>` | API key (`nw_test_*` or `nw_live_*`). Skips the interactive prompt. |
| `--help` | Show CLI help. |

---

## Deployment

### Vercel

Nurbak Watch is designed to work on Vercel out of the box. The SDK uses `after()` from `next/server` and `waitUntil()` to ensure events are flushed before the serverless container freezes.

No additional configuration is needed. Just set your environment variables in the Vercel dashboard:

```
NURBAK_WATCH_KEY_LIVE=nw_live_xxxxxxxxxxxxx
NURBAK_WATCH_KEY_TEST=nw_test_xxxxxxxxxxxxx
```

### Self-hosted / Docker

The SDK works identically on self-hosted Next.js. The `http.Server` interceptor captures all API route requests in long-running Node.js processes.

### Edge Runtime

The middleware layer (`withNurbakMiddleware`) works in both Node.js and Edge runtimes. The instrumentation interceptor (`initWatch`) runs in the Node.js runtime only.

---

## Nurbak Watch vs Alternatives

| Feature | Datadog | New Relic | Nurbak Watch |
|---|---|---|---|
| Setup time | 30–60 min | 30–60 min | 2 min |
| Lines of code | 50–100+ | 50–100+ | 5 |
| Monthly cost | $23+/host | $25+/host | Free tier |
| Works on Vercel | Limited | Limited | Yes |
| Internal execution | No | No | Yes |
| Server Action monitoring | No | No | Yes |
| WhatsApp alerts | No | No | Yes |
| Zero dependencies | No | No | Yes |
| Auto-discovers routes | Partial | Partial | Yes |
| Package size | Heavy | Heavy | < 10 KB |

---

## Requirements

- **Next.js** 13.4 or higher (App Router, Pages Router, or both)
- **Node.js** 18 or higher
- A free Nurbak account at [nurbak.com](https://nurbak.com)

## Get Your API Key

1. Go to [watch.nurbak.com](https://watch.nurbak.com)
2. Create a free account
3. Add your project
4. Copy your API keys (`nw_test_*` for development, `nw_live_*` for production)
5. Add them to `.env.local`

---

## Troubleshooting

### Events not appearing in the dashboard

1. Enable debug mode to see SDK activity in the console:
   ```ts
   initWatch({ apiKey: '...', debug: true })
   ```
   Or set the environment variable: `NURBAK_WATCH_DEBUG=true`

2. Check that your API key is correctly set and starts with `nw_test_` or `nw_live_`

3. Verify your middleware matcher includes `/api/:path*`

4. On Next.js < 15, ensure `instrumentationHook: true` is set in `next.config.js`

### SDK disabled in test environment

The SDK automatically disables itself when `NODE_ENV=test`. To override this:

```ts
initWatch({ apiKey: '...', enabled: true })
```

### Duplicate events

If you see duplicate events, ensure `initWatch()` is only called once in `instrumentation.ts`. The SDK is idempotent — multiple calls are safe but unnecessary.

---

## Early Access

Nurbak Watch is currently in beta — free during launch.

- Free tier included
- No credit card required
- Pro plan free for the first 3 months for early adopters
- Locked pricing for life

Reserve your spot at [nurbak.com](https://nurbak.com)

---

## License

MIT - [Nurbak](https://nurbak.com)
