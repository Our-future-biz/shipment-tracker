import path from "node:path";
import { defineConfig } from "vitest/config";

// Lets tests import "~encore/*" (generated clients, auth) the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "~encore": path.resolve(__dirname, "./encore.gen"),
    },
  },
});
