import { beforeEach, describe, expect, it, vi } from "vitest";

// The MBL Shipper / Consignee of a master job, linked to the Customer Database: run against
// stand-ins for the repositories, the shipment service and the customers service.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ customers: { customerGet: vi.fn() }, invoicing: { _internalMasterJobShipmentLeft: vi.fn() } }));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../repositories/cargoDimension.repository", () => ({ cargoDimensionRepository: { listByShipmentIds: vi.fn(async () => []) } }));
vi.mock("../../repositories/cargoItem.repository", () => ({ cargoItemRepository: { listByShipmentIds: vi.fn(async () => []) } }));
vi.mock("../../repositories/masterJob.repository", () => ({
  masterJobRepository: { getByIdForCompany: vi.fn(), updateForCompany: vi.fn(), shipmentCounts: vi.fn() },
}));
vi.mock("../../repositories/masterJobContainer.repository", () => ({ masterJobContainerRepository: {} }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: { findByMasterJobId: vi.fn() } }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: {} }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: { update: vi.fn(), isInvoiced: vi.fn(), mayChangeDetails: vi.fn() } }));
// The company's users and the signed-in one's e-mail, which the auth service answers.
vi.mock("../../../../lib/companyUsers", () => ({ companyUsers: vi.fn(), userEmailOf: vi.fn() }));

import { customers } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { companyUsers, userEmailOf } from "../../../../lib/companyUsers";
import { masterJobRepository } from "../../repositories/masterJob.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { MASTER_JOB_PEOPLE_REFUSAL, masterJobService } from "../../services/masterJob.service";
import { shipmentService } from "../../services/shipment.service";

const repository = vi.mocked(masterJobRepository);
const customerGet = vi.mocked(customers.customerGet);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const JOB = "5b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const ALFA = "00000000-0000-0000-0000-0000000000a1";
const record = (over: Record<string, unknown> = {}) => ({
  id: JOB,
  companyId: COMPANY,
  mczNumber: "MCZ00000001",
  loadType: "",
  shipper: "",
  shipperId: null,
  consignee: "",
  consigneeId: null,
  createdAt: new Date("2026-10-26T10:00:00Z"),
  updatedAt: new Date("2026-10-26T10:00:00Z"),
  deletedAt: null,
  ...over,
});
const update = (data: Record<string, unknown>) => masterJobService.update(JOB, COMPANY, data as never, USER);
const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  repository.getByIdForCompany.mockResolvedValue(record() as never);
  repository.updateForCompany.mockImplementation(async (_id, _companyId, data) => record(data as Record<string, unknown>) as never);
  repository.shipmentCounts.mockResolvedValue(new Map());
  // No houses on the master job.
  vi.mocked(shipmentRepository.findByMasterJobId).mockResolvedValue([]);
  customerGet.mockResolvedValue({ customer: { id: ALFA, companyName: "Alfa s.r.o." } } as never);
});

describe("the reference", () => {
  it("takes the letters of the Load Type when one is set, keeping its number", async () => {
    const saved = await update({ loadType: "Consolidation" });
    expect(written()).toMatchObject({ loadType: "Consolidation", mczNumber: "MCZCONSOL00000001" });
    expect(saved.mczNumber).toBe("MCZCONSOL00000001");
  });

  it("stays as it is on a save without a Load Type", async () => {
    await update({ vessel: "ONE RELIABILITY" });
    expect(written()).not.toHaveProperty("mczNumber");
    await update({ loadType: "" });
    expect(repository.updateForCompany.mock.calls[1]![2]).not.toHaveProperty("mczNumber");
  });

  it("is not doubled when the same Load Type is saved again", async () => {
    repository.getByIdForCompany.mockResolvedValue(record({ loadType: "Full Load", mczNumber: "MCZFULL00000001" }) as never);
    await update({ loadType: "Full Load" });
    expect(written()).toMatchObject({ mczNumber: "MCZFULL00000001" });
  });
});

