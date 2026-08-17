import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { ShipmentItem, ContainerLine, CargoItemLine, CargoDimensionLine } from "../interfaces/interfaces";

interface ShipmentCreateRequest {
  jobNumber: string;
  shipper?: string;
  consignee?: string;
  pol?: string;
  pod?: string;
  destination?: string;
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
  equipmentDeliveryDate?: string;
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

  // Detail rows (containers + cargo lines)
  containers?: ContainerLine[];
  cargoItems?: CargoItemLine[];
  cargoDimensions?: CargoDimensionLine[];

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

interface ShipmentCreateResponse {
  shipment: ShipmentItem;
}

export const shipmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments" },
  async (req: ShipmentCreateRequest): Promise<ShipmentCreateResponse> => {
    if (!req.jobNumber) {
      throw APIError.invalidArgument("jobNumber is required");
    }
    const shipment = await shipmentService.create(getAuthData()!.companyID, req);
    return { shipment: shipment as unknown as ShipmentItem };
  },
);
