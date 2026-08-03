import { api, APIError } from "encore.dev/api";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem, ContainerLine, CargoItemLine } from "../interfaces/interfaces";

interface ShipmentUpdateRequest {
  shipmentId: string;
  shipper?: string;
  consignee?: string;
  pol?: string;
  pod?: string;
  destination?: string;
  countryCode?: string;
  origin?: string;
  tradeDirection?: string;
  loadType?: string;
  status?: string;
  customsStatus?: string;
  vessel?: string;
  voyage?: string;
  shippingLine?: string;
  bookingNumber?: string;
  typeOfPackages?: string;
  serviceName?: string;
  invoicingStatus?: string;
  personalReference?: string;
  agent?: string;
  hsCode?: string;
  cargoDescription?: string;
  incotermOrigin?: string;
  incotermDestination?: string;
  houseBolNumber?: string;
  masterBolNumber?: string;
  houseBolType?: string;
  masterBolType?: string;
  pcs?: string;
  totalWeightTons?: string;
  totalVolumeCbm?: string;
  cargoOrigin?: string;
  commercialInvoiceValue?: string;

  // Meta
  shipmentsDate?: string;
  department?: string;
  personInCharge?: string;
  holidayCover?: string;

  // Customer
  customerId?: string;
  shipperId?: string;
  consigneeId?: string;
  customer?: string;
  customerPic?: string;
  customerReference?: string;

  // Commercial parties
  pickupAddress?: string;
  deliveryAddress?: string;
  shipperContact?: string;
  consigneeContact?: string;
  shipperOpeningFrom?: string;
  shipperOpeningTo?: string;
  consigneeOpeningFrom?: string;
  consigneeOpeningTo?: string;

  // Status / mode
  freeComments?: string;
  freightMode?: string;

  // Agent
  agentPic?: string;
  serviceType?: string;

  // Insurance
  insurance?: string;

  // Dates
  estimatedDeparture?: string;
  estimatedArrival?: string;
  actualDeparture?: string;
  actualArrival?: string;
  cargoReadinessDate?: string;
  pickupDate?: string;
  pickupTime?: string;
  closingDate?: string;
  etaWarehouse?: string;
  plannedDeliveryDate?: string;
  plannedDeliveryTime?: string;

  // Commercial
  commercialInvoice?: string;
  creditCheck?: string;
  approvedBy?: string;
  bookingConfirmation?: string;
  customsProcedure?: string;
  equipmentDelivery?: string;
  supplierPic?: string;

  // Compliance
  vgm?: string;
  shippingInstructions?: string;
  ams?: string;
  isf?: string;
  bolDraft?: string;

  // Switch BoL
  switchBol?: string;
  switchBolApprovedBy?: string;
  switchBolNumber?: string;

  // Containers (4 sets)
  containerCount1?: string;
  containerLength1?: string;
  containerType1?: string;
  containerCount2?: string;
  containerLength2?: string;
  containerType2?: string;
  containerCount3?: string;
  containerLength3?: string;
  containerType3?: string;
  containerCount4?: string;
  containerLength4?: string;
  containerType4?: string;

  // Dimensions (JSONB)
  dimensions?: unknown;
  containers?: ContainerLine[];
  cargoItems?: CargoItemLine[];

  // Quote
  salesNumber?: string;
  selling?: string;
  buying?: string;
  quoteValidity?: string;
  validityStatus?: string;
  salesPerson?: string;

  // Other
  claim?: string;
  createdBy?: string;
}

interface ShipmentUpdateResponse {
  shipment: ShipmentItem;
}

export const shipmentUpdate = api(
  { expose: true, auth: false, method: "PATCH", path: "/shipments/:shipmentId" },
  async (req: ShipmentUpdateRequest): Promise<ShipmentUpdateResponse> => {
    const { shipmentId, ...data } = req;
    // TODO: get userId from auth context once auth is enforced
    const userId = "00000000-0000-0000-0000-000000000000";
    const shipment = await shipmentService.update(shipmentId, data, userId);
    if (!shipment) {
      throw APIError.notFound("Shipment not found");
    }
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
