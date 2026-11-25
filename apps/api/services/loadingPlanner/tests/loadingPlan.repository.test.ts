import { drizzle } from "drizzle-orm/node-postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository's statements, built for real and handed to a stand-in for the database that
// records them and answers with the rows a test gives it. What Postgres makes of them is not
// checked here.
// `answer`, when a test sets it, gives the rows by the statement asked.
const asked = vi.hoisted(() => ({ statements: [] as { text: string; values: unknown[] }[], rows: [] as unknown[][], answer: null as ((text: string) => unknown[][]) | null }));
vi.mock("../db/db", () => ({
  db: drizzle({
    query: async (query: { text: string }, values: unknown[]) => {
      asked.statements.push({ text: query.text, values });
      return { rows: asked.answer ? asked.answer(query.text) : asked.rows };
    },
  } as never),
}));

import { loadingPlanRepository } from "../repositories/loadingPlan.repository";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const PLAN = "33333333-3333-4333-8333-333333333333";
const QUOTE = "66666666-6666-4666-8666-666666666666";
const REVISION = "77777777-7777-4777-8777-777777777777";
const last = () => asked.statements.at(-1)!;

beforeEach(() => {
  asked.statements = [];
  asked.rows = [];
  asked.answer = null;
});

describe("listLatest", () => {
  it("adds up colli and weight in the database and does not read the plans' cargo", async () => {
    await loadingPlanRepository.listLatest(COMPANY);
    const { text, values } = last();
    expect(text).toContain(`sum((l ->> 'colli')::numeric)`);
    expect(text).toContain(`sum((l ->> 'colli')::numeric * (l ->> 'weightKg')::numeric)`);
    // The lines are only the sums' source, never a column of the answer; nor is the nominated equipment.
    expect(text.slice(0, text.indexOf(" from "))).not.toMatch(/, "lines"|"nominated"/);
    expect(text).toMatch(/where \("loading_plan"\."company_id" = \$1 and "loading_plan"\."deleted_at" is null\)/);
    expect(values).toEqual([COMPANY, 501]);
  });

  it("returns at most the limit and says when there are more", async () => {
    const row = (n: number) => [`id-${n}`, "Plan", null, null, "", "3", "1200.5", "a@example.com", "a@example.com", "2026-11-23 08:00:00+00", "2026-11-23 09:00:00+00"];
    asked.rows = [row(1), row(2), row(3)];
    const capped = await loadingPlanRepository.listLatest(COMPANY, undefined, 2);
    expect(capped.capped).toBe(true);
    expect(capped.rows).toHaveLength(2);
    expect(capped.rows[0]).toMatchObject({ id: "id-1", colli: 3, weightKg: 1200.5 });
    await expect(loadingPlanRepository.listLatest(COMPANY, undefined, 3)).resolves.toMatchObject({ capped: false });
  });

  it("with a link, lists only that job's plans of the company", async () => {
    await loadingPlanRepository.listLatest(COMPANY, { kind: "quote", id: QUOTE });
    expect(last().text).toContain(`"loading_plan"."link_kind" = $2 and "loading_plan"."link_id" = $3`);
    expect(last().values.slice(0, 3)).toEqual([COMPANY, "quote", QUOTE]);
  });
});

describe("searchMain", () => {
  const search = () => asked.statements.find((s) => s.text.includes("inner join"))!;
  const count = () => asked.statements.find((s) => s.text.startsWith("select count(*)"))!;
  // The name and the linked job's reference together, folded for the words: diacritics and case aside.
  const FOLDED = `replace(lower(translate(regexp_replace(normalize(concat_ws(' ', "loading_plan"."name", "loading_plan"."link_ref"), NFD)`;

  it("looks in every live plan of the company for each word, folded, in the name or the linked job's reference", async () => {
    await loadingPlanRepository.searchMain(COMPANY, "Plzně  QCZ2026", 5);
    for (const { text, values } of [search(), count()]) {
      expect(text).toContain(`"loading_plan"."company_id" = $`);
      expect(text).toContain(`"loading_plan"."deleted_at" is null`);
      expect(text).toContain(FOLDED);
      expect(text.match(/ LIKE \$\d+/g)).toHaveLength(2);
      expect(values).toEqual(expect.arrayContaining([COMPANY, "%plzne%", "%qcz2026%"]));
    }
  });

  it("gives the last saved first, at most the limit, and adds up the cargo of those plans only", async () => {
    await loadingPlanRepository.searchMain(COMPANY, "plzen", 7);
    const { text, values } = search();
    // The page of plans is picked first, without the sums; the sums are worked out on it.
    const page = text.slice(text.indexOf("inner join"));
    expect(page).toMatch(/^inner join \(select "id" from "loading_plan" where .* order by "loading_plan"\."updated_at" desc limit \$\d+\) "page"/);
    expect(page).not.toContain("jsonb_array_elements");
    expect(text.slice(0, text.indexOf("inner join"))).toContain("jsonb_array_elements");
    expect(text).toMatch(/order by "loading_plan"\."updated_at" desc$/);
    expect(values).toContain(7);
    // The outer read is the company's too.
    expect(text.slice(text.lastIndexOf("where"))).toContain(`"loading_plan"."company_id" = $`);
  });

  it("answers the rows and how many match in all", async () => {
    asked.answer = (text) => (text.startsWith("select count(*)") ? [["731"]] : [["id-1", "Plzeň", null, null, "", "3", "1200.5", null, "a@example.com", "a@example.com", "2026-11-23 08:00:00+00", "2026-11-23 09:00:00+00"]]);
    const found = await loadingPlanRepository.searchMain(COMPANY, "plzen", 5);
    expect(found.total).toBe(731);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0]).toMatchObject({ id: "id-1", name: "Plzeň", colli: 3, weightKg: 1200.5 });
  });

  it("asks nothing for a text with no words", async () => {
    await expect(loadingPlanRepository.searchMain(COMPANY, "   ", 5)).resolves.toEqual({ rows: [], total: 0 });
    expect(asked.statements).toHaveLength(0);
  });
});

