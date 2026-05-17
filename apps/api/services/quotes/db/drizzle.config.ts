import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/quotes/db/migrations",
  schema: "./services/quotes/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/quotes?sslmode=disable",
  },
});
