import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/loadingPlanner/db/migrations",
  schema: "./services/loadingPlanner/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/loadingPlanner?sslmode=disable",
  },
});