describe("the MBL Shipper and Consignee", () => {
  it("store the Customer Database's current name with the id, whatever text the save sends", async () => {
    await update({ shipperId: ALFA, shipper: "ALFA SRO", consigneeId: ALFA });
    expect(customerGet).toHaveBeenCalledWith({ id: ALFA });
    expect(written()).toMatchObject({ shipperId: ALFA, shipper: "Alfa s.r.o.", consigneeId: ALFA, consignee: "Alfa s.r.o." });
  });

  it("keep the text when unlinked", async () => {
    await update({ shipperId: null, shipper: "As on the MBL" });
    expect(customerGet).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ shipperId: null, shipper: "As on the MBL" });
  });

  it("refuse an id that is no customer of the company, before anything is written", async () => {
    customerGet.mockRejectedValue(APIError.notFound("Customer not found"));
    await expect(update({ consigneeId: ALFA })).rejects.toMatchObject({ code: "invalid_argument", message: "Unknown consignee" });
    await expect(update({ shipperId: "not-an-id" })).rejects.toMatchObject({ code: "invalid_argument", message: "Unknown shipper" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("are not looked up for a save that does not link them", async () => {
    await update({ vessel: "MSC Anna" });
    expect(customerGet).not.toHaveBeenCalled();
  });
});

describe("a save that writes onto the houses", () => {
  const house = (jobNumber: string, personInCharge: string) => ({ id: jobNumber, jobNumber, personInCharge, holidayCover: "" });
  const user = { userID: USER, role: "user" };
  const save = (data: Record<string, unknown>, editor?: { userID: string; role: string }) => masterJobService.update(JOB, COMPANY, data as never, USER, editor);

  beforeEach(() => {
    vi.mocked(shipmentRepository.findByMasterJobId).mockResolvedValue([house("CZ1", "a@x.cz"), house("CZ2", "b@x.cz")] as never);
    vi.mocked(shipmentService.isInvoiced).mockResolvedValue(false);
    // The editor is CZ1's Person in Charge only.
    vi.mocked(shipmentService.mayChangeDetails).mockImplementation(async (h) => h.personInCharge === "a@x.cz");
  });

  it("is refused, naming the houses and writing nothing, unless the editor may change every one", async () => {
    await expect(save({ pol: "Hamburg" }, user)).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("CZ2") });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(shipmentService.update).not.toHaveBeenCalled();
  });

  it("goes through for a manager, and for someone who may change every house", async () => {
    await save({ pol: "Hamburg" }, { userID: USER, role: "manager" });
    expect(shipmentService.update).toHaveBeenCalledTimes(2);
    vi.mocked(shipmentService.mayChangeDetails).mockResolvedValue(true);
    await save({ pol: "Bremen" }, user);
    expect(shipmentService.update).toHaveBeenCalledTimes(4);
  });

  it("keeps the departments' own fields open, and a save not reaching the houses free", async () => {
    await save({ etaWarehouse: "2026-11-20", warehouseReceivedDate: "2026-11-21" }, user);
    // Equipment stays on the master job.
    await save({ equipment: "40HC" }, user);
    expect(shipmentService.mayChangeDetails).not.toHaveBeenCalled();
  });

  it("writes the HUB onto every house, open to every user as the warehouse's field", async () => {
    await save({ hub: "Prague (CZPRG)" }, user);
    expect(written()).toMatchObject({ hub: "Prague (CZPRG)" });
    expect(shipmentService.update).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(shipmentService.update).mock.calls) expect(call[2]).toEqual({ hub: "Prague (CZPRG)" });
    expect(shipmentService.mayChangeDetails).not.toHaveBeenCalled();
  });

  it("holds a date from a house's Tracking tab to every house too, writing nothing when one isn't the person's", async () => {
    await expect(save({ actualArrival: "2026-11-20" }, user)).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("CZ2") });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(shipmentService.update).not.toHaveBeenCalled();
  });

  it("leaves the app's own writes, which name no editor, unchecked", async () => {
    await save({ actualArrival: "2026-11-20" });
    expect(shipmentService.mayChangeDetails).not.toHaveBeenCalled();
    expect(shipmentService.update).toHaveBeenCalledTimes(2);
  });

  it("checks every house on its own, before a caller writes anything", async () => {
    await expect(masterJobService.assertMayChangeEveryHouse(JOB, COMPANY, user)).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("CZ2") });
    vi.mocked(shipmentRepository.findByMasterJobId).mockClear();
    await expect(masterJobService.assertMayChangeEveryHouse(JOB, COMPANY, { userID: USER, role: "manager" })).resolves.toBeUndefined();
    expect(shipmentRepository.findByMasterJobId).not.toHaveBeenCalled();
    vi.mocked(shipmentService.mayChangeDetails).mockResolvedValue(true);
    await expect(masterJobService.assertMayChangeEveryHouse(JOB, COMPANY, user)).resolves.toBeUndefined();
  });
});

