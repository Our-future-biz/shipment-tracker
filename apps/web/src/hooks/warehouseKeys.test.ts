import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { STOCK_RECORD_KEYS, gateKeys, invalidateAfterGateEvent, sectionKeys, warehouseRecordKeys, warehouseTaskKeys } from "./warehouseKeys";

describe("invalidateAfterGateEvent", () => {
  it("reads again everything the server builds from gate events", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateAfterGateEvent({ invalidateQueries } as unknown as QueryClient);
    const keys = invalidateQueries.mock.calls.map((c) => (c as unknown as [{ queryKey: readonly unknown[] }])[0].queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        gateKeys.all,
        ...STOCK_RECORD_KEYS.map((k) => warehouseRecordKeys.of(k)),
        warehouseRecordKeys.of("containers"),
        sectionKeys.all,
        sectionKeys.summary(),
        warehouseTaskKeys.all,
      ]),
    );
  });

  it("keeps the KPI key under the report summary, so refreshing the summary refreshes KPIs", () => {
    expect(warehouseRecordKeys.kpis("2026-10-01", "2026-10-14").slice(0, 2)).toEqual(warehouseRecordKeys.reportSummary());
  });
});
