import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/holidays/db/migrations",
  schema: "./services/holidays/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/holidays?sslmode=disable",
  },
});
