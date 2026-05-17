import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/invoicing/db/migrations",
  schema: "./services/invoicing/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/invoicing?sslmode=disable",
  },
});
