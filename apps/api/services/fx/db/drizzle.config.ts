import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./services/fx/db/migrations",
  schema: "./services/fx/schemas/*.schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: "postgresql://wvs8e:local@127.0.0.1:9500/fx?sslmode=disable",
  },
});
