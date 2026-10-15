// Incoterms® 2020 rules: the code stored on a record and its full name for display.
export const INCOTERM_NAMES: Record<string, string> = {
  EXW: "Ex Works",
  FCA: "Free Carrier",
  FAS: "Free Alongside Ship",
  FOB: "Free On Board",
  CFR: "Cost and Freight",
  CIF: "Cost, Insurance and Freight",
  CPT: "Carriage Paid To",
  CIP: "Carriage and Insurance Paid To",
  DPU: "Delivered at Place Unloaded",
  DAP: "Delivered at Place",
  DDP: "Delivered Duty Paid",
};

/** The codes, in the order of the rules (E, F, C, D groups); the one list for every picker. */
export const INCOTERMS = Object.keys(INCOTERM_NAMES);

/** "FOB – Free On Board"; an unknown code is shown as it is. */
export function incotermLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "";
  const name = INCOTERM_NAMES[c.toUpperCase()];
  return name ? `${c} – ${name}` : c;
}
