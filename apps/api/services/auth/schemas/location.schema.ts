import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

// UN/LOCODE places (UNECE 2025-1), the cities a branch is picked from. Reference data shared by
// all companies, filled by a migration; `id` is the release's Record ID, since one code can carry
// several names.
export const locationTable = pgTable(
  "location",
  {
    id: integer("id").primaryKey(),
    // UN/LOCODE, e.g. "CZPRG".
    code: text("code").notNull(),
    // ISO 3166-1 alpha-2.
    countryCode: text("country_code").notNull(),
    name: text("name").notNull(),
    nameAscii: text("name_ascii").notNull(),
    subdivisionName: text("subdivision_name"),
  },
  (table) => [
    index("location_country_code_idx").on(table.countryCode),
    index("location_code_idx").on(table.code),
    // The pickers search code and name with ILIKE, also mid-name ("% ham%", "%(ham%"):
    // trigram indexes serve those (pg_trgm, created by the migration).
    index("location_code_trgm_idx").using("gin", table.code.op("gin_trgm_ops")),
    index("location_name_ascii_trgm_idx").using("gin", table.nameAscii.op("gin_trgm_ops")),
  ],
);
