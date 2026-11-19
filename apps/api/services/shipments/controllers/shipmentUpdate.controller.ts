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
  CustomsPriority,
  CustomsReceivedOverride,
} from "../interfaces/interfaces";

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
  /**
   * Why the job is cancelled (D22): a write that sets status "Cancelled Shipment" on a job that was not
   * cancelled is refused without it ("Say why the shipment is cancelled"). Stored trimmed; kept when
   * the job is un-cancelled.
   */
  cancelReason?: string & MaxLen<1000>;
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
  /** The import's B/L in hand (D31), each "YYYY-MM-DD"; "" clears it. */
  originalsReceivedDate?: string;
  telexReleaseReceivedDate?: string;
  deliveryOrderDate?: string;
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
  // null unlinks the party from its CRM customer (the name stays as free text).
  customerId?: string | null;
  shipperId?: string | null;
  consigneeId?: string | null;
  /** The Agent picked from the Customer Database (any company); null unlinks it. */
  agentId?: string | null;
  principalPartyId?: string | null;
  principalParty?: string;
  customer?: string;
  customerPic?: string;
  /**
   * The Customer Database contact the Customer's PIC is (one of the customer's live contacts): its
   * current name is stored as customerPic. Without it a customerPic name is matched to a contact.
   * null clears the Customer's PIC.
   */
  customerPicContactId?: string | null;
  customerReference?: string;

  // Commercial parties
  pickupAddress?: string;
  deliveryAddress?: string;
  // Structured pick-up / delivery place; null or "" clears a value. A CZ postcode is stored
  // as its five digits ("110 00" → "11000"), the country as ISO alpha-2 in capitals.
  pickupSiteId?: string | null;
  pickupPostcode?: string | null;
  pickupCountry?: string | null;
  deliverySiteId?: string | null;
  deliveryPostcode?: string | null;
  deliveryCountry?: string | null;
  shipperContact?: string;
  consigneeContact?: string;
  /**
   * The contact of the shipper's / consignee's customer the Contact is: its current name is stored
   * as the Contact. Without it a Contact naming one of the party's contacts is linked to it; any
   * other name stays as typed, with no id.
   */
  shipperContactId?: string | null;
  consigneeContactId?: string | null;
  /** The Agent's Contact as a contact of the Agent; null for a typed name. */
  agentPicContactId?: string | null;
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
  actualDeparture?: string;
  actualArrival?: string;
  cargoReadinessDate?: string;
  pickupDate?: string;
  pickupTime?: string;
  closingDate?: string;
  vgmClosing?: string;
  siClosing?: string;
  closingTime?: string;
  vgmClosingTime?: string;
  siClosingTime?: string;
  amsDeadline?: string;
  amsDeadlineTime?: string;
  isfDeadline?: string;
  isfDeadlineTime?: string;
  releaseReference?: string;
  releaseDepot?: string;
  redeliveryReference?: string;
  redeliveryDepot?: string;
  etaWarehouse?: string;
  warehouseReceivedDate?: string;
  warehouseReleasedDate?: string;
  warehouseReference?: string;
  warehouseTruck?: string;
  plateNumber?: string;
  plannedDeliveryDate?: string;
  plannedDeliveryTime?: string;
  actualDeliveryDate?: string;

  // Commercial
  commercialInvoice?: string;
  creditCheck?: string;
  approvedBy?: string;
  bookingConfirmation?: string;
  customsProcedure?: string;
  customsOffice?: string;
  /** "" counts as Standard. */
  customsPriority?: CustomsPriority | "";
  customsDeadline?: string;
  mrn?: string;
  csRecvInvoice?: CustomsReceivedOverride;
  csRecvPacking?: CustomsReceivedOverride;
  equipmentDelivery?: string;
  equipmentDeliveryDate?: string;
  equipmentDeliveryTime?: string;
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

  // Detail rows (containers + cargo lines; each replaces the shipment's set when present)
  containers?: ContainerLine[] & MaxLen<500>;
  cargoItems?: CargoItemLine[] & MaxLen<2000>;
  cargoDimensions?: CargoDimensionLine[] & MaxLen<2000>;
  /**
   * The cargo dimension lines the page started from when it sends cargoDimensions (Cargo Details):
   * the lines are saved only while the shipment still holds these, else the write is refused
   * ("Cargo Details changed meanwhile", code aborted) and the page reads them again. Not stored.
   */
  expectedCargoDimensions?: CargoDimensionLine[] & MaxLen<2000>;
  /**
   * The containers the page started from when it sends containers (Container Details): they are
   * saved only while the shipment still has these, else the write is refused ("Container Details
   * changed meanwhile", code aborted) and the page reads them again. Not stored.
   */
  expectedContainers?: ContainerLine[] & MaxLen<500>;
  /**
   * The app's own writes only (the gate's outbox): Warehouse Released is set only while the shipment's day is empty
   * or one of these days, checked in the write turn; otherwise the day is left as it is and the rest is written.
   * Ignored on a person's edit. Not stored.
   */
  warehouseReleasedReplaces?: string[] & MaxLen<50>;
  // Replaces the shipment's commercial invoices when present.
  commercialInvoices?: CommercialInvoiceLine[] & MaxLen<500>;

  // Quote
  salesNumber?: string;
  selling?: string;
  buying?: string;
  quoteValidity?: string;
  validityStatus?: string;
  salesPerson?: string;
  /**
   * A manager's reason (at least 3 characters) to set Warehouse Released, from empty, on a job on prepayment that is
   * not paid - or whose payment could not be checked (lib/prepaymentStop). Recorded with the release; not stored on
   * the shipment, and ignored by any other edit.
   */
  paymentOverrideReason?: string & MaxLen<500>;
  // No claim: it is derived from the shipment's claims (shipmentClaim.repository), never set here.
}

interface ShipmentUpdateResponse {
  shipment: ShipmentItem;
}

export const shipmentUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId" },
  async (req: ShipmentUpdateRequest): Promise<ShipmentUpdateResponse> => {
    const { shipmentId, paymentOverrideReason, expectedCargoDimensions, expectedContainers, warehouseReleasedReplaces, ...data } = req;
    const auth = getAuthData()!;
    // A person's edit is held to what their role may change; the app's own updates are not (see AuthData.appWrite).
    const role = auth.appWrite ? undefined : auth.role;
    return {
      shipment: await shipmentService.update(shipmentId, auth.companyID, data, auth.userID, role, undefined, undefined, {
        paymentOverrideReason,
        expectedCargoDimensions,
        expectedContainers,
        warehouseReleasedReplaces: auth.appWrite ? warehouseReleasedReplaces : undefined,
      }),
    };
  },
);
