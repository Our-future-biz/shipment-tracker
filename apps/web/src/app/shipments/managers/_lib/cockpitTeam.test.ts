import { describe, expect, it } from "vitest";
import type { OpsCockpitPerson } from "@/hooks/useShipmentsManagersCockpit";
import { handledByOf, modeOf, reportsOf, tabOf } from "./cockpitAddress";
import { awayText, coversText, modeSplit, shortDay, teamFigure, teamRowHref, teamRows } from "./cockpitTeam";

const person = (handledBy: string, over: Partial<OpsCockpitPerson> = {}): OpsCockpitPerson => ({
  handledBy,
  isUser: true,
  active: 1,
  urgent: 0,
  attention: 0,
  covers: 0,
  byMode: { sea: 1, air: 0, rail: 0, road: 0 },
  todosLate: 0,
  mentionsUnread: 0,
  notTouched: 0,
  coversSince: null,
  highLoad: false,
  awayUntil: null,
  ...over,
});

const everyone = { mode: "all", direction: "all", reports: "all" } as const;

describe("Shipments → Managers, Team: a figure", () => {
  it("shows a count as it is, zero included", () => {
    expect(teamFigure(0)).toBe("0");
    expect(teamFigure(7)).toBe("7");
  });

  it("shows a figure that was not read as –, never as 0", () => {
    expect(teamFigure(null)).toBe("–");
    // An answer from before step 3 does not have the field at all.
    expect(teamFigure(undefined)).toBe("–");
  });
});

describe("Shipments → Managers, Team: days and modes", () => {
  it("writes a day as dd.mm.", () => {
    expect(shortDay("2026-11-03")).toBe("03.11.");
    expect(shortDay("2026-11-03T08:00:00.000Z")).toBe("03.11.");
  });

  it("writes nothing for no day or for what is not one", () => {
    expect(shortDay(null)).toBe("");
    expect(shortDay(undefined)).toBe("");
    expect(shortDay("")).toBe("");
    expect(shortDay("03.11.2026")).toBe("");
  });

  it("splits the active jobs by mode, in the page's order, leaving out the modes with none", () => {
    expect(modeSplit({ sea: 8, air: 3, rail: 0, road: 1 })).toBe("Sea 8 · Air 3 · Road 1");
    expect(modeSplit({ sea: 0, air: 0, rail: 2, road: 0 })).toBe("Rail 2");
    expect(modeSplit({ sea: 0, air: 0, rail: 0, road: 0 })).toBe("");
  });

  it("splits nothing for an answer that has no split", () => {
    expect(modeSplit(undefined)).toBe("");
    expect(modeSplit(null)).toBe("");
    expect(modeSplit({ air: 2 })).toBe("Air 2");
  });

  it("says on how many jobs somebody is the Holiday Cover, and since when", () => {
    expect(coversText({ covers: 4, coversSince: "2026-11-03" })).toBe("4 · since 03.11.");
    // The day is not known: the count stands alone.
    expect(coversText({ covers: 4, coversSince: null })).toBe("4");
    expect(coversText({ covers: 0, coversSince: null })).toBe("0");
    // No cover, no day - whatever the answer carries.
    expect(coversText({ covers: 0, coversSince: "2026-11-03" })).toBe("0");
  });
});

describe("Shipments → Managers, Team: where a row leads", () => {
  it("opens the Cockpit tab narrowed to the person", () => {
    expect(teamRowHref(person("jana@cto.cz"), everyone)).toBe("/shipments/managers?handledBy=jana%40cto.cz");
  });

  it("keeps the mode, the direction and My reports", () => {
    const href = teamRowHref(person("jana@cto.cz"), { mode: "air", direction: "import", reports: "mine" })!;
    expect(href).toBe("/shipments/managers?mode=air&direction=import&handledBy=jana%40cto.cz&reports=mine");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(tabOf(params.get("tab"))).toBe("cockpit");
    expect(modeOf(params.get("mode"))).toBe("air");
    expect(handledByOf(params.get("handledBy"))).toBe("jana@cto.cz");
    expect(reportsOf(params.get("reports"))).toBe("mine");
    // The signal the cards were narrowed to is not carried: the person's cards open whole.
    expect(params.get("signal")).toBeNull();
  });

  it("keeps what the Money tab's cards are narrowed to: each tab keeps its own narrowing", () => {
    expect(teamRowHref(person("jana@cto.cz"), { ...everyone, msignal: "margin" })).toBe("/shipments/managers?handledBy=jana%40cto.cz&msignal=margin");
    expect(teamRowHref(person("jana@cto.cz"), { ...everyone, msignal: null })).toBe("/shipments/managers?handledBy=jana%40cto.cz");
    expect(teamRows([person("jana@cto.cz"), person("eva@cto.cz", { active: 0, covers: 2 })], { mode: "sea", direction: "all", reports: "all", msignal: "accrual" }).map((r) => r.href)).toEqual([
      "/shipments/managers?mode=sea&handledBy=jana%40cto.cz&msignal=accrual",
      null,
    ]);
  });

  it("opens the jobs nobody handles for Nobody", () => {
    expect(teamRowHref(person("", { active: 5 }), { ...everyone, mode: "sea" })).toBe("/shipments/managers?mode=sea&handledBy=nobody");
  });

  it("leads nowhere for somebody with no job of their own: the cards go by Handled By", () => {
    expect(teamRowHref(person("eva@cto.cz", { active: 0, covers: 3 }), everyone)).toBeNull();
  });
});

