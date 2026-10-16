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

/**
 * What a consignment does with its job's department as Shipments has it now (decision 8):
 * - "same": nothing changed;
 * - "refresh": before the POD the consignment follows the job (department and internal);
 * - "fill": after the POD a consignment that never recorded a department (made before Phase 6)
 *   records it when that keeps it on the same side - its billing does not change;
 * - "frozen": after the POD the side is fixed; the change is logged as a warning, billing unchanged.
 */
export type DepartmentPlan =
  | { kind: "same" }
  | { kind: "refresh"; department: string; internal: boolean }
  | { kind: "fill"; department: string }
  | { kind: "frozen"; department: string };

export function departmentPlan(c: { department: string; internal: boolean; podReceivedAt: Date | null }, jobDepartment: string): DepartmentPlan {
  const internal = isInternalDepartment(jobDepartment);
  if (jobDepartment === c.department && internal === c.internal) return { kind: "same" };
  if (!c.podReceivedAt) return { kind: "refresh", department: jobDepartment, internal };
  if (c.department === "" && internal === c.internal) return { kind: "fill", department: jobDepartment };
  return { kind: "frozen", department: jobDepartment };
}
