/**
 * Only the T1 procedure names a customs office: under any other procedure the office is cleared,
 * also when the procedure changes on a screen that doesn't show the office (the grid), so a
 * shipment never keeps the office of a procedure it no longer has.
 */
export function customsOfficeForProcedure(procedure: string | null | undefined, office: string | null | undefined): { customsOffice?: string } {
  const t1 = (procedure ?? "").trim().toUpperCase() === "T1";
  return !t1 && office ? { customsOffice: "" } : {};
}
