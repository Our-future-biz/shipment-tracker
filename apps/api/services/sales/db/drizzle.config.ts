import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/sales/db/migrations",
  schema: "./services/sales/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/sales?sslmode=disable",
  },
});