describe("updateIfUnchanged", () => {
  it("writes only while the plan is the company's, live, and not saved since the editor's version", async () => {
    const basedOn = new Date("2026-11-23T09:00:00.123Z");
    await loadingPlanRepository.updateIfUnchanged(PLAN, COMPANY, basedOn, { name: "Plan", linkKind: null, linkId: null, linkRef: "", lines: [], nominated: null, updatedBy: "petr@example.com" });
    const { text, values } = last();
    expect(text).toContain(`"updated_at" = greatest(now(), "loading_plan"."updated_at" + interval '1 millisecond')`);
    expect(text).toMatch(/"loading_plan"\."id" = \$\d+ and "loading_plan"\."company_id" = \$\d+ and "loading_plan"\."deleted_at" is null and date_trunc\('milliseconds', "loading_plan"\."updated_at"\) <= \$\d+::timestamptz/);
    expect(values).toEqual(expect.arrayContaining([PLAN, COMPANY, "2026-11-23T09:00:00.123Z"]));
  });

  it("answers null when nothing was written", async () => {
    await expect(loadingPlanRepository.updateIfUnchanged(PLAN, COMPANY, new Date(), { name: "Plan", linkKind: null, linkId: null, linkRef: "", lines: [], nominated: null, updatedBy: "" })).resolves.toBeNull();
  });
});

describe("following the linked job", () => {
  it("writes a job's new reference without making it a save", async () => {
    await loadingPlanRepository.setLinkRef(PLAN, COMPANY, { kind: "shipment", id: QUOTE }, "CZLCL00000053");
    expect(last().text).toMatch(/^update "loading_plan" set "link_ref" = \$1 where /);
    expect(last().text).toContain(`"loading_plan"."company_id" = $3`);
  });

  it("renames a quote on the company's plans only where the reference still differs", async () => {
    await loadingPlanRepository.followQuoteRename(COMPANY, "QCZ20261109001", "QCZLCL20261109001");
    const { text, values } = last();
    expect(text).toMatch(/^update "loading_plan" set "link_ref" = \$1 where /);
    expect(text).toContain(`"loading_plan"."company_id" = $2 and "loading_plan"."link_kind" = $3`);
    expect(text).toContain(`"loading_plan"."link_ref" <> $`);
    // Found without the letters of the Freight Mode, whichever spelling the event and the copy hold.
    expect(values).toEqual(expect.arrayContaining(["QCZLCL20261109001", COMPANY, "quote", "QCZ20261109001"]));
  });

  it("moves a revised quote's live plans of the company to the revision, as a save", async () => {
    asked.rows = [["a"], ["b"]];
    await expect(loadingPlanRepository.moveQuote(COMPANY, QUOTE, { id: REVISION, reference: "QCZ20261109001-R1" }, "petr@example.com")).resolves.toBe(2);
    const { text, values } = last();
    expect(text).toContain(`"updated_at" = greatest(now()`);
    expect(text).toMatch(/"loading_plan"\."company_id" = \$\d+ and "loading_plan"\."link_kind" = \$\d+ and "loading_plan"\."link_id" = \$\d+ and "loading_plan"\."deleted_at" is null/);
    expect(values).toEqual([REVISION, "QCZ20261109001-R1", "petr@example.com", COMPANY, "quote", QUOTE]);
  });
});
