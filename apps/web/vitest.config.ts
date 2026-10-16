import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Modules under test may hold JSX (e.g. column definitions): the automatic runtime, as Next uses.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
