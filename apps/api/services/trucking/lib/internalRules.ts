// Which consignments Trucking bills internally (owner decision, 15 Oct 2026): a consignment whose
// job is owned by another department than the Road Department. Operations sells such a job to the
// customer itself; Trucking charges Operations from the Internal tariff, and the haulier cost stays
// in Trucking's own ledger instead of the job's Costs. Pure.

/** The department that owns Trucking's own road jobs (as Shipments stores it). */
export const ROAD_DEPARTMENT = "Road Department";

/** Whether a consignment on a job of `department` is billed internally. A job without a department is Trucking's own. */
export function isInternalDepartment(department: string | null | undefined): boolean {
  const d = (department ?? "").trim();
  return d !== "" && d.toLowerCase() !== ROAD_DEPARTMENT.toLowerCase();
}
