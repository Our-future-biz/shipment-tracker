// What the one clicking the warehouse's Inform Operations is told. The server posts "Cargo has been
// remeasured by the warehouse" to the shipment's chat and answers whom it tagged (the shipment's
// Person in Charge and Holiday Cover), so this says what really happened. Pure.

export interface InformedText {
  level: "success" | "warning";
  text: string;
}

/** `tagged`: the e-mails tagged; null for a stand-alone warehouse position (no shipment, no chat). */
export function informedText(tagged: readonly string[] | null): InformedText {
  if (tagged === null) return { level: "success", text: "Operations informed — logged (a stand-alone position has no shipment chat to post to)" };
  if (!tagged.length) return { level: "warning", text: "Posted in the shipment's chat, but nobody is set in Handled By or Holiday Cover to notify" };
  return { level: "success", text: `Operations informed in the shipment's chat — tagged ${tagged.join(", ")}` };
}

/**
 * The queries that show the notice once posted: the shipment's chat, and the bell's mentions with
 * the grid's unread marks (every "shipment-comments" query).
 */
export function chatQueryKeys(shipmentId: string | null | undefined): (readonly string[])[] {
  return [...(shipmentId ? [["comments", shipmentId] as const] : []), ["shipment-comments"] as const];
}
