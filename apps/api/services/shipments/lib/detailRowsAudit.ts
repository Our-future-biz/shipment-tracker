import type { CargoDimensionLine, CargoItemLine, CommercialInvoiceLine, ContainerLine } from "../interfaces/interfaces";

/** A shipment's detail rows as its API shows them. */
export interface DetailRowLists {
  containers: ContainerLine[];
  cargoItems: CargoItemLine[];
  cargoDimensions: CargoDimensionLine[];
  commercialInvoices: CommercialInvoiceLine[];
}

/** An entry of a shipment's audit log for one of its detail-row lists. */
export interface DetailRowChange {
  field: keyof DetailRowLists;
  oldValue: string;
  newValue: string;
}

const LISTS = ["containers", "cargoItems", "cargoDimensions", "commercialInvoices"] as const;

// What a shipment's audit log keeps of a write of its detail rows: each list that came out
// different, as JSON of its lines before and after (a cargo line names its container by the
// container's id, which the containers' entries carry too). A list the write left as it was -
// the same lines sent again, or one the write did not touch - writes nothing.
export function detailRowChanges(before: DetailRowLists, after: DetailRowLists): DetailRowChange[] {
  return LISTS.flatMap((field) => {
    const oldValue = JSON.stringify(before[field]);
    const newValue = JSON.stringify(after[field]);
    return oldValue === newValue ? [] : [{ field, oldValue, newValue }];
  });
}
