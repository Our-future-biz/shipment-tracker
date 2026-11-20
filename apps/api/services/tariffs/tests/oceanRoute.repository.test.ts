import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

// The ocean route's read, run against a stand-in for the database that records its condition.
const asked = vi.hoisted(() => ({ where: [] as unknown[] }));
vi.mock("../db/db", () => {
  const chain: Record<string, unknown> = {};
  for (const step of ["select", "from", "leftJoin", "orderBy"]) chain[step] = () => chain;
  chain.where = (where: unknown) => {
    asked.where.push(where);
    return chain;
  };
  chain.limit = async () => [];
  return { db: chain };
});

import { tariffRepository } from "../repositories/tariff.repository";
import { samePortCodes } from "../../../lib/geo/carrierPorts";

const dialect = new PgDialect();
const lastWhere = () => dialect.sqlToQuery(asked.where.at(-1) as SQL);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const VERSION = "22222222-2222-4222-8222-222222222222";

// Review of user council step 3, M2: the pickers name CNSHA "Shanghai", the tariffs match the
// port's name to CNSGH; a sea quote on either code finds the rates.
describe("tariffRepository.oceanRoute", () => {
  beforeEach(() => {
    asked.where = [];
  });

  it("finds a carrier code's port of discharge and loading by its port's code too", async () => {
    await tariffRepository.oceanRoute(COMPANY, [VERSION], "CNSHA", "CNNGB");
    const { sql, params } = lastWhere();
    expect(sql).toMatch(/"pod_port"\."code" in \(\$\d+, \$\d+\)/);
    expect(sql).toMatch(/"pol_port"\."code" in \(\$\d+, \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["CNSHA", "CNSGH", "CNNGB", "CNNBO"]));
  });

  it("finds a port's code by its carrier code too, the other way round", async () => {
    await tariffRepository.oceanRoute(COMPANY, [VERSION], "CNSGH", null);
    const { sql, params } = lastWhere();
    expect(params).toEqual(expect.arrayContaining(["CNSGH", "CNSHA"]));
    expect(sql).toContain(`"pol_port"."code" IS NOT NULL`);
  });

  it("asks any other port by its own code alone", async () => {
    await tariffRepository.oceanRoute(COMPANY, [VERSION], "DEHAM", "NLRTM");
    const { sql, params } = lastWhere();
    expect(sql).toMatch(/"pod_port"\."code" in \(\$\d+\)/);
    expect(params).not.toContain("CNSGH");
  });
});

describe("samePortCodes", () => {
  it("pairs each carrier code with its port's code, both ways", () => {
    expect(samePortCodes("CNSHA")).toEqual(["CNSHA", "CNSGH"]);
    expect(samePortCodes("CNSGH")).toEqual(["CNSGH", "CNSHA"]);
    expect(samePortCodes("CNTAO")).toEqual(["CNTAO", "CNQIN"]);
    expect(samePortCodes("CNDAL")).toEqual(["CNDAL", "CNDLC"]);
    expect(samePortCodes("DEHAM")).toEqual(["DEHAM"]);
    // Shanghai Pt and Shanghai Pudong airport are other places.
    expect(samePortCodes("CNSHG")).toEqual(["CNSHG"]);
    expect(samePortCodes("CNPVG")).toEqual(["CNPVG"]);
  });
});
