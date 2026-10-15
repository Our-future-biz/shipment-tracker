import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/trucking/db/migrations",
  schema: "./services/trucking/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/trucking?sslmode=disable",
  },
});
