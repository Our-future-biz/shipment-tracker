import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../lib/userEmails", () => ({
  userEmails: vi.fn(async () => new Map([["u1", "jan@firm.cz"], ["u2", "eva@firm.cz"]])),
}));
vi.mock("../../repositories/shipmentNote.repository", () => ({
  shipmentNoteRepository: { listByShipmentId: vi.fn(), createForCompany: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() },
}));
vi.mock("../../services/shipment.service", () => ({ shipmentService: { requireLive: vi.fn() } }));


import { shipmentNoteRepository as repo } from "../../repositories/shipmentNote.repository";
import { shipmentService } from "../../services/shipment.service";
import { NOTE_MAX_LENGTH, noteDueDate, noteService, noteText } from "../../services/note.service";

const at = new Date("2026-11-10T20:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  shipmentId: "s1",
  companyId: "c1",
  text: "Call the depot",
  details: "",
  dueDate: null,
  authorId: "u1",
  doneAt: null,
  doneById: null,
  pinned: false,
  pinnedAt: null,
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("noteText", () => {
  it("keeps the text trimmed", () => {
    expect(noteText("  Call the depot \n")).toBe("Call the depot");
  });

  it("refuses an empty title and one that is too long", () => {
    expect(() => noteText("   ")).toThrow("Write a title for the to-do");
    expect(() => noteText(undefined)).toThrow("Write a title for the to-do");
    expect(() => noteText("x".repeat(NOTE_MAX_LENGTH + 1))).toThrow(`up to ${NOTE_MAX_LENGTH} characters`);
  });
});

describe("noteDueDate", () => {
  it("keeps a real day and takes an empty one as no deadline", () => {
    expect(noteDueDate(" 2026-11-12 ")).toBe("2026-11-12");
    expect(noteDueDate("")).toBeNull();
    expect(noteDueDate(undefined)).toBeNull();
  });

  it("refuses anything that is no real day", () => {
    expect(() => noteDueDate("2026-02-30")).toThrow("The deadline must be a day as YYYY-MM-DD");
    expect(() => noteDueDate("12.11.2026")).toThrow("The deadline must be a day as YYYY-MM-DD");
  });
});

describe("noteService", () => {
  it("lists a live shipment's notes with who wrote and who ticked them off", async () => {
    vi.mocked(repo.listByShipmentId).mockResolvedValue([row(), row({ id: "n2", doneAt: at, doneById: "u2" })] as never);
    const notes = await noteService.list("s1", "c1");
    expect(shipmentService.requireLive).toHaveBeenCalledWith("s1", "c1");
    expect(notes.map((n) => [n.authorName, n.done, n.doneByName])).toEqual([
      ["jan@firm.cz", false, ""],
      ["jan@firm.cz", true, "eva@firm.cz"],
    ]);
  });

  it("writes a note as the signed-in user", async () => {
    vi.mocked(repo.createForCompany).mockResolvedValue(row() as never);
    const note = await noteService.create("s1", "c1", "u1", { text: "  Call the depot " });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", { shipmentId: "s1", text: "Call the depot", details: "", dueDate: null, authorId: "u1" });
    expect(note.authorName).toBe("jan@firm.cz");
  });

  it("writes a to-do with its details and deadline", async () => {
    vi.mocked(repo.createForCompany).mockResolvedValue(row({ details: "Customs need it", dueDate: "2026-11-12" }) as never);
    const note = await noteService.create("s1", "c1", "u1", { text: "Get the permit", details: " Customs need it ", dueDate: "2026-11-12" });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", { shipmentId: "s1", text: "Get the permit", details: "Customs need it", dueDate: "2026-11-12", authorId: "u1" });
    expect(note.dueDate).toBe("2026-11-12");
  });

  it("moves a deadline and takes it away", async () => {
    vi.mocked(repo.updateNote).mockResolvedValue(row() as never);
    await noteService.update("s1", "n1", "c1", "u1", { dueDate: "2026-11-20" });
    expect(repo.updateNote).toHaveBeenCalledWith("n1", "s1", "c1", { dueDate: "2026-11-20" });
    await noteService.update("s1", "n1", "c1", "u1", { dueDate: "" });
    expect(repo.updateNote).toHaveBeenLastCalledWith("n1", "s1", "c1", { dueDate: null });
  });

  it("does not write an empty note", async () => {
    await expect(noteService.create("s1", "c1", "u1", { text: " " })).rejects.toThrow("Write a title for the to-do");
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });

  it("ticks a note off with who and when, and back to open", async () => {
    vi.mocked(repo.updateNote).mockResolvedValue(row({ doneAt: at, doneById: "u2" }) as never);
    await noteService.update("s1", "n1", "c1", "u2", { done: true });
    expect(repo.updateNote).toHaveBeenCalledWith("n1", "s1", "c1", { doneAt: expect.any(Date), doneById: "u2" });

    vi.mocked(repo.updateNote).mockResolvedValue(row() as never);
    await noteService.update("s1", "n1", "c1", "u2", { done: false });
    expect(repo.updateNote).toHaveBeenLastCalledWith("n1", "s1", "c1", { doneAt: null, doneById: null });
  });

  it("stars a note and takes the star off", async () => {
    vi.mocked(repo.updateNote).mockResolvedValue(row({ pinned: true }) as never);
    const note = await noteService.update("s1", "n1", "c1", "u1", { pinned: true });
    expect(repo.updateNote).toHaveBeenCalledWith("n1", "s1", "c1", { pinned: true, pinnedAt: expect.any(Date) });
    expect(note.pinned).toBe(true);
    await noteService.update("s1", "n1", "c1", "u1", { pinned: false });
    expect(repo.updateNote).toHaveBeenLastCalledWith("n1", "s1", "c1", { pinned: false, pinnedAt: null });
  });

  it("changes only the text when only the text is sent", async () => {
    vi.mocked(repo.updateNote).mockResolvedValue(row({ text: "Call the depot at 9" }) as never);
    await noteService.update("s1", "n1", "c1", "u1", { text: "Call the depot at 9" });
    expect(repo.updateNote).toHaveBeenCalledWith("n1", "s1", "c1", { text: "Call the depot at 9" });
  });

  it("changes and deletes the to-dos of a live shipment only", async () => {
    vi.mocked(shipmentService.requireLive).mockRejectedValueOnce(new Error("Shipment not found"));
    await expect(noteService.update("s1", "n1", "c1", "u1", { done: true })).rejects.toThrow("Shipment not found");
    vi.mocked(shipmentService.requireLive).mockRejectedValueOnce(new Error("Shipment not found"));
    await expect(noteService.delete("s1", "n1", "c1")).rejects.toThrow("Shipment not found");
    expect(repo.updateNote).not.toHaveBeenCalled();
    expect(repo.deleteNote).not.toHaveBeenCalled();
  });

  it("says when the note is gone", async () => {
    vi.mocked(repo.updateNote).mockResolvedValue(null);
    await expect(noteService.update("s1", "n1", "c1", "u1", { done: true })).rejects.toThrow("Note not found");
    vi.mocked(repo.deleteNote).mockResolvedValue(false);
    await expect(noteService.delete("s1", "n1", "c1")).rejects.toThrow("Note not found");
  });
});
