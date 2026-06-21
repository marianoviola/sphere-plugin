// Bundle the MCP server into a single Node ESM file for the MCPB bundle.
// All JS dependencies (MCP SDK, zod) are inlined; Node built-ins stay external.
// No native dependencies, no Python. Output: server/index.js.

import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "server/index.js",
  loader: { ".json": "json" },
  // Node ESM needs createRequire for any transitive CJS interop in deps.
  banner: {
    js: [
      "import { createRequire as __sphereCreateRequire } from 'node:module';",
      "const require = __sphereCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
