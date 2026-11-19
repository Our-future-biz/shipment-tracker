import { describe, expect, it } from "vitest";
import {
  HIGH_LOAD_FACTOR,
  HIGH_LOAD_MIN_PEOPLE,
  MENTION_UNREAD_OFFICE_HOURS,
  MENTION_UNREAD_URGENT_OFFICE_HOURS,
  NOT_TOUCHED_WORKING_DAYS,
  TODO_LATE_URGENT_WORKING_DAYS,
  TODO_TAG_CHARS,
} from "../lib/cockpitThresholds";
import { EXTRA_RANK_SCALE, OPS_RANK, SIGNAL_KINDS } from "../lib/managersCockpit";
import { EXTRA_RANK } from "../lib/managersCockpitExtra";
import {
  NO_TEAM_FACTS,
  TEAM_PARTS,
  TEAM_RANK,
  awaySignals,
  awayToday,
  awayUntilOf,
  coverSinceOf,
  highLoadAbove,
  lateTodos,
  mentionSignals,
  notTouchedSignal,
  releaseRequestSignals,
  teamFactsOf,
  todoSignals,
  touchCandidates,
  touchReadFrom,
  touchedFrom,
  unreadMentionsOf,
  type AbsenceFact,
  type MentionFact,
  type TeamJob,
  type TeamReads,
  type TodoFact,
} from "../lib/managersCockpitTeam";

// November 2026, the days these tests stand on:
//   Mon 9 · Tue 10 · Wed 11 · Thu 12 · Fri 13 · Sat 14 · Sun 15 · Mon 16 · Tue 17 (a public holiday) · Wed 18 · Thu 19 · Fri 20
// Wednesday 18 Nov 2026, 11:00 in Prague.
const TODAY = "2026-11-18";
/** A moment of a November day on Prague's clock (CET, an hour ahead of UTC). */
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);
const NOW = at(TODAY);
const CTX = { now: NOW, today: TODAY, holidays: [] as string[] };

let seq = 0;
const job = (over: Partial<TeamJob> = {}): TeamJob => ({
  id: `id-${++seq}`,
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  personInCharge: "jan@firma.cz",
  holidayCover: "",
  createdAt: at("2026-10-01"),
  updatedAt: at("2026-10-01"),
  ...over,
});
const todo = (dueDate: string, text = "Call the carrier"): TodoFact => ({ text, dueDate });
const USERS = new Map([
  ["u-jan", "jan@firma.cz"],
  ["u-eva", "eva@firma.cz"],
  ["u-petr", "petr@firma.cz"],
]);
const mention = (userId: string, day: string, time = "09:00"): MentionFact => ({ userId, at: at(day, time) });

describe("the numbers", () => {
  it("are Council Outlay 11's", () => {
    expect(NOT_TOUCHED_WORKING_DAYS).toEqual({ sea: 5, rail: 5, road: 5, air: 3 });
    expect(TODO_LATE_URGENT_WORKING_DAYS).toBe(3);
    expect(TODO_TAG_CHARS).toBe(40);
    expect([MENTION_UNREAD_OFFICE_HOURS, MENTION_UNREAD_URGENT_OFFICE_HOURS]).toEqual([4, 9]);
    expect([HIGH_LOAD_FACTOR, HIGH_LOAD_MIN_PEOPLE]).toEqual([1.5, 3]);
  });
});

describe("the ranks", () => {
  it("put the URGENT ones after every clock and state of a job and before a job with nobody; the ATTENTION ones after every other signal", () => {
    const otherTables = Object.values(EXTRA_RANK).map((rank) => rank * EXTRA_RANK_SCALE);
    const ownUrgent = [OPS_RANK.customsUrgent, OPS_RANK.closingMissed, OPS_RANK.podUrgent, 95 /* Needs Attention's last urgent flag */];
    const ownAttention = [OPS_RANK.houseBol, 275 /* Needs Attention's last attention flag */];
    for (const rank of [TEAM_RANK.mentionUrgent, TEAM_RANK.todoUrgent]) {
      expect(rank).toBeGreaterThan(Math.max(...ownUrgent));
      expect(rank).toBeLessThan(OPS_RANK.nobody);
    }
    for (const rank of [TEAM_RANK.todoLate, TEAM_RANK.mentionUnread, TEAM_RANK.notTouched]) expect(rank).toBeGreaterThan(Math.max(...otherTables, ...ownAttention));
    // A colleague waiting for an answer before a to-do; a job nobody touched last.
    expect(TEAM_RANK.mentionUrgent).toBeLessThan(TEAM_RANK.todoUrgent);
    expect([TEAM_RANK.todoLate, TEAM_RANK.mentionUnread, TEAM_RANK.notTouched]).toEqual([410, 420, 430]);
    // A release request waits for a manager as the other requests do: the same place in the card.
    expect(TEAM_RANK.releaseRequest).toBe(EXTRA_RANK.request * EXTRA_RANK_SCALE);
  });

  it("name families the cockpit's tiles know", () => {
    const signals = [
      ...todoSignals([todo("2026-11-16")], TODAY, []),
      ...mentionSignals(unreadMentionsOf(job(), [mention("u-jan", "2026-11-16")], USERS, NOW, [])),
      notTouchedSignal(job(), null, TODAY, [])!,
    ];
    expect(signals.map((s) => s.kind)).toEqual(["todo", "mention", "not_touched"]);
    expect(signals.every((s) => (SIGNAL_KINDS as readonly string[]).includes(s.kind))).toBe(true);
    // Each is worked on where the job's to-dos and chat are reached from.
    expect(signals.map((s) => s.area)).toEqual(["details", "details", "details"]);
  });
});

