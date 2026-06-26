// Build step for the MCPB bundle.
//
// 1. Renders the brand icon. assets/sphere-icon.svg is the single source of
//    truth; it is rasterized to assets/icon.png (512x512, transparent) at build
//    time. sharp is a build-only devDependency and is never shipped inside the
//    .mcpb (node_modules/ and scripts/ are excluded by .mcpbignore).
// 2. Bundles the MCP server into a single Node ESM file. All JS dependencies
//    (MCP SDK, zod) are inlined; Node built-ins stay external. No native
//    runtime dependencies, no Python. Output: server/index.js.

import { build } from "esbuild";
import { readFile } from "node:fs/promises";

// Render assets/icon.png from the canonical mark. Graceful: if sharp is not
// installed, packing still works with whatever icon.png is already present.
try {
  const sharp = (await import("sharp")).default;
  const svg = await readFile("assets/sphere-icon.svg");
  await sharp(svg, { density: 384 })
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile("assets/icon.png");
  console.log("assets/icon.png rendered from assets/sphere-icon.svg");
} catch (err) {
  console.warn(
    "icon render skipped (install sharp to regenerate it from the SVG):",
    err.message,
  );
}

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
