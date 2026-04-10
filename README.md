# @nurbak/watch

> Next.js API monitoring from inside your server.

[![npm version](https://img.shields.io/npm/v/@nurbak/watch)](https://www.npmjs.com/package/@nurbak/watch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-13%2B-black)](https://nextjs.org)

Nurbak Watch monitors every Next.js API route automatically using the native instrumentation hook — no external pings, no agents, no YAML.

Health checks run inside your server process, catching issues that external monitors miss.

→ Dashboard, docs and early access at https://nurbak.com

## Why Nurbak Watch

External monitors ping your URL from outside. They tell you your server responded. They don't tell you:

- Why /api/checkout is 4x slower than yesterday
- That 3% of /api/users requests are returning 500
- That your database connection pool is exhausted

Nurbak Watch runs inside your Next.js server process using the instrumentation hook, executing real internal health checks on every API route — not synthetic pings.

## Install

npm install @nurbak/watch

## Setup

Add 5 lines to your instrumentation.ts file:

import { initWatch } from '@nurbak/watch'

export function register() {
  initWatch({
    apiKey: process.env.NURBAK_WATCH_KEY,
  })
}

That's it. Every API route is now monitored automatically.

## What you get

- Health checks every 60 seconds from 4 global regions
- P50, P95, P99 latency per route from real execution data
- 4xx/5xx error rate tracking per endpoint
- Instant alerts via Slack, Email, or WhatsApp in under 10 seconds
- Auto-discovery of all API routes — App Router and Pages Router
- Zero dependencies — under 10KB
- Works on Vercel — no agent required

## How it works

Nurbak Watch hooks into the Next.js instrumentation API, which runs inside your server process on startup.

Your Next.js app
└── instrumentation.ts
    └── initWatch()
        ├── Discovers all API routes automatically
        ├── Runs health checks every 60 seconds
        ├── Tracks P50/P95/P99 latency per route
        ├── Monitors 4xx/5xx error rates
        └── Sends alerts in under 10 seconds on failure

Unlike external monitors that send HTTP requests from outside, Nurbak Watch executes real requests inside your server — catching issues with database connections, internal services, and middleware that external pings never see.

## Nurbak Watch vs alternatives

Feature            | Datadog      | New Relic    | Nurbak Watch
-------------------|--------------|--------------|-------------
Setup time         | 30-60 min    | 30-60 min    | 5 min
Lines of code      | 50-100+      | 50-100+      | 5
Monthly cost       | $23+/host    | $25+/host    | Free tier
Works on Vercel    | No           | No           | Yes
Internal execution | No           | No           | Yes
WhatsApp alerts    | No           | No           | Yes
Zero dependencies  | No           | No           | Yes
Auto-discovers routes | Partial   | Partial      | Yes

## Requirements

- Next.js 13.4 or higher (App Router or Pages Router)
- Node.js 18 or higher
- A free Nurbak account at https://nurbak.com

## Get your API key

1. Go to https://watch.nurbak.com
2. Create a free account
3. Add your project
4. Copy your NURBAK_WATCH_KEY
5. Add it to your .env.local file

NURBAK_WATCH_KEY=your_api_key_here

## Early access

Nurbak Watch is currently in beta — free during launch.

- Free tier included
- No credit card required
- Pro plan free for the first 3 months for early adopters
- Locked pricing for life

Reserve your spot at https://nurbak.com

## License

MIT © Nurbak — https://nurbak.com
