import { describe, expect, it } from "vitest";
import { directionOf, planJobRates, type JobDates } from "../lib/jobRates";

const TODAY = "2026-10-14";
const imp: JobDates = { tradeDirection: "Import", estimatedArrival: "2026-10-20", estimatedDeparture: "2026-09-30", actualArrival: null, actualDeparture: null };
const exp: JobDates = { ...imp, tradeDirection: "Export" };
const published = () => true;

describe("planJobRates", () => {
  it("values an import without ATA by ETA, provisionally", () => {
    expect(planJobRates(imp, TODAY, null, false, published)).toEqual({ action: "provisional", basis: "eta", date: "2026-10-20" });
  });

  it("values an export without ATD by ETD", () => {
    expect(planJobRates(exp, TODAY, null, false, published)).toEqual({ action: "provisional", basis: "etd", date: "2026-09-30" });
  });

  it("locks an import at its ATA, an export at its ATD", () => {
    expect(planJobRates({ ...imp, actualArrival: "2026-10-12" }, TODAY, null, false, published)).toEqual({ action: "lock", basis: "ata", date: "2026-10-12" });
    expect(planJobRates({ ...exp, actualDeparture: "2026-10-01", actualArrival: "2026-10-12" }, TODAY, null, false, published)).toEqual({ action: "lock", basis: "atd", date: "2026-10-01" });
  });

  it("keeps an existing lock while ATA is unchanged", () => {
    expect(planJobRates({ ...imp, actualArrival: "2026-10-12" }, TODAY, { rateDate: "2026-10-12" }, false, published)).toEqual({ action: "use_lock", basis: "ata" });
  });

  it("re-locks when ATA changes before the job is invoiced", () => {
    expect(planJobRates({ ...imp, actualArrival: "2026-10-13" }, TODAY, { rateDate: "2026-10-12" }, false, published)).toEqual({ action: "lock", basis: "ata", date: "2026-10-13" });
  });

  it("keeps the lock once invoiced, whatever ATA says", () => {
    expect(planJobRates({ ...imp, actualArrival: "2026-10-13" }, TODAY, { rateDate: "2026-10-12" }, true, published)).toEqual({ action: "use_lock", basis: "ata" });
  });

  it("stays provisional while the fixing for ATA is not published (ATA today before 15:00)", () => {
    expect(planJobRates({ ...imp, actualArrival: TODAY }, TODAY, null, false, () => false)).toEqual({ action: "provisional", basis: "ata", date: TODAY });
  });

  it("does not lock on an ATA in the future", () => {
    expect(planJobRates({ ...imp, actualArrival: "2026-10-30" }, TODAY, null, false, published)).toEqual({ action: "provisional", basis: "eta", date: "2026-10-20" });
  });

  it("uses today when the job has no dates at all", () => {
    expect(planJobRates({ ...imp, estimatedArrival: null }, TODAY, null, false, published)).toEqual({ action: "provisional", basis: "today", date: TODAY });
  });

  it("treats a blank trade direction as import, and says so", () => {
    expect(directionOf("")).toEqual({ direction: "import", assumed: true });
    expect(directionOf("Export")).toEqual({ direction: "export", assumed: false });
    expect(planJobRates({ ...imp, tradeDirection: "", actualArrival: "2026-10-12" }, TODAY, null, false, published)).toMatchObject({ basis: "ata" });
  });
});
