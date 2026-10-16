import { beforeEach, describe, expect, it, vi } from "vitest";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { authClient } = vi.hoisted(() => ({
  authClient: {
    _internalServiceUser: vi.fn(async (_opts: { authData: { companyID: string } }) => ({ userId: "svc-1" })),
    userLookup: vi.fn(async ({ ids }: { ids: string[] }, _opts?: unknown) => ({ users: ids.filter((id) => id !== "left").map((id) => ({ id, name: "", role: "user" })) })),
  },
}));
vi.mock("~encore/clients", () => ({ auth: authClient }));

import { goneUsers, resetServiceActors, serviceActor } from "../outbox/serviceIdentity";
import { sendFailedAgain } from "../outbox/sendAgain";
import { OutboxRepository } from "../outbox/outboxRepository";
import { defaultTableColumns, tenantColumns } from "../db/defaults";
import { outboxColumns } from "../outbox/outbox.columns";

beforeEach(() => {
  resetServiceActors();
  authClient._internalServiceUser.mockClear();
  authClient.userLookup.mockClear();
});

describe("the service identity", () => {
  it("is the company's Trucking (system) user with the least role, asked for once per company", async () => {
    expect(await serviceActor("c1")).toEqual({ userID: "svc-1", companyID: "c1", role: "user" });
    await serviceActor("c1");
    expect(authClient._internalServiceUser).toHaveBeenCalledTimes(1);
    expect(authClient._internalServiceUser).toHaveBeenCalledWith({ authData: { userID: "", companyID: "c1", role: "user" } });
    await serviceActor("c2");
    expect(authClient._internalServiceUser).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failed call", async () => {
    authClient._internalServiceUser.mockRejectedValueOnce(new Error("auth down"));
    await expect(serviceActor("c1")).rejects.toThrow("auth down");
    expect(await serviceActor("c1")).toMatchObject({ userID: "svc-1" });
  });

  it("tells which acting users are gone (nobody included)", async () => {
    expect(await goneUsers("c1", ["u1", "left", "", "u1"])).toEqual(["left", ""]);
    expect(authClient.userLookup).toHaveBeenCalledWith({ ids: ["u1", "left"] }, { authData: { userID: "", companyID: "c1", role: "user" } });
    expect(await goneUsers("c1", [""])).toEqual([""]);
  });
});

describe("send again", () => {
  const repo = { requeueFailed: vi.fn(async (_c: string, ids: string[]) => ids.map((id) => ({ id }))) };

  beforeEach(() => {
    repo.requeueFailed.mockClear();
  });

  it("requeues the failed rows; those of a user who left (or of nobody) go out as the service identity", async () => {
    const rows = [
      { id: "r1", actingUserId: "u1" },
      { id: "r2", actingUserId: "left" },
      { id: "r3", actingUserId: "" },
    ];
    expect(await sendFailedAgain(repo, "c1", rows)).toEqual([{ id: "r1" }, { id: "r2" }, { id: "r3" }]);
    expect(repo.requeueFailed).toHaveBeenCalledWith("c1", ["r1", "r2", "r3"], { gone: ["left", ""], userId: "svc-1", role: "user" });
  });

  it("keeps the acting users when they are all still there", async () => {
    await sendFailedAgain(repo, "c1", [{ id: "r1", actingUserId: "u1" }]);
    expect(repo.requeueFailed).toHaveBeenCalledWith("c1", ["r1"], null);
    expect(authClient._internalServiceUser).not.toHaveBeenCalled();
  });

  it("does nothing without rows", async () => {
    expect(await sendFailedAgain(repo, "c1", [])).toEqual([]);
    expect(repo.requeueFailed).not.toHaveBeenCalled();
  });
});

describe("claiming due rows", () => {
  const table = pgTable("test_outbox", { ...defaultTableColumns, ...tenantColumns, shipmentId: uuid("shipment_id").notNull(), kind: text("kind").notNull(), ...outboxColumns });
  class TestRepo extends OutboxRepository<typeof table> {
    claim = (limit: number) => this.claimDueRows(limit);
  }

  it("holds a row back only behind an older pending row of the same key, never behind a failed one", async () => {
    let query = "";
    const db = { execute: vi.fn(async (q: SQL) => ((query = new PgDialect().sqlToQuery(q).sql), { rows: [] })) };
    await new TestRepo(db as never, table, "test_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "" }).claim(5);
    const waitsBehind = query.slice(query.indexOf("NOT EXISTS"));
    expect(waitsBehind).toContain(`y."shipment_id" = x."shipment_id" AND y.status = 'pending'`);
    expect(waitsBehind).not.toContain("failed");
  });
});
