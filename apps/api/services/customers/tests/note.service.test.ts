import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup } }));
const notes = vi.hoisted(() => ({ createForCompany: vi.fn() }));
vi.mock("../repositories/customerNote.repository", () => ({ customerNoteRepository: notes }));
vi.mock("../services/customer.service", () => ({ customerService: { requireLive: vi.fn(async () => ({ id: "c1" })) } }));

import { noteService } from "../services/note.service";

const now = new Date("2026-10-26T08:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  notes.createForCompany.mockImplementation(async (_company: string, values: Record<string, unknown>) => ({
    id: "n1", companyId: "co", createdAt: now, updatedAt: now, deletedAt: null, ...values,
  }));
});

describe("a communication entry", () => {
  it("is written by the signed-in user, whatever the request says", async () => {
    userLookup.mockResolvedValue({ users: [{ id: "u1", name: "Martin Koubek", role: "superadmin" }] });
    const input = { type: "Note" as const, content: "Called them", author: "Austromar" };
    const note = await noteService.create("co", "c1", "u1", input);
    expect(userLookup).toHaveBeenCalledWith({ ids: ["u1"] });
    expect(notes.createForCompany).toHaveBeenCalledWith("co", { customerId: "c1", type: "Note", content: "Called them", author: "Martin Koubek" });
    expect(note.author).toBe("Martin Koubek");
  });

  it("is saved without a name when the user can't be looked up", async () => {
    userLookup.mockRejectedValue(new Error("auth down"));
    await noteService.create("co", "c1", "u1", { content: "x" });
    expect(notes.createForCompany).toHaveBeenCalledWith("co", expect.objectContaining({ author: "" }));
  });
});
