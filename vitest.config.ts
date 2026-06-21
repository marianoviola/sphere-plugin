import { defineConfig } from "vitest/config";

// Plain Node environment. The tools depend only on Node built-ins, the MCP SDK,
// and injected dependencies (fs paths, a fetch function), so tests run with no
// transport and no network.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
