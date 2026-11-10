import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The approval chats' unread messages for the bell, run against a stand-in for the database that
// records the conditions it is asked for. What the statements return from real rows is not checked.
const fake = vi.hoisted(() => {
  const state = { wheres: [] as unknown[] };
  const db = {
    select: () => ({
      from: () => {
        const where = (condition: unknown) => {
          state.wheres.push(condition);
          // The messages are grouped by chat; the "added to a chat" rows are awaited as they are.
          return { groupBy: async () => [], then: (resolve: (rows: unknown[]) => unknown) => resolve([]) };
        };
        return { leftJoin: () => ({ where }), where };
      },
    }),
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { companyRegistrationRepository } from "../../repositories/companyRegistration.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";

const messagesWhere = () => new PgDialect().sqlToQuery(fake.state.wheres[0] as SQL);

beforeEach(() => {
  fake.state.wheres = [];
});

describe("the approval chats on a user's bell", () => {
  it("are only those a manager takes part in: named in the chat, or having written in it", async () => {
    await companyRegistrationRepository.unread(COMPANY, USER, true);
    const { sql, params } = messagesWhere();
    expect(sql).toContain(
      `("company_approval_participant"."member" is true or ("company_approval_message"."author_user_id" is not null and exists (select 1 from "company_approval_message" as own where own.company_id = $`,
    );
    expect(sql).toContain('and own.thread_id = "company_approval_message"."thread_id" and own.author_user_id = $');
    expect(params.filter((p) => p === USER).length).toBeGreaterThanOrEqual(2);
  });

  it("are not every chat colleagues wrote in, for a manager either: nothing calls a manager who is not in it", async () => {
    await companyRegistrationRepository.unread(COMPANY, USER, true);
    expect(messagesWhere().sql).not.toMatch(/"member" is true or "company_approval_message"\."author_user_id" is not null\)/);
  });

  it("are, for anyone else, only those they are named in: one taken out of a chat is not called by what they once wrote there", async () => {
    await companyRegistrationRepository.unread(COMPANY, USER, false);
    const { sql } = messagesWhere();
    expect(sql).toContain('"company_approval_participant"."member" is true');
    expect(sql).not.toContain("own.author_user_id");
  });

  it("leave out the user's own messages and what they have read", async () => {
    await companyRegistrationRepository.unread(COMPANY, USER, true);
    const { sql } = messagesWhere();
    expect(sql).toContain('"company_approval_message"."author_user_id" is distinct from $');
    expect(sql).toContain('("company_approval_participant"."last_read_at" is null or "company_approval_message"."created_at" > "company_approval_participant"."last_read_at")');
  });
});
