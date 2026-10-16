import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The statements behind job and MCZ numbers, as Postgres gets them. What they do to real rows -
// ten creates at once getting ten numbers - is checked against the database in
// tests/db/shipmentRefCounter.db.test.ts.
vi.mock("../../db/db", () => ({ db: {} }));

import { allocateSql, formatRef, peekSql, storedMaxSql } from "../../repositories/shipmentRefCounter.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const dialect = new PgDialect();
const sent = (piece: SQL) => dialect.sqlToQuery(piece);
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

describe("formatRef", () => {
  it("keeps the job-number and MCZ formats: the prefix and eight digits", () => {
    expect(formatRef("CZ", 123)).toBe("CZ00000123");
    expect(formatRef("MCZ", 45)).toBe("MCZ00000045");
  });
});

describe("storedMaxSql", () => {
  it("reads the highest CZ number of the company over all its shipments, archived ones too - CZQ… and other text count as none", () => {
    const { sql, params } = sent(storedMaxSql(COMPANY, "CZ"));
    expect(flat(sql)).toBe(
      `(SELECT coalesce(max(substring("shipment"."job_number" from '^CZ([0-9]{1,12})([^0-9]|$)')::bigint), 0) FROM "shipment" WHERE "shipment"."company_id" = $1 AND "shipment"."job_number" LIKE 'CZ%')`,
    );
    expect(sql).not.toContain("deleted_at");
    expect(params).toEqual([COMPANY]);
  });

  it("counts at most twelve digits, so a long number typed by hand cannot overflow bigint and block every create", () => {
    const pattern = new RegExp(/from '([^']+)'/.exec(sent(storedMaxSql(COMPANY, "CZ")).sql)![1]!);
    expect(pattern.exec("CZ00000123")?.[1]).toBe("00000123");
    expect(pattern.exec("CZ00000123-A")?.[1]).toBe("00000123");
    expect(pattern.exec("CZ1234567890123456789")).toBeNull();
    expect(pattern.exec("CZQ1")).toBeNull();
  });

  it("reads the highest MCZ number of the company over all its master jobs", () => {
    const { sql, params } = sent(storedMaxSql(COMPANY, "MCZ"));
    expect(flat(sql)).toBe(
      `(SELECT coalesce(max(substring("master_job"."mcz_number" from '^MCZ([0-9]{1,12})([^0-9]|$)')::bigint), 0) FROM "master_job" WHERE "master_job"."company_id" = $1 AND "master_job"."mcz_number" LIKE 'MCZ%')`,
    );
    expect(params).toEqual([COMPANY]);
  });
});

describe("allocateSql", () => {
  it("bumps the company's counter in one statement, starting from and never falling below the highest stored number", () => {
    const { sql, params } = sent(allocateSql(COMPANY, "CZ"));
    const stored = flat(sent(storedMaxSql(COMPANY, "CZ")).sql);
    expect(flat(sql)).toBe(
      `INSERT INTO "shipment_ref_counter" (company_id, sequence, last) VALUES ($1, $2, ${stored.replace("$1", "$3")} + 1) ` +
        `ON CONFLICT (company_id, sequence) DO UPDATE SET last = GREATEST("shipment_ref_counter".last, ${stored.replace("$1", "$4")}) + 1, updated_at = now() ` +
        "RETURNING last",
    );
    expect(params).toEqual([COMPANY, "CZ", COMPANY, COMPANY]);
  });
});

describe("peekSql", () => {
  it("reads the next number without taking it", () => {
    const { sql, params } = sent(peekSql(COMPANY, "MCZ"));
    expect(flat(sql)).toMatch(/^SELECT GREATEST\( coalesce\(\(SELECT last FROM "shipment_ref_counter" WHERE company_id = \$1 AND sequence = \$2\), 0\), \(SELECT .*\) \) \+ 1 AS next$/);
    expect(sql).not.toMatch(/INSERT|UPDATE/);
    expect(params).toEqual([COMPANY, "MCZ", COMPANY]);
  });
});
