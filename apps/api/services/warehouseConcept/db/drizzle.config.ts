import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/warehouseConcept/db/migrations",
  schema: "./services/warehouseConcept/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/warehouse?sslmode=disable",
  },
});
