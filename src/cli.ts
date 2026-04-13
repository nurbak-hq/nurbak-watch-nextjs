/**
 * @nurbak/watch CLI
 *
 * Usage:
 *   npx @nurbak/watch init                     # Interactive setup
 *   npx @nurbak/watch init --key nw_test_xxx   # Non-interactive (for AI assistants)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { createInterface } from "readline"
import { execSync } from "child_process"

// --- Constants ---

const INSTRUMENTATION_CODE = `import { initWatch } from '@nurbak/watch'

export async function register() {
  initWatch({
    apiKey: process.env.NODE_ENV === 'production'
      ? process.env.NURBAK_WATCH_KEY_LIVE!
      : process.env.NURBAK_WATCH_KEY_TEST!,
  })
}
`

const MIDDLEWARE_CODE = `import { withNurbakMiddleware } from '@nurbak/watch'

export default withNurbakMiddleware()

export const config = { matcher: '/api/:path*' }
`

const NEXT_CONFIG_SNIPPET = `// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
}
module.exports = nextConfig`

// --- Helpers ---

function log(symbol: string, msg: string) {
  console.log(`  ${symbol} ${msg}`)
}

function success(msg: string) { log("✓", msg) }
function info(msg: string) { log("→", msg) }
function warn(msg: string) { log("!", msg) }
function error(msg: string) { log("✗", msg) }

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`  ? ${question} `, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// --- Detection ---

interface ProjectInfo {
  isNextJs: boolean
  nextVersion: number | null
  useSrc: boolean
  useTs: boolean
  packageManager: "npm" | "yarn" | "pnpm" | "bun"
}

function detectProject(): ProjectInfo {
  const result: ProjectInfo = {
    isNextJs: false,
    nextVersion: null,
    useSrc: false,
    useTs: false,
    packageManager: "npm",
  }

  // Detect Next.js from package.json
  if (existsSync("package.json")) {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps["next"]) {
      result.isNextJs = true
      const ver = deps["next"].replace(/[\^~>=<]/g, "")
      result.nextVersion = parseInt(ver.split(".")[0], 10) || null
    }
  }

  // Detect src/ directory
  result.useSrc = existsSync("src")

  // Detect TypeScript
  result.useTs = existsSync("tsconfig.json")

  // Detect package manager
  if (existsSync("bun.lockb") || existsSync("bun.lock")) result.packageManager = "bun"
  else if (existsSync("pnpm-lock.yaml")) result.packageManager = "pnpm"
  else if (existsSync("yarn.lock")) result.packageManager = "yarn"

  return result
}

// --- File creation ---

function createInstrumentationFile(project: ProjectInfo): string {
  const ext = project.useTs ? "ts" : "js"
  const dir = project.useSrc ? "src" : "."
  const filePath = join(dir, `instrumentation.${ext}`)

  if (existsSync(filePath)) {
    warn(`${filePath} already exists — skipping (add initWatch manually)`)
    return filePath
  }

  const code = project.useTs
    ? INSTRUMENTATION_CODE
    : INSTRUMENTATION_CODE.replace(/!$/gm, "")  // Remove TS non-null assertions

  writeFileSync(filePath, code)
  success(`Created ${filePath}`)
  return filePath
}

function createMiddlewareFile(project: ProjectInfo): string {
  const ext = project.useTs ? "ts" : "js"
  const dir = project.useSrc ? "src" : "."
  const filePath = join(dir, `middleware.${ext}`)

  if (existsSync(filePath)) {
    warn(`${filePath} already exists — add withNurbakMiddleware manually`)
    return filePath
  }

  writeFileSync(filePath, MIDDLEWARE_CODE)
  success(`Created ${filePath}`)
  return filePath
}

function addEnvVar(key: string, value: string): void {
  const envFile = ".env.local"
  let content = ""

  if (existsSync(envFile)) {
    content = readFileSync(envFile, "utf-8")
    if (content.includes(key)) {
      warn(`${key} already exists in ${envFile} — skipping`)
      return
    }
    if (!content.endsWith("\n")) content += "\n"
  }

  content += `\n# Nurbak Watch\n${key}=${value}\n`
  writeFileSync(envFile, content)
  success(`Added ${key} to ${envFile}`)
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command !== "init") {
    console.log(`
  @nurbak/watch CLI

  Usage:
    npx @nurbak/watch init                     Interactive setup
    npx @nurbak/watch init --key <api-key>     Non-interactive setup

  Options:
    --key <key>    API key (nw_test_* or nw_live_*)
    --help         Show this help
`)
    process.exit(0)
  }

  console.log()
  console.log("  @nurbak/watch — SDK Setup")
  console.log("  ─────────────────────────")
  console.log()

  // Step 1: Detect project
  const project = detectProject()

  if (!project.isNextJs) {
    error("No Next.js project detected (missing 'next' in package.json)")
    info("This SDK currently supports Next.js 13.4+ only")
    process.exit(1)
  }

  success(`Detected Next.js ${project.nextVersion || ""}${project.useTs ? " (TypeScript)" : " (JavaScript)"}${project.useSrc ? " with src/" : ""}`)

  // Step 2: Get API key
  const keyIndex = args.indexOf("--key")
  let apiKey = keyIndex !== -1 ? args[keyIndex + 1] : ""

  if (!apiKey) {
    apiKey = await ask("Enter your API key (from Nurbak Watch dashboard):")
  }

  if (!apiKey) {
    error("API key is required")
    process.exit(1)
  }

  if (!apiKey.startsWith("nw_test_") && !apiKey.startsWith("nw_live_")) {
    warn("API key should start with nw_test_ or nw_live_")
  }

  const isTestKey = apiKey.startsWith("nw_test_")
  const envVarName = isTestKey ? "NURBAK_WATCH_KEY_TEST" : "NURBAK_WATCH_KEY_LIVE"

  // Step 3: Create instrumentation + middleware files
  createInstrumentationFile(project)
  createMiddlewareFile(project)

  // Step 4: Add env var
  addEnvVar(envVarName, apiKey)

  // Step 5: Check Next.js version for instrumentationHook
  if (project.nextVersion && project.nextVersion < 15) {
    console.log()
    warn("Next.js < 15 detected — you need to enable instrumentationHook:")
    console.log()
    console.log(`    ${NEXT_CONFIG_SNIPPET.split("\n").join("\n    ")}`)
    console.log()
  }

  // Step 6: Auto-install
  const installCmd = {
    npm: "npm install @nurbak/watch",
    yarn: "yarn add @nurbak/watch",
    pnpm: "pnpm add @nurbak/watch",
    bun: "bun add @nurbak/watch",
  }[project.packageManager]

  console.log()
  info(`Installing @nurbak/watch...`)
  try {
    execSync(installCmd, { stdio: 'inherit' })
    success(`@nurbak/watch installed`)
  } catch (e) {
    warn(`Install failed — run manually: ${installCmd}`)
  }

  console.log()
  success("Setup complete!")
  console.log()
  info("Start your dev server and navigate your app")
  info("Events will appear in your Nurbak Watch dashboard within 30 seconds")
  console.log()
}

main().catch((err) => {
  error(err.message)
  process.exit(1)
})
