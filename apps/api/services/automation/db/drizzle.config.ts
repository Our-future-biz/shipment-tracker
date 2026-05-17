import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/automation/db/migrations",
  schema: "./services/automation/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/automation?sslmode=disable",
  },
});
