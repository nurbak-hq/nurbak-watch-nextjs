/// <reference types="node" />

import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node18',
    external: ['next'],
    splitting: false,
    define: {
      __SDK_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    banner: { js: "#!/usr/bin/env node" },
  },
]
);