import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { companyTable } from "../services/auth/schemas/company.schema";
import { userTable } from "../services/auth/schemas/user.schema";

// Platform-level: create a superadmin (a platform operator who manages all companies).
// Superadmins live in the internal "platform" company, which is created on first run.
// The superadmin role is intentionally NOT assignable through any HTTP endpoint — only here.
//
// Usage:
//   AUTH_DB_URL=... tsx scripts/provision-superadmin.ts <email> <password> ["Name"]

const { Pool } = pg;
const PLATFORM_SLUG = "platform";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name} (get it from \`encore db conn-uri auth\`)`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: tsx scripts/provision-superadmin.ts <email> <password> ["Name"]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: requireEnv("AUTH_DB_URL") });
  const db = drizzle(pool);

  const existing = await db.select().from(companyTable).where(eq(companyTable.slug, PLATFORM_SLUG)).limit(1);
  const platformId =
    existing[0]?.id ??
    (await db.insert(companyTable).values({ name: "Platform", slug: PLATFORM_SLUG }).returning())[0]!.id;

  const passwordHash = await hash(password);
  await db.insert(userTable).values({
    companyId: platformId,
    email: email.toLowerCase().trim(),
    passwordHash,
    displayName: name ?? "Superadmin",
    role: "superadmin",
  });

  console.log(`✓ Superadmin ${email} (platform company ${platformId})`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
