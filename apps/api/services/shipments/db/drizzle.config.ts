import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/shipments/db/migrations",
  schema: "./services/shipments/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/shipments?sslmode=disable",
  },
});
