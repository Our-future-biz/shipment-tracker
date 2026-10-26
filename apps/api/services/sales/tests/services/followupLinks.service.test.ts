import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real against stand-ins for the repository and the Customer Database.
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalCustomerRefs: vi.fn() } }));
vi.mock("../../repositories/followupTask.repository", () => ({
  followupTaskRepository: { followCustomer: vi.fn(), relabelCustomer: vi.fn(), customerLinks: vi.fn() },
}));

import { customers } from "~encore/clients";
import { followupTaskRepository } from "../../repositories/followupTask.repository";
import { followupLinksService } from "../../services/followupLinks.service";

const tasks = vi.mocked(followupTaskRepository);
const refs = vi.mocked(customers._internalCustomerRefs);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const GONE = "6d1c3f0e-1a2b-4c3d-8e9f-000000000002";

// A handler has no login: it asks the Customer Database for the event's company.
const AS_COMPANY = { authData: { userID: "", companyID: COMPANY, role: "user" } };

/** The names the handler's reads gave the repository to write, in order (null = nothing). */
let written: (string | null)[];

beforeEach(() => {
  vi.resetAllMocks();
  written = [];
  // The repository takes the turn and then asks for the name; the stand-in only asks.
  tasks.followCustomer.mockImplementation(async (_company: string, _customer: string, currentName: () => Promise<string | null>) => {
    const name = await currentName();
    written.push(name);
    return name ? 2 : 0;
  });
  tasks.relabelCustomer.mockResolvedValue(0);
  tasks.customerLinks.mockResolvedValue([]);
  refs.mockResolvedValue({ customers: [], contacts: [] });
});

describe("customerChanged", () => {
  const event = { companyId: COMPANY, customerId: ACME, companyName: "ACME", label: "STANDARD", deleted: false };
  const live = (companyName: string) => refs.mockResolvedValue({ customers: [{ id: ACME, companyName, label: "STANDARD" }], contacts: [] });

  it("gives the tasks linked to the customer its name as the Customer Database has it now, not as the event says", async () => {
    live("ACME Logistics s.r.o.");
    await expect(followupLinksService.customerChanged(event)).resolves.toBe(2);
    expect(tasks.followCustomer).toHaveBeenCalledWith(COMPANY, ACME, expect.any(Function));
    expect(refs).toHaveBeenCalledWith({ customerIds: [ACME] }, AS_COMPANY);
    expect(written).toEqual(["ACME Logistics s.r.o."]);
  });

  it("an older event delivered after a newer one does not bring the old name back", async () => {
    live("ACME Group");
    await followupLinksService.customerChanged({ ...event, companyName: "ACME Group" });
    await followupLinksService.customerChanged(event);
    expect(written).toEqual(["ACME Group", "ACME Group"]);
  });

  it("a deleted customer's tasks take the last name its delete event carries; one restored since, its current name", async () => {
    await followupLinksService.customerChanged({ ...event, companyName: "ACME Final s.r.o.", deleted: true });
    live("ACME Group");
    await followupLinksService.customerChanged({ ...event, deleted: true });
    expect(written).toEqual(["ACME Final s.r.o.", "ACME Group"]);
  });

  it("an edit of a customer deleted since writes nothing (its delete event does)", async () => {
    await expect(followupLinksService.customerChanged(event)).resolves.toBe(0);
    expect(written).toEqual([null]);
  });

  it("fails when the Customer Database cannot be read, so the event is delivered again", async () => {
    refs.mockRejectedValue(new Error("down"));
    await expect(followupLinksService.customerChanged(event)).rejects.toThrow("down");
  });

  it("ignores an event that names no customer", async () => {
    await expect(followupLinksService.customerChanged({ ...event, customerId: "" })).resolves.toBe(0);
    expect(tasks.followCustomer).not.toHaveBeenCalled();
  });
});

describe("normalize", () => {
  it("relabels the tasks of every live customer and lists the names of deleted ones", async () => {
    tasks.customerLinks.mockResolvedValue([
      { customerId: ACME, customerLabel: "ACME", count: 2 },
      { customerId: ACME, customerLabel: "ACME Logistics s.r.o.", count: 1 },
      { customerId: GONE, customerLabel: "Gone s.r.o.", count: 4 },
    ]);
    refs.mockResolvedValue({ customers: [{ id: ACME, companyName: "ACME Logistics s.r.o.", label: "STANDARD" }], contacts: [] });
    tasks.relabelCustomer.mockResolvedValue(2);
    await expect(followupLinksService.normalize(COMPANY)).resolves.toEqual({
      checked: 7,
      changed: 2,
      unmatched: [{ field: "customer", value: "Gone s.r.o.", count: 4 }],
    });
    expect(refs).toHaveBeenCalledWith({ customerIds: [ACME, GONE] });
    expect(tasks.relabelCustomer.mock.calls).toEqual([[COMPANY, ACME, "ACME Logistics s.r.o."]]);
  });

  it("fails instead of guessing when the Customer Database cannot be read", async () => {
    tasks.customerLinks.mockResolvedValue([{ customerId: ACME, customerLabel: "ACME", count: 1 }]);
    refs.mockRejectedValue(new Error("down"));
    await expect(followupLinksService.normalize(COMPANY)).rejects.toThrow("down");
    expect(tasks.relabelCustomer).not.toHaveBeenCalled();
  });

  it("asks nothing when no task is linked to a customer", async () => {
    await expect(followupLinksService.normalize(COMPANY)).resolves.toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(refs).not.toHaveBeenCalled();
  });
});
