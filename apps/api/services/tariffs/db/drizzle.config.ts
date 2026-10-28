import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/tariffs/db/migrations",
  schema: "./services/tariffs/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/tariffs?sslmode=disable",
  },
});
