import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
const usersList = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup, usersList } }));
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
  it("is written by the signed-in user, recorded by e-mail, whatever the request says", async () => {
    userLookup.mockResolvedValue({ users: [{ id: "u1", name: "Martin Koubek", email: "Martin@OurFuture.biz", role: "superadmin" }] });
    const input = { type: "Note" as const, content: "Called them", author: "Austromar" };
    const note = await noteService.create("co", "c1", "u1", input);
    expect(userLookup).toHaveBeenCalledWith({ ids: ["u1"], selfInOwnCompany: true });
    expect(notes.createForCompany).toHaveBeenCalledWith("co", { customerId: "c1", type: "Note", content: "Called them", author: "martin@ourfuture.biz", colleagues: [] });
    expect(note.author).toBe("martin@ourfuture.biz");
  });

  // Changed: it used to be saved without an author (lib/companyUsers userEmailOf answered "" when auth
  // did not); an entry nobody wrote is not kept - it is refused, to be saved again.
  it("is refused, not saved without an author, when the user can't be looked up", async () => {
    userLookup.mockRejectedValue(new Error("auth down"));
    await expect(noteService.create("co", "c1", "u1", { content: "x" })).rejects.toMatchObject({ code: "unavailable" });
    expect(notes.createForCompany).not.toHaveBeenCalled();
  });

  it("names the colleagues who took part, by e-mail, each once and never the author", async () => {
    userLookup.mockResolvedValue({ users: [{ id: "u1", name: "Martin Koubek", email: "martin@ourfuture.biz", role: "admin" }] });
    usersList.mockResolvedValue({
      users: [
        { id: "u1", displayName: "Martin Koubek", email: "martin@ourfuture.biz" },
        { id: "u2", displayName: "Lukáš", email: "Lukas@OurFuture.biz" },
        { id: "u3", displayName: "Marek", email: "marek@ourfuture.biz" },
      ],
    });
    const note = await noteService.create("co", "c1", "u1", {
      type: "Visit",
      content: "Visited the plant",
      colleagues: ["marek@ourfuture.biz", " LUKAS@ourfuture.biz", "martin@ourfuture.biz", "marek@ourfuture.biz", ""],
    });
    expect(notes.createForCompany).toHaveBeenCalledWith("co", expect.objectContaining({ colleagues: ["marek@ourfuture.biz", "lukas@ourfuture.biz"] }));
    expect(note.colleagues).toEqual(["marek@ourfuture.biz", "lukas@ourfuture.biz"]);
  });

  it("refuses a colleague who is not a user of the company", async () => {
    userLookup.mockResolvedValue({ users: [{ id: "u1", email: "martin@ourfuture.biz" }] });
    usersList.mockResolvedValue({ users: [{ id: "u1", displayName: "Martin", email: "martin@ourfuture.biz" }] });
    await expect(noteService.create("co", "c1", "u1", { type: "Visit", content: "x", colleagues: ["someone@else.com"] })).rejects.toThrow(/Colleagues/);
    expect(notes.createForCompany).not.toHaveBeenCalled();
  });

  it("refuses colleagues on anything but a visit", async () => {
    usersList.mockResolvedValue({ users: [{ id: "u2", displayName: "Marek", email: "marek@ourfuture.biz" }] });
    await expect(noteService.create("co", "c1", "u1", { type: "Call", content: "x", colleagues: ["marek@ourfuture.biz"] })).rejects.toThrow(/only a visit/);
    await expect(noteService.create("co", "c1", "u1", { content: "x", colleagues: ["marek@ourfuture.biz"] })).rejects.toThrow(/only a visit/);
    expect(notes.createForCompany).not.toHaveBeenCalled();
  });

  it("doesn't load the users when nobody else took part", async () => {
    userLookup.mockResolvedValue({ users: [{ id: "u1", email: "martin@ourfuture.biz" }] });
    await noteService.create("co", "c1", "u1", { content: "x", colleagues: [] });
    expect(usersList).not.toHaveBeenCalled();
  });
});
