import type { ShipmentItem } from "@/hooks/useShipments";

// `masterJobs` are the MCZ numbers of every master job on the server: one created
// on the Master Jobs page has no shipments yet, so the shipments alone miss it.
export function nextMczNumber(shipments: ShipmentItem[], masterJobs: string[] = []): string {
  let max = 0;
  for (const mn of [...shipments.map((s) => s.masterJobMczNumber), ...masterJobs]) {
    if (mn && mn.startsWith("MCZ")) {
      const num = parseInt(mn.substring(3), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `MCZ${String(max + 1).padStart(8, "0")}`;
}

export function existingMczNumbers(shipments: ShipmentItem[], masterJobs: string[] = []): string[] {
  const set = new Set<string>();
  for (const mn of [...shipments.map((s) => s.masterJobMczNumber), ...masterJobs]) {
    if (mn && mn.startsWith("MCZ")) set.add(mn);
  }
  return Array.from(set).sort();
}
