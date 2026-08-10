import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { companyTable } from "../services/auth/schemas/company.schema";
import { userTable } from "../services/auth/schemas/user.schema";

// Platform-level onboarding: create a company + its first admin in one step.
// This has no HTTP surface — it needs direct DB access, which only operators have.
//
// Usage:
//   AUTH_DB_URL=... tsx scripts/provision-company.ts <slug> "<Company Name>" <adminEmail> <adminPassword> ["Admin Name"]
//
// The new admin can then add the rest of that company's users in-app.

const { Pool } = pg;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name} (get it from \`encore db conn-uri auth\`)`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const [slug, name, adminEmail, adminPassword, adminName] = process.argv.slice(2);
  if (!slug || !name || !adminEmail || !adminPassword) {
    console.error('Usage: tsx scripts/provision-company.ts <slug> "<Company Name>" <adminEmail> <adminPassword> ["Admin Name"]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: requireEnv("AUTH_DB_URL") });
  const db = drizzle(pool);

  const existing = await db.select().from(companyTable).where(eq(companyTable.slug, slug)).limit(1);
  if (existing[0]) {
    console.error(`A company with slug "${slug}" already exists (${existing[0].id}).`);
    process.exit(1);
  }

  const [company] = await db.insert(companyTable).values({ name, slug }).returning();
  const passwordHash = await hash(adminPassword);
  await db.insert(userTable).values({
    companyId: company!.id,
    email: adminEmail.toLowerCase().trim(),
    passwordHash,
    displayName: adminName ?? "Admin",
    role: "admin",
  });

  console.log(`✓ Company "${name}" (${slug}) — ${company!.id}`);
  console.log(`✓ Admin ${adminEmail}`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
