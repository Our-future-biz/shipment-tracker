import { beforeEach, describe, expect, it, vi } from "vitest";

// shipmentRepository.managersMoneyRows - the jobs the Money tab of Shipments → Managers reads - as
// the statement Postgres gets: the repository runs against a real drizzle over a stand-in for the
// Postgres client that keeps the SQL it is handed and answers with the rows a test gives it. What
// the statement finds in real rows is tests/db/managersMoney.db.test.ts.
const fake = vi.hoisted(() => ({ queries: [] as { text: string; values: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("../../db/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const client = {
    query: async (config: { text: string; values?: unknown[] }, values?: unknown[]) => {
      fake.queries.push({ text: config.text, values: values ?? config.values ?? [] });
      return { rows: fake.rows, rowCount: fake.rows.length, fields: [] };
    },
  };
  return { db: drizzle(client as never) };
});

import { shipmentRepository } from "../../repositories/shipment.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SINCE = "2026-08-20";
const LIMITS = { active: 2001, invoiced: 1001 };

beforeEach(() => {
  fake.queries.length = 0;
  fake.rows = [];
});

/** The one statement a read sent, on one line. */
const sent = () => {
  expect(fake.queries).toHaveLength(1);
  const { text, values } = fake.queries[0]!;
  fake.queries.length = 0;
  return { text: text.replace(/\s+/g, " "), values };
};
/** The columns of each group of the statement, as one text each. */
const groupColumns = (text: string) => [...text.matchAll(/\(select (.+?) from "shipment" where /g)].map((m) => m[1]!);

// What makes a job one of the Money tab's: active as the cockpit reads it, or Invoiced since lately.
const LIVE = (n: number) => `"shipment"."company_id" = $${n} and "shipment"."deleted_at" is null`;
const ACTIVE_JOB = `"shipment"."invoicing_status" IS DISTINCT FROM 'Invoiced' AND "shipment"."status" IS DISTINCT FROM $2`;
const TAX_DATE =
  `CASE WHEN (lower("shipment"."trade_direction") = 'domestic' OR lower("shipment"."department") = $6) THEN "shipment"."actual_delivery_date" ` +
  `WHEN lower("shipment"."trade_direction") = 'export' THEN "shipment"."actual_departure" ELSE "shipment"."actual_arrival" END`;
// Taxed or last changed since then: an old tax date does not hide a job that was invoiced lately, and GREATEST skips a tax date it does not have.
const INVOICED_LATELY = `"shipment"."invoicing_status" = 'Invoiced' AND "shipment"."status" IS DISTINCT FROM $5 AND GREATEST(${TAX_DATE}, ("shipment"."updated_at" AT TIME ZONE 'Europe/Prague')::date) >= $7::date`;
const NEWEST_FIRST = 'order by "shipment"."created_at" desc, "shipment"."id" desc';

describe("the Money tab's read of the jobs", () => {
  it("is one statement: the active jobs and the invoiced ones of late, each group the newest first up to its own limit", async () => {
    await shipmentRepository.managersMoneyRows(COMPANY, SINCE, LIMITS);
    const { text, values } = sent();
    // Each group is cut by itself: two thousand active jobs and more never leave the invoiced ones unread.
    expect(text.startsWith('(select "id", ')).toBe(true);
    expect(text).toContain(`from "shipment" where (${LIVE(1)} and ${ACTIVE_JOB}) ${NEWEST_FIRST} limit $3) union all (select "id", `);
    expect(text).toContain(`from "shipment" where (${LIVE(4)} and (${INVOICED_LATELY})) ${NEWEST_FIRST} limit $8) `);
    // The union the newest first too, by the columns it hands out.
    expect(text.endsWith(') order by "created_at" desc, "id" desc ')).toBe(true);
    expect(values).toEqual([COMPANY, "Cancelled Shipment", LIMITS.active, COMPANY, "Cancelled Shipment", "road department", SINCE, LIMITS.invoiced]);
  });

  it("reads the cockpit's own columns of each job - but the arrival notice, which no money rule reads - with its Invoicing Status and its linked customer, in both groups", async () => {
    await shipmentRepository.managersCockpitRows(COMPANY, 10);
    const cockpit = /^select (.+), EXISTS \( SELECT 1 FROM "shipment_customer_notice" told .+?\) from "shipment" where /.exec(sent().text)?.[1];
    expect(cockpit).toBeDefined();
    await shipmentRepository.managersMoneyRows(COMPANY, SINCE, LIMITS);
    // The one intended difference: whether the customer was sent an arrival notice is a subquery a row, and the Money tab has no use for it.
    // Otherwise column for column the same, in the same order in both groups: a column added to the one read and not the other fails here.
    const money = `${cockpit}, "invoicing_status", "customer_id"`;
    expect(groupColumns(sent().text)).toEqual([money, money]);
  });

  it("hands the rows over by the cockpit's names, with the Invoicing Status and the customer", async () => {
    await shipmentRepository.managersMoneyRows(COMPANY, SINCE, LIMITS);
    const columns = groupColumns(sent().text)[0]!.split(", ");
    const given: Record<string, string> = { '"id"': "shipment-1", '"job_number"': "CZFCL00000001", '"invoicing_status"': "Invoiced", '"customer_id"': "customer-1" };
    fake.rows = [columns.map((column) => given[column] ?? null)];
    const [job] = await shipmentRepository.managersMoneyRows(COMPANY, SINCE, LIMITS);
    expect(job).toMatchObject({ id: "shipment-1", jobNumber: "CZFCL00000001", invoicingStatus: "Invoiced", customerId: "customer-1" });
    expect(job).not.toHaveProperty("arrivalNoticeSent");
  });
});

describe("the invoiced jobs owing a credit", () => {
  it("are read in a group of their own, however long ago invoiced, and never in the lately invoiced group, whose limit is the others'", async () => {
    await shipmentRepository.managersMoneyRows(COMPANY, SINCE, LIMITS, ["owed-1", "owed-2"]);
    const { text, values } = sent();
    // Left out of the lately invoiced group, and read in a third group of their own, up to as many as were asked.
    expect(text).toContain(`>= $7::date) and NOT ("shipment"."id" in ($8, $9)))) ${NEWEST_FIRST} limit $10)) union all (`);
    expect(text).toContain(`"shipment"."status" IS DISTINCT FROM $12 and "shipment"."id" in ($13, $14))) ${NEWEST_FIRST} limit $15)`);
    expect(values).toEqual([COMPANY, "Cancelled Shipment", LIMITS.active, COMPANY, "Cancelled Shipment", "road department", SINCE, "owed-1", "owed-2", LIMITS.invoiced, COMPANY, "Cancelled Shipment", "owed-1", "owed-2", 2]);
  });
});
