#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_fs = require("fs");
var import_path = require("path");
var import_readline = require("readline");
var INSTRUMENTATION_CODE = `import { initWatch } from '@nurbak/watch'

export async function register() {
  initWatch({
    apiKey: process.env.NODE_ENV === 'production'
      ? process.env.NURBAK_WATCH_KEY_LIVE!
      : process.env.NURBAK_WATCH_KEY_TEST!,
  })
}
`;
var NEXT_CONFIG_SNIPPET = `// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
}
module.exports = nextConfig`;
function log(symbol, msg) {
  console.log(`  ${symbol} ${msg}`);
}
function success(msg) {
  log("\u2713", msg);
}
function info(msg) {
  log("\u2192", msg);
}
function warn(msg) {
  log("!", msg);
}
function error(msg) {
  log("\u2717", msg);
}
function ask(question) {
  const rl = (0, import_readline.createInterface)({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ? ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
function detectProject() {
  const result = {
    isNextJs: false,
    nextVersion: null,
    useSrc: false,
    useTs: false,
    packageManager: "npm"
  };
  if ((0, import_fs.existsSync)("package.json")) {
    const pkg = JSON.parse((0, import_fs.readFileSync)("package.json", "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["next"]) {
      result.isNextJs = true;
      const ver = deps["next"].replace(/[\^~>=<]/g, "");
      result.nextVersion = parseInt(ver.split(".")[0], 10) || null;
    }
  }
  result.useSrc = (0, import_fs.existsSync)("src");
  result.useTs = (0, import_fs.existsSync)("tsconfig.json");
  if ((0, import_fs.existsSync)("bun.lockb") || (0, import_fs.existsSync)("bun.lock")) result.packageManager = "bun";
  else if ((0, import_fs.existsSync)("pnpm-lock.yaml")) result.packageManager = "pnpm";
  else if ((0, import_fs.existsSync)("yarn.lock")) result.packageManager = "yarn";
  return result;
}
function createInstrumentationFile(project) {
  const ext = project.useTs ? "ts" : "js";
  const dir = project.useSrc ? "src" : ".";
  const filePath = (0, import_path.join)(dir, `instrumentation.${ext}`);
  if ((0, import_fs.existsSync)(filePath)) {
    warn(`${filePath} already exists \u2014 skipping (add initWatch manually)`);
    return filePath;
  }
  const code = project.useTs ? INSTRUMENTATION_CODE : INSTRUMENTATION_CODE.replace(/!$/gm, "");
  (0, import_fs.writeFileSync)(filePath, code);
  success(`Created ${filePath}`);
  return filePath;
}
function addEnvVar(key, value) {
  const envFile = ".env.local";
  let content = "";
  if ((0, import_fs.existsSync)(envFile)) {
    content = (0, import_fs.readFileSync)(envFile, "utf-8");
    if (content.includes(key)) {
      warn(`${key} already exists in ${envFile} \u2014 skipping`);
      return;
    }
    if (!content.endsWith("\n")) content += "\n";
  }
  content += `
# Nurbak Watch
${key}=${value}
`;
  (0, import_fs.writeFileSync)(envFile, content);
  success(`Added ${key} to ${envFile}`);
}
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command !== "init") {
    console.log(`
  @nurbak/watch CLI

  Usage:
    npx @nurbak/watch init                     Interactive setup
    npx @nurbak/watch init --key <api-key>     Non-interactive setup

  Options:
    --key <key>    API key (nw_test_* or nw_live_*)
    --help         Show this help
`);
    process.exit(0);
  }
  console.log();
  console.log("  @nurbak/watch \u2014 SDK Setup");
  console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log();
  const project = detectProject();
  if (!project.isNextJs) {
    error("No Next.js project detected (missing 'next' in package.json)");
    info("This SDK currently supports Next.js 13.4+ only");
    process.exit(1);
  }
  success(`Detected Next.js ${project.nextVersion || ""}${project.useTs ? " (TypeScript)" : " (JavaScript)"}${project.useSrc ? " with src/" : ""}`);
  const keyIndex = args.indexOf("--key");
  let apiKey = keyIndex !== -1 ? args[keyIndex + 1] : "";
  if (!apiKey) {
    apiKey = await ask("Enter your API key (from Nurbak Watch dashboard):");
  }
  if (!apiKey) {
    error("API key is required");
    process.exit(1);
  }
  if (!apiKey.startsWith("nw_test_") && !apiKey.startsWith("nw_live_")) {
    warn("API key should start with nw_test_ or nw_live_");
  }
  const isTestKey = apiKey.startsWith("nw_test_");
  const envVarName = isTestKey ? "NURBAK_WATCH_KEY_TEST" : "NURBAK_WATCH_KEY_LIVE";
  createInstrumentationFile(project);
  addEnvVar(envVarName, apiKey);
  if (project.nextVersion && project.nextVersion < 15) {
    console.log();
    warn("Next.js < 15 detected \u2014 you need to enable instrumentationHook:");
    console.log();
    console.log(`    ${NEXT_CONFIG_SNIPPET.split("\n").join("\n    ")}`);
    console.log();
  }
  const installCmd = {
    npm: "npm install @nurbak/watch",
    yarn: "yarn add @nurbak/watch",
    pnpm: "pnpm add @nurbak/watch",
    bun: "bun add @nurbak/watch"
  }[project.packageManager];
  console.log();
  success("Setup complete!");
  console.log();
  info(`Make sure the SDK is installed: ${installCmd}`);
  info("Start your dev server and navigate your app");
  info("Events will appear in your Nurbak Watch dashboard within 30 seconds");
  console.log();
}
main().catch((err) => {
  error(err.message);
  process.exit(1);
});
