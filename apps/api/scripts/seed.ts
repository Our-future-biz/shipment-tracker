import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { companyTable } from "../services/auth/schemas/company.schema";
import { userTable } from "../services/auth/schemas/user.schema";
import { shipmentTable } from "../services/shipments/schemas/shipment.schema";

const { Pool } = pg;

// Local DB connection strings must be supplied via env (from `encore db conn-uri <db>`).
// No credentials are hardcoded here — this file is committed to git.
const AUTH_URL = requireEnv("AUTH_DB_URL");
const SHIPMENTS_URL = requireEnv("SHIPMENTS_DB_URL");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name} (get it from \`encore db conn-uri <db>\`)`);
    process.exit(1);
  }
  return value;
}

// Seed users are read from SEED_USERS as JSON:
//   [{ "email": "...", "password": "...", "displayName": "...", "role": "admin" }]
// so no real credential is ever committed. Falls back to a single throwaway dev admin.
interface SeedUser {
  email: string;
  password: string;
  displayName: string;
  role: string;
}

function seedUsers(): SeedUser[] {
  const raw = process.env.SEED_USERS;
  if (raw) {
    return JSON.parse(raw) as SeedUser[];
  }
  console.warn("SEED_USERS not set — creating a single dev admin (dev@example.com / changeme).");
  return [{ email: "dev@example.com", password: "changeme", displayName: "Dev Admin", role: "admin" }];
}

// The three platform operators. Superadmins live in the internal "platform" company and
// manage all other companies. Passwords come from SEED_SUPERADMIN_PASSWORD so nothing is
// committed; change them from the UI after first login.
const SUPERADMINS = [
  { email: "martin@ourfuture.biz", displayName: "Martin" },
  { email: "lukas@ourfuture.biz", displayName: "Lukáš" },
  { email: "marek@ourfuture.biz", displayName: "Marek" },
];

async function seed() {
  const authPool = new Pool({ connectionString: AUTH_URL });
  const authDb = drizzle(authPool);

  const shipmentsPool = new Pool({ connectionString: SHIPMENTS_URL });
  const shipmentsDb = drizzle(shipmentsPool);

  // — Platform company + superadmins —
  console.log("Seeding platform company + superadmins...");
  const existingPlatform = await authDb.select().from(companyTable).where(eq(companyTable.slug, "platform")).limit(1);
  const platformId =
    existingPlatform[0]?.id ??
    (await authDb.insert(companyTable).values({ name: "Platform", slug: "platform" }).returning())[0]!.id;

  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!superadminPassword) {
    console.warn("  ! SEED_SUPERADMIN_PASSWORD not set — skipping superadmins. Set it and re-run to create them.");
  } else {
    const superHash = await hash(superadminPassword);
    for (const s of SUPERADMINS) {
      await authDb.insert(userTable).values({
        companyId: platformId,
        email: s.email.toLowerCase().trim(),
        passwordHash: superHash,
        displayName: s.displayName,
        role: "superadmin",
      }).onConflictDoNothing();
      console.log(`  ✓ ${s.email} (superadmin)`);
    }
  }

  console.log("\nSeeding default company...");
  const companyName = process.env.SEED_COMPANY_NAME ?? "Demo Company";
  const companySlug = process.env.SEED_COMPANY_SLUG ?? "demo";
  const existingCompany = await authDb.select().from(companyTable).where(eq(companyTable.slug, companySlug)).limit(1);
  const companyId =
    existingCompany[0]?.id ??
    (await authDb.insert(companyTable).values({ name: companyName, slug: companySlug }).returning())[0]!.id;
  console.log(`  ✓ ${companyName} (${companySlug}) — ${companyId}`);

  console.log("\nSeeding users...");

  for (const u of seedUsers()) {
    const passwordHash = await hash(u.password);
    await authDb.insert(userTable).values({
      companyId,
      email: u.email.toLowerCase().trim(),
      passwordHash,
      displayName: u.displayName,
      role: u.role,
    }).onConflictDoNothing();
    console.log(`  ✓ ${u.email} (${u.role})`);
  }

  console.log("\nSeeding shipments...");

  const shipments = [
    {
      jobNumber: "CZ25000001",
      shipper: "Shanghai Electronics Co.",
      consignee: "Prague Tech s.r.o.",
      pol: "Shanghai",
      pod: "Hamburg",
      destination: "Prague",
      tradeDirection: "Import",
      loadType: "FCL",
      status: "Booked For Further Transport [IMP]",
      customsStatus: "Waiting For Commercial Paperwork",
      vessel: "MSC AURORA",
      voyage: "AE512W",
    },
    {
      jobNumber: "CZ25000002",
      shipper: "CZ Machinery a.s.",
      consignee: "Tokyo Industries Ltd.",
      pol: "Hamburg",
      pod: "Yokohama",
      destination: "Tokyo",
      tradeDirection: "Export",
      loadType: "FCL",
      status: "All Done - Waiting To Be Shipped [EXP]",
      customsStatus: "Customs Cleared/Released",
      vessel: "MAERSK SENTOSA",
      voyage: "MS421E",
    },
    {
      jobNumber: "CZ25000003",
      shipper: "Guangzhou Textiles",
      consignee: "Brno Fashion s.r.o.",
      pol: "Shenzhen",
      pod: "Bremerhaven",
      destination: "Brno",
      tradeDirection: "Import",
      loadType: "LCL",
      status: "Pre-Alert Received - Further Transport To Be Booked [IMP]",
      customsStatus: "Paperwork Verification Pending",
    },
    {
      jobNumber: "CZ25000004",
      shipper: "Ostrava Steel Works",
      consignee: "Dubai Metal Trading LLC",
      pol: "Hamburg",
      pod: "Jebel Ali",
      destination: "Dubai",
      tradeDirection: "Export",
      loadType: "FCL",
      status: "Booking Confirmation Pending [EXP]",
      customsStatus: "Waiting For Commercial Paperwork",
    },
    {
      jobNumber: "CZ25000005",
      shipper: "Ningbo Auto Parts Co.",
      consignee: "Liberec Motors s.r.o.",
      pol: "Ningbo",
      pod: "Hamburg",
      destination: "Liberec",
      tradeDirection: "Import",
      loadType: "FCL",
      status: "Billed [IMP]",
      customsStatus: "Customs Cleared/Released",
      vessel: "COSCO SHIPPING PLANET",
      voyage: "CP801W",
    },
  ];

  for (const s of shipments) {
    await shipmentsDb.insert(shipmentTable).values({ ...s, companyId }).onConflictDoNothing();
    console.log(`  ✓ ${s.jobNumber} — ${s.shipper} → ${s.consignee}`);
  }

  console.log("\nSeed complete!");
  await authPool.end();
  await shipmentsPool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
