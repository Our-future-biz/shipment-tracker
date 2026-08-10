import { SQLDatabase } from "encore.dev/storage/sqldb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as companySchema from "../schemas/company.schema";
import * as userSchema from "../schemas/user.schema";
import * as columnTemplateSchema from "../schemas/columnTemplate.schema";

const { Pool } = pg;

export const DB = new SQLDatabase("auth", {
  migrations: { path: "migrations", source: "drizzle" },
});

const pool = new Pool({
  connectionString: DB.connectionString,
});

export const db = drizzle(pool, { schema: { ...companySchema, ...userSchema, ...columnTemplateSchema } });
