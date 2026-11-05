import { beforeEach, describe, expect, it, vi } from "vitest";

// The statement that counts a user's unread chat messages per shipment, as Postgres gets it: the
// repository runs on a real query builder whose connection only records what it is sent. What the
// statement does to real rows is not checked here - that needs a database.
const sent = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
vi.mock("../../db/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const client = {
    query: async (q: { text: string }, params?: unknown[]) => {
      sent.push({ text: q.text, values: params ?? [] });
      return { rows: [], fields: [], rowCount: 0 };
    },
  };
  return { db: drizzle({ client: client as never }) };
});

import { shipmentCommentRepository } from "../../repositories/shipmentComment.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ME = "0b4e1a52-35a4-4e5f-9a9f-1d0c6a0f7a11";

beforeEach(() => {
  sent.length = 0;
});

describe("unreadCounts", () => {
  it("counts others' messages and the user's own ones that tag them, since they last opened the chat, per live shipment", async () => {
    await shipmentCommentRepository.unreadCounts(COMPANY, ME);
    expect(sent).toHaveLength(1);
    const { text, values } = sent[0]!;
    // The user's last opening of each chat is theirs, in their company.
    expect(text).toContain('where ("shipment_comment_read"."company_id" = $1 and "shipment_comment_read"."user_id" = $2)');
    expect(values.slice(0, 2)).toEqual([COMPANY, ME]);
    // A message counts when someone else wrote it, or when it tags the user - a notice posted for
    // their own click on the warehouse's Inform Operations - and only after their last opening.
    expect(text).toContain('("shipment_comment"."author_id" <> $4 or "shipment_comment"."mentioned_user_ids" @> ARRAY[$5::uuid])');
    expect(text).toContain('("read"."read_at" is null or "shipment_comment"."created_at" > "read"."read_at")');
    expect(values.slice(2)).toEqual([COMPANY, ME, ME]);
    // Live messages of live shipments of the company, counted per shipment.
    expect(text).toContain('"shipment_comment"."company_id" = $3 and "shipment_comment"."deleted_at" is null and "shipment"."deleted_at" is null');
    expect(text).toMatch(/group by "shipment_comment"\."shipment_id"$/);
  });
});
