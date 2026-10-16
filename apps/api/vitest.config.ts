import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Lets tests import "~encore/*" (generated clients, auth) the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "~encore": path.resolve(__dirname, "./encore.gen"),
    },
  },
  test: {
    // The warehouse tests talk to the warehouse database, so they only run under `encore test`
    // (set WAREHOUSE_DB_TESTS=1 there). A plain `vitest run` skips them.
    exclude: process.env.WAREHOUSE_DB_TESTS
      ? configDefaults.exclude
      : [...configDefaults.exclude, "services/warehouse/tests/**"],
  },
});
