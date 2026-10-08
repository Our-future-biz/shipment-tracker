// antd Tag colour for a shipment status. Statuses are long free-text labels with a
// direction suffix ("Billed [IMP]"), so the colour is picked by what the label mentions.
export function statusTagColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("deliver") || s.includes("billed")) return "green";
  if (s.includes("custom")) return "gold";
  if (s.includes("transit") || s.includes("shipped") || s.includes("transport")) return "blue";
  if (s.includes("cargo") || s.includes("ready")) return "cyan";
  if (s.includes("book") || s.includes("confirm") || s.includes("pending")) return "geekblue";
  return "default";
}