describe("A16: a to-do past its day", () => {
  it("is ATTENTION from the day after its day, with how late and what it says", () => {
    expect(todoSignals([todo("2026-11-16")], TODAY, [])).toEqual([{ rank: TEAM_RANK.todoLate, urgent: false, kind: "todo", area: "details", text: 'To-do 2 days late: "Call the carrier"' }]);
    expect(todoSignals([todo("2026-11-17")], TODAY, [])[0]!.text).toBe('To-do 1 day late: "Call the carrier"');
  });

  it("is not late on its day, nor before it", () => {
    expect(todoSignals([todo(TODAY), todo("2026-11-19")], TODAY, [])).toEqual([]);
    expect(todoSignals([], TODAY, [])).toEqual([]);
  });

  it("is URGENT once it is three working days late - counted in working days, the tag in the days that passed", () => {
    // Due Thu 12: Fri 13, Mon 16, Wed 18 have passed (Tue 17 is a public holiday) - three working days, six calendar days.
    expect(todoSignals([todo("2026-11-12")], TODAY, [])).toEqual([{ rank: TEAM_RANK.todoUrgent, urgent: true, kind: "todo", area: "details", text: 'To-do 6 days late: "Call the carrier"' }]);
    // Due Fri 13: Mon 16 and Wed 18 - two.
    expect(todoSignals([todo("2026-11-13")], TODAY, [])[0]).toMatchObject({ urgent: false, text: 'To-do 5 days late: "Call the carrier"' });
    // A day the company is off is no working day either: Monday off, and the to-do of Thursday is two working days late.
    expect(todoSignals([todo("2026-11-12")], TODAY, ["2026-11-16"])[0]!.urgent).toBe(false);
  });

  it("quotes one line of the title, cut at 40 characters", () => {
    const long = "Ask the shipper for the corrected packing list and the MSDS";
    expect(todoSignals([todo("2026-11-16", long)], TODAY, [])[0]!.text).toBe('To-do 2 days late: "Ask the shipper for the corrected packin…"');
    expect(todoSignals([todo("2026-11-16", "  Two\n lines \t here ")], TODAY, [])[0]!.text).toBe('To-do 2 days late: "Two lines here"');
    expect(todoSignals([todo("2026-11-16", "x".repeat(40))], TODAY, [])[0]!.text).toBe(`To-do 2 days late: "${"x".repeat(40)}"`);
  });

  it("is one tag for the job: the to-do late the longest, the others counted - and its urgency is that one's", () => {
    const todos = [todo("2026-11-17", "Newest"), todo("2026-11-12", "Oldest"), todo("2026-11-16", "Middle"), todo("2026-11-20", "Not due yet")];
    expect(todoSignals(todos, TODAY, [])).toEqual([{ rank: TEAM_RANK.todoUrgent, urgent: true, kind: "todo", area: "details", text: 'To-do 6 days late: "Oldest" · and 2 more' }]);
    expect(lateTodos(todos, TODAY).map((t) => t.text)).toEqual(["Oldest", "Middle", "Newest"]);
  });
});