describe("Shipments → Managers, Team: the rows", () => {
  // As the server sends them: the most active first, nobody among them, a Holiday Cover only last.
  const PEOPLE = [
    person("jana@cto.cz", { active: 12, urgent: 3, attention: 2, byMode: { sea: 8, air: 3, rail: 0, road: 1 }, todosLate: 2, mentionsUnread: 1, notTouched: 4, covers: 2, coversSince: "2026-11-03", highLoad: true }),
    person("", { isUser: false, active: 5, urgent: 5, byMode: { sea: 5, air: 0, rail: 0, road: 0 } }),
    person("petr@old.cz", { isUser: false, active: 2, byMode: { sea: 0, air: 2, rail: 0, road: 0 } }),
    person("eva@cto.cz", { active: 0, byMode: { sea: 0, air: 0, rail: 0, road: 0 }, covers: 3, coversSince: "2026-10-28" }),
  ];

  it("keeps the server's order: nothing is sorted, nobody is ranked", () => {
    expect(teamRows(PEOPLE, everyone).map((r) => r.name)).toEqual(["jana@cto.cz", "Nobody", "petr@old.cz", "eva@cto.cz"]);
    expect(teamRows([...PEOPLE].reverse(), everyone).map((r) => r.name)).toEqual(["eva@cto.cz", "petr@old.cz", "Nobody", "jana@cto.cz"]);
  });

  it("gives a person their figures, their split by mode, their covers and their load", () => {
    expect(teamRows(PEOPLE, everyone)[0]).toEqual({
      key: "jana@cto.cz",
      name: "jana@cto.cz",
      nobody: false,
      notUser: false,
      coverOnly: false,
      highLoad: true,
      away: "",
      active: 12,
      modes: "Sea 8 · Air 3 · Road 1",
      urgent: 3,
      attention: 2,
      todosLate: 2,
      mentionsUnread: 1,
      notTouched: 4,
      covers: 2,
      coversText: "2 · since 03.11.",
      href: "/shipments/managers?handledBy=jana%40cto.cz",
    });
  });

  it("marks the jobs nobody handles as nobody - not as somebody who is not a user, and never as a high load", () => {
    const nobody = teamRows([person("", { isUser: false, active: 40, highLoad: true })], everyone)[0]!;
    expect(nobody).toMatchObject({ key: "nobody", name: "Nobody", nobody: true, notUser: false, coverOnly: false, highLoad: false, href: "/shipments/managers?handledBy=nobody" });
  });

  it("marks who is not a user - and nobody while the users are not known", () => {
    expect(teamRows(PEOPLE, everyone)[2]).toMatchObject({ name: "petr@old.cz", notUser: true });
    expect(teamRows([person("petr@old.cz", { isUser: null })], everyone)[0]).toMatchObject({ notUser: false });
  });

  it("marks who only stands in as a Holiday Cover, with their covers and no link", () => {
    expect(teamRows(PEOPLE, everyone)[3]).toMatchObject({ name: "eva@cto.cz", coverOnly: true, active: 0, modes: "", coversText: "3 · since 28.10.", href: null });
  });

  it("keeps a figure that was not read as not read", () => {
    const row = teamRows([person("jana@cto.cz", { todosLate: null, mentionsUnread: null, notTouched: null })], everyone)[0]!;
    expect([row.todosLate, row.mentionsUnread, row.notTouched]).toEqual([null, null, null]);
    expect([row.todosLate, row.mentionsUnread, row.notTouched].map(teamFigure)).toEqual(["–", "–", "–"]);
    // One not read does not hide the others.
    expect(teamRows([person("jana@cto.cz", { todosLate: 3, mentionsUnread: null, notTouched: 0 })], everyone)[0]).toMatchObject({ todosLate: 3, mentionsUnread: null, notTouched: 0 });
  });

  it("does not fall over an answer from before step 3: no split, no step 3 figures", () => {
    const old = JSON.parse(JSON.stringify({ handledBy: "jana@cto.cz", isUser: true, active: 4, urgent: 1, attention: 0, covers: 1 })) as OpsCockpitPerson;
    const [row] = teamRows([old], everyone);
    expect(row).toMatchObject({ active: 4, modes: "", todosLate: null, mentionsUnread: null, notTouched: null, highLoad: false, away: "", coversText: "1" });
  });

  it("carries the page's mode, direction and My reports into every link", () => {
    const rows = teamRows(PEOPLE, { mode: "sea", direction: "export", reports: "mine" });
    expect(rows[0]!.href).toBe("/shipments/managers?mode=sea&direction=export&handledBy=jana%40cto.cz&reports=mine");
    expect(rows[1]!.href).toBe("/shipments/managers?mode=sea&direction=export&handledBy=nobody&reports=mine");
  });

  it("marks who is away today until the last day of their absence - never the jobs nobody handles", () => {
    expect(teamRows([person("jana@cto.cz", { awayUntil: "2026-11-28" })], everyone)[0]).toMatchObject({ away: "away until 28.11." });
    expect(awayText({ handledBy: "jana@cto.cz", awayUntil: null })).toBe("");
    expect(awayText({ handledBy: "", awayUntil: "2026-11-28" })).toBe("");
    // An answer from before step 6 has no field: not away, as far as anybody knows.
    expect(awayText({ handledBy: "jana@cto.cz" })).toBe("");
  });

  it("has no rows for no people", () => {
    expect(teamRows([], everyone)).toEqual([]);
  });
});
