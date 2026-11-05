import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { shipments } from "~encore/clients";

// The warehouse's "Inform Operations" (Shipments → Warehouse in the warehouse service, a position
// or shipment in Warehouse Concept) tells the shipment's people in its chat: the shipments service
// posts "Cargo has been remeasured by the warehouse" as the user clicking, tagging the shipment's
// Person in Charge and Holiday Cover. Each warehouse service calls this inside the transaction that
// records when Operations were informed, so a notice that could not be posted records nothing.

export interface RemeasuredFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/** What the screen compared the remeasured lines with (see the shipments service's lib/remeasureNotice). */
export type ComparedWith = "dimensions" | "declared";

/** Posts the notice; answers the e-mails tagged (empty when nobody is set to notify). */
export async function tellOperations(shipmentId: string, remeasured: RemeasuredFigures, comparedWith: ComparedWith, note = ""): Promise<string[]> {
  try {
    const { tagged } = await shipments._internalShipmentRemeasureNotice({ shipmentId, remeasured, comparedWith, note });
    return tagged;
  } catch (err) {
    if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.notFound("Shipment not found");
    if (err instanceof APIError && err.code === ErrCode.InvalidArgument) throw err;
    log.warn("warehouse: the remeasurement notice could not be posted to the shipment's chat", { shipmentId, error: err instanceof Error ? err.message : String(err) });
    throw APIError.unavailable("The message to the shipment's chat could not be posted, so Operations were not informed — try again");
  }
}