describe("A17: an @mention not read", () => {
  const jans = job({ personInCharge: "jan@firma.cz — Jan Novák", holidayCover: "Eva@firma.cz " });

  it("counts for the job's Handled By and its Holiday Cover only - a colleague tagged in passing is theirs to read", () => {
    const unread = unreadMentionsOf(jans, [mention("u-jan", "2026-11-16"), mention("u-eva", "2026-11-13", "10:30"), mention("u-petr", "2026-11-12"), mention("u-gone", "2026-11-12")], USERS, NOW, []);
    expect(unread.map((u) => u.email)).toEqual(["jan@firma.cz", "eva@firma.cz"]);
    expect(mentionSignals(unread).map((s) => s.text)).toEqual(["@mention unread since 16.11. 09:00 (jan@firma.cz)", "@mention unread since 13.11. 10:30 (eva@firma.cz)"]);
  });

  it("is ATTENTION after 4 office hours and URGENT after 9, on the office's clock (08:00-17:00, working days)", () => {
    const unreadSince = (day: string, time: string) => mentionSignals(unreadMentionsOf(job(), [mention("u-jan", day, time)], USERS, NOW, []));
    // Today 08:00: three office hours by 11:00 - not yet.
    expect(unreadSince(TODAY, "08:00")).toEqual([]);
    // Monday 16:00: one hour on Monday, Tuesday a holiday, three today - four.
    expect(unreadSince("2026-11-16", "16:00")).toEqual([{ rank: TEAM_RANK.mentionUnread, urgent: false, kind: "mention", area: "details", text: "@mention unread since 16.11. 16:00 (jan@firma.cz)" }]);
    expect(unreadSince("2026-11-16", "16:01")).toEqual([]);
    // Monday 11:00: six hours on Monday and three today - nine: a whole office day went by.
    expect(unreadSince("2026-11-16", "11:00")).toEqual([{ rank: TEAM_RANK.mentionUrgent, urgent: true, kind: "mention", area: "details", text: "@mention unread since 16.11. 11:00 (jan@firma.cz)" }]);
    expect(unreadSince("2026-11-16", "11:01")[0]!.urgent).toBe(false);
    // Friday evening, after the office closed: Monday's nine hours and three of today.
    expect(unreadSince("2026-11-13", "19:30")[0]!.urgent).toBe(true);
    // Saturday's mention waits no office hour before Monday.
    expect(unreadSince("2026-11-14", "10:00")[0]).toMatchObject({ urgent: true, text: "@mention unread since 14.11. 10:00 (jan@firma.cz)" });
  });

  it("counts a day the company is off as no office day", () => {
    const monday = [mention("u-jan", "2026-11-13", "16:00")];
    // Friday 16:00: one hour, Monday nine, today three - URGENT. With Monday off: four - ATTENTION.
    expect(unreadMentionsOf(job(), monday, USERS, NOW, [])[0]!.urgent).toBe(true);
    expect(unreadMentionsOf(job(), monday, USERS, NOW, ["2026-11-16"])[0]!.urgent).toBe(false);
  });

  it("is one tag per person: since the oldest that has waited long enough, with how many have", () => {
    const mentions = [mention("u-jan", TODAY, "10:30"), mention("u-jan", "2026-11-16", "15:00"), mention("u-jan", "2026-11-12", "09:00"), mention("u-jan", TODAY, "06:00")];
    const unread = unreadMentionsOf(job(), mentions, USERS, NOW, []);
    // Today's two have waited half an hour and three office hours: not counted yet.
    expect(unread).toEqual([{ email: "jan@firma.cz", since: at("2026-11-12", "09:00"), waiting: 2, urgent: true }]);
    expect(mentionSignals(unread)).toHaveLength(1);
  });

  it("is one tag when Handled By and Holiday Cover are the same person, and none on a job with nobody", () => {
    const both = job({ personInCharge: "jan@firma.cz", holidayCover: "JAN@firma.cz" });
    expect(unreadMentionsOf(both, [mention("u-jan", "2026-11-16")], USERS, NOW, [])).toHaveLength(1);
    expect(unreadMentionsOf(job({ personInCharge: "", holidayCover: "" }), [mention("u-jan", "2026-11-16")], USERS, NOW, [])).toEqual([]);
  });

  it("says nothing of a Handled By who is no user: nobody could have tagged them", () => {
    expect(unreadMentionsOf(job({ personInCharge: "left@firma.cz" }), [mention("u-jan", "2026-11-16")], USERS, NOW, [])).toEqual([]);
  });
});

