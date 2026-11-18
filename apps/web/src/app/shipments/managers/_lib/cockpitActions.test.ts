import { describe, expect, it } from "vitest";
import { CUTOFF_KEYS } from "@/lib/managerActions";
import { NUDGE_NEEDS_HANDLED_BY, canNudge, cutoffsToast, dismissableCutoffs, handOverJob, handOverToast, hasActions, nudgeToast, ticksStillListed } from "./cockpitActions";

const tag = (text: string, urgent = true, kind: string | undefined = "cutoff") => ({ text, urgent, kind });

describe("Shipments → Managers: the cut-offs a row can dismiss", () => {
  it("offers a missed Closing", () => {
    expect(dismissableCutoffs([tag("Closing missed · 16.11. 10:00")])).toEqual([{ key: "closingDate", label: "Closing missed · 16.11. 10:00" }]);
    expect(dismissableCutoffs([tag("Closing missed · today 10:00")])).toEqual([{ key: "closingDate", label: "Closing missed · today 10:00" }]);
  });

  it("offers an overdue filing, each under its own key", () => {
    expect(dismissableCutoffs([tag("VGM overdue 2 days")])).toEqual([{ key: "vgmClosing", label: "VGM overdue 2 days" }]);
    expect(dismissableCutoffs([tag("SI overdue · today 10:00")])).toEqual([{ key: "siClosing", label: "SI overdue · today 10:00" }]);
    expect(dismissableCutoffs([tag("AMS overdue 1 day")])).toEqual([{ key: "amsDeadline", label: "AMS overdue 1 day" }]);
    expect(dismissableCutoffs([tag("ISF overdue 3 days")])).toEqual([{ key: "isfDeadline", label: "ISF overdue 3 days" }]);
  });

  it("offers every missed cut-off of the row, in the tags' order", () => {
    const tags = [tag("Closing missed · 16.11."), tag("Customs hold", true, "customs"), tag("VGM overdue 2 days"), tag("SI overdue 1 day")];
    expect(dismissableCutoffs(tags).map((c) => c.key)).toEqual(["closingDate", "vgmClosing", "siClosing"]);
  });

  it("does not offer a cut-off that is still to be met: due today, tomorrow or in the days after", () => {
    expect(dismissableCutoffs([tag("Closing today 16:00")])).toEqual([]);
    expect(dismissableCutoffs([tag("VGM due tomorrow")])).toEqual([]);
    expect(dismissableCutoffs([tag("SI 20.11.", false)])).toEqual([]);
    // Not urgent: whatever it says, it is not a miss the URGENT card holds.
    expect(dismissableCutoffs([tag("VGM overdue 2 days", false)])).toEqual([]);
  });

  it("does not take another kind of tag for a cut-off, whatever it says", () => {
    expect(dismissableCutoffs([tag("To-do 2 days overdue", true, "todo")])).toEqual([]);
    expect(dismissableCutoffs([tag("Closing missed · 16.11.", true, "tracking")])).toEqual([]);
    // A tag of an older answer names no kind.
    expect(dismissableCutoffs([{ text: "VGM overdue 2 days", urgent: true }])).toEqual([]);
  });

  it("leaves out a cut-off this page does not know, and a word that only looks like one", () => {
    expect(dismissableCutoffs([tag("ENS overdue 2 days")])).toEqual([]);
    expect(dismissableCutoffs([tag("constructor overdue 2 days")])).toEqual([]);
    expect(dismissableCutoffs([tag("vgm overdue 2 days")])).toEqual([]);
    // "Closing" must say missed; an overdue filing must have a word before " overdue".
    expect(dismissableCutoffs([tag("Closing soon")])).toEqual([]);
  });

  it("offers each cut-off once", () => {
    expect(dismissableCutoffs([tag("VGM overdue 2 days"), tag("VGM overdue · today 10:00")])).toEqual([{ key: "vgmClosing", label: "VGM overdue 2 days" }]);
  });

  it("offers nothing on a row with no tags", () => {
    expect(dismissableCutoffs([])).toEqual([]);
  });

  it("knows a tag's first word for every cut-off the dialog can dismiss, and for no other", () => {
    const tags = [tag("Closing missed · 16.11."), tag("VGM overdue 1 day"), tag("SI overdue 1 day"), tag("AMS overdue 1 day"), tag("ISF overdue 1 day")];
    expect(dismissableCutoffs(tags).map((c) => c.key)).toEqual([...CUTOFF_KEYS]);
  });
});

describe("Shipments → Managers: what a row offers", () => {
  it("has actions for a job, none for a Master Job", () => {
    expect(hasActions({ kind: "job" })).toBe(true);
    expect(hasActions({ kind: "masterJob" })).toBe(false);
    // A row of an older answer says no kind: it is a job.
    expect(hasActions({} as { kind: "job" })).toBe(true);
  });

  it("nudges only where somebody is in Handled By, and says what to do first where nobody is", () => {
    expect(canNudge({ handledBy: "jana@cto.cz" })).toBe(true);
    expect(canNudge({ handledBy: "" })).toBe(false);
    expect(canNudge({ handledBy: "  " })).toBe(false);
    expect(NUDGE_NEEDS_HANDLED_BY).toBe("Nobody in Handled By: hand the job over first");
  });

  it("gives the hand-over dialog the job, who handles it and who covers", () => {
    const row = { kind: "job" as const, id: "abc", jobNumber: "CZ00000053", customer: "ACME", handledBy: "jana@cto.cz", holidayCover: "", tags: [] };
    expect(handOverJob(row)).toEqual({ id: "abc", jobNumber: "CZ00000053", handledBy: "jana@cto.cz", holidayCover: "" });
  });

});

