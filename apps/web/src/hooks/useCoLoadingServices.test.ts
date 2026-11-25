import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { interfaces } from "@/lib/api/client";
import { afterSailingLogWrite, CO_LOADING_KEY, invalidateAfterSailingLinks, sailingKey, shipmentSailingKind } from "./useCoLoadingServices";
import { afterCustomerNotice } from "./useShipmentTracking";
import { invalidateAfterMasterJobLink } from "./useShipments";

/** A query client holding something under each key, to see which a write marks stale. */
function holding(keys: readonly (readonly unknown[])[]) {
  const qc = new QueryClient();
  for (const key of keys) qc.setQueryData(key, { held: true });
  const stale = (key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated ?? false;
  return { qc, stale };
}

// Every view of sailing s1 the sailing's page and tabs read.
const VIEWS = ["utilization", "earnings", "removed", "shipment-facts", "box-cost-changes", "log", "notices", "master-job"] as const;

describe("what is read of a sailing (Council Outlay 14)", () => {
  it("is all under the sailing's own key, so reading the sailing again reads every view of it", () => {
    for (const view of VIEWS) expect(sailingKey("s1", view).slice(0, 3)).toEqual(sailingKey("s1"));
    expect(sailingKey("s1")).toEqual([...CO_LOADING_KEY, "sailing", "s1"]);
  });

  it("linking or taking off shipments reads again the Master Job card, the history and the customers to tell - not only the fill", () => {
    const { qc, stale } = holding([...VIEWS.map((v) => sailingKey("s1", v)), sailingKey("s2", "master-job"), [...CO_LOADING_KEY, "sailings", "svc"], ["shipments", "list"]]);
    void invalidateAfterSailingLinks(qc, "s1");
    for (const view of VIEWS) expect(stale(sailingKey("s1", view)), view).toBe(true);
    expect(stale([...CO_LOADING_KEY, "sailings", "svc"])).toBe(true);
    expect(stale(["shipments", "list"])).toBe(true);
    // Another sailing's views are not this sailing's.
    expect(stale(sailingKey("s2", "master-job"))).toBe(false);
  });

  it("a tick or a note keeps the log as saved, and reads again the Earnings record of changes that words them", () => {
    const { qc, stale } = holding([sailingKey("s1", "box-cost-changes"), sailingKey("s1", "earnings")]);
    const log = { checklist: [], note: "Seal checked" } as unknown as interfaces.SailingLog;
    void afterSailingLogWrite(qc, "s1", log);
    expect(qc.getQueryData(sailingKey("s1", "log"))).toBe(log);
    expect(stale(sailingKey("s1", "box-cost-changes"))).toBe(true);
    expect(stale(sailingKey("s1", "earnings"))).toBe(false);
  });

  it("a sailed or rolled notice told from a shipment's page reads again every sailing's customers to tell", () => {
    const keys = [sailingKey("s1", "notices"), sailingKey("s2", "notices"), sailingKey("s1", "log"), ["customer-notes", "c1"]];
    for (const kind of ["sailed", "rolled"]) {
      const { qc, stale } = holding(keys);
      afterCustomerNotice(qc, kind);
      expect(stale(sailingKey("s1", "notices"))).toBe(true);
      expect(stale(sailingKey("s2", "notices"))).toBe(true);
      expect(stale(sailingKey("s1", "log"))).toBe(false);
      expect(stale(["customer-notes", "c1"])).toBe(true);
    }
    const { qc, stale } = holding(keys);
    afterCustomerNotice(qc, "eta_change");
    expect(stale(sailingKey("s1", "notices"))).toBe(false);
    expect(stale(["customer-notes", "c1"])).toBe(true);
  });

  it("a shipment linked to a master job or off one reads again the sailings' Master Job cards", () => {
    const { qc, stale } = holding([sailingKey("s1", "master-job"), [...CO_LOADING_KEY, "board"]]);
    void invalidateAfterMasterJobLink(qc);
    expect(stale(sailingKey("s1", "master-job"))).toBe(true);
    expect(stale([...CO_LOADING_KEY, "board"])).toBe(false);
  });

  it("knows a shipment's kind for its sailing's read the same on the header and in a dialog of the page", () => {
    expect(shipmentSailingKind({ serviceName: " ISHA ", freightMode: "Sea Freight", loadType: null })).toBe("ISHA|Sea Freight|");
    expect(shipmentSailingKind({})).toBe("||");
  });
});