describe("U17: a release request waiting for a manager", () => {
  const asked = (day: string, time = "10:00") => ({ requestedAt: at(day, time) });

  it("is URGENT once it has waited longer than a working day, in the other requests' words", () => {
    // Asked on Monday 10:00; Tuesday is a public holiday: a working day has passed on Wednesday 10:00.
    expect(releaseRequestSignals([asked("2026-11-16")], NOW, [])).toEqual([{ rank: TEAM_RANK.releaseRequest, urgent: true, kind: "request", area: "finance", text: "Release request waiting for approval since 16.11. 10:00" }]);
    expect(releaseRequestSignals([asked("2026-11-16", "11:00")], NOW, [])).toEqual([]);
    expect(releaseRequestSignals([asked("2026-11-16", "10:59")], NOW, [])).toHaveLength(1);
  });

  it("gives no tag before that: a young request is on the Approvals tab, where it is answered", () => {
    expect(releaseRequestSignals([asked(TODAY, "08:00")], NOW, [])).toEqual([]);
    expect(releaseRequestSignals([], NOW, [])).toEqual([]);
  });

  it("counts a day the company is off as no working day", () => {
    // Asked on Friday 10:00: a working day has passed on Monday 10:00 - unless Monday is off, then on Wednesday 10:00.
    expect(releaseRequestSignals([asked("2026-11-13", "10:30")], NOW, [])).toHaveLength(1);
    expect(releaseRequestSignals([asked("2026-11-13", "11:30")], NOW, ["2026-11-16"])).toEqual([]);
  });

  it("is one tag for the job's two requests (House BoL, warehouse), aged by the older", () => {
    expect(releaseRequestSignals([asked(TODAY, "09:00"), asked("2026-11-13", "14:05")], NOW, []).map((s) => s.text)).toEqual(["2 release requests waiting for approval, the oldest since 13.11. 14:05"]);
  });
});

describe("A15: a job nobody touched", () => {
  describe("the first day a touch still counts on", () => {
    it("is the earliest day fewer than that many working days ago", () => {
      // Wed 18 back over the holiday and the weekend: 16, 13, 12, 11 are four working days before it.
      expect(touchedFrom(TODAY, 5, [])).toBe("2026-11-11");
      expect(touchedFrom(TODAY, 3, [])).toBe("2026-11-13");
      expect(touchedFrom(TODAY, 1, [])).toBe(TODAY);
      // A plain week: Friday the 13th and five working days - the Monday of that week.
      expect(touchedFrom("2026-11-13", 5, [])).toBe("2026-11-09");
      // From a Monday, three working days: Thursday - the weekend in between is nobody's silence.
      expect(touchedFrom("2026-11-09", 3, [])).toBe("2026-11-05");
    });

    it("skips the days the company is off", () => {
      expect(touchedFrom(TODAY, 5, ["2026-11-16"])).toBe("2026-11-10");
    });

    it("gives the read the longest of the modes' windows", () => {
      expect(touchReadFrom(TODAY, [])).toBe("2026-11-11");
    });
  });

  it("is a job last touched before its window, with the day it was", () => {
    const j = job();
    expect(notTouchedSignal(j, null, TODAY, [])).toEqual({ rank: TEAM_RANK.notTouched, urgent: false, kind: "not_touched", area: "details", text: "Not touched since 01.10." });
    // Touched on Wednesday the 11th: four working days ago - not yet. (The read starts there: an older touch is never handed in.)
    expect(notTouchedSignal(j, at("2026-11-11", "00:05"), TODAY, [])).toBeNull();
    expect(notTouchedSignal(j, NOW, TODAY, [])).toBeNull();
  });

  it("gives a flight's job three working days, any other five", () => {
    const friday = at("2026-11-13");
    const thursday = at("2026-11-12");
    const air = job({ freightMode: "Air Freight" });
    // Touched on Thursday: 13, 16, 18 - three working days of silence for a flight, not five for a vessel.
    expect(notTouchedSignal(air, thursday, TODAY, [])!.text).toBe("Not touched since 12.11.");
    expect(notTouchedSignal(air, friday, TODAY, [])).toBeNull();
    for (const freightMode of ["Sea Freight", "Rail Freight", "Road Freight", ""]) expect(notTouchedSignal(job({ freightMode }), thursday, TODAY, [])).toBeNull();
    expect(notTouchedSignal(job({ tradeDirection: "Domestic" }), thursday, TODAY, [])).toBeNull();
  });

  it("is never said of a job created within its window: that job is new, not forgotten", () => {
    expect(notTouchedSignal(job({ createdAt: at("2026-11-11"), updatedAt: at("2026-11-11") }), null, TODAY, [])).toBeNull();
    expect(notTouchedSignal(job({ createdAt: at("2026-11-10"), updatedAt: at("2026-11-10") }), null, TODAY, [])!.text).toBe("Not touched since 10.11.");
    // A flight's job of Thursday the 12th is old enough; of Friday it is not.
    expect(notTouchedSignal(job({ freightMode: "Air Freight", createdAt: at("2026-11-12"), updatedAt: at("2026-11-12") }), null, TODAY, [])!.text).toBe("Not touched since 12.11.");
    expect(notTouchedSignal(job({ freightMode: "Air Freight", createdAt: at("2026-11-13"), updatedAt: at("2026-11-13") }), null, TODAY, [])).toBeNull();
  });

  it("names the day by Prague's calendar", () => {
    // 23:30 UTC on the 9th is the 10th in Prague.
    const j = job({ createdAt: new Date("2026-11-09T23:30:00Z"), updatedAt: new Date("2026-11-09T23:30:00Z") });
    expect(notTouchedSignal(j, null, TODAY, [])!.text).toBe("Not touched since 10.11.");
  });

  it("with no touch found, names the day the job's row was last written - never a day inside the window, where nothing was found", () => {
    expect(notTouchedSignal(job({ updatedAt: at("2026-11-03") }), null, TODAY, [])!.text).toBe("Not touched since 03.11.");
    // The row was written yesterday by something that leaves no history: all that is known is that nothing happened since the window began.
    expect(notTouchedSignal(job({ updatedAt: at("2026-11-16") }), null, TODAY, [])!.text).toBe("Not touched since 10.11.");
    expect(notTouchedSignal(job({ freightMode: "Air Freight", updatedAt: at("2026-11-16") }), null, TODAY, [])!.text).toBe("Not touched since 12.11.");
  });

  it("asks for the last touches of the jobs old enough to be untouched only", () => {
    const old = job();
    const fresh = job({ createdAt: at("2026-11-11") });
    const edge = job({ createdAt: at("2026-11-10") });
    const flight = job({ freightMode: "Air Freight", createdAt: at("2026-11-12") });
    const newFlight = job({ freightMode: "Air Freight", createdAt: at("2026-11-13") });
    expect(touchCandidates([old, fresh, edge, flight, newFlight], TODAY, [])).toEqual([old.id, edge.id, flight.id]);
    // Whoever is no candidate gets no signal whatever is found, and the other way round.
    for (const j of [old, fresh, edge, flight, newFlight]) expect(notTouchedSignal(j, null, TODAY, []) !== null).toBe([old, edge, flight].includes(j));
  });
});

