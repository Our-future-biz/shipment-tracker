import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ companyIds: vi.fn(), personValuesOf: vi.fn(), setUserLinks: vi.fn() }));
const usersList = vi.hoisted(() => vi.fn());
const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: repository }));
vi.mock("~encore/clients", () => ({ auth: { usersList } }));
vi.mock("encore.dev/log", () => ({ default: log }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { shipmentUserLinksService } from "../../services/shipmentUserLinks.service";

// The daily backfill of the users' ids beside Handled By and Holiday Cover, against stand-ins for
// the repository and the auth service. Its SQL is tests/db/userLinks.db.test.ts.

const A = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const B = "96f202b1-7449-441b-9c5b-5bf4d89f8d89";
const JAN = { id: "u-jan", email: " Jan@Firma.cz ", displayName: "Jan Novák", role: "user" };

beforeEach(() => {
  vi.resetAllMocks();
  repository.companyIds.mockResolvedValue([A, B]);
  repository.personValuesOf.mockResolvedValue([
    { field: "personInCharge", value: "jan@firma.cz" },
    { field: "holidayCover", value: "left@firma.cz" },
    { field: "holidayCover", value: "" },
  ]);
  repository.setUserLinks.mockResolvedValue(2);
  usersList.mockResolvedValue({ users: [JAN] });
});

describe("the backfill of the users' ids", () => {
  it("reads each company's users as that company and writes the ids of the values that name them", async () => {
    expect(await shipmentUserLinksService.backfillAll()).toEqual({ companies: 2, failed: 0, changed: 4 });
    expect(usersList).toHaveBeenCalledWith({ authData: { userID: "", companyID: A, role: "user" } });
    expect(usersList).toHaveBeenCalledWith({ authData: { userID: "", companyID: B, role: "user" } });
    expect(repository.setUserLinks).toHaveBeenCalledWith(A, [
      { field: "personInCharge", value: "jan@firma.cz", userId: "u-jan" },
      { field: "holidayCover", value: "", userId: null },
    ]);
  });

  it("goes on with the next company when one fails, and counts it", async () => {
    usersList.mockRejectedValueOnce(new Error("auth is unreachable"));
    expect(await shipmentUserLinksService.backfillAll()).toEqual({ companies: 2, failed: 1, changed: 2 });
    expect(repository.setUserLinks).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
