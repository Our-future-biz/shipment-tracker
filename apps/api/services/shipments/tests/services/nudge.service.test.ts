import { beforeEach, describe, expect, it, vi } from "vitest";

const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const nudges = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() } }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentNudge.repository", () => ({ shipmentNudgeRepository: nudges }));
// note.service is read for its title and deadline rules only.
vi.mock("../../repositories/shipmentNote.repository", () => ({ shipmentNoteRepository: {} }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: {} }));

import { auth } from "~encore/clients";
import { nudgeService } from "../../services/nudge.service";

// A manager's nudge, against stand-ins: a to-do with a due date, a chat line tagging the job's
// people, a history line - written together. The wording is tests/nudge.test.ts.

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const BOSS = "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02";
const manager = { userID: BOSS, companyID: "c1", role: "manager" };
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const job = (over = {}) => ({ id: SHIPMENT, jobNumber: "CZFCL00000001", personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz", ...over });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.usersList).mockResolvedValue({
    users: [
      { id: "u-jan", email: "jan@firma.cz", displayName: "Jan Novák" },
      { id: "u-eva", email: "eva@firma.cz", displayName: "Eva Malá" },
      { id: BOSS, email: "boss@firma.cz", displayName: "Petra Šéfová" },
    ],
  } as never);
  shipments.getByIdForCompany.mockResolvedValue(job());
  nudges.create.mockImplementation(async (n) => ({ id: "n1", shipmentId: n.shipmentId, text: n.text, details: "", dueDate: n.dueDate, authorId: n.authorId, doneAt: null, doneById: null, pinned: false, pinnedAt: null, createdAt: NOW }));
});

describe("a manager's nudge", () => {
  it("writes the to-do, the chat line tagging Handled By and Holiday Cover, and the history line together", async () => {
    const result = await nudgeService.nudge(manager, SHIPMENT, { text: " Send the SI today ", dueDate: "2026-11-19" }, NOW);
    expect(nudges.create).toHaveBeenCalledTimes(1);
    expect(nudges.create).toHaveBeenCalledWith({
      companyId: "c1",
      shipmentId: SHIPMENT,
      authorId: BOSS,
      text: "Send the SI today",
      dueDate: "2026-11-19",
      message: "To-do from Petra Šéfová: Send the SI today — due 19.11.2026\n@Jan Novák @Eva Malá",
      mentionedUserIds: ["u-jan", "u-eva"],
      history: { field: "nudge", newValue: "To-do for jan@firma.cz, eva@firma.cz: Send the SI today — due 19.11.2026" },
    });
    expect(result.told).toEqual(["jan@firma.cz", "eva@firma.cz"]);
    expect(result.note).toEqual({
      id: "n1",
      shipmentId: SHIPMENT,
      text: "Send the SI today",
      details: "",
      dueDate: "2026-11-19",
      authorName: "boss@firma.cz",
      createdAt: "2026-11-18T10:00:00.000Z",
      done: false,
      doneAt: null,
      doneByName: "",
      pinned: false,
      pinnedAt: null,
    });
  });

  it("is refused on a job nobody handles", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: " ", holidayCover: "eva@firma.cz" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Name somebody in Handled By first",
    });
    expect(nudges.create).not.toHaveBeenCalled();
  });

  it("is refused when nobody on the job can be told - its people are no users of the company, or the only one is the manager nudging - and writes no to-do nobody hears of", async () => {
    const refused = { code: "failed_precondition", message: "Nobody on this job can be told: hand it over first" };
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: "left@firma.cz", holidayCover: "" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject(refused);
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: "left@firma.cz", holidayCover: "gone@firma.cz" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject(refused);
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: "boss@firma.cz", holidayCover: "" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject(refused);
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: "boss@firma.cz", holidayCover: "left@firma.cz" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject(refused);
    expect(nudges.create).not.toHaveBeenCalled();
  });

  it("goes to whoever of the two can be told: a Holiday Cover who is a user is enough", async () => {
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: "left@firma.cz", holidayCover: "eva@firma.cz" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).resolves.toMatchObject({ told: ["eva@firma.cz"] });
    shipments.getByIdForCompany.mockResolvedValue(job({ personInCharge: "boss@firma.cz", holidayCover: "jan@firma.cz" }));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI today", dueDate: "2026-11-19" }, NOW)).resolves.toMatchObject({ told: ["jan@firma.cz"] });
    expect(nudges.create.mock.lastCall![0]).toMatchObject({ mentionedUserIds: ["u-jan"] });
  });

  it("wants a title of at most 300 characters and a real due day, today or later", async () => {
    const due = { dueDate: "2026-11-19" };
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "  ", ...due }, NOW)).rejects.toThrow("Write a title for the to-do");
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "x".repeat(301), ...due }, NOW)).rejects.toThrow("up to 300 characters");
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "" }, NOW)).rejects.toThrow("Say by when it has to be done");
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "2026-02-31" }, NOW)).rejects.toThrow("The deadline must be a day as YYYY-MM-DD");
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "2026-11-17" }, NOW)).rejects.toThrow("The due date has passed: choose today or a later day");
    expect(shipments.getByIdForCompany).not.toHaveBeenCalled();
    // Today is fine.
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "2026-11-18" }, NOW)).resolves.toMatchObject({ told: ["jan@firma.cz", "eva@firma.cz"] });
  });

  it("finds no shipment of another company, a deleted one, or what is no id", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject({ code: "not_found" });
    await expect(nudgeService.nudge(manager, "s1", { text: "Send the SI", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject({ code: "not_found" });
  });

  it("is refused, to be sent again, when the people to tell can't be read: nothing is saved with nobody told", async () => {
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject({ code: "unavailable" });
    expect(nudges.create).not.toHaveBeenCalled();
  });

  it("writes nothing on a second click: the same to-do is already open on the job", async () => {
    nudges.create.mockResolvedValue(null);
    await expect(nudgeService.nudge(manager, SHIPMENT, { text: "Send the SI", dueDate: "2026-11-19" }, NOW)).rejects.toMatchObject({
      code: "already_exists",
      message: "This to-do is already open on the job",
    });
  });
});
