import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/auth/db/migrations",
  schema: "./services/auth/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/auth?sslmode=disable",
  },
});
