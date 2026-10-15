import { describe, expect, it } from "vitest";
import { PUBLIC_STATUS, canRespond, canUploadPod, localInputToIso, podProblem, respondProblem, toLocalInput } from "./publicOrder";

describe("haulier page", () => {
  it("names every status in Czech and English", () => {
    expect(PUBLIC_STATUS.AWAITING_CONFIRMATION).toMatchObject({ cs: "Čeká na potvrzení", en: "Awaiting your confirmation" });
    expect(Object.keys(PUBLIC_STATUS)).toHaveLength(4);
  });

  it("asks to confirm once, and the POD once after confirming", () => {
    expect(canRespond({ status: "AWAITING_CONFIRMATION" })).toBe(true);
    expect(canRespond({ status: "CONFIRMED" })).toBe(false);
    expect(canUploadPod({ status: "AWAITING_CONFIRMATION", podUploaded: false })).toBe(false);
    expect(canUploadPod({ status: "CONFIRMED", podUploaded: false })).toBe(true);
    expect(canUploadPod({ status: "DELIVERED", podUploaded: true })).toBe(false);
    expect(canUploadPod({ status: "REJECTED", podUploaded: false })).toBe(false);
  });

  it("needs a name, and a reason to reject", () => {
    expect(respondProblem("CONFIRM", "", "")?.en).toBe("Enter your name.");
    expect(respondProblem("CONFIRM", "Jan", "")).toBeNull();
    expect(respondProblem("REJECT", "Jan", "")?.cs).toBe("Uveďte důvod odmítnutí.");
    expect(respondProblem("REJECT", "Jan", "no truck")).toBeNull();
  });

  it("needs the file and the receiver for a POD, never a future time", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(podProblem(false, "Eva", null, now)?.en).toMatch(/photo or PDF/);
    expect(podProblem(true, "", null, now)?.en).toBe("Enter the receiver's name.");
    expect(podProblem(true, "Eva", "2026-10-15T13:00:00Z", now)?.en).toMatch(/future/);
    expect(podProblem(true, "Eva", "2026-10-15T11:00:00Z", now)).toBeNull();
  });

  it("turns a datetime-local value into ISO and back", () => {
    const d = new Date(2026, 9, 15, 14, 5);
    expect(toLocalInput(d)).toBe("2026-10-15T14:05");
    expect(localInputToIso("2026-10-15T14:05")).toBe(d.toISOString());
    expect(localInputToIso("")).toBeNull();
  });
});
