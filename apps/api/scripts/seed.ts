import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { userTable } from "../services/auth/schemas/user.schema";
import { shipmentTable } from "../services/shipments/schemas/shipment.schema";

const { Pool } = pg;

// Encore local DB connection strings (from `encore db conn-uri <db>`)
const AUTH_URL = process.env.AUTH_DB_URL ?? "postgresql://wvs8e:local@127.0.0.1:9500/auth?sslmode=disable";
const SHIPMENTS_URL = process.env.SHIPMENTS_DB_URL ?? "postgresql://wvs8e:local@127.0.0.1:9500/shipments?sslmode=disable";

async function seed() {
  const authPool = new Pool({ connectionString: AUTH_URL });
  const authDb = drizzle(authPool);

  const shipmentsPool = new Pool({ connectionString: SHIPMENTS_URL });
  const shipmentsDb = drizzle(shipmentsPool);

  console.log("Seeding users...");

  const users = [
    { email: "austromar@austromar.com", password: "test", displayName: "Austromar", role: "admin" },
    { email: "lukas@ourfuture.biz", password: "Wjj7AkeRr-ICruJ%zaBuKx", displayName: "Lukáš", role: "admin" },
    { email: "ad@ourfuture.biz", password: "Zt8&hQw3LcY6bF", displayName: "AD", role: "admin" },
    { email: "martin@ourfuture.biz", password: "Rw3&mZp8KxJ5Vn", displayName: "Martin", role: "user" },
    { email: "marek@ourfuture.biz", password: "Vx7#nKq4RwL9Tp", displayName: "Marek", role: "user" },
    { email: "eva@ourfuture.biz", password: "Kx9#vNp4RmW7eJ", displayName: "Eva", role: "user" },
    { email: "monca@ourfuture.biz", password: "Pj7$wNx3KrL8mQ", displayName: "Monca", role: "user" },
  ];

  for (const u of users) {
    const passwordHash = await hash(u.password);
    await authDb.insert(userTable).values({
      email: u.email,
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
    await shipmentsDb.insert(shipmentTable).values(s).onConflictDoNothing();
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
