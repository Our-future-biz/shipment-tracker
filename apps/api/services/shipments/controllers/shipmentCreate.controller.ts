import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type {
  ShipmentItem,
  ContainerLine,
  CargoItemLine,
  CargoDimensionLine,
  CommercialInvoiceLine,
  CostImportOutcome,
  CustomsPriority,
  QuoteLinkOutcome,
} from "../interfaces/interfaces";

interface ShipmentCreateRequest {
  /**
   * Not used: the shipment always gets the company's next CZ job number when it is stored
   * (see the response). Still accepted so clients that send the previewed number keep working.
   */
  jobNumber?: string;
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
  dangerous?: string;
  outOfGauge?: string;
  temperatureControlled?: string;
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
  principalPartyId?: string;
  principalParty?: string;
  customer?: string;
  customerPic?: string;
  customerReference?: string;

  // Commercial parties
  pickupAddress?: string;
  deliveryAddress?: string;
  // Structured pick-up / delivery place (see the update request).
  pickupSiteId?: string | null;
  pickupPostcode?: string | null;
  pickupCountry?: string | null;
  deliverySiteId?: string | null;
  deliveryPostcode?: string | null;
  deliveryCountry?: string | null;
  shipperContact?: string;
  consigneeContact?: string;
  shipperOpeningFrom?: string;
  shipperOpeningTo?: string;
  consigneeOpeningFrom?: string;
  consigneeOpeningTo?: string;

  // Status / mode
  freeComments?: string;
  freightPayableAt?: string;
  hub?: string;
  cfs?: string;
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
  vgmClosing?: string;
  siClosing?: string;
  releaseReference?: string;
  releaseDepot?: string;
  redeliveryReference?: string;
  redeliveryDepot?: string;
  etaWarehouse?: string;
  plannedDeliveryDate?: string;
  plannedDeliveryTime?: string;

  // Commercial
  commercialInvoice?: string;
  creditCheck?: string;
  approvedBy?: string;
  bookingConfirmation?: string;
  customsProcedure?: string;
  /** "" counts as Standard. */
  customsPriority?: CustomsPriority | "";
  customsDeadline?: string;
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
  // Replaces the shipment's commercial invoices when present.
  commercialInvoices?: CommercialInvoiceLine[];

  // Quote
  salesNumber?: string;
  selling?: string;
  buying?: string;
  quoteValidity?: string;
  validityStatus?: string;
  salesPerson?: string;
  /**
   * The reference of the sales quote the shipment is created from. The quote becomes the
   * shipment's Sales Number and, unless salesPerson is sent, its owner the Sales Person; the
   * quote is linked to the shipment and marked Won, and its cost lines are copied into Costs
   * Breakdown. An unknown reference is refused. When a live shipment was already created from
   * the quote the request is refused with HTTP 409 and details { shipmentId, jobNumber } of that
   * shipment - unless allowSecondShipment is sent.
   */
  fromQuoteNumber?: string & MaxLen<50>;
  /** With fromQuoteNumber: create the shipment although the quote already has one. */
  allowSecondShipment?: boolean;

  // Other
  claim?: string;
  // No createdBy: the server stamps who created the shipment from the signed-in user.
}

interface ShipmentCreateResponse {
  shipment: ShipmentItem;
  /** With fromQuoteNumber: whether the quote was told about the shipment, and what that made of it. */
  quoteLink?: QuoteLinkOutcome;
  /** With fromQuoteNumber: how many of the quote's cost lines were copied into Costs Breakdown. */
  costImport?: CostImportOutcome;
  /** With fromQuoteNumber: why containers or cargo lines were not saved although the shipment was created. */
  detailRowsError?: string;
}

export const shipmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments" },
  async (req: ShipmentCreateRequest): Promise<ShipmentCreateResponse> => {
    const { jobNumber, ...data } = req;
    const auth = getAuthData()!;
    return shipmentService.create(auth.companyID, data, auth.userID);
  },
);
