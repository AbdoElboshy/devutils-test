#!/usr/bin/env node
/**
 * Bundles src/server-ops.ts -> dist/operations.server.mjs for server/api-v1.mjs.
 * Node format, no browser shims. Run via `npm run build:server-ops`;
 * `npm run build` now chains it (see package.json "build" script).
 */
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/server-ops.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  outfile: "dist/operations.server.mjs",
  sourcemap: false,
  logLevel: "info",
});

if (!result || result.errors?.length) process.exit(1);
console.log("dist/operations.server.mjs written.");
