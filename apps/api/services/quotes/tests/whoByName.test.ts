import { beforeEach, describe, expect, it, vi } from "vitest";

// Who wrote a quote's chat message is shown by name, the e-mail for a user with none, as the shipments'
// chat shows it (mock test of 21 Nov): the bell lists both chats' mentions side by side, and the same
// panel shows both chats (review of system-22). The service runs for real, with the real lib/people,
// against stand-ins for the repositories, the bucket and the auth service.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
const auth = vi.hoisted(() => ({ usersList: vi.fn(), userLookup: vi.fn() }));
vi.mock("~encore/clients", () => ({ auth }));
vi.mock("../storage/quoteAttachmentBucket", () => ({ quoteAttachmentBucket: { upload: vi.fn(), download: vi.fn() } }));
vi.mock("../repositories/salesQuote.repository", () => ({ salesQuoteRepository: { loadSales: vi.fn(async (_c: string, quoteNumber: string) => ({ quoteNumber })) } }));
vi.mock("../repositories/quoteComment.repository", () => ({
  quoteCommentRepository: {
    listByThread: vi.fn(),
    listChatFiles: vi.fn(async () => []),
    lastReadByOthers: vi.fn(async () => null),
    createForCompany: vi.fn(),
    linkFiles: vi.fn(),
    mentions: vi.fn(),
  },
}));

import type { Actor } from "../../../lib/rbac";
import { quoteCommentRepository } from "../repositories/quoteComment.repository";
import { quoteChatService } from "../services/quoteChat.service";

const repo = vi.mocked(quoteCommentRepository);
const ROOT = "QCZ20261022003";
const AT = new Date("2026-11-21T08:00:00Z");
const JAN = { id: "u-jan", email: "Jan@Firma.cz", displayName: "Jan Novák", role: "user" };
const EVA = { id: "u-eva", email: "eva@firma.cz", displayName: "Eva Malá", role: "user" };
const me: Actor = { userID: "u-jan", companyID: "c1", role: "user" } as Actor;
const message = (over: Record<string, unknown>) => ({ id: "m1", companyId: "c1", threadRef: ROOT, quoteNumber: ROOT, message: "hi", createdAt: AT, struckAt: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  auth.usersList.mockResolvedValue({ users: [JAN, EVA] });
  auth.userLookup.mockResolvedValue({ users: [] });
});

describe("a quote's chat", () => {
  it("names a mention's writer under the bell by name, as a shipment's mention reads", async () => {
    repo.mentions.mockResolvedValue([
      { ...message({ id: "m1", authorId: "u-eva", authorName: "eva@firma.cz" }), readAt: null },
      // A writer who is no user any more keeps what the message recorded.
      { ...message({ id: "m2", authorId: "u-gone", authorName: "gone@firma.cz" }), readAt: null },
    ] as never);
    const mentions = await quoteChatService.mentions(me);
    expect(mentions.map((m) => m.authorName)).toEqual(["Eva Malá", "gone@firma.cz"]);
  });

  it("names a message's writer by name, the e-mail for a user with none", async () => {
    auth.usersList.mockResolvedValue({ users: [JAN, { ...EVA, displayName: "" }] });
    repo.listByThread.mockResolvedValue([message({ id: "m1", authorId: "u-jan", authorName: "jan@firma.cz" }), message({ id: "m2", authorId: "u-eva", authorName: "" })] as never);
    const items = await quoteChatService.list(me, ROOT);
    expect(items.map((i) => i.authorName)).toEqual(["Jan Novák", "eva@firma.cz"]);
  });

  it("records the writer's name with a new message, so it still reads so once they are no user", async () => {
    repo.createForCompany.mockImplementation(async (_c, row) => message({ ...row }) as never);
    const item = await quoteChatService.create(me, ROOT, { message: "hello", fileIds: [], mentionedUserIds: ["u-eva"] });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", expect.objectContaining({ authorId: "u-jan", authorName: "Jan Novák", mentionedUserIds: ["u-eva"] }));
    expect(item.authorName).toBe("Jan Novák");
  });

  it("names a superadmin working as the company, who is no user of it, by their own e-mail", async () => {
    const root: Actor = { userID: "u-root", companyID: "c1", role: "superadmin" } as Actor;
    auth.userLookup.mockResolvedValue({ users: [{ id: "u-root", name: "Root", email: "Root@Platform.cz", role: "superadmin" }] });
    repo.createForCompany.mockImplementation(async (_c, row) => message({ ...row }) as never);
    const item = await quoteChatService.create(root, ROOT, { message: "hello", fileIds: [], mentionedUserIds: [] });
    expect(item.authorName).toBe("root@platform.cz");
  });
});
