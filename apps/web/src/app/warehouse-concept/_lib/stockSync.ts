import type { interfaces } from "@/lib/api/client";

// What "Build stock from gate records" did or will do, as text (the hook is hooks/useStockSync).

export type StockSyncResult = interfaces.WarehouseStockSyncResult;

/** "3 lines to create, 1 to close · 2 bonded entries to open" — what the build will do. */
export function stockSyncText(r: StockSyncResult, future: boolean): string {
  const will = (n: number, what: string) => (n ? `${n} ${what}` : "");
  const lines = [
    will(r.linesCreated, future ? "to create" : "created"),
    will(r.linesClosed, future ? "to close" : "closed"),
    will(r.linesVoided, future ? "to void" : "voided"),
    will(r.linesReopened, future ? "to reopen" : "reopened"),
  ].filter(Boolean);
  const bonded = [
    will(r.bondedOpened, future ? "to open" : "opened"),
    will(r.bondedDischarged, future ? "to discharge" : "discharged"),
    will(r.bondedVoided, future ? "to void" : "voided"),
  ].filter(Boolean);
  const parts = [
    lines.length ? `Stock lines: ${lines.join(", ")}` : "Stock lines: nothing to change",
    bonded.length ? `Bonded register: ${bonded.join(", ")}` : "",
  ].filter(Boolean);
  return `${parts.join(" · ")} (${r.positions} gate record${r.positions === 1 ? "" : "s"} checked)`;
}
