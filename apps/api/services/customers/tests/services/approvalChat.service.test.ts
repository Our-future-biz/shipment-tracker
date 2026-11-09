import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn(), usersList: vi.fn() } }));
vi.mock("../../../../lib/companyUsers", () => ({ userEmailOf: vi.fn().mockResolvedValue("boss@firm.cz") }));
vi.mock("../../repositories/companyRegistration.repository", () => ({
  companyRegistrationRepository: { thread: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), isMember: vi.fn(), messages: vi.fn(), members: vi.fn(), markRead: vi.fn(), addMessage: vi.fn(), unread: vi.fn() },
}));

import { auth } from "~encore/clients";
import { companyRegistrationRepository } from "../../repositories/companyRegistration.repository";
import { approvalChatService as service } from "../../services/approvalChat.service";

const repository = vi.mocked(companyRegistrationRepository);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const THREAD = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
const REP = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const manager = { companyID: COMPANY, userID: "11111111-1111-4111-8111-111111111111", role: "manager" };
const rep = { companyID: COMPANY, userID: REP, role: "user" };
const outsider = { companyID: COMPANY, userID: OTHER, role: "user" };

beforeEach(() => {
  vi.clearAllMocks();
  repository.thread.mockResolvedValue({ companyName: "DANGO s.r.o.", requesterUserId: REP });
  repository.messages.mockResolvedValue([]);
  repository.members.mockResolvedValue([{ userId: REP } as never]);
  repository.isMember.mockImplementation(async (_t, user) => user === REP);
  vi.mocked(auth.userLookup).mockResolvedValue({ users: [{ id: REP, email: "Rep@Firm.cz" }] } as never);
  vi.mocked(auth.usersList).mockResolvedValue({ users: [{ id: OTHER }] } as never);
});

describe("who is in the chat", () => {
  it("has every manager and the one who asked, who is made a member on the way", async () => {
    await expect(service.get(manager, THREAD)).resolves.toMatchObject({ companyName: "DANGO s.r.o.", canAddPeople: true, people: [{ userId: REP, name: "rep@firm.cz", isRequester: true }] });
    expect(repository.addMember).toHaveBeenCalledWith(COMPANY, THREAD, REP, null);
    await expect(service.get(rep, THREAD)).resolves.toMatchObject({ canAddPeople: false });
  });

  it("keeps anyone else out", async () => {
    await expect(service.get(outsider, THREAD)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.post(outsider, THREAD, "hello")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.addMessage).not.toHaveBeenCalled();
  });

  it("says nothing of a thread that does not exist", async () => {
    repository.thread.mockResolvedValue(null);
    await expect(service.get(manager, THREAD)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.get(manager, "nonsense")).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets a manager add a colleague of the company, and nobody else add anyone", async () => {
    await service.addPerson(manager, THREAD, OTHER);
    expect(repository.addMember).toHaveBeenCalledWith(COMPANY, THREAD, OTHER, manager.userID);
    await expect(service.addPerson(rep, THREAD, OTHER)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.addPerson(manager, THREAD, "44444444-4444-4444-8444-444444444444")).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("removing someone from the chat", () => {
  it("is a manager's, and the colleague can't open it any more", async () => {
    repository.removeMember.mockResolvedValue(true);
    await service.removePerson(manager, THREAD, OTHER);
    expect(repository.removeMember).toHaveBeenCalledWith(COMPANY, THREAD, OTHER);
    await expect(service.removePerson(rep, THREAD, OTHER)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.get(outsider, THREAD)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("never takes out the one who created the link", async () => {
    await expect(service.removePerson(manager, THREAD, REP)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repository.removeMember).not.toHaveBeenCalled();
  });

  it("says so when the colleague is no longer in it", async () => {
    repository.removeMember.mockResolvedValue(false);
    await expect(service.removePerson(manager, THREAD, OTHER)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("messages", () => {
  it("are stored with who wrote them, trimmed", async () => {
    await service.post(rep, THREAD, "  I will call them  ");
    expect(repository.addMessage).toHaveBeenCalledWith({ companyId: COMPANY, threadId: THREAD, authorUserId: REP, author: "boss@firm.cz", text: "I will call them" });
  });

  it("can't be empty or too long", async () => {
    await expect(service.post(rep, THREAD, "   ")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.post(rep, THREAD, "x".repeat(2001))).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("count as read once the chat is opened, and tell whose are whose", async () => {
    repository.messages.mockResolvedValue([{ id: "m", authorUserId: REP, author: "rep@firm.cz", text: "a", createdAt: new Date() }, { id: "s", authorUserId: null, author: "", text: "registered", createdAt: new Date() }] as never);
    const chat = await service.get(rep, THREAD);
    expect(chat.messages.map((m) => [m.mine, m.isSystem])).toEqual([[true, false], [false, true]]);
    expect(repository.markRead).toHaveBeenCalledWith(COMPANY, THREAD, REP, expect.any(Date));
  });
});
