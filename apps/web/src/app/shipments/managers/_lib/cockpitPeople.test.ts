import { describe, expect, it } from "vitest";
import type { OpsCockpitPerson } from "@/hooks/useShipmentsManagersCockpit";
import { EVERYONE } from "./cockpitAddress";
import { filterValueOf, handledByOptions, isNotUser, personFigures, personName, teamOf } from "./cockpitPeople";

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
  ...over,
});

// As the server sends them: the most active first, nobody among them.
const PEOPLE = [person("jana@cto.cz", { active: 12, urgent: 3 }), person("", { isUser: false, active: 5, urgent: 5 }), person("petr@old.cz", { isUser: false, active: 2 })];

describe("Shipments → Managers: people", () => {
  it("calls a person by the e-mail and the jobs nobody handles Nobody", () => {
    expect(personName("jana@cto.cz")).toBe("jana@cto.cz");
    expect(personName("")).toBe("Nobody");
  });

  it("marks who is not a user - never nobody, and nobody at all while the users are not known", () => {
    expect(isNotUser(person("petr@old.cz", { isUser: false }))).toBe(true);
    expect(isNotUser(person("jana@cto.cz", { isUser: true }))).toBe(false);
    expect(isNotUser(person("jana@cto.cz", { isUser: null }))).toBe(false);
    expect(isNotUser(person("", { isUser: false }))).toBe(false);
    expect(isNotUser(person("", { isUser: null }))).toBe(false);
  });

  it("says a person's active and urgent jobs, and the Holiday Cover only when there is one", () => {
    expect(personFigures(person("jana@cto.cz", { active: 12, urgent: 3 }))).toBe("12 active · 3 urgent");
    expect(personFigures(person("jana@cto.cz", { active: 1, urgent: 0, covers: 4 }))).toBe("1 active · 0 urgent · Holiday Cover on 4");
  });

  it("lists the team in the server's order with nobody last", () => {
    expect(teamOf(PEOPLE).map((p) => p.handledBy)).toEqual(["jana@cto.cz", "petr@old.cz", ""]);
    expect(teamOf([])).toEqual([]);
  });

  it("leaves out of the Team line who only stands in as a Holiday Cover: narrowed to them the cards would be empty", () => {
    const cover = person("eva@cto.cz", { active: 0, covers: 3 });
    expect(teamOf([...PEOPLE, cover]).map((p) => p.handledBy)).toEqual(["jana@cto.cz", "petr@old.cz", ""]);
    expect(teamOf([cover])).toEqual([]);
  });

  it("filters by a person's e-mail, by nobody for the jobs nobody handles", () => {
    expect(filterValueOf(person("jana@cto.cz"))).toBe("jana@cto.cz");
    expect(filterValueOf(person(""))).toBe("nobody");
  });
});

describe("Shipments → Managers: the Handled By select", () => {
  it("offers Everyone, each person with their active jobs, and Nobody last", () => {
    expect(handledByOptions(PEOPLE, null)).toEqual([
      { value: EVERYONE, label: "Everyone" },
      { value: "jana@cto.cz", label: "jana@cto.cz · 12 active" },
      { value: "petr@old.cz", label: "petr@old.cz · 2 active · not a user" },
      { value: "nobody", label: "Nobody · 5 active" },
    ]);
  });

  it("offers Everyone and Nobody before the answer is there", () => {
    expect(handledByOptions([], null)).toEqual([
      { value: EVERYONE, label: "Everyone" },
      { value: "nobody", label: "Nobody" },
    ]);
  });

  it("keeps a person the address names who has no active job here", () => {
    expect(handledByOptions(PEOPLE, "eva@cto.cz").map((o) => o.value)).toEqual([EVERYONE, "jana@cto.cz", "petr@old.cz", "eva@cto.cz", "nobody"]);
    expect(handledByOptions([], "eva@cto.cz")).toContainEqual({ value: "eva@cto.cz", label: "eva@cto.cz" });
  });

  it("does not offer who only stands in as a Holiday Cover - unless the address names them", () => {
    const withCover = [...PEOPLE, person("eva@cto.cz", { active: 0, covers: 3 })];
    expect(handledByOptions(withCover, null).map((o) => o.value)).toEqual([EVERYONE, "jana@cto.cz", "petr@old.cz", "nobody"]);
    // Named by the address, they are shown as who the page is narrowed to, with no count.
    expect(handledByOptions(withCover, "eva@cto.cz")).toContainEqual({ value: "eva@cto.cz", label: "eva@cto.cz" });
    expect(handledByOptions(withCover, "eva@cto.cz").filter((o) => o.value === "eva@cto.cz")).toHaveLength(1);
  });

  it("lists nobody once, whatever the address names", () => {
    for (const handledBy of ["nobody", "jana@cto.cz", "eva@cto.cz", "everyone", null]) {
      const values = handledByOptions(PEOPLE, handledBy).map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("does not mark anybody while the users are not known", () => {
    const unknown = PEOPLE.map((p) => ({ ...p, isUser: null }));
    expect(handledByOptions(unknown, null).some((o) => o.label.includes("not a user"))).toBe(false);
  });
});
