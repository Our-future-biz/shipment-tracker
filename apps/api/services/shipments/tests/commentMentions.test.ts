import { describe, expect, it, vi } from "vitest";

// The bell's mentions: unread ones, and read ones written in the last 7 days, each saying which it
// is. The service is run for real against a stand-in repository.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: { unreadMentions: vi.fn(), createForCompany: vi.fn() } }));
vi.mock("../repositories/shipmentAttachment.repository", () => ({
  shipmentAttachmentRepository: { linkToComment: vi.fn(), listChatFilesByShipmentId: vi.fn(async () => []) },
}));
// Who wrote a message is shown by e-mail, as every person is.
vi.mock("../lib/userEmails", () => ({ userEmails: vi.fn(async () => new Map([["u-eva", "eva@firma.cz"], ["u-me", "me@firma.cz"]])) }));
vi.mock("../services/attachment.service", () => ({ attachmentService: {} }));
vi.mock("../services/shipment.service", () => ({ shipmentService: { requireLive: vi.fn(), get: vi.fn() } }));
// The company's users, as the warehouse's notice resolves whom to tag.
vi.mock("../../../lib/companyUsers", () => ({
  companyUsers: vi.fn(async () => [
    { id: "u-eva", email: "eva@firma.cz", displayName: "Eva" },
    { id: "u-me", email: "me@firma.cz", displayName: "" },
  ]),
}));
vi.mock("../lib/contentToken", () => ({ attachmentContentUrl: vi.fn() }));

import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
import { shipmentService } from "../services/shipment.service";
import { companyUsers } from "../../../lib/companyUsers";
import { commentService, READ_MENTION_KEEP_DAYS } from "../services/comment.service";

const repo = vi.mocked(shipmentCommentRepository);
const shipments = vi.mocked(shipmentService);

describe("the bell's mentions", () => {
  it("asks for read ones of the last 7 days and says which are unread", async () => {
    const at = (s: string) => new Date(s);
    repo.unreadMentions.mockResolvedValue([
      { id: "m1", shipmentId: "s1", jobNumber: "CZ1", authorId: "u-eva", message: "@you new", createdAt: at("2026-10-23T09:00:00Z"), readAt: at("2026-10-23T08:00:00Z") },
      { id: "m2", shipmentId: "s2", jobNumber: "CZ2", authorId: "u-eva", message: "@you old", createdAt: at("2026-10-20T09:00:00Z"), readAt: at("2026-10-21T08:00:00Z") },
      { id: "m3", shipmentId: "s3", jobNumber: null, authorId: "u-gone", message: "@you", createdAt: at("2026-10-22T09:00:00Z"), readAt: null },
    ] as never);
    const mentions = await commentService.unreadMentions("c1", "u-me");
    expect(repo.unreadMentions).toHaveBeenCalledWith("c1", "u-me", READ_MENTION_KEEP_DAYS);
    expect(READ_MENTION_KEEP_DAYS).toBe(7);
    expect(mentions.map((m) => [m.id, m.unread, m.authorName, m.jobNumber])).toEqual([
      ["m1", true, "eva@firma.cz", "CZ1"],
      ["m2", false, "eva@firma.cz", "CZ2"],
      ["m3", true, "", ""],
    ]);
  });
});

describe("a message's tags", () => {
  it("drops a tag of the writer (the @ list never offers yourself) and anyone who is no colleague", async () => {
    repo.createForCompany.mockImplementation(async (companyId, c) => ({ id: "c1", companyId, createdAt: new Date(), ...c }) as never);
    await commentService.create("s1", "c1", "u-me", { message: "@Eva look", attachmentIds: [], mentionedUserIds: ["u-me", "u-eva", "u-eva", "u-stranger"] });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", expect.objectContaining({ authorId: "u-me", mentionedUserIds: ["u-eva"] }));
  });
});

describe("the warehouse's remeasurement notice", () => {
  const remeasured = { colli: 11, weightKg: 2750, volumeCbm: 31.68 };
  const shipment = (people: { personInCharge: string; holidayCover: string }) =>
    ({
      ...people,
      pcs: "20",
      totalWeightTons: "3",
      totalVolumeCbm: "",
      cargoDimensions: [{ pieces: "20", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "150", volumePerPcM3: "0.5" }],
    }) as never;

  it("tags the shipment's Person in Charge and Holiday Cover as stored - the one clicking too - and says whom", async () => {
    repo.createForCompany.mockImplementation(async (companyId, c) => ({ id: "n1", companyId, createdAt: new Date(), ...c }) as never);
    shipments.get.mockResolvedValue(shipment({ personInCharge: "me@firma.cz", holidayCover: "EVA@firma.cz" }));
    const res = await commentService.postRemeasureNotice("s1", "c1", "u-me", { remeasured, comparedWith: "dimensions", note: "" });
    expect(shipments.get).toHaveBeenCalledWith("s1", "c1");
    expect(res).toEqual({ commentId: "n1", tagged: ["me@firma.cz", "eva@firma.cz"] });
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", {
      shipmentId: "s1",
      authorId: "u-me",
      message: [
        "Cargo has been remeasured by the warehouse.",
        "Shipment values: 20 colli · 3,000.0 kg · 10.000 CBM",
        "Remeasured values: 11 colli · 2,750.0 kg · 31.680 CBM",
        "@me@firma.cz @Eva",
      ].join("\n"),
      mentionedUserIds: ["u-me", "u-eva"],
    });
  });

  it("posts it tagging nobody when nobody is set, and answers so", async () => {
    repo.createForCompany.mockImplementation(async (companyId, c) => ({ id: "n2", companyId, createdAt: new Date(), ...c }) as never);
    shipments.get.mockResolvedValue(shipment({ personInCharge: "", holidayCover: "someone@else.com" }));
    const res = await commentService.postRemeasureNotice("s1", "c1", "u-me", { remeasured, comparedWith: "declared", note: "two crates crushed" });
    expect(res.tagged).toEqual([]);
    expect(repo.createForCompany).toHaveBeenCalledWith("c1", expect.objectContaining({ mentionedUserIds: [], message: expect.stringContaining("Note: two crates crushed") }));
  });

  it("posts nothing when the users can't be read, or the figures are not figures", async () => {
    repo.createForCompany.mockClear();
    shipments.get.mockResolvedValue(shipment({ personInCharge: "me@firma.cz", holidayCover: "" }));
    vi.mocked(companyUsers).mockRejectedValueOnce(new Error("auth down"));
    await expect(commentService.postRemeasureNotice("s1", "c1", "u-me", { remeasured, comparedWith: "dimensions", note: "" })).rejects.toThrow("auth down");
    await expect(commentService.postRemeasureNotice("s1", "c1", "u-me", { remeasured: { colli: -1, weightKg: 0, volumeCbm: 0 }, comparedWith: "dimensions", note: "" })).rejects.toThrow(
      expect.objectContaining({ code: "invalid_argument" }),
    );
    await expect(commentService.postRemeasureNotice("s1", "c1", "u-me", { remeasured, comparedWith: "gate", note: "" })).rejects.toThrow(/comparedWith/);
    expect(repo.createForCompany).not.toHaveBeenCalled();
  });
});
