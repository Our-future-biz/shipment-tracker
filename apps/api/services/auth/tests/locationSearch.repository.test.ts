import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The place search's SQL, run against a stand-in for the database that records what it is asked.
const asked = vi.hoisted(() => ({ queries: [] as unknown[] }));
vi.mock("../db/db", () => ({
  db: {
    execute: async (query: unknown) => {
      asked.queries.push(query);
      return { rows: [] };
    },
  },
}));

import { locationRepository } from "../repositories/orgUnit.repository";

const dialect = new PgDialect();
const lastQuery = () => dialect.sqlToQuery(asked.queries.at(-1) as SQL);

// User council O1 / S10, owner's answer Q3.
describe("locationRepository.search", () => {
  beforeEach(() => {
    asked.queries = [];
  });

  it("by sea lists the seaports first, before the user's picks and the name order", async () => {
    await locationRepository.search("Hamburg", null, 30, { companyId: "c", userId: "u" }, true);
    const { sql } = lastQuery();
    expect(sql).toMatch(/ORDER BY p\.is_seaport DESC, COALESCE\(lp\.picks, 0\) DESC/);
    expect(sql).toContain("subdivision_name, is_seaport FROM location");
  });

  it("everywhere else keeps the order it had and does not read the seaport column", async () => {
    await locationRepository.search("Hamburg", null, 30, { companyId: "c", userId: "u" });
    const { sql } = lastQuery();
    expect(sql).not.toContain("is_seaport");
    expect(sql).toMatch(/ORDER BY\s+COALESCE\(lp\.picks, 0\) DESC/);
  });

  it("names, finds and ranks the carrier codes by their port's name", async () => {
    await locationRepository.search("Shanghai", null, 30, undefined, true);
    const { sql, params } = lastQuery();
    expect(sql).toMatch(/CASE "location"\."code" WHEN \$\d+ THEN \$\d+/);
    expect(sql).toContain(`ELSE "location"."name" END AS name`);
    expect(sql).toContain(`ELSE "location"."name_ascii" END AS name_ascii`);
    // CNSHA's release name starts with "Shanghai" too; CNSWA's ("Jieyang Chaoshan Apt") does not.
    expect(params).toContain("CNSHA");
    await locationRepository.search("Shantou", null, 30, undefined, true);
    expect(lastQuery().params).toContain("CNSWA");
    expect(lastQuery().sql).toMatch(/ OR code IN \(\$\d+\)\)/);
  });

  it("binds the names it shows, never writing them into the SQL (a name such as \"Xi'an\": review of step 3, minor 3)", async () => {
    await locationRepository.search("Shanghai", null, 30, undefined, true);
    const { sql, params } = lastQuery();
    expect(sql).not.toContain("'Shanghai'");
    expect(sql).not.toContain("'CNSHA'");
    // Each shown value right after its code, as a WHEN … THEN pair.
    const at = params.indexOf("CNSHA");
    expect(params[at + 1]).toBe("Shanghai");
  });

  it("says beside a carrier code that it is one, and its port's code (review of step 3, M2)", async () => {
    await locationRepository.search("Shanghai", null, 30, undefined, true);
    const { sql, params } = lastQuery();
    expect(sql).toContain(`ELSE "location"."subdivision_name" END AS subdivision_name`);
    expect(params).toContain("carrier code for Shanghai port CNSGH");
    expect(params).toContain("carrier code for Ningbo port CNNBO");
  });

  it("by air or road keeps the release's names and asks no carrier code by its port's name (mock council S4-2)", async () => {
    await locationRepository.search("Shanghai", null, 30);
    const { sql, params } = lastQuery();
    expect(sql).not.toContain("CASE \"location\".\"code\"");
    expect(sql).toContain("SELECT DISTINCT ON (code) code, country_code, name AS name, name_ascii AS name_ascii, subdivision_name AS subdivision_name FROM location");
    expect(sql).not.toContain("OR code IN");
    expect(params).not.toContain("carrier code for Shanghai port CNSGH");
  });

  it("by sea lists a carrier code before its port's own code (mock council S4-Q1 / R16)", async () => {
    await locationRepository.search("Shanghai", null, 30, { companyId: "c", userId: "u" }, true);
    const { sql, params } = lastQuery();
    expect(sql).toMatch(/ORDER BY p\.is_seaport DESC, CASE WHEN p\.code IN \(\$\d+\) THEN 0 ELSE 1 END, COALESCE\(lp\.picks, 0\) DESC/);
    expect(params.filter((p) => p === "CNSHA").length).toBeGreaterThanOrEqual(2);
  });

  it("asks no carrier code for a text no port name of theirs starts with", async () => {
    await locationRepository.search("Hamburg", null, 30);
    expect(lastQuery().sql).not.toContain("OR code IN");
  });
});