describe("Shipments → Managers: the ticks of the rows listed", () => {
  it("keeps the ticks of the rows that are listed, in the order they were ticked", () => {
    expect(ticksStillListed(["job:c", "job:a"], ["job:a", "job:b", "job:c"])).toEqual(["job:c", "job:a"]);
  });

  it("drops the tick of a row that left the list", () => {
    expect(ticksStillListed(["job:a", "job:x", "job:c"], ["job:a", "job:b", "job:c"])).toEqual(["job:a", "job:c"]);
    expect(ticksStillListed(["job:x"], [])).toEqual([]);
  });

  it("does not tick a row again that left and came back", () => {
    const first = ticksStillListed(["job:a", "job:b"], ["job:a"]);
    expect(first).toEqual(["job:a"]);
    // job:b is listed again: its tick is gone for good.
    expect(ticksStillListed(first, ["job:a", "job:b"])).toEqual(["job:a"]);
  });

  it("hands back the same ticks when nothing is dropped, so nothing is set again", () => {
    const ticked = ["job:a", "job:b"];
    expect(ticksStillListed(ticked, ["job:b", "job:a", "job:c"])).toBe(ticked);
    const none: string[] = [];
    expect(ticksStillListed(none, ["job:a"])).toBe(none);
    expect(ticksStillListed(ticked, ["job:a"])).not.toBe(ticked);
  });

  it("keeps a job and a Master Job of the same id apart", () => {
    expect(ticksStillListed(["job:1"], ["masterJob:1"])).toEqual([]);
  });
});

describe("Shipments → Managers: what is said after an action", () => {
  const skipped = (n: number) => Array.from({ length: n }, (_, i) => ({ shipmentId: `s${i}`, jobNumber: `CZ0000000${i}`, why: "already so" }));

  it("says how many jobs were handed over", () => {
    expect(handOverToast({ changed: 1, skipped: [] })).toEqual({ tone: "success", text: "1 job handed over" });
    expect(handOverToast({ changed: 12, skipped: [] })).toEqual({ tone: "success", text: "12 jobs handed over" });
  });

  it("says how many were left as they were", () => {
    expect(handOverToast({ changed: 3, skipped: skipped(1) })).toEqual({ tone: "success", text: "3 jobs handed over, 1 job left as it was" });
    expect(handOverToast({ changed: 1, skipped: skipped(2) })).toEqual({ tone: "success", text: "1 job handed over, 2 jobs left as they were" });
  });

  it("does not call a hand-over that changed nothing done", () => {
    expect(handOverToast({ changed: 0, skipped: skipped(2) })).toEqual({ tone: "info", text: "No job was changed: 2 jobs left as they were" });
    expect(handOverToast({ changed: 0, skipped: [] })).toEqual({ tone: "info", text: "No job was changed" });
  });

  it("says a hand-over was done when the dialog hands back no figures", () => {
    expect(handOverToast(undefined)).toEqual({ tone: "success", text: "Handed over" });
  });

  it("says where a nudge's to-do is and who has it under their bell", () => {
    expect(nudgeToast("CZ00000053", { told: ["jana@cto.cz"] })).toEqual({ tone: "success", text: "To-do left on CZ00000053; under the bell of jana@cto.cz" });
    expect(nudgeToast("CZ00000053", { told: ["jana@cto.cz", "petr@cto.cz"] }).text).toBe("To-do left on CZ00000053; under the bell of jana@cto.cz and petr@cto.cz");
  });

  it("says so when the to-do is there but nobody was told", () => {
    const said = nudgeToast("CZ00000053", { told: [] });
    expect(said.tone).toBe("info");
    expect(said.text).toBe("To-do left on CZ00000053, but nobody has it under their bell: Handled By and Holiday Cover are not users");
  });

  it("says a nudge was left when the dialog hands back nothing, also on a job with no number", () => {
    expect(nudgeToast("CZ00000053", undefined)).toEqual({ tone: "success", text: "Nudge left on CZ00000053" });
    expect(nudgeToast("", undefined)).toEqual({ tone: "success", text: "Nudge left" });
  });

  it("says a cut-off was dismissed, and that it is gone from both pages", () => {
    expect(cutoffsToast("CZ00000053", "dismissed")).toEqual({ tone: "success", text: "Cut-off dismissed on CZ00000053: it no longer shows on either page" });
    expect(cutoffsToast("", "dismissed").text).toBe("Cut-off dismissed: it no longer shows on either page");
  });

  it("says a dismissal was taken back, and that the cut-off counts again", () => {
    expect(cutoffsToast("CZ00000053", "taken_back")).toEqual({ tone: "success", text: "Dismissal taken back on CZ00000053: the cut-off shows again" });
    expect(cutoffsToast("", "taken_back").text).toBe("Dismissal taken back: the cut-off shows again");
  });

  it("says only that the missed cut-offs changed when the dialog does not say which way", () => {
    expect(cutoffsToast("CZ00000053")).toEqual({ tone: "success", text: "Missed cut-offs of CZ00000053 changed: the signals are read again" });
    expect(cutoffsToast("CZ00000053", null).text).toBe("Missed cut-offs of CZ00000053 changed: the signals are read again");
    expect(cutoffsToast("").text).toBe("Missed cut-offs changed: the signals are read again");
    // A word a newer dialog might say is not guessed at.
    expect(cutoffsToast("CZ00000053", "moved" as never).text).toBe("Missed cut-offs of CZ00000053 changed: the signals are read again");
    expect(cutoffsToast("CZ00000053").text).not.toContain("dismissed");
  });
});
