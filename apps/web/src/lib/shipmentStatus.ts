// The tone of a shipment status, as a Badge tone (components/Badge): indigo booked and getting
// ready, sky on its way, amber in customs, green delivered or billed, grey cancelled or unknown.
// Statuses are long free-text labels with a direction suffix ("Billed [IMP]"), so the tone is
// picked by what the label mentions.
export function statusTone(status: string): "g" | "a" | "b" | "i" | "" {
  const s = status.toLowerCase();
  if (s.includes("cancelled")) return "";
  if (s.includes("deliver") || s.includes("billed")) return "g";
  if (s.includes("custom")) return "a";
  if (s.includes("transit") || s.includes("shipped") || s.includes("transport")) return "b";
  if (s.includes("cargo") || s.includes("ready")) return "i";
  if (s.includes("book") || s.includes("confirm") || s.includes("pending")) return "i";
  return "";
}

// Statuses are stored with their direction ("Billing [IMP]"); the direction is already on the
// shipment, so the app shows them without it ("Billing").
export function statusLabel(status: string | null | undefined): string {
  return (status ?? "").replace(/\s*\[(IMP|EXP|DOM)\]$/, "");
}