describe("since when a Holiday Cover stands", () => {
  it("is the day of its newest change in the job's history, by Prague's calendar", () => {
    expect(coverSinceOf(job({ holidayCover: "eva@firma.cz" }), new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
  });

  it("is the day the job was created when its cover never changed: it was there from the start", () => {
    expect(coverSinceOf(job({ holidayCover: "eva@firma.cz", createdAt: at("2026-10-05") }), null)).toBe("2026-10-05");
  });

  it("is nothing for a job with no Holiday Cover, whatever its history says", () => {
    expect(coverSinceOf(job({ holidayCover: "  " }), at("2026-11-09"))).toBeNull();
  });
});

describe("a load that stands out", () => {
  it("is above 1.5 times the median of the people with at least one active job", () => {
    expect(highLoadAbove([2, 4, 6])).toBe(6);
    expect(highLoadAbove([7, 1, 3, 5])).toBe(6);
    // Whoever has no job of their own (a cover only) is not among the people the median is taken of.
    expect(highLoadAbove([0, 0, 2, 4, 6])).toBe(6);
  });

  it("is not said among fewer than three such people", () => {
    expect(highLoadAbove([])).toBeNull();
    expect(highLoadAbove([1, 9])).toBeNull();
    expect(highLoadAbove([0, 1, 9])).toBeNull();
    expect(highLoadAbove([1, 1, 9])).toBe(1.5);
  });
});

describe("the jobs' facts together", () => {
  const reads = (over: Partial<TeamReads> = {}): TeamReads => ({ todos: new Map(), mentions: new Map(), touched: new Map(), coverChanged: new Map(), releaseRequests: new Map(), emailOf: USERS, absences: [], ...over });

  it("gives each job its signals and the figures the people line adds up; a job nothing is said of has no entry", () => {
    const busy = job({ holidayCover: "eva@firma.cz" });
    const quiet = job();
    const fresh = job({ createdAt: at("2026-11-16"), updatedAt: at("2026-11-16") });
    const facts = teamFactsOf(
      [busy, quiet, fresh],
      reads({
        todos: new Map([[busy.id, [todo("2026-11-16"), todo("2026-11-17", "Send the pre-alert")]]]),
        mentions: new Map([[busy.id, [mention("u-eva", "2026-11-16"), mention("u-eva", "2026-11-13"), mention("u-jan", TODAY, "10:59")]]]),
        touched: new Map([[busy.id, at("2026-11-16")]]),
        coverChanged: new Map([[busy.id, at("2026-11-09")]]),
        releaseRequests: new Map([[busy.id, [{ requestedAt: at("2026-11-13", "15:00") }]]]),
      }),
      CTX,
    );
    expect(facts.byJob.get(busy.id)).toEqual({
      signals: [
        { rank: TEAM_RANK.releaseRequest, urgent: true, kind: "request", area: "finance", text: "Release request waiting for approval since 13.11. 15:00" },
        { rank: TEAM_RANK.todoLate, urgent: false, kind: "todo", area: "details", text: 'To-do 2 days late: "Call the carrier" · and 1 more' },
        { rank: TEAM_RANK.mentionUrgent, urgent: true, kind: "mention", area: "details", text: "@mention unread since 13.11. 09:00 (eva@firma.cz)" },
      ],
      notTouched: null,
      todosLate: 2,
      mentionsUnread: new Map([["eva@firma.cz", 2]]),
      coverSince: "2026-11-09",
    });
    expect(facts.byJob.get(quiet.id)).toEqual({ signals: [], notTouched: expect.objectContaining({ text: "Not touched since 01.10." }), todosLate: 0, mentionsUnread: new Map(), coverSince: null });
    expect(facts.byJob.has(fresh.id)).toBe(false);
    expect(facts.known).toEqual({ todos: true, mentions: true, touched: true, coverSince: true });
    expect(facts.notKnown).toEqual([]);
  });

  it("says nothing of a part that was not read, and names it - not known is not zero", () => {
    const j = job({ holidayCover: "eva@firma.cz" });
    const all = { todos: new Map([[j.id, [todo("2026-11-16")]]]), mentions: new Map([[j.id, [mention("u-jan", "2026-11-16")]]]) };
    const facts = teamFactsOf([j], reads({ ...all, todos: null, touched: null, coverChanged: null, releaseRequests: null }), CTX);
    expect(facts.byJob.get(j.id)).toMatchObject({ signals: [expect.objectContaining({ kind: "mention" })], notTouched: null, todosLate: 0, coverSince: null });
    expect(facts.known).toEqual({ todos: false, mentions: true, touched: false, coverSince: false });
    expect(facts.notKnown).toEqual([TEAM_PARTS.todos, TEAM_PARTS.touched, TEAM_PARTS.coverSince, "release requests"]);
  });

  it("cannot say whom a chat line tagged without the users: the @mentions are then not known, read or not", () => {
    const j = job();
    const mentions = new Map([[j.id, [mention("u-jan", "2026-11-16")]]]);
    for (const partial of [reads({ mentions, emailOf: null }), reads({ mentions: null })]) {
      const facts = teamFactsOf([j], partial, CTX);
      expect(facts.byJob.get(j.id)?.signals ?? []).toEqual([]);
      expect(facts.known.mentions).toBe(false);
      expect(facts.notKnown).toEqual([TEAM_PARTS.mentions]);
    }
  });

  it("hands the company's days off to every count of working days and office hours", () => {
    const j = job();
    const partial = reads({ todos: new Map([[j.id, [todo("2026-11-12")]]]), mentions: new Map([[j.id, [mention("u-jan", "2026-11-13", "16:00")]]]), touched: new Map([[j.id, at("2026-11-10", "12:00")]]) });
    const plain = teamFactsOf([j], partial, CTX).byJob.get(j.id)!;
    expect(plain.signals.map((s) => s.urgent)).toEqual([true, true]);
    expect(plain.notTouched).not.toBeNull();
    const mondayOff = teamFactsOf([j], partial, { ...CTX, holidays: ["2026-11-16"] }).byJob.get(j.id)!;
    expect(mondayOff.signals.map((s) => s.urgent)).toEqual([false, false]);
    // With Monday off the window reaches back to the 10th: the touch of that day still counts.
    expect(mondayOff.notTouched).toBeNull();
  });

  it("knows nothing at all when none of it was read", () => {
    expect(NO_TEAM_FACTS.byJob.size).toBe(0);
    expect(NO_TEAM_FACTS.known).toEqual({ todos: false, mentions: false, touched: false, coverSince: false });
    expect(NO_TEAM_FACTS.notKnown).toEqual(Object.values(TEAM_PARTS));
  });
});

describe("D12: Handled By away", () => {
  const absence = (fromDate: string, toDate: string, over: Partial<AbsenceFact> = {}): AbsenceFact => ({ email: "jan@firma.cz", fromDate, toDate, hasCover: false, ...over });
  const signalsOf = (j: TeamJob, absences: AbsenceFact[], holidays: string[] = []) => awaySignals(j, absences, awayToday(absences, TODAY), TODAY, holidays);

  it("ranks a job with nobody covering an absent Handled By right after a job with nobody at all, and an absence coming first of the ATTENTION ones of the people", () => {
    expect(TEAM_RANK.awayNoCover).toBeGreaterThan(OPS_RANK.nobody);
    expect(TEAM_RANK.awayNoCover).toBeLessThan(OPS_RANK.notUser);
    const otherTables = Object.values(EXTRA_RANK).map((rank) => rank * EXTRA_RANK_SCALE);
    expect(TEAM_RANK.awaySoon).toBeGreaterThan(Math.max(...otherTables, OPS_RANK.houseBol, 275));
    expect(TEAM_RANK.awaySoon).toBeLessThan(TEAM_RANK.todoLate);
  });

  it("knows until when somebody is away today, carried on through an absence that starts the day after", () => {
    expect(awayUntilOf([absence("2026-11-16", "2026-11-20")], "jan@firma.cz", TODAY)).toBe("2026-11-20");
    expect(awayUntilOf([absence("2026-11-18", "2026-11-18")], "jan@firma.cz", TODAY)).toBe("2026-11-18");
    expect(awayUntilOf([absence("2026-11-21", "2026-11-27"), absence("2026-11-16", "2026-11-20")], "jan@firma.cz", TODAY)).toBe("2026-11-27");
    // A day in between: back on it.
    expect(awayUntilOf([absence("2026-11-16", "2026-11-20"), absence("2026-11-22", "2026-11-27")], "jan@firma.cz", TODAY)).toBe("2026-11-20");
    expect(awayUntilOf([absence("2026-11-19", "2026-11-20")], "jan@firma.cz", TODAY)).toBeNull();
    expect(awayUntilOf([absence("2026-11-10", "2026-11-17")], "jan@firma.cz", TODAY)).toBeNull();
    expect(awayUntilOf([absence("2026-11-16", "2026-11-20", { email: "eva@firma.cz" })], "jan@firma.cz", TODAY)).toBeNull();
    expect(awayToday([absence("2026-11-16", "2026-11-20"), absence("2026-11-18", "2026-11-19", { email: "eva@firma.cz" }), absence("2026-11-19", "2026-11-19", { email: "petr@firma.cz" })], TODAY)).toEqual(
      new Map([
        ["jan@firma.cz", "2026-11-20"],
        ["eva@firma.cz", "2026-11-19"],
      ]),
    );
  });

  it("is URGENT on a job whose Handled By is away today with no Holiday Cover - whether the absence names a cover or not", () => {
    for (const hasCover of [false, true]) {
      expect(signalsOf(job(), [absence("2026-11-16", "2026-11-20", { hasCover })])).toEqual([
        { rank: TEAM_RANK.awayNoCover, urgent: true, kind: "away", area: "details", text: "Handled By away until 20.11., no Holiday Cover" },
      ]);
    }
    // Handled By with a name after the e-mail is the same person.
    expect(signalsOf(job({ personInCharge: " Jan@Firma.cz — Jan Novák" }), [absence("2026-11-18", "2026-11-18")])).toHaveLength(1);
  });

  it("says nothing of a job with a Holiday Cover, with nobody in Handled By, or whose Handled By is not away", () => {
    const away = [absence("2026-11-16", "2026-11-20")];
    expect(signalsOf(job({ holidayCover: "eva@firma.cz" }), away)).toEqual([]);
    expect(signalsOf(job({ personInCharge: "" }), away)).toEqual([]);
    expect(signalsOf(job({ personInCharge: "petr@firma.cz" }), away)).toEqual([]);
    expect(signalsOf(job(), [absence("2026-11-10", "2026-11-17")])).toEqual([]);
  });

  it("counts a Holiday Cover who is not a user as no cover (S16): an absent Handled By is uncovered", () => {
    const away = [absence("2026-11-16", "2026-11-20")];
    const users = new Set(["jan@firma.cz", "eva@firma.cz"]);
    const covered = (holidayCover: string, userEmails: ReadonlySet<string> | null) => awaySignals(job({ holidayCover }), away, awayToday(away, TODAY), TODAY, [], userEmails);
    expect(covered("gone@firma.cz", users).map((s) => [s.urgent, s.text])).toEqual([[true, "Handled By away until 20.11., no Holiday Cover"]]);
    expect(covered("eva@firma.cz", users)).toEqual([]);
    // Who is a user not known: the cover is taken at its word, as before.
    expect(covered("gone@firma.cz", null)).toEqual([]);
    // teamFactsOf hands the users read on.
    const facts = teamFactsOf([job({ id: "j1", holidayCover: "gone@firma.cz" })], { todos: null, mentions: null, touched: null, coverChanged: null, releaseRequests: null, emailOf: new Map([["u1", "jan@firma.cz"]]), absences: away }, { now: NOW, today: TODAY, holidays: [] });
    expect(facts.byJob.get("j1")?.signals.map((s) => s.text)).toEqual(["Handled By away until 20.11., no Holiday Cover"]);
  });

  it("tags a job whose Holiday Cover is away today too: URGENT with its Handled By away, ATTENTION with the cover alone", () => {
    const both = [absence("2026-11-16", "2026-11-25"), absence("2026-11-17", "2026-11-20", { email: "eva@firma.cz" })];
    // Until the first of the two is back.
    expect(signalsOf(job({ holidayCover: "eva@firma.cz" }), both)).toEqual([{ rank: TEAM_RANK.awayNoCover, urgent: true, kind: "away", area: "details", text: "Handled By and Holiday Cover away until 20.11." }]);
    expect(signalsOf(job({ holidayCover: "Eva@Firma.cz — Eva Malá" }), [absence("2026-11-18", "2026-11-22", { email: "eva@firma.cz" })])).toEqual([
      { rank: TEAM_RANK.coverAway, urgent: false, kind: "away", area: "details", text: "Holiday Cover away until 22.11." },
    ]);
    // A cover away tomorrow, or not at all, says nothing.
    expect(signalsOf(job({ holidayCover: "eva@firma.cz" }), [absence("2026-11-19", "2026-11-22", { email: "eva@firma.cz" })])).toEqual([]);
    expect(TEAM_RANK.coverAway).toBeGreaterThan(TEAM_RANK.awaySoon);
    expect(TEAM_RANK.coverAway).toBeLessThan(TEAM_RANK.todoLate);
  });

  it("is ATTENTION when an absence naming no cover starts within two working days", () => {
    // Thursday 19 and Friday 20: one and two working days ahead.
    expect(signalsOf(job(), [absence("2026-11-20", "2026-11-27")])).toEqual([{ rank: TEAM_RANK.awaySoon, urgent: false, kind: "away", area: "details", text: "Handled By away from 20.11." }]);
    expect(signalsOf(job(), [absence("2026-11-19", "2026-11-19")])[0]?.text).toBe("Handled By away from 19.11.");
    // Monday 23 is the third working day; with Friday a company holiday it is the second.
    expect(signalsOf(job(), [absence("2026-11-23", "2026-11-27")])).toEqual([]);
    expect(signalsOf(job(), [absence("2026-11-23", "2026-11-27")], ["2026-11-20"])).toHaveLength(1);
    // An absence starting on the weekend is within the days.
    expect(signalsOf(job(), [absence("2026-11-21", "2026-11-22")])).toHaveLength(1);
    // One that names a cover is taken care of: its cover is set on the jobs when it starts.
    expect(signalsOf(job(), [absence("2026-11-20", "2026-11-27", { hasCover: true })])).toEqual([]);
    expect(signalsOf(job({ holidayCover: "eva@firma.cz" }), [absence("2026-11-20", "2026-11-27")])).toEqual([]);
  });

  it("hands the cockpit who is away; when the absences could not be read, no tag, nobody's awayUntil, and the part named", () => {
    const j = job();
    const read = teamFactsOf([j], { todos: new Map(), mentions: new Map(), touched: new Map(), coverChanged: new Map(), releaseRequests: new Map(), emailOf: USERS, absences: [absence("2026-11-16", "2026-11-20")] }, CTX);
    expect(read.byJob.get(j.id)?.signals.map((s) => s.kind)).toEqual(["away"]);
    expect(read.awayUntil).toEqual(new Map([["jan@firma.cz", "2026-11-20"]]));
    expect(read.notKnown).toEqual([]);
    const unread = teamFactsOf([j], { todos: new Map(), mentions: new Map(), touched: new Map(), coverChanged: new Map(), releaseRequests: new Map(), emailOf: USERS, absences: null }, CTX);
    expect(unread.byJob.get(j.id)?.signals ?? []).toEqual([]);
    expect(unread.awayUntil).toBeNull();
    expect(unread.notKnown).toEqual([TEAM_PARTS.away]);
    expect(NO_TEAM_FACTS.awayUntil).toBeNull();
  });
});
