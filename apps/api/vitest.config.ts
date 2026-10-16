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
    // (set WAREHOUSE_DB_TESTS=1 there). A plain `vitest run` skips them. The same goes for the
    // shipments tests in tests/db (SHIPMENTS_DB_TESTS=1) and the trucking ones (TRUCKING_DB_TESTS=1).
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.WAREHOUSE_DB_TESTS ? [] : ["services/warehouse/tests/**"]),
      ...(process.env.SHIPMENTS_DB_TESTS ? [] : ["services/shipments/tests/db/**"]),
      ...(process.env.TRUCKING_DB_TESTS ? [] : ["services/trucking/tests/db/**"]),
    ],
  },
});