describe("the master job's own Person in Charge and Holiday Cover", () => {
  const JAN = "jan@firma.cz";
  const EVA = "eva@firma.cz";
  const users = [
    { id: USER, email: JAN, displayName: "Jan Novák" },
    { id: "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a03", email: EVA, displayName: "Eva Svobodová" },
  ];
  // The person saving is Jan, at user level unless said otherwise.
  const user = { userID: USER, role: "user" };
  const manager = { userID: USER, role: "manager" };
  const save = (data: Record<string, unknown>, editor?: { userID: string; role: string }) => masterJobService.update(JOB, COMPANY, data as never, USER, editor);
  const lastWritten = () => repository.updateForCompany.mock.calls.at(-1)![2] as Record<string, unknown>;
  const named = (personInCharge: string, holidayCover = "") => repository.getByIdForCompany.mockResolvedValue(record({ personInCharge, holidayCover }) as never);

  beforeEach(() => {
    vi.mocked(companyUsers).mockResolvedValue(users);
    vi.mocked(userEmailOf).mockResolvedValue(JAN);
    // Named nobody yet.
    named("");
  });

  it("stores a user of the company by e-mail, lower-cased", async () => {
    await save({ personInCharge: " Eva@Firma.CZ ", holidayCover: JAN }, user);
    expect(lastWritten()).toMatchObject({ personInCharge: EVA, holidayCover: JAN });
    // The users are read once for both.
    expect(companyUsers).toHaveBeenCalledTimes(1);
  });

  it("refuses anyone who is no user of the company, naming the field, before anything is written", async () => {
    await expect(save({ holidayCover: "petr@jinde.cz" }, user)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Holiday Cover: pick a user of the company (by e-mail)",
    });
    await expect(save({ personInCharge: "Eva Svobodová" }, user)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Handled By: pick a user of the company (by e-mail)",
    });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("clears a person with an empty value, without reading the users", async () => {
    named(EVA, JAN);
    await save({ personInCharge: "", holidayCover: "  " }, user);
    expect(lastWritten()).toMatchObject({ personInCharge: "", holidayCover: "" });
    expect(companyUsers).not.toHaveBeenCalled();
  });

  it("lets the value it holds pass as it is, an old one that is no user's e-mail too", async () => {
    named(`${EVA} — Eva Svobodová`, "Petr");
    // Jan is neither of them, but nothing changes: no check, no users read.
    await save({ personInCharge: `${EVA} — Eva Svobodová`, holidayCover: " Petr ", vessel: "MSC Anna" }, user);
    expect(lastWritten()).toMatchObject({ personInCharge: `${EVA} — Eva Svobodová`, holidayCover: "Petr", vessel: "MSC Anna" });
    expect(companyUsers).not.toHaveBeenCalled();
    expect(userEmailOf).not.toHaveBeenCalled();
  });

  it("are changed at user level only by the master job's Person in Charge or Holiday Cover, as on a shipment", async () => {
    // Eva is in charge, nobody covers: Jan may not name himself, and nothing is written.
    named(EVA);
    await expect(save({ holidayCover: JAN }, user)).rejects.toMatchObject({ code: "permission_denied", message: MASTER_JOB_PEOPLE_REFUSAL });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    // Refused before the users are read.
    expect(companyUsers).not.toHaveBeenCalled();
    // Eva herself may, and so may the Holiday Cover (an old value with a name after the e-mail counts).
    vi.mocked(userEmailOf).mockResolvedValue(EVA);
    await save({ holidayCover: JAN }, user);
    expect(lastWritten()).toMatchObject({ holidayCover: JAN });
    named(EVA, `${JAN} — Jan Novák`);
    vi.mocked(userEmailOf).mockResolvedValue(JAN);
    await save({ personInCharge: JAN }, user);
    expect(lastWritten()).toMatchObject({ personInCharge: JAN });
  });

  it("are open to a manager always, and to anyone while the master job names neither", async () => {
    named(EVA);
    await save({ personInCharge: JAN }, manager);
    expect(lastWritten()).toMatchObject({ personInCharge: JAN });
    expect(userEmailOf).not.toHaveBeenCalled();
    named("");
    await save({ personInCharge: EVA }, user);
    expect(lastWritten()).toMatchObject({ personInCharge: EVA });
    // Nobody to be: whoever saves needn't be looked up.
    expect(userEmailOf).not.toHaveBeenCalled();
  });

  it("leave the app's own writes, which name no editor, unchecked but still validated", async () => {
    named(EVA);
    await save({ holidayCover: JAN });
    expect(lastWritten()).toMatchObject({ holidayCover: JAN });
    expect(userEmailOf).not.toHaveBeenCalled();
    await expect(save({ holidayCover: "petr@jinde.cz" })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("the houses a vendor invoice read by B/L is checked against", () => {
  it("are the master job's shipments with their House B/L, whether cancelled and their W/M", async () => {
    const { cargoDimensionRepository } = await import("../../repositories/cargoDimension.repository");
    vi.mocked(cargoDimensionRepository.listByShipmentIds).mockResolvedValue([]);
    vi.mocked(shipmentRepository.findByMasterJobId).mockResolvedValue([
      { id: "s2", jobNumber: "CZ00000002", houseBolNumber: "GLSL26060963", status: "Cancelled Shipment", totalWeightTons: "1.5", totalVolumeCbm: "2" },
      { id: "s1", jobNumber: "CZ00000001", houseBolNumber: "GLSL26060771", status: "Arrived", totalWeightTons: "3", totalVolumeCbm: "1" },
    ] as never);
    await expect(masterJobService.invoiceHouses(JOB, COMPANY)).resolves.toEqual([
      { shipmentId: "s1", jobNumber: "CZ00000001", houseBolNumber: "GLSL26060771", cancelled: false, freightTon: 3 },
      { shipmentId: "s2", jobNumber: "CZ00000002", houseBolNumber: "GLSL26060963", cancelled: true, freightTon: 2 },
    ]);
    // What a master job's costs are split over stays as it was.
    await expect(masterJobService.houses(JOB, COMPANY)).resolves.toEqual([
      { shipmentId: "s1", jobNumber: "CZ00000001", freightTon: 3 },
      { shipmentId: "s2", jobNumber: "CZ00000002", freightTon: 2 },
    ]);
  });
});
