"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Badge, Button, Checkbox, ConfigProvider, DatePicker, Dropdown, Input, InputNumber, Select, Spin, Tooltip } from "antd";
import type { MenuProps } from "antd";
import dayjs from "dayjs";
import {
  ContainerOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EyeOutlined,
  FilePdfOutlined,
  HistoryOutlined,
  ImportOutlined,
  MailOutlined,
  MessageOutlined,
  PlusOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { InfoRow } from "@/components/InfoRow";
import { KPI_TONE_CLASS, KpiTile, type KpiTone } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { LINK_CLASS } from "@/components/linkClass";
import { PillTabs } from "@/components/SectionCard";
import { useQuoteFamily } from "@/hooks/useQuoteFamily";
import { useSalesQuoteDraft } from "@/hooks/useSalesQuoteDraft";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useCompanyDetails } from "@/hooks/useSalesPrefs";
import { useCustomer, useCustomers, type CustomerItem } from "@/hooks/useCustomers";
import { useDebounced } from "@/hooks/useDebounced";
import { useTermsConditions } from "@/hooks/useTermsConditions";
import { api, apiErrorMessage } from "@/lib/api";
import { useQuoteMarginInquiry } from "@/hooks/useMarginInquiries";
import { businessToday } from "@/lib/date";
import { fmtMoney, moneyInputParser } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { CustomerAccountTypeBadge } from "@/app/customers/_components/CustomerAccountTypeBadge";
import { GeoFlag, GeoSelect } from "@/components/GeoSelect";
import { useRouteWhere } from "@/hooks/usePlaceSearch";
import { NewSupplierFromQuote } from "@/components/SupplierPicker";
import { useSupplierApprovals } from "@/hooks/useSupplierApprovals";
import { useSupplierDirectory } from "@/hooks/useSupplierDirectory";
import { customerSendBlock, supplierSendBlock } from "../../_lib/supplierApproval";
import type { SalesQuoteData, PackageLine, QuoteContainerLine, CostLine, TariffUpdate } from "../../_lib/types";
import type { QuoteProblem } from "../../_lib/quoteProblem";
import { INCOTERMS, SERVICE_TYPES, DIRECTIONS, PACKING_TYPES, serviceTypeLabel } from "../../_lib/types";
import { createShipmentHint, shipmentFromQuoteBlockedText } from "../../_lib/shipmentLink";
import { CURRENCIES } from "@/lib/enums";
import { CONTAINER_KINDS, CONTAINER_KINDS_BY_SIZE, CONTAINER_SIZES, containerType, teuForType } from "@/lib/cargo";
import { useListKeys } from "@/hooks/useListKeys";
import { asData, cargoReadyDay, computeTotals, computeCargo, convertLine, cyAtDestination, cyAtOrigin, cyTermsOf, CY_TERMS, documentBlock, fxNote, hasReefer, isContainerQuote, isSeaQuote, isWonRevision, reeferMissing, revisionRoot, routingMissing, stripProtected, withLineBasis, type CyTerms, type QuoteTotals } from "../../_lib/salesQuote";
import { PRINT_WINDOW_BLOCKED, exportClosesQuote } from "../../_lib/exportClose";
import { ExportCloseDialog } from "../../_components/ExportCloseDialog";
import {
  NO_CUSTOMER, changesCustomer, contactFields, customerCurrencies, customerCurrencyFields, customerLinkFields, liveCustomerCopies, namedContact,
  withCustomerUnit,
} from "../../_lib/quoteCustomer";
import { useQuoteCustomerFields, useQuoteCustomerLive } from "@/hooks/useQuoteCustomerFields";
import { useUsers } from "@/hooks/useUsers";
import { useQuoteListHref } from "../../_lib/quoteListHref";
import { useQuoteOrigin } from "../../_lib/useQuoteOrigin";
import { printQuote } from "../../_lib/printQuote";
import { transitionRequest, type StatusChange } from "../../_lib/statusChange";
import { salesSettingsHref } from "../../_lib/tabs";
import { isRoadQuote, lineTariffTag, roadInputDefaults, roadInputProblems, sideOverridden, type LineTariffTag, type RatePick } from "../../_lib/roadQuote";
import { formatAmount as formatMoney } from "@/lib/money";
import { CustomerLink } from "../../_components/CustomerLink";
import { DeleteQuoteModal } from "../../_components/DeleteQuoteModal";
import { ExchangeRatesError } from "../../_components/ExchangeRatesError";
import { ToolbarButton, toolbarButtonClass } from "../../_components/ToolbarButton";
import { fmtQuantity } from "./_lib/fmtQuantity";
import { LifecycleBar } from "./_components/LifecycleBar";
import { ImportInquiryModal } from "./_components/ImportInquiryModal";
import { CopyFromModal } from "./_components/CopyFromModal";
import { DuplicateWizardModal } from "./_components/DuplicateWizardModal";
import { PdfPreviewModal } from "./_components/PdfPreviewModal";
import { EmailQuoteModal } from "./_components/EmailQuoteModal";
import { AddToSellingDialog } from "./_components/AddToSellingDialog";
import { RemoveBothDialog } from "./_components/RemoveBothDialog";
import { buyingBasis, buyingQuantity, counterpartIndex, lineRemovals, newPairId, offerToSelling, pairedCopies, type LineRemoval, type LineSide } from "../../_lib/costPairs";
import { CostLinesEditor } from "./_components/CostLinesEditor";
import { FclPricingEditor } from "./_components/FclPricingEditor";
import { FclTruckingBlock } from "./_components/FclTruckingBlock";
import { fclChanges, fclProfitBlock, usesFclPricing, withContainerTypes, withFclPricing } from "../../_lib/fclPricing";
import { templateTerms, termsDifferFromTemplate } from "../../_lib/shippingTerms";
import { linesForOtherDirection, linesToRecheck, otherDirectionBlock, rechecked, stampDirection, stampPricedFor, withPricedForNow } from "../../_lib/tariffRecheck";
import {
  approvalLineOf,
  isOfferOfUpdate,
  linesWaitingForRate,
  roadForToday,
  tariffUpdateBlock,
  tariffUpdateChange,
  tariffUpdateSelling,
  waitingTariffUpdates,
  withApprovedRate,
  withoutTariffUpdate,
} from "../../_lib/tariffUpdates";
import { QuoteAddressField } from "./_components/QuoteAddressField";
import { QuoteContactField } from "./_components/QuoteContactField";
import { QuoteRatesEditor } from "./_components/QuoteRatesEditor";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineBlockEmpty, LineTable } from "./_components/LineBlock";
import { MiniButton, RemoveLineButton } from "./_components/QuoteButtons";
import { QuoteReeferBlock } from "./_components/QuoteReeferBlock";
import { QuoteOogBlock } from "./_components/QuoteOogBlock";
import { hasOogEquipment, oogMissing, oogSummary, oogTypes } from "../../_lib/oog";
import { checkContainerWeight, type WeightCheck } from "../../_lib/containerWeight";
import { asksHeavyPieces, missingWarehouseFee, WAREHOUSE_PAIR_ID, withHeavyPieces } from "../../_lib/heavyPieces";
import { HeavyFeeReasonDialog } from "./_components/HeavyFeeReasonDialog";
import { OverweightReasonDialog } from "./_components/OverweightReasonDialog";
import { OVERWEIGHT_PAIR_ID, overweightUnexplained, withOverweight } from "../../_lib/overweight";
import { QuoteHeavyPiecesDialogs } from "./_components/QuoteHeavyPiecesDialogs";
import { QuoteChatDrawer, quoteThreadOf, useQuoteChatUnread } from "../../_components/QuoteChat";
import { QuoteSection, QuoteStepTiles, type SectionStatus } from "./_components/QuoteSection";
import { QuoteRoadCard } from "./_components/QuoteRoadCard";
import { QuoteRoadPriceDrawer } from "./_components/QuoteRoadPriceDrawer";
import { RailTariffsDrawer } from "./_components/RailTariffsDrawer";
import { useRailOffers } from "@/hooks/useRailTariffs";
import { railVersionHref } from "@/app/tariffs/_lib/railTariffs";
import { isInlandHaulageLine, isRailLine, railOffersRequest, railRouteOf, railVersionId, withRailOffer, type RailOffer, type RailRoute } from "../../_lib/railQuote";
import type { TariffPick } from "../../_lib/tariffQuote";
import { CollectionTariffsDrawer } from "./_components/CollectionTariffsDrawer";
import { useCollectionHubs, useCollectionOffers } from "@/hooks/useCollectionTariffs";
import { collectionVersionHref } from "@/app/tariffs/_lib/collectionTariffs";
import {
  collectionFreightOf,
  collectionOffersRequest,
  collectionRouteOf,
  collectionVersionId,
  isCollectionLine,
  isInlandCollectionLine,
  withCollectionOffer,
  type CollectionOffer,
  type CollectionRoute,
} from "../../_lib/collectionQuote";
import { OceanTariffsDrawer } from "./_components/OceanTariffsDrawer";
import { useOceanOffers } from "@/hooks/useOceanTariffs";
import { oceanVersionHref } from "@/app/tariffs/_lib/oceanTariffs";
import {
  isOceanFreightLine,
  isOceanLine,
  oceanOffersRequest,
  oceanRouteOf,
  oceanVersionId,
  withOceanOffer,
  type OceanOffer,
  type OceanRoute,
} from "../../_lib/oceanQuote";
import { QuoteMarginPanel } from "./_components/QuoteMarginPanel";
import { QuoteMarginApproveDialog } from "./_components/QuoteMarginApproveDialog";
import { AskMarginApprovalDialog } from "./_components/AskMarginApprovalDialog";
import { QuoteShipmentsDialog } from "./_components/QuoteShipmentsDialog";
import { QuotePriceTile } from "./_components/QuotePriceTile";
import { useQuoteShipments } from "@/hooks/useQuoteShipments";
import { useAuth, useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { limitCzechPhone } from "@/lib/phone";
import { CargoDimensionAdrFields } from "@/app/shipments/[jobNumber]/tabs/CargoDimensionAdrFields";
import { CARD, LABEL_TEXT } from "@/styles/ui";
import { MenuLabel } from "@/app/trucking/_components/MenuLabel";
import { QuoteFacts } from "./_components/QuoteFacts";
import { OwnerFact } from "./_components/OwnerFact";

// A new package has no dimensions and no weight: made-up ones would print as real cargo and drive
// the chargeable weight.
const emptyPackage: PackageLine = { qty: 1, type: "Pallets", stackable: true };
// A new container is the most quoted box; its cargo weight is left for somebody to enter.
const emptyContainer: QuoteContainerLine = { qty: 1, type: "40' HC" };
// The container types a line can be, as the shipment's Container Details offer them: grouped by
// size, each group saying what one box of it counts in TEU.
const CONTAINER_TYPE_OPTIONS = CONTAINER_SIZES.map((size) => ({
  label: `${size} containers · ${teuForType(size)} TEU`,
  options: (CONTAINER_KINDS_BY_SIZE[size] ?? CONTAINER_KINDS).map((kind) => ({ value: `${size} ${kind}`, label: `${size} ${kind}` })),
}));

// The six steps of the form, in the order they are filled in.
type SectionKey = "customer" | "shipment" | "routing" | "cargo" | "pricing" | "terms";

// A date is shown and typed the app's way; one typed the way it is stored is still read.
const DATE_FORMATS = ["DD.MM.YYYY", "YYYY-MM-DD"];
const STORED_DATE = "YYYY-MM-DD";

// The server searches the Customer Database from this many letters on: one letter would match
// most of it.
const MIN_CUSTOMER_SEARCH = 2;

// How many customers the Customer box offers at a time.
const CUSTOMER_LIMIT = 20;

// What a figure of the air-freight rule shows on a quote that is not air freight.
const AIR_ONLY = <span title="Air freight only">{EMPTY_CELL}</span>;

// Two columns of label / value rows where the card is wide enough for both, one column below
// that. It goes by the card's own width, not the window's: the sidebar and the summary column
// take from it.
const FIELD_COLUMNS_CLASS = "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-6";

// A small link out of the form, as on the customer page's cards.
const SMALL_LINK_CLASS = `shrink-0 text-xs font-semibold whitespace-nowrap ${LINK_CLASS}`;
// The tooltip of the e-mail and phone of a contact picked from the Customer Database.
const CONTACT_FOLLOWS_TITLE = "From the contact in the Customer Database - change it there, or unlink the contact to type another";

// The offer of a lapsed tariff's new rate, asked for again as of today, with the route it was asked for.
type ApprovedOffer =
  | { kind: "ocean"; offer: OceanOffer; route: OceanRoute }
  | { kind: "rail"; offer: RailOffer; port: string; direction: RailRoute["direction"] }
  | { kind: "collection"; offer: CollectionOffer; route: CollectionRoute };

// The line a lapsed tariff's new rate goes on (approvalLineOf): its ocean freight, its inland
// haulage, or any line of a collection.
const approvalFreightOf = (kind: TariffUpdate["kind"]): ((line: CostLine) => boolean) =>
  kind === "ocean" ? isOceanFreightLine : kind === "rail" ? isInlandHaulageLine : () => true;

// What the question before Routing is saved without its Place of Loading (origin) or Place of
// Delivery (destination) asks.
function blankRoutingTitle(data: SalesQuoteData): string {
  const blank = routingMissing(data);
  return blank.length === 2 ? "Keep Place of Loading and Place of Delivery blank?" : `Keep ${blank[0] ?? "Place of Loading"} blank?`;
}

export function QuoteWorkflow() {
  const canSeeConcepts = useCanSeeConcepts();
  const truckingOn = canSeeConcepts;
  const { user } = useAuth();
  // The reference in the address: what the quote is loaded and saved by. The page names the quote by
  // its reference as stored (`ref` below), which takes the letters of its Freight Mode while it is open.
  const { ref: routeRef } = useParams<{ ref: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The quote's chat (shared by the original and all its revisions); ?chat=1 (a mention under the
  // bell) opens it.
  const [chatOpen, setChatOpen] = useState(false);
  const [approvingRate, setApprovingRate] = useState<string | null>(null);
  const chatUnread = useQuoteChatUnread().get(quoteThreadOf(routeRef)) ?? 0;
  useEffect(() => {
    if (searchParams.get("chat") !== "1") return;
    setChatOpen(true);
    // Only the chat flag leaves the address: where the user came from (the origin) stays in it.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chat");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);
  const toast = useToast();
  // Loading, autosave and everything about not losing or overwriting data live in the hook.
  // `draft` is the document being edited; `quote` is the quote as the server last returned it,
  // with everything the server owns - status, validity, owner - and what may be done with them.
  const { draft, quote, change, follow, act, load, reload, discard, save, syncedAt, saveNow, pending, reapply, dismissPending } = useSalesQuoteDraft(routeRef);
  // The quote's reference as stored: QCZ20261109001 becomes QCZLCL20261109001 when its Freight Mode is
  // set (lib/salesReference). The address follows it in place - no navigation, so the page and what
  // is being typed stay - and a reload or a copied link opens it under its reference as it is now.
  const ref = quote?.quoteNumber ?? routeRef;
  // The newest question to a manager about the margin, while the quote has a road margin to ask about.
  const marginAsk = useQuoteMarginInquiry(ref, !!quote?.roadMargin);
  // The newest question changed while the quote is open - asked, withdrawn, or answered by a
  // manager: the quote is read again (what was typed is saved first, and the version this page is
  // based on is not touched), so its history, approval and send gate show what the server holds.
  // The first answer of the server is only remembered: the quote was read with it already.
  const seenInquiry = useRef<string | null>(null);
  useEffect(() => {
    if (!marginAsk.loaded) return;
    const i = marginAsk.inquiry;
    const key = i ? `${i.id}:${i.status}` : "";
    if (seenInquiry.current !== null && seenInquiry.current !== key) void act(() => api.quotes.salesQuoteGet(ref));
    seenInquiry.current = key;
  }, [marginAsk.loaded, marginAsk.inquiry, act, ref]);
  const { deleteQuote } = useSalesQuotes();
  const exchange = useCurrentExchangeRates();
  const company = useCompanyDetails();
  // The company's users: the quotation names its sales owner for the customer.
  const people = useUsers();
  // Only the variants of this quote are asked for - the page never loads the list of all quotes.
  const variants = useQuoteFamily(ref);
  // The Quotes list as it was left: with its search, filters, sort and page.
  const listHref = useQuoteListHref();
  // Where the quote was opened from: what the back link is called and leads to, and the address
  // of another quote opened from here, which keeps that way back.
  const { back, hrefOf } = useQuoteOrigin();
  // The address follows the quote's reference as stored (see `ref` above).
  const addressRef = useRef(routeRef);
  useEffect(() => {
    if (ref === addressRef.current) return;
    const before = addressRef.current;
    addressRef.current = ref;
    // The app's addresses end in a slash (trailingSlash): kept, so a reload needs no redirect.
    const slash = window.location.pathname.endsWith("/") ? "/" : "";
    window.history.replaceState(window.history.state, "", `${hrefOf(ref).split("?")[0]}${slash}${window.location.search}`);
    // The browser tab's name too (the page's title names the quote).
    document.title = document.title.replace(before, ref);
  }, [ref, hrefOf]);
  // The one customer the quote is linked to, as the Customer Database has it now. The page never
  // loads the list of all customers: the Customer box asks the server for what is typed.
  const linkedCustomer = useCustomer(draft.customerId ?? null);
  // The same customer and its contacts as the Customer Database has them now, read again when the
  // page comes back into view: the contact person is picked from them, and an open quote's copies
  // follow them (below).
  const live = useQuoteCustomerLive(draft.customerId, syncedAt);
  const { terms } = useTermsConditions();
  // Sales Settings, where the templates are kept, is for managers and admins only.
  const { canManageSales } = useSalesPermissions();
  const supplierDirectory = useSupplierDirectory();
  const supplierApprovals = useSupplierApprovals();

  // The step "Save & continue" goes to once the out-of-gauge cargo is confirmed, while that is asked.
  const [confirmCargoTo, setConfirmCargoTo] = useState<SectionKey | null>(null);
  // The step "Save & continue" goes to once a Sea LCL quote of over 2 t says whether any piece is over 2 t.
  const [heavyPiecesTo, setHeavyPiecesTo] = useState<SectionKey | null>(null);
  // The step "Save & continue" goes to once leaving Origin / Destination blank is confirmed, while that is asked.
  const [blankRoutingTo, setBlankRoutingTo] = useState<SectionKey | null>(null);
  // The selling line of the warehouse's Heavy Cargo Handling Fee whose amount Sales just changed: kept only with a reason.
  // Or a fee line Sales is removing (`removing`, its side): it goes only with a reason too.
  // Leaving Pricing with the Overweight surcharge at 0 (to the step named), or removing it (the line's index): the reason is asked.
  const [overweightAsk, setOverweightAsk] = useState<{ to?: SectionKey; save?: boolean; removing?: number } | null>(null);
  const [feeChange, setFeeChange] = useState<{ index: number; amount: number; before: number; currency: string; reason?: string; removing?: LineSide } | null>(null);
  const [modal, setModal] = useState<
    null | "import" | "copyQuote" | "copyShipment" | "duplicate" | "preview" | "email" | "delete" | "replaceSelling" | "allIn" | "closeQuote" | "revise" | "roadPrice" | "approveMargin" | "askMargin" | "shipments"
  >(null);
  // The template chosen under Shipping terms while the user is asked whether its text may replace
  // what the quote says; null when no question is open.
  // A buying line that just got its amount (and its place), offered to selling as well with a markup.
  const [toSelling, setToSelling] = useState<{ line: CostLine; index: number } | null>(null);
  // The buying line "Tariffs available" was opened from: for rail, collections, or ocean freight.
  const [railLine, setRailLine] = useState<number | null>(null);
  const [collectionLine, setCollectionLine] = useState<number | null>(null);
  const [oceanLine, setOceanLine] = useState<number | null>(null);
  // A line being removed that has a counterpart on the other side: asked whether both go.
  const [removing, setRemoving] = useState<{ side: LineSide; index: number; other: number } | null>(null);
  // The customer picked last in the Customer box, while its contact person is still being read.
  const pickedCustomer = useRef<string | null>(null);
  const { customerContactFields } = useQuoteCustomerFields();
  // The steps that are unfolded. Each folds on its own; a new quote starts at the first.
  // The step of the form that is on screen; the others wait behind their tiles. Null until the
  // quote is here: a quote opens on Pricing, a new one without a customer yet on Customer.
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const startSection: SectionKey = draft.customerName ? "pricing" : "customer";
  // The step is chosen once, as the quote arrives, so typing the customer of a new quote does
  // not move the form on to Pricing.
  useEffect(() => {
    if (quote && activeSection === null) setActiveSection(startSection);
  }, [quote, activeSection, startSection]);
  // The date picked as "Valid until" while the server is storing it; undefined when none is on
  // its way. The field shows it meanwhile, so the picker does not hand the same date in again.
  const [pendingValidity, setPendingValidity] = useState<string | null>();
  // The owner is being changed: its control waits for the server's answer.
  const [changingOwner, setChangingOwner] = useState(false);
  // The revision is being made: Revise waits for the server's answer, so a second click asks for no second one.
  const [revising, setRevising] = useState(false);
  // The quote was deleted from this page, which is on its way to the Quotes list.
  const [deleted, setDeleted] = useState(false);

  // The page file names the browser tab after the reference. Once the quote is here the
  // customer's name joins it, so the tabs of several quotes can be told apart by whom they are
  // for. The page's own title is put back when the name changes or the page is left - unless the
  // next page has set its title by then.
  const customerName = draft.customerName;
  useEffect(() => {
    if (!customerName) return;
    const byReference = document.title;
    // A function, so that a "$" in a customer's name is not read as a replacement pattern.
    const withCustomer = byReference.replace(ref, () => `${ref} ${customerName}`);
    document.title = withCustomer;
    return () => {
      if (document.title === withCustomer) document.title = byReference;
    };
  }, [ref, customerName]);

  // `set` is the only way this page edits the quote's document. Status, validity, owner and
  // history are not part of that - they are the server's and have their own actions below - so
  // such keys are dropped from every patch, whatever an imported inquiry or a copied quote brings.
  // A change to the pricing can make a conversion necessary: the rates the quote does not have
  // yet are then taken from the Exchange sheet as part of that same change, so they are saved
  // with it and the quote keeps the rates it was priced with. Nothing but a change by the user
  // ever stores a rate.
  // The customer is one unit: a patch that names another customer - from the Customer box, an
  // imported inquiry, a copied quote or shipment - also empties what it does not bring of the
  // previous one (withCustomerUnit), and the contact person still being read for a customer
  // picked before is no longer waited for.
  // What the quote's own rules put with a change, in that same change: the Overweight surcharge as
  // the cargo has it, then the lines priced by their basis.
  // A Sea FCL quote's selling lines are then made from its buying lines and profit (fclPricing.ts) -
  // only once today's rates are known, as they convert each charge's profit into its currency.
  const derived = (changed: SalesQuoteData): Partial<SalesQuoteData> => {
    // Rates per container stay with their size, whatever is added to the cargo.
    const sized = withContainerTypes(changed) ?? {};
    const next = { ...changed, ...sized };
    const overweight = withOverweight(next) ?? {};
    const based = { ...sized, ...overweight, ...withLineBasis({ ...next, ...overweight }) };
    const priced = { ...next, ...based };
    // An open quote's blocks are sold at full fives (fclPricing.ts SELLING_ROUNDS_TO).
    const fcl = usesFclPricing(priced, false) ? withFclPricing(priced, exchange.rates, exchange, { roundUp: true, open: true }) : null;
    return fcl ? { ...based, ...fclChanges(fcl, priced) } : based;
  };
  const set = (patch: Partial<SalesQuoteData>) => {
    // Nothing of a closed quote is changed here (the server would keep it as stored anyway).
    if (quoteClosed) return;
    const editable = stripProtected(patch);
    if (changesCustomer(draft, editable)) pickedCustomer.current = null;
    const own = withCustomerUnit(draft, editable);
    if (!Object.keys(own).length) return;
    // A rate marked to recheck that is changed by hand has been checked.
    const checked = own.buyingLines && rechecked(draft.buyingLines ?? [], own.buyingLines, { ...draft, ...own });
    if (checked) own.buyingLines = checked;
    // Rates are not copied onto the quote here: a draft is priced at today's ČNB fixing and the
    // server stores the rates when the quote is sent.
    // A selling line has its buying line's basis, and a line charged per W/M or per container the
    // cargo's weight / measure or its containers as its quantity, in the same change - while the
    // pricing is open.
    change({ ...own, ...derived({ ...draft, ...own }) });
  };

  // A customer picked in the Customer box: the link at once, with the contact fields emptied in
  // that same change, so the previous customer's person never stands under the new name. The
  // customer's main contact follows once its contacts are read - unless another customer was
  // picked or brought in meanwhile, or the customer was taken off: a late answer must not land
  // on a later choice.
  const pickCustomer = async (customer: CustomerItem) => {
    // Priced in the customer's default currency (Customer Database); taking the customer off keeps it.
    set({ ...NO_CUSTOMER, ...customerLinkFields(customer), ...customerCurrencyFields(customer) });
    pickedCustomer.current = customer.id;
    const contact = await customerContactFields(customer.id);
    if (pickedCustomer.current === customer.id) set(contact);
  };

  // Every status change made on this page - on the lifecycle bar and by "Mark as sent" - is asked
  // of the server, which decides whether the quote may make that move and stamps what goes with
  // it. Sending stores rates in the document, so the request names the document's version.
  // Resolves with why the server refused, or with null.
  const changeStatus = (change: StatusChange) =>
    act(
      (expectedDataVersion) => api.quotes.salesQuoteTransition(ref, { ...transitionRequest(change), expectedDataVersion }),
      { versioned: true },
    );

  // "Price from tariff": the server prices the road input at the picked level and haulier, writes
  // the trucking lines and the road pricing, and answers with the quote. Those are document keys
  // the page edits too, so the stored quote is read again whole rather than merged.
  const priceRoad = async (pick: RatePick, road: NonNullable<SalesQuoteData["road"]> = draft.road ?? roadInputDefaults(draft)) => {
    const refused = await act(
      (expectedDataVersion) => api.quotes.salesQuoteRoadPrice(ref, { road, ...pick, expectedDataVersion }),
      { versioned: true },
    );
    if (refused) return `Not priced - ${refused}`;
    setModal(null);
    toast.success(`${ref} priced from the tariff`);
    reload();
    return null;
  };

  // Pieces of 12.5 t or more have no rate: the warehouse is asked; its answer is the server's (no
  // new version of the document, so this page's draft goes on). Resolves with why it was refused, or null.
  const inquireWarehouse = async (pieces: number, note: string) => {
    const refused = await act(() => api.quotes.salesQuoteWarehouseInquiryAsk(ref, { pieces, grossWeightKg: cargo.grossWeight, note }));
    if (!refused) toast.success("Sent to the warehouse — the answer comes to your notifications");
    return refused;
  };

  // A manager accepts the margin below the floor; the approval is the server's, like the status.
  const approveMargin = async (reason: string) => {
    const refused = await act((expectedDataVersion) => api.quotes.salesQuoteMarginApprove(ref, { reason, expectedDataVersion }), { versioned: true });
    // A question waiting about the margin is answered by the approval: Managers → Quote inquiries
    // and the cockpit no longer show it as waiting.
    if (!refused) void marginAsk.closed();
    return refused;
  };

  // Anybody else asks a manager to approve it (Council Outlay 6): the question and its answer are
  // the server's, without a new version of the document, so this page's draft goes on. The
  // history line the server writes with an ask or a withdrawal comes with the quote read again
  // once the question has changed (above).
  const askMargin = async (input: { reason: string; note: string; needsBy: string | null; competitorPrice: string; volume: string }) => {
    try {
      await marginAsk.ask.mutateAsync(input);
      toast.success("Sent to a manager — the answer comes to your notifications");
      return null;
    } catch (err) {
      return apiErrorMessage(err);
    }
  };
  const withdrawMargin = async (inquiryId: string) => {
    try {
      await marginAsk.withdraw.mutateAsync(inquiryId);
      toast.success("Question withdrawn");
    } catch (err) {
      toast.error(`${ref} - ${apiErrorMessage(err)}`);
    }
  };

  // Validity and owner are changed at once, each by its own request. Their controls show what the
  // server stored, so a refusal leaves them as they were and is told here.
  const changeValidity = async (validUntil: string | null) => {
    setPendingValidity(validUntil);
    const refused = await act(() => api.quotes.salesQuoteValidity(ref, { validUntil }));
    // Back to what is stored - unless another date was picked meanwhile and is still on its way.
    setPendingValidity((pending) => (pending === validUntil ? undefined : pending));
    if (refused) toast.error(`${ref} - ${refused}`);
  };
  const changeOwner = async (ownerUserId: string | null) => {
    setChangingOwner(true);
    const refused = await act(() => api.quotes.salesQuoteOwner(ref, { ownerUserId }));
    setChangingOwner(false);
    if (refused) toast.error(`${ref} - ${refused}`);
  };

  // Unlike autosave, the Retry button also confirms a save that worked. A refused one is
  // announced by the hook, for a button as for autosave.
  const handleSave = async () => {
    const result = await saveNow();
    if (!result.problem && result.status === "saved") toast.success("Saved");
  };

  // Every shipment booked under this quote, the oldest first: the quote itself keeps only the
  // first. Asked only once it has one.
  const quoteShipments = useQuoteShipments(quote?.shipmentId ? [ref] : []).byReference?.get(ref);

  // New Shipment opens for this quote. What was typed is saved first: the shipment is made from
  // the quote as it is stored, and a save that is refused - the hook says why - stops here.
  // `another`: one more shipment under a quote that has one already - the wizard starts with that ticked.
  const createShipment = async (another = false) => {
    const result = await saveNow();
    if (!result.problem) router.push(`/shipments?fromQuote=${encodeURIComponent(ref)}${another ? "&another=1" : ""}`);
  };

  // Deletes the quote, once that was confirmed. What was typed and not saved yet is given up, not
  // saved - and with it everything this page could still send, so the request below is the only
  // one about the quote. Then the Quotes list takes this page's place: it has no quote to show any
  // more. The server judges the quote as it is now and may refuse although Delete was offered;
  // the stored quote is then read again - with what may be done with it now - and the dialog
  // says why.
  const deleteThisQuote = async () => {
    await discard();
    try {
      await deleteQuote(ref);
    } catch (err) {
      reload();
      throw err;
    }
    setDeleted(true);
    router.replace(listHref);
  };

  // Packages
  const packages = draft.packages ?? [];
  const packageKeys = useListKeys(packages.length);
  // The cost lines' row keys live here, not in their editors: a line removed with its counterpart
  // drops a row on each side.
  const buyingKeys = useListKeys((draft.buyingLines ?? []).length);
  const sellingKeys = useListKeys((draft.sellingLines ?? []).length);
  const cargo = useMemo(() => computeCargo(draft), [draft]);
  // The quote's own weight and volume - typed into an inquiry, for cargo without package lines -
  // are not the editor's to write: they count while there are no lines and are still there when
  // the lines are removed again. Until now every edit of the lines overwrote them with the
  // lines' sums. Such a copy is dropped with the next edit, so it does not come back as the
  // cargo of a quote whose lines were removed.
  const updatePackages = (pkgs: PackageLine[]) => {
    const sums = computeCargo({ packages });
    const copyOfSums = packages.length > 0 && draft.weight === sums.grossWeight && draft.cbm === sums.cbm;
    set(copyOfSums ? { packages: pkgs, weight: undefined, cbm: undefined } : { packages: pkgs });
  };
  const patchPackage = (i: number, patch: Partial<PackageLine>) => updatePackages(packages.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // Containers: the equipment of a full-container quote, in the packages' place. A typed total
  // weight that is the boxes' own sum is dropped with the edit, as with the packages above.
  const containerQuote = isContainerQuote(draft);
  const containers = draft.containers ?? [];
  const containerKeys = useListKeys(containers.length);
  const updateContainers = (lines: QuoteContainerLine[]) => {
    const sums = computeCargo({ containers });
    const copyOfSums = sums.weightFromContainers && draft.weight === sums.grossWeight;
    set(copyOfSums ? { containers: lines, weight: undefined } : { containers: lines });
  };
  const patchContainer = (i: number, patch: Partial<QuoteContainerLine>) => updateContainers(containers.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // Sibling variants of the same enquiry (base ref + its -2/-3 duplicates).
  // The active quote uses the live draft so the preview always shows fresh data.
  const family = useMemo(
    () => variants.family.map((q) => (q.quoteNumber === ref ? { ...q, data: draft } : q)),
    [variants.family, ref, draft],
  );

  // Pricing
  const totals = useMemo(() => computeTotals(draft, exchange.rates, exchange), [draft, exchange]);
  // ČNB's fixing for today should be stored but isn't (the import failed): today's rates are stale.
  const liveRatesMissing = !draft.fx && exchange.missing;
  const updateLines = (kind: "buyingLines" | "sellingLines", lines: CostLine[]) =>
    set(kind === "buyingLines" ? { buyingLines: lines } : { sellingLines: lines });

  // The customer's document goes out only with a complete total; until then the reason is shown.
  const documentBlocked = documentBlock(totals, exchange.isError);
  // A quote that went out (or is decided) is closed: every detail and price is what the customer
  // was given, so the server keeps the document as stored and the page shows it locked. Changes
  // are a revision of the quote. The revision of a Won quote is the exception: it stays Won with
  // everything open to change.
  const wonRevision = !!quote && isWonRevision(quote.status, draft);
  const quoteClosed = !!quote && !exportClosesQuote(quote.status) && !wonRevision;
  // A Sea FCL quote is priced in the FCL layout (fclPricing.ts); one sent before it stays as it was
  // sent. Shown once today's rates are known; until then (or for want of a rate) the lines as they are.
  const fclLayout = usesFclPricing(draft, quoteClosed);
  const fclView = useMemo(() => {
    const fcl = fclLayout ? withFclPricing(draft, exchange.rates, exchange, { open: !quoteClosed }) : null;
    return fcl && { ...draft, ...fcl };
  }, [fclLayout, draft, exchange, quoteClosed]);
  // Buying lines priced by a tariff for another cargo weight than Cargo details has now: marked, to recheck.
  const recheck = quoteClosed ? [] : linesToRecheck(draft);
  // And those priced from a tariff in another Trade Direction than the quote has now: picked again before sending.
  const otherDirection = quoteClosed ? [] : linesForOtherDirection(draft);
  // And those whose lapsed tariff has a new rate waiting for approval.
  const waitingUpdates = quoteClosed ? [] : waitingTariffUpdates(draft);
  const waitingRate = quoteClosed ? [] : linesWaitingForRate(draft);
  const toRecheck = (index: number) => recheck.includes(index) || otherDirection.includes(index) || waitingRate.includes(index);
  // A warehouse approval from before the server put its fee to Pricing: the lines are added as the
  // quote opens (once per answer; autosave stores them). Not on a quote whose pricing is closed.
  const missingFee = quote && !quoteClosed ? missingWarehouseFee(draft) : null;
  const missingFeeFor = missingFee ? draft.warehouseInquiry?.id : undefined;
  useEffect(() => {
    if (missingFee) set(missingFee);
    // Once per answer, not on every render while the change is on its way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingFeeFor]);
  // Lines from before the basis was copied, W/M followed the cargo and the Overweight surcharge was
  // put to Pricing are brought in line as the quote opens; and rates priced by weight before the
  // weight was remembered are taken as priced for the weight the quote has now.
  useEffect(() => {
    if (!quote || quoteClosed) return;
    const staleWm = withPricedForNow(draft, derived(draft));
    if (Object.keys(staleWm).length) change(staleWm);
    // Once as the quote opens; later changes of the cargo carry it themselves (set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!quote]);
  // "Everything must be linked" (owner, 26 Oct 2026): an open quote names its customer and contact
  // person as the Customer Database names them now. A rename saved in another screen, tab or by a
  // colleague shows here once the record is read again, and the link to a contact that was deleted
  // ends (the name stays, as text). The server does the same to the stored quote. A closed quote
  // keeps what it went out with.
  useEffect(() => {
    if (quote && !quoteClosed) follow(liveCustomerCopies(draft, live.customer, live.contactsFor));
  }, [quote, quoteClosed, draft, live.customer, live.contactsFor, follow]);
  // A save the server refused may be about a contact that is no longer the customer's: its
  // contacts are read again, which ends such a link above and tries the save again.
  const saveRefused = save.problem?.kind === "failed" ? save.problem : null;
  const { reloadContacts } = live;
  const contactLinked = !!draft.customerContactId;
  useEffect(() => {
    if (saveRefused && contactLinked) void reloadContacts();
  }, [saveRefused, contactLinked, reloadContacts]);
  // How many rail tariff offers the quote's route has, for the "Tariffs available" button of its
  // inland container haulage lines; asked only while there is such a line to price.
  const railCount = useRailOffers(!quoteClosed && (draft.buyingLines ?? []).some(isInlandHaulageLine) ? railOffersRequest(railRouteOf(draft, businessToday())) : null);
  // The same for the collections tariffs, on an inland collection / delivery line of a Sea LCL or
  // air quote; our hubs give the route its other end (asked only on such a quote).
  const collectionHubs = useCollectionHubs({ enabled: !!collectionFreightOf(draft.serviceType) }).hubs;
  const collectionCount = useCollectionOffers(
    !quoteClosed && collectionFreightOf(draft.serviceType) && (draft.buyingLines ?? []).some(isInlandCollectionLine)
      ? collectionOffersRequest(collectionRouteOf(draft, collectionHubs, businessToday()))
      : null,
  );
  // The same for the shipping lines' tariffs, on the Ocean freight line of a Sea FCL quote.
  const oceanCount = useOceanOffers(
    !quoteClosed && draft.serviceType === "Sea FCL" && (draft.buyingLines ?? []).some(isOceanFreightLine) ? oceanOffersRequest(oceanRouteOf(draft, businessToday())) : null,
  );
  // Where the route's places are: the quotation says it, as Routing does.
  const routeWhere = useRouteWhere(draft);
  // What an approved rate puts on the quote, as the page was last drawn (see approveTariffUpdate).
  const putApprovedRateNow = useRef<(update: TariffUpdate, found: ApprovedOffer) => void>(() => undefined);
  const printNow = () => {
    const blocked = printQuote(ref, draft, exchange, company, people, routeWhere);
    if (blocked) toast.error(blocked);
  };
  // Export PDF closes a quote that has not gone out yet: it is sent as it stands (Quoted), which
  // the user confirms first - unless the margin floor stops the sending, which is said instead.
  // A quote that went out is printed again as it is - the revision of a Won quote too: open to
  // change, yet Won, which the server does not mark as sent again.
  const exportPdf = () => {
    if (quote && !exportClosesQuote(quote.status)) printNow();
    else if (documentBlocked) toast.error(documentBlocked);
    else if (sendBlocked) toast.error(sendBlocked);
    else setModal("closeQuote");
  };
  // The print window is opened on the click itself - after the server's answer the browser would
  // take it for a pop-up - and gets the quote as the server stored it when it was sent. A window
  // that does not open closes nothing: the user allows pop-ups and tries again.
  const exportAndClose = async (validUntil?: string) => {
    const target = window.open("", "_blank");
    if (!target) {
      toast.error(PRINT_WINDOW_BLOCKED);
      return;
    }
    let sent: SalesQuoteData | null = null;
    const refused = await act(async (expectedDataVersion) => {
      const answer = await api.quotes.salesQuoteTransition(ref, { ...transitionRequest({ status: "quoted", validUntil }), expectedDataVersion });
      sent = asData(answer.quote.data);
      return answer;
    }, { versioned: true });
    if (refused) {
      target.close();
      toast.error(`${ref} - ${refused}`);
      return;
    }
    setModal(null);
    toast.success(`${ref} closed and marked as sent`);
    const blocked = printQuote(ref, sent ?? draft, exchange, company, people, routeWhere, target);
    if (blocked) toast.error(blocked);
  };
  // A quote that can't go out is not e-mailed either: the server never sees a mail, so it is
  // stopped here (Council Outlay 6 D11) - see emailBlocked.
  const openEmail = () => {
    if (documentBlocked) toast.error(documentBlocked);
    else if (emailBlocked) toast.error(`${ref} - ${emailBlocked}`);
    else setModal("email");
  };
  // The user's word that the quotation went out. Resolves like changeStatus: a refusal is shown
  // by the email dialog, which stays open for it.
  // Revise: the server makes the revision, a new quote QCZ…-R1 with this one's content, and this
  // quote becomes Replaced. The page then goes to the revision, where prices can be changed.
  const reviseQuote = async () => {
    let revision: string | null = null;
    const refused = await act(async (expectedDataVersion) => {
      // The status this page shows: a quote made Won meanwhile (a colleague's shipment) is not revised.
      const answer = await api.quotes.salesQuoteRevise(ref, { expectedDataVersion, expectedStatus: quote?.effectiveStatus });
      revision = answer.revision.quoteNumber;
      // A Won quote's shipments could not be moved to the revision: what to do by hand.
      if (answer.warning) toast.warning(answer.warning);
      return answer;
    }, { versioned: true });
    if (refused) return refused;
    if (revision) {
      toast.success(`${ref} revised as ${revision}`);
      router.push(hrefOf(revision));
    }
    return null;
  };
  const markSent = async () => {
    const refused = await changeStatus({ status: "quoted" });
    if (!refused) toast.success(`${ref} marked as sent`);
    return refused;
  };

  const done: Record<SectionKey, boolean> = {
    customer: !!draft.customerName,
    // A sea quote also says whether the cargo goes through a CY.
    // Not asked of one closed before it was asked: it cannot be answered there.
    shipment: !!(draft.direction && draft.serviceType && draft.incoterm) && (!isSeaQuote(draft) || cyTermsOf(draft) !== undefined || quoteClosed),
    // Origin and Destination, but not an FOB import's Origin or a CFR export's Destination (routingNeeds).
    // Or left blank on purpose: confirmed as the step was saved without them.
    routing: routingMissing(draft).length === 0 || !!draft.routingBlank,
    // A reefer box needs its set-point, an open top or flat rack the in-gauge answer (and the
    // measures of cargo that is not), before the cargo is complete.
    cargo: !!(draft.commodity || packages.length || containers.length) && !reeferMissing(draft) && !oogMissing(draft),
    pricing: !!(draft.sellingLines?.length),
    terms: !!draft.shippingTerms,
  };

  if (load.status === "notFound") {
    return (
      <div className="p-10 text-center text-slate-500">
        Quote not found.{" "}
        <Link href={listHref} className={LINK_CLASS}>
          Back to Quotes
        </Link>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="p-10 text-center text-slate-500">
        Could not load the quote - {load.problem.reason}.{" "}
        {load.problem.kind === "signedOut" && (
          <>
            <SignInLink /> again in a new tab, then{" "}
          </>
        )}
        <Button size="small" onClick={() => reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // Without a loaded quote there is no form and no action: an empty form looks like a wiped
  // quote and, once saved or duplicated, becomes one. The Exchange sheet is waited for as well:
  // without it a quote in several currencies would first show totals with lines left out. A
  // quote that was just deleted here is not one to act on either, while the Quotes list opens.
  if (load.status === "loading" || !quote || exchange.isLoading || deleted) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  // A save that worked is not announced: the page saves by itself. Only a save that failed is
  // said in the header, beside the banner that offers Retry.
  const saveLabel = save.problem ? `Not saved - ${save.problem.reason}` : null;

  // The readiness date, when what is stored is a date - the test the lists and the customer's
  // document apply (cargoReadyDay), so the date picker, the Summary and the document agree.
  const readyDate = cargoReadyDay(draft) || null;

  // The owner is not counted: it is the server's, and its picker stands in the summary at the top.
  const partial: Record<SectionKey, boolean> = {
    customer: !!(draft.customerName || draft.customerContact || draft.customerEmail || draft.customerPhone),
    shipment: !!(draft.direction || draft.serviceType || draft.incoterm || readyDate),
    routing: !!(draft.origin || draft.destination || draft.pol || draft.pod || draft.pickup || draft.delivery),
    cargo: !!(draft.commodity || packages.length || containers.length || draft.stackable || draft.dangerous),
    pricing: !!(draft.buyingLines?.length || draft.sellingLines?.length),
    terms: !!(draft.shippingTerms || draft.shippingIncludes || draft.shippingExcludes || draft.shippingSubjectTo),
  };
  const sectionStatus = (key: SectionKey): SectionStatus => (done[key] ? "completed" : partial[key] ? "in-progress" : "empty");

  const shownValidity = pendingValidity === undefined ? quote.validUntil : pendingValidity;

  const airFreight = draft.serviceType === "Air";
  // By sea (FCL, LCL, Break Bulk), Origin offers the ocean terminals when the CY terms (Shipment
  // details) start with CY, and Destination when they end with CY.
  const seaFreight = isSeaQuote(draft);
  const cyTerms = cyTermsOf(draft);
  const originTerminals = seaFreight && cyAtOrigin(cyTerms);
  const destinationTerminals = seaFreight && cyAtDestination(cyTerms);

  // Road transport: the card shows on a Road quote and on any quote with lines priced from a tariff.
  // Road pricing from the trucking tariffs only while the company has the Trucking Concept.
  const showRoad = truckingOn && isRoadQuote(draft);
  const road = draft.road ?? roadInputDefaults(draft);
  const roadProblems = roadInputProblems(road, businessToday());
  const roadMargin = quote.roadMargin ?? null;
  // Why the quote may not be sent or marked Ready to send: its margin waits for a manager.
  // Why the quote can't go out, in the server's words: a margin below its mode's floor no approval
  // covers, or heavy pieces the warehouse has not approved (Council Outlay 6).
  // And a buying line linked to a new supplier that waits for a manager's approval, or was declined, or
  // with a supplier only typed: the server refuses the sending too, this says it beforehand.
  // So does a line priced from a tariff in the other Trade Direction (a tariff prices only the directions it is for).
  // And a Sea FCL quote with a container type that has no profit yet, a new tariff rate that waits for
  // approval, or a customer that registered through a link and waits for a manager (or was declined).
  const sendBlocked =
    quote.sendBlocked ??
    (quoteClosed
      ? null
      : (supplierSendBlock(draft.buyingLines ?? [], (id) => supplierDirectory.byId.get(id), supplierApprovals.byId) ??
        otherDirectionBlock(draft) ??
        tariffUpdateBlock(draft) ??
        customerSendBlock(draft.customerId, supplierApprovals.byId) ??
        (exchange.isLoading ? null : fclProfitBlock(fclView ?? draft, exchange.rates, exchange))));
  // E-mailing sends the quote only where Export PDF would close it - one that has not gone out yet
  // - and on the revision of a Won quote, whose new prices go to the customer. A quote that went
  // out is e-mailed again as it was sent, whatever its margin says now.
  const emailBlocked = exportClosesQuote(quote.status) || wonRevision ? sendBlocked : null;
  // "Tariff vN" on a line priced from a tariff, and "Override" when it was changed by hand since.
  const buyingTag = (line: CostLine) => {
    if (isRailLine(line)) return <SupplierTariffTag line={line} label="Rail tariff" versionId={railVersionId(line)} versionHref={railVersionHref} />;
    if (isCollectionLine(line)) return <SupplierTariffTag line={line} label="Collection tariff" versionId={collectionVersionId(line)} versionHref={collectionVersionHref} />;
    if (isOceanLine(line)) return <SupplierTariffTag line={line} label="Ocean tariff" versionId={oceanVersionId(line)} versionHref={oceanVersionHref} />;
    const tag = lineTariffTag(line, draft.roadPricing, "buying");
    return tag && <TariffTag tag={tag} />;
  };
  const sellingTag = (line: CostLine) => {
    const tag = lineTariffTag(line, draft.roadPricing, "selling");
    if (tag) return <TariffTag tag={tag} />;
    // Why the warehouse's fee was changed from what its approval set.
    return line.pairId === WAREHOUSE_PAIR_ID && line.changeReason ? <span className="text-[11px] text-amber-700">Changed: {line.changeReason}</span> : null;
  };
  const pricedTotals = { buying: draft.roadPricing?.buy, selling: draft.roadPricing?.sell };
  const sideOverrideNote = (kind: "buying" | "selling", lines: CostLine[]) => {
    const priced = pricedTotals[kind];
    if (!priced || !sideOverridden(lines, priced)) return null;
    return (
      <div className="text-[12px] text-amber-700">
        The {kind} lines priced from the tariff no longer add up to its {formatMoney(priced.total, priced.currency)} - changed by hand (Override).
      </div>
    );
  };

  // "Copy buying → selling" puts a copy of every buying line in the place of the selling lines.
  // Selling lines that are there were typed by somebody, and autosave stores the change at once:
  // the copy is asked about first, and made straight away only into an empty Selling.
  const buyingLines = draft.buyingLines ?? [];
  const sellingLines = draft.sellingLines ?? [];
  // The FCL layout lists the trucking lines on their own (FclTruckingBlock), these notes under them.
  const buyingOverride = sideOverrideNote("buying", buyingLines);
  const sellingOverride = sideOverrideNote("selling", sellingLines);
  const truckingNotes = buyingOverride || sellingOverride ? (
    <>
      {buyingOverride}
      {sellingOverride}
    </>
  ) : null;
  // Each copy shares a pairId with its buying line, so removing one can offer to remove the other.
  const copyBuyingToSelling = () => {
    const { buying, selling } = pairedCopies(buyingLines);
    set({ buyingLines: buying, sellingLines: selling });
  };

  // "Tariffs available" under an inland container haulage buying line (rail tariffs), under an
  // inland collection / delivery line of a Sea LCL or air quote (collections tariffs), and under the
  // Ocean freight line of a Sea FCL quote (shipping lines' tariffs), with how many offers the
  // quote's route has once that is known.
  const tariffKindOf = (line: CostLine): "rail" | "collection" | "ocean" | null => {
    if (isInlandHaulageLine(line)) return "rail";
    if (isInlandCollectionLine(line) && collectionFreightOf(draft.serviceType)) return "collection";
    if (isOceanFreightLine(line) && draft.serviceType === "Sea FCL") return "ocean";
    return null;
  };
  const buyingAction = (line: CostLine, index: number) => {
    if (quoteClosed) return null;
    const kind = tariffKindOf(line);
    if (!kind) return null;
    const count = { rail: railCount, collection: collectionCount, ocean: oceanCount }[kind].result?.offers.length;
    const open = { rail: setRailLine, collection: setCollectionLine, ocean: setOceanLine }[kind];
    return (
      <button
        type="button"
        onClick={() => open(index)}
        className={`inline-flex items-center gap-1 text-[12px] font-medium ${LINK_CLASS} cursor-pointer`}
      >
        <TagsOutlined aria-hidden />
        Tariffs available{count !== undefined ? ` (${count})` : ""}
      </button>
    );
  };
  // An offer's amount in the quote's currency, as the buying lines are totalled.
  const toQuoteCurrency = (amount: number, currency: string) => convertLine({ type: "", description: "", currency, amount }, draft, exchange.rates, { live: exchange });
  // The buying lines after a pick, with the rows' React keys following them: the keys of the lines
  // an earlier pick made go, and the offer's further lines get new ones.
  // `also`: what else changes with the lines, in the same change.
  const putPick = (pick: TariffPick, also: Partial<SalesQuoteData> = {}) => {
    for (const i of [...pick.removed].sort((a, b) => b - a)) buyingKeys.remove(i);
    for (let k = 1; k < pick.count; k++) buyingKeys.insert(pick.at + k);
    // The offer's lines are priced for the cargo weight and in the Trade Direction the quote has now.
    const picked = Array.from({ length: pick.count }, (_, k) => pick.at + k);
    set({ ...also, buyingLines: stampDirection(stampPricedFor(pick.lines, picked, draft), picked, draft) });
  };
  // An offer picked under "Tariffs available" goes on the line it was opened from (see
  // withRailOffer); the rows keep their React keys. As when an amount is typed on a line that had
  // none, selling is then offered the line. Nothing is put on a quote closed meanwhile.
  const pickRailOffer = (offer: RailOffer, route: RailRoute) => {
    if (quoteClosed || railLine === null || !route.port) return;
    const before = buyingLines[railLine];
    const pick = withRailOffer(buyingLines, railLine, offer, route.port, route.direction, draft);
    putPick(pick);
    setRailLine(null);
    toast.success(`Priced from ${offer.supplierName}: ${fmtMoney(offer.total, offer.currency)}`);
    const first = pick.lines[pick.at];
    if (!fclLayout && pick.count === 1 && first && !(Number(before?.amount) > 0) && offerToSelling(first, sellingLines)) setToSelling({ line: first, index: pick.at });
  };
  // A collections offer replaces the line it was opened from with one lump sum (see
  // withCollectionOffer), so every row keeps its key; selling is offered it as for rail.
  const pickCollectionOffer = (offer: CollectionOffer, route: CollectionRoute) => {
    if (quoteClosed || collectionLine === null) return;
    const before = buyingLines[collectionLine];
    const lines = stampPricedFor(withCollectionOffer(buyingLines, collectionLine, offer, route), [collectionLine], draft);
    updateLines("buyingLines", lines);
    setCollectionLine(null);
    toast.success(`Priced from ${offer.supplierName}: ${fmtMoney(offer.total, offer.currency)}`);
    const priced = lines[collectionLine];
    if (!fclLayout && priced && !(Number(before?.amount) > 0) && offerToSelling(priced, sellingLines)) setToSelling({ line: priced, index: collectionLine });
  };
  // An ocean offer puts its freight and a line per surcharge in the place of the line it was opened
  // from (see withOceanOffer); the rows keep their React keys, and selling is offered the freight.
  const pickOceanOffer = (offer: OceanOffer, route: OceanRoute) => {
    if (quoteClosed || oceanLine === null) return;
    const before = buyingLines[oceanLine];
    const pick = withOceanOffer(buyingLines, oceanLine, offer, route, draft);
    putPick(pick);
    setOceanLine(null);
    const surcharges = offer.surcharges.length ? ` and ${offer.surcharges.length} ${offer.surcharges.length === 1 ? "surcharge" : "surcharges"}` : "";
    toast.success(`Priced from ${offer.supplierName}: ${fmtMoney(offer.freight, offer.currency)} freight${surcharges}`);
    const freight = pick.lines[pick.at];
    if (!fclLayout && freight && !(Number(before?.amount) > 0) && offerToSelling(freight, sellingLines)) setToSelling({ line: freight, index: pick.at });
  };

  // What approving a lapsed tariff's new rate puts on the quote once its offer is here (see
  // approveTariffUpdate). Nothing is put on a quote closed meanwhile.
  const putApprovedRate = (update: TariffUpdate, found: ApprovedOffer) => {
    if (quoteClosed) return;
    const at = approvalLineOf(buyingLines, update, approvalFreightOf(update.kind));
    if (at < 0) return toast.error(`No buying line is priced from the old ${update.supplierName} rate any more`);
    const old = buyingLines.filter((l) => l.tariffRef === update.oldRef);
    const settled = { tariffUpdates: withoutTariffUpdate(draft, update) };
    if (found.kind === "ocean") putPick(withApprovedRate(withOceanOffer(buyingLines, at, found.offer, found.route, draft), old), settled);
    else if (found.kind === "rail") putPick(withApprovedRate(withRailOffer(buyingLines, at, found.offer, found.port, found.direction, draft), old), settled);
    else set({ ...settled, buyingLines: stampPricedFor(withCollectionOffer(buyingLines, at, found.offer, found.route), [at], draft) });
    toast.success(`New ${update.supplierName} rate approved`);
  };
  putApprovedRateNow.current = putApprovedRate;

  // The new rate of a lapsed tariff, approved: the offer is asked for again as of today and put in the
  // place of the old lines, each charge keeping the profit, "All in" tick and pairing it had
  // (withApprovedRate), and the rate leaves the quote's waiting ones in the same change. Typed
  // selling lines are left as they are and the user sees the new margin; a quote in the FCL layout
  // sells each charge at its new buying plus the same profit. The offer goes on the quote as it is
  // once the offer is here, not as it was when the button was pressed: the page as last drawn puts
  // it there (putApprovedRateNow), so what was typed while it was asked for stays, and the old lines
  // are looked for where they are by then.
  const approveTariffUpdate = async (update: TariffUpdate) => {
    const today = businessToday();
    if (update.kind === "road") {
      if (quoteClosed || !draft.roadPricing) return;
      setApprovingRate(update.oldRef);
      const refused = await priceRoad(
        { serviceLevel: draft.roadPricing.serviceLevel, haulierCustomerId: draft.roadPricing.buy?.haulierCustomerId ?? null },
        roadForToday(draft.road ?? roadInputDefaults(draft), today),
      );
      setApprovingRate(null);
      if (refused) toast.error(refused);
      return;
    }
    if (quoteClosed || approvalLineOf(buyingLines, update, approvalFreightOf(update.kind)) < 0) {
      if (!quoteClosed) toast.error(`No buying line is priced from the old ${update.supplierName} rate any more`);
      return;
    }
    const gone = () => toast.error(`The new ${update.supplierName} rate is no longer offered for this route: pick a tariff under Tariffs available`);
    setApprovingRate(update.oldRef);
    try {
      if (update.kind === "ocean") {
        const route = oceanRouteOf(draft, today);
        const request = oceanOffersRequest(route);
        const offer = request && (await api.tariffs.oceanOffers(request)).offers.find((o) => isOfferOfUpdate(o, update));
        if (!offer) return gone();
        putApprovedRateNow.current(update, { kind: "ocean", offer, route });
      } else if (update.kind === "rail") {
        const route = railRouteOf(draft, today);
        const request = railOffersRequest(route);
        const offer = request && (await api.tariffs.railOffers(request)).offers.find((o) => isOfferOfUpdate(o, update));
        if (!offer || !route.port) return gone();
        putApprovedRateNow.current(update, { kind: "rail", offer, port: route.port, direction: route.direction });
      } else {
        const route = collectionRouteOf(draft, collectionHubs, today);
        const request = collectionOffersRequest(route);
        const offer = request && (await api.tariffs.collectionOffers(request)).offers.find((o) => isOfferOfUpdate(o, update));
        if (!offer) return gone();
        putApprovedRateNow.current(update, { kind: "collection", offer, route });
      }
    } catch (err) {
      toast.error(`Could not approve the new rate: ${apiErrorMessage(err)}`);
    } finally {
      setApprovingRate(null);
    }
  };

  const linesOf = (side: LineSide) => (side === "buying" ? buyingLines : sellingLines);
  const keysOf = (side: LineSide) => (side === "buying" ? buyingKeys : sellingKeys);
  // The lines without those removed, as one change (two would each start from the same draft and
  // the second undo the first); each removed row's key goes with it, so the rows after keep theirs.
  const applyRemovals = (removals: LineRemoval[], also: Partial<SalesQuoteData> = {}) => {
    const patch: Partial<SalesQuoteData> = { ...also };
    for (const side of ["buying", "selling"] as const) {
      const own = removals.filter((r) => r.side === side).sort((a, b) => b.index - a.index);
      if (!own.length) continue;
      for (const { index } of own) keysOf(side).remove(index);
      patch[side === "buying" ? "buyingLines" : "sellingLines"] = linesOf(side).filter((_, j) => !own.some((r) => r.index === j));
    }
    set(patch);
  };
  // Removing a line that has a counterpart on the other side asks first; one without goes at once.
  const removeLine = (side: LineSide, index: number) => {
    const line = linesOf(side)[index]!;
    // The Overweight surcharge goes only with a reason, as does leaving it at 0.
    if (line.pairId === OVERWEIGHT_PAIR_ID) return setOverweightAsk({ removing: index });
    // The warehouse's fee goes only with a reason - its buying and its selling line together.
    if (line.pairId === WAREHOUSE_PAIR_ID) return setFeeChange({ index, amount: 0, before: Number(line.amount) || 0, currency: line.currency, removing: side });
    const other = counterpartIndex(linesOf(side)[index]!, linesOf(side === "buying" ? "selling" : "buying"));
    if (other >= 0) return setRemoving({ side, index, other });
    applyRemovals(lineRemovals(side, index, other, false));
  };
  const finishRemoving = (both: boolean) => {
    if (!removing) return;
    applyRemovals(lineRemovals(removing.side, removing.index, removing.other, both));
    setRemoving(null);
  };

  // What choosing a template puts on the quote: its name and its texts, word for word - a text the
  // template leaves empty is empty here too. The Shipping terms are not typed on the quote; only the
  // validity is the quote's own. The quote is not made Ready to Send (or sent) before one is chosen.
  const chooseTemplate = (name: string) => set(templateTerms(name, terms));
  // The template was changed since its texts were put on this quote (or they were copied from an
  // older quote): choosing the same template again changes nothing in the picker, so it is offered.
  const termsOutdated = !quoteClosed && termsDifferFromTemplate(draft, terms);

  // While a shipment carries the quote nobody may delete it, and the way there is not obvious:
  // the server's sentence stands under Delete quote in the Actions menu. A user who may not
  // delete the quote for want of a role is shown neither the item nor a reason.
  const deleteBlockedByShipment = quote.shipmentId !== null ? quote.permissions.deleteBlockedReason : undefined;

  // What waits behind Actions in the header: what is done now and then - a copy of the quote,
  // filling it in from something that exists, deleting it. What cannot be done now stays in the
  // menu, disabled, with the reason under it.
  const actionItems: MenuProps["items"] = [
    { key: "duplicate", icon: <CopyOutlined />, label: "Duplicate", onClick: () => setModal("duplicate") },
    { type: "divider" },
    {
      // The three ways to fill the quote in from something that exists.
      key: "importData",
      type: "group",
      label: <MenuLabel label="Import data" reason={quoteClosed ? "A closed quote is not changed - revise it" : ""} />,
      children: [
        { key: "import", icon: <ImportOutlined />, label: "Import inquiry data", disabled: quoteClosed, onClick: () => setModal("import") },
        { key: "copyQuote", icon: <CopyOutlined />, label: "Copy from quote", disabled: quoteClosed, onClick: () => setModal("copyQuote") },
        { key: "copyShipment", icon: <ContainerOutlined />, label: "Copy from shipment", disabled: quoteClosed, onClick: () => setModal("copyShipment") },
      ],
    },
    ...(quote.permissions.canDelete
      ? [{ type: "divider" as const }, { key: "delete", danger: true, icon: <DeleteOutlined />, label: "Delete quote", onClick: () => setModal("delete") }]
      : deleteBlockedByShipment
        ? [
            { type: "divider" as const },
            { key: "delete", danger: true, disabled: true, icon: <DeleteOutlined />, label: <MenuLabel label="Delete quote" reason={`Cannot be deleted: ${deleteBlockedByShipment}.`} /> },
          ]
        : []),
  ];

  // The record the quote is linked to no longer exists: the server answered "not found", which
  // a read that is still on its way or one that failed does not say. The quote keeps the name
  // and its link, but the customer's page would open on "not found", so nothing leads there.
  const customerDeleted = !!draft.customerId && !linkedCustomer.customer && !linkedCustomer.isLoading && !linkedCustomer.isLoadError;
  // A quote for a customer is priced in one of the customer's currencies (its default marked); one
  // without a customer in any. A currency set before, and not the customer's, still shows as it is.
  const offeredCurrencies: string[] = linkedCustomer.customer ? customerCurrencies(linkedCustomer.customer) : [...CURRENCIES];
  const currencyOptions = (offeredCurrencies.includes(totals.currency) ? offeredCurrencies : [totals.currency, ...offeredCurrencies]).map((c) => ({
    value: c,
    label: linkedCustomer.customer && c === linkedCustomer.customer.currency ? `${c} · default` : c,
  }));
  const customerPageId = customerDeleted ? undefined : draft.customerId;

  // Who the quote is for, as the card at the top shows it: a name too long for its column is cut,
  // and hovering it shows all of it.
  const customerFact = draft.customerName ? (
    <span className="block truncate" title={draft.customerName}>
      <CustomerLink customerId={customerPageId} deleted={customerDeleted} name={draft.customerName} />
    </span>
  ) : (
    <span className="text-slate-400">No customer yet</span>
  );

  // What stands under the Customer step: where a linked customer comes from, or that the name
  // the quote carries is only text - which the Customer box cannot show as its value, so the way
  // to take such a name off the quote is here.
  let customerNote: ReactNode = null;
  // A contact person picked from the customer's contacts, on a quote that follows them: what is
  // shown comes from the Customer Database, and Unlink makes it text to be typed over.
  // A typed name that is one of the contacts, beside an e-mail or phone that is not theirs, is not
  // linked on its own (that would replace them): the link is offered here.
  const offeredContact = draft.customerId && !quoteClosed ? namedContact(live.contacts, draft) : undefined;
  let contactNote: ReactNode = null;
  if (contactLinked && !quoteClosed) {
    contactNote = (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-xs text-slate-500">The contact person, e-mail and phone follow the Customer Database</span>
        <MiniButton onClick={() => set({ customerContactId: null })}>Unlink</MiniButton>
      </div>
    );
  } else if (offeredContact && !offeredContact.keepsDetails) {
    const { contact } = offeredContact;
    contactNote = (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-xs text-slate-500">
          {contact.name} is one of this customer&apos;s contacts - linking replaces the e-mail and phone with theirs
        </span>
        <MiniButton onClick={() => set(contactFields(contact))}>Link contact</MiniButton>
      </div>
    );
  }
  if (draft.customerId) {
    const record = linkedCustomer.customer;
    customerNote = (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {draft.customerLabel && <CustomerAccountTypeBadge label={draft.customerLabel} />}
        <span className="text-xs text-slate-500">
          {customerDeleted
            ? "This customer record was deleted - the name is kept as text"
            : [record?.ico && `ICO ${record.ico}`, record?.city].filter(Boolean).join(" · ")}
        </span>
        {customerPageId && (
          <Link href={`/customers/${customerPageId}`} className={SMALL_LINK_CLASS}>
            Open customer
          </Link>
        )}
      </div>
    );
    if (contactNote) {
      customerNote = (
        <div className="flex flex-col gap-1">
          {customerNote}
          {contactNote}
        </div>
      );
    }
  } else if (draft.customerName) {
    customerNote = (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-xs text-slate-500">
          {draft.customerName} is not linked to the Customer Database - pick the customer above to link it
        </span>
        <MiniButton onClick={() => set(NO_CUSTOMER)}>Remove</MiniButton>
      </div>
    );
  }

  // `note` stands at the foot of a step, left of its "Save & continue".
  // A step's `content` is locked whole on a closed quote.
  // A step with `cards` is a stack of cards of its own, as a shipment's Cargo Details tab, rather
  // than one card under the step's title.
  const sections: { key: SectionKey; title: string; subtitle: string; content: ReactNode; note?: ReactNode; cards?: boolean }[] = [
    {
      key: "customer",
      title: "Customer details",
      subtitle: "Customer and contact person",
      content: (
        <div className={FIELD_COLUMNS_CLASS}>
          <div className="min-w-0">
            <InfoRow label="Customer">
              <CustomerSelect
                // Named as the Customer Database names it now; by the name on the quote while
                // that is being read and when the record is gone.
                linked={draft.customerId ? { id: draft.customerId, name: linkedCustomer.customer?.companyName || draft.customerName || draft.customerId } : null}
                unlinkedName={draft.customerId ? undefined : draft.customerName}
                onPick={pickCustomer}
                // The x takes the customer off the quote, whole: link, name, account type and contact.
                onClear={() => set(NO_CUSTOMER)}
              />
            </InfoRow>
            <InfoRow label="Contact person">
              <QuoteContactField
                name={draft.customerContact ?? ""}
                contactId={draft.customerContactId}
                email={draft.customerEmail}
                phone={draft.customerPhone}
                customerLinked={!!draft.customerId}
                contacts={draft.customerId ? live.contacts : []}
                onChange={set}
              />
            </InfoRow>
          </div>
          <div className="min-w-0">
            {/* A picked contact's e-mail and phone are the contact's: the server writes them from
                the Customer Database with every save, so they are not typed over here. */}
            <InfoRow label="Email">
              <Input
                size="small"
                aria-label="Email"
                value={draft.customerEmail ?? ""}
                readOnly={contactLinked}
                variant={contactLinked ? "filled" : undefined}
                title={contactLinked ? CONTACT_FOLLOWS_TITLE : undefined}
                onChange={(e) => set({ customerEmail: e.target.value })}
              />
            </InfoRow>
            <InfoRow label="Phone">
              <Input
                size="small"
                aria-label="Phone"
                value={draft.customerPhone ?? ""}
                readOnly={contactLinked}
                variant={contactLinked ? "filled" : undefined}
                title={contactLinked ? CONTACT_FOLLOWS_TITLE : undefined}
                onChange={(e) => set({ customerPhone: limitCzechPhone(e.target.value) })}
              />
            </InfoRow>
          </div>
        </div>
      ),
      note: customerNote,
    },
    {
      key: "shipment",
      title: "Shipment details",
      subtitle: "Direction, freight mode and Incoterms",
      content: (
        <div className={FIELD_COLUMNS_CLASS}>
          <div className="min-w-0">
            <InfoRow label="Trade Direction">
              <Select
                size="small"
                className="w-full"
                aria-label="Trade Direction"
                value={draft.direction}
                onChange={(v) => set({ direction: v })}
                options={DIRECTIONS.map((d) => ({ value: d, label: d }))}
              />
            </InfoRow>
            <InfoRow label="Freight Mode">
              <Select
                size="small"
                className="w-full"
                aria-label="Freight Mode"
                value={draft.serviceType}
                onChange={(v) => set({ serviceType: v })}
                options={SERVICE_TYPES.map((d) => ({ value: d, label: serviceTypeLabel(d) }))}
              />
            </InfoRow>
            {seaFreight && (
              <InfoRow label="CY">
                <Select
                  size="small"
                  className="w-full"
                  aria-label="CY"
                  placeholder="CY or store door, origin / destination"
                  value={cyTerms}
                  onChange={(v: CyTerms) => set({ cy: v })}
                  options={CY_TERMS.map((t) => ({ value: t, label: t }))}
                />
              </InfoRow>
            )}
          </div>
          <div className="min-w-0">
            <InfoRow label="Incoterms">
              <Select
                size="small"
                className="w-full"
                aria-label="Incoterms"
                value={draft.incoterm}
                onChange={(v) => set({ incoterm: v })}
                options={INCOTERMS.map((d) => ({ value: d, label: d }))}
              />
            </InfoRow>
            <InfoRow label="Cargo Readiness Date">
              <DatePicker
                size="small"
                className="w-full"
                aria-label="Cargo Readiness Date"
                format={DATE_FORMATS}
                placeholder="DD.MM.YYYY"
                value={readyDate ? dayjs(readyDate) : null}
                onChange={(date) => set({ readyDate: date ? date.format(STORED_DATE) : "" })}
              />
            </InfoRow>
          </div>
        </div>
      ),
    },
    {
      key: "routing",
      title: "Routing",
      subtitle: "Places of loading and delivery, ports and addresses",
      content: (
        <div className={FIELD_COLUMNS_CLASS}>
          <div className="min-w-0">
            <InfoRow label="Place of Loading">
              <span className="flex items-center">
                <GeoSelect kind="place" airports={airFreight} terminals={originTerminals} showWhere size="small" className="w-full" value={draft.origin} onChange={(v) => set({ origin: v })} />
                <GeoFlag kind="place" value={draft.origin} />
              </span>
            </InfoRow>
            <InfoRow label="Port of Loading">
              <span className="flex items-center">
                <GeoSelect kind="place" airports={airFreight} size="small" className="w-full" placeholder={airFreight ? "Airport of departure" : "Port of Loading"} value={draft.pol} onChange={(v) => set({ pol: v })} />
                <GeoFlag kind="place" value={draft.pol} />
              </span>
            </InfoRow>
            {/* One of the customer's Pickup addresses in the Customer Database. The shipment's Pick-up Address: copied there when a shipment is created from the quote, and back by Copy from shipment. */}
            <InfoRow label="Pickup Address">
              <QuoteAddressField label="Pickup Address" type="Pickup" customerId={draft.customerId} value={draft.pickup} onChange={(pickup) => set({ pickup })} />
            </InfoRow>
          </div>
          <div className="min-w-0">
            <InfoRow label="Place of Delivery">
              <span className="flex items-center">
                <GeoSelect kind="place" airports={airFreight} terminals={destinationTerminals} showWhere size="small" className="w-full" value={draft.destination} onChange={(v) => set({ destination: v })} />
                <GeoFlag kind="place" value={draft.destination} />
              </span>
            </InfoRow>
            <InfoRow label="Port of Discharge">
              <span className="flex items-center">
                <GeoSelect kind="place" airports={airFreight} size="small" className="w-full" placeholder={airFreight ? "Airport of destination" : "Port of Discharge"} value={draft.pod} onChange={(v) => set({ pod: v })} />
                <GeoFlag kind="place" value={draft.pod} />
              </span>
            </InfoRow>
            {/* One of the customer's Delivery addresses; the shipment's Delivery Address, the same way. */}
            <InfoRow label="Delivery Address">
              <QuoteAddressField label="Delivery Address" type="Delivery" customerId={draft.customerId} value={draft.delivery} onChange={(delivery) => set({ delivery })} />
            </InfoRow>
          </div>
        </div>
      ),
    },
    {
      key: "cargo",
      title: "Cargo details",
      subtitle: containerQuote ? "Commodity, containers and weight" : "Commodity, packages and dimensions",
      cards: true,
      content: (
        <div className="flex flex-col gap-3">
          <LineBlock title="Cargo description">
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Input
                  size="small"
                  className="flex-1 !min-w-[240px] !max-w-[560px]"
                  aria-label="Cargo Description"
                  placeholder="Commodity"
                  value={draft.commodity ?? ""}
                  onChange={(e) => set({ commodity: e.target.value })}
                />
                <div className="flex items-center gap-4">
                  {/* Whether cargo may be stacked is a question of loose cargo; a full container is the box. */}
                  {!containerQuote && (
                    <Checkbox checked={!!draft.stackable} onChange={(e) => set({ stackable: e.target.checked })}>
                      Stackable
                    </Checkbox>
                  )}
                  {/* Unticked, the ADR details go with it: they describe dangerous goods. */}
                  <Checkbox
                    checked={!!draft.dangerous}
                    onChange={(e) => set(e.target.checked ? { dangerous: true } : { dangerous: false, adr: undefined })}
                  >
                    Dangerous goods
                  </Checkbox>
                </div>
              </div>
              {draft.dangerous && (
                <>
                  {/* The same fields as a shipment's cargo line, where they go when a shipment is made from the quote. */}
                  <CargoDimensionAdrFields line={draft.adr ?? {}} onPatch={(patch) => set({ adr: { ...draft.adr, ...patch } })} onCommit={() => {}} />
                  <Alert
                    type="warning"
                    showIcon
                    message="Dangerous goods declared"
                    description="An SDS is needed before booking. DG surcharges may apply."
                  />
                </>
              )}
            </div>
          </LineBlock>

          {/* A full-container quote lists its boxes; container lines a quote still has after its
              service type changed stay in view too - they count in its weight and go with a shipment
              made from it - rather than counting unseen. */}
          {(containerQuote || containers.length > 0) && (
            <LineBlock
              title="Containers"
              actions={
                <MiniButton icon={<PlusOutlined />} onClick={() => updateContainers([...containers, { ...emptyContainer }])}>
                  Add container
                </MiniButton>
              }
            >
              {containers.length === 0 ? (
                <LineBlockEmpty>No containers yet.</LineBlockEmpty>
              ) : (
                <LineTable minWidthClass="min-w-[760px]">
                  <colgroup>
                    <col className="w-[76px]" />
                    <col className="w-[200px]" />
                    <col className="w-16" />
                    <col className="w-[140px]" />
                    <col />
                    <col className="w-10" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={LINE_TH_CLASS}>Qty</th>
                      <th scope="col" className={LINE_TH_CLASS}>Container type</th>
                      <th scope="col" className={LINE_TH_RIGHT_CLASS}>TEU</th>
                      <th scope="col" className={LINE_TH_CLASS}>Kg / container</th>
                      <th scope="col" className={LINE_TH_CLASS}>Weight limit</th>
                      <th scope="col" aria-label="Remove container" className={LINE_TH_CLASS} />
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((c, i) => {
                      const weightCheck = checkContainerWeight(c.type, c.weight);
                      return (
                      <tr key={containerKeys.keys[i]}>
                        <td className={LINE_TD_CLASS}>
                          <InputNumber size="small" className="!w-full" aria-label="Number of containers" min={1} precision={0} parser={moneyInputParser} value={c.qty} onChange={(v) => patchContainer(i, { qty: v ?? 1 })} />
                        </td>
                        <td className={LINE_TD_CLASS}>
                          <Select
                            size="small"
                            className="w-full"
                            aria-label="Container type"
                            // A box saved as "40' GP" shows as the "40' DC" it is today.
                            value={containerType(c.type) || undefined}
                            onChange={(v) => patchContainer(i, { type: v })}
                            options={CONTAINER_TYPE_OPTIONS}
                          />
                        </td>
                        <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{fmtQuantity((Number(c.qty) || 0) * teuForType(c.type))}</td>
                        <td className={LINE_TD_CLASS}>
                          <InputNumber
                            size="small"
                            className={`!w-full ${WEIGHT_FIELD_CLASS[weightCheck?.level ?? "standard"]}`}
                            aria-label="Cargo weight per container in kg"
                            min={0}
                            parser={moneyInputParser}
                            value={c.weight}
                            placeholder="Cargo"
                            onChange={(v) => patchContainer(i, { weight: v ?? undefined })}
                          />
                        </td>
                        <td className={LINE_TD_CLASS}>{weightCheck ? <ContainerWeightNote check={weightCheck} /> : EMPTY_CELL}</td>
                        <td className={`${LINE_TD_CLASS} !pl-0`}>
                          <RemoveLineButton label={`Remove container ${i + 1}`} onClick={() => {
                              containerKeys.remove(i);
                              updateContainers(containers.filter((_, j) => j !== i));
                            }}
                          />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </LineTable>
              )}
            </LineBlock>
          )}

          {/* A reefer box among the containers opens its requirements; the set-point is required. */}
          {hasReefer(draft) && (
            <QuoteReeferBlock value={draft.reefer} missing={reeferMissing(draft)} onChange={(patch) => set({ reefer: { ...draft.reefer, ...patch } })} />
          )}

          {/* An open top or flat rack among the containers asks whether the cargo is in gauge. */}
          {hasOogEquipment(draft) && (
            <QuoteOogBlock value={draft.oog} types={oogTypes(draft.containers)} missing={oogMissing(draft)} onChange={(patch) => set({ oog: { ...draft.oog, ...patch } })} />
          )}

          {/* A full-container quote lists its boxes above; package lines it still has (from before
              it was one, or copied from a shipment) stay in view rather than counting unseen. */}
          {(!containerQuote || packages.length > 0) && (
          <LineBlock
            title="Packages"
            actions={
              <MiniButton icon={<PlusOutlined />} onClick={() => updatePackages([...packages, { ...emptyPackage }])}>
                Add package
              </MiniButton>
            }
          >
            {packages.length === 0 ? (
              <LineBlockEmpty>No packages yet.</LineBlockEmpty>
            ) : (
              <LineTable minWidthClass="min-w-[700px]">
                <colgroup>
                  <col className="w-[76px]" />
                  <col />
                  <col className="w-[84px]" />
                  <col className="w-[84px]" />
                  <col className="w-[84px]" />
                  <col className="w-[92px]" />
                  <col className="w-[144px]" />
                  <col className="w-10" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={LINE_TH_CLASS}>Qty</th>
                    <th scope="col" className={LINE_TH_CLASS}>Packing</th>
                    <th scope="col" className={LINE_TH_CLASS}>L (cm)</th>
                    <th scope="col" className={LINE_TH_CLASS}>W (cm)</th>
                    <th scope="col" className={LINE_TH_CLASS}>H (cm)</th>
                    <th scope="col" className={LINE_TH_CLASS}>Kg/each</th>
                    <th scope="col" className={LINE_TH_CLASS}>Cargo Stackability</th>
                    <th scope="col" aria-label="Remove package" className={LINE_TH_CLASS} />
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p, i) => (
                    <tr key={packageKeys.keys[i]}>
                      {/* Width needs "!": antd's own input-number width is unlayered CSS and would win over a plain utility. */}
                      <td className={LINE_TD_CLASS}>
                        <InputNumber size="small" className="!w-full" aria-label="Quantity" min={1} precision={0} parser={moneyInputParser} value={p.qty} onChange={(v) => patchPackage(i, { qty: v ?? 1 })} />
                      </td>
                      <td className={LINE_TD_CLASS}>
                        <Select
                          size="small"
                          className="w-full"
                          aria-label="Packing"
                          value={p.type}
                          onChange={(v) => patchPackage(i, { type: v })}
                          options={PACKING_TYPES.map((t) => ({ value: t, label: t }))}
                        />
                      </td>
                      <td className={LINE_TD_CLASS}>
                        <InputNumber size="small" className="!w-full" aria-label="Length in cm" min={0} parser={moneyInputParser} value={p.length} onChange={(v) => patchPackage(i, { length: v ?? undefined })} />
                      </td>
                      <td className={LINE_TD_CLASS}>
                        <InputNumber size="small" className="!w-full" aria-label="Width in cm" min={0} parser={moneyInputParser} value={p.width} onChange={(v) => patchPackage(i, { width: v ?? undefined })} />
                      </td>
                      <td className={LINE_TD_CLASS}>
                        <InputNumber size="small" className="!w-full" aria-label="Height in cm" min={0} parser={moneyInputParser} value={p.height} onChange={(v) => patchPackage(i, { height: v ?? undefined })} />
                      </td>
                      <td className={LINE_TD_CLASS}>
                        <InputNumber size="small" className="!w-full" aria-label="Weight per piece in kg" min={0} parser={moneyInputParser} value={p.weight} onChange={(v) => patchPackage(i, { weight: v ?? undefined })} />
                      </td>
                      <td className={LINE_TD_CLASS}>
                        <Checkbox aria-label="Stackable" checked={p.stackable !== false} onChange={(e) => patchPackage(i, { stackable: e.target.checked })} />
                      </td>
                      <td className={`${LINE_TD_CLASS} !pl-0`}>
                        <RemoveLineButton label={`Remove package ${i + 1}`} onClick={() => {
                            packageKeys.remove(i);
                            updatePackages(packages.filter((_, j) => j !== i));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </LineTable>
            )}
          </LineBlock>
          )}

          {/* Freight metrics. Weight and volume are the lines' sum - the containers' declared
              cargo, else the packages'; where the lines give none they are typed here for the
              whole shipment (computeCargo). Volumetric and chargeable weight are the air-freight
              rule (volume ÷ 6000 against gross weight) and the customer's document prints them
              for Air only; any other quote shows the weight / measure instead - 1 t or 1 cbm, the
              greater - and its chargeable tile says Air only. A full-container quote is priced
              per box: it counts its containers and TEU and names its equipment instead. */}
          <div className={`grid grid-cols-2 gap-3 ${containerQuote ? "md:grid-cols-5" : "md:grid-cols-6"}`}>
            {containerQuote ? (
              <>
                <KpiTile size="text" label="Containers" value={fmtQuantity(cargo.totalContainers)} />
                <KpiTile size="text" label={<span title="20' = 1, 40' and 45' = 2">TEU</span>} value={fmtQuantity(cargo.teu)} />
              </>
            ) : (
              <KpiTile size="text" label="Packages" value={fmtQuantity(cargo.totalPackages)} />
            )}
            <KpiTile
              size="text"
              label="Gross weight"
              value={
                cargo.weightFromLines ? (
                  `${fmtQuantity(cargo.grossWeight)} kg`
                ) : (
                  <InputNumber
                    size="small"
                    className="!w-full"
                    aria-label="Gross weight of the shipment in kg"
                    min={0}
                    parser={moneyInputParser}
                    value={draft.weight}
                    suffix="kg"
                    placeholder="Total"
                    onChange={(v) => set({ weight: v ?? undefined })}
                  />
                )
              }
              // Where a counted weight comes from: an FCL quote takes its containers' and leaves its
              // packages' weights out, which only this says.
              hint={cargo.weightFromContainers ? "From containers" : cargo.weightFromLines ? "From packages" : undefined}
            />
            <KpiTile
              size="text"
              label="Volume"
              value={
                cargo.cbmFromLines ? (
                  `${fmtQuantity(cargo.cbm)} cbm`
                ) : (
                  <InputNumber
                    size="small"
                    className="!w-full"
                    aria-label="Volume of the shipment in cbm"
                    min={0}
                    parser={moneyInputParser}
                    value={draft.cbm}
                    suffix="cbm"
                    placeholder="Total"
                    onChange={(v) => set({ cbm: v ?? undefined })}
                  />
                )
              }
              hint={cargo.cbmFromLines ? "From package dimensions" : undefined}
            />
            {containerQuote ? (
              <KpiTile size="text" label="Equipment" value={cargo.equipment || EMPTY_CELL} />
            ) : (
              <>
                {airFreight ? (
                  <KpiTile size="text" label="Volumetric wt" value={`${fmtQuantity(cargo.volumetricWeight)} kg`} />
                ) : (
                  <KpiTile
                    size="text"
                    label={<span title="1 t or 1 cbm, the greater">Weight / measure</span>}
                    value={cargo.weightMeasure ? `${fmtQuantity(cargo.weightMeasure)} W/M` : EMPTY_CELL}
                  />
                )}
                <KpiTile size="text" wrapLabel label={<>Chargeable weight <span className="normal-case whitespace-nowrap">(ChW)</span></>} value={airFreight ? `${fmtQuantity(cargo.chargeableWeight)} kg` : AIR_ONLY} />
                <KpiTile
                  size="text"
                  label={<span title="Volume ÷ weight in tons">Weight ratio</span>}
                  value={cargo.weightRatio !== null ? `${fmtQuantity(cargo.weightRatio)} cbm/t` : EMPTY_CELL}
                />
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "pricing",
      title: "Pricing",
      subtitle: "Buying & selling breakdown with margin",
      cards: true,
      content: (
        // A supplier is taken from the Customer Database only; one that is not there is added (and waits for a manager).
        <NewSupplierFromQuote.Provider value={quoteClosed ? null : ref}>
        <div className="flex flex-col gap-3">
          <div className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5`}>
            <span className={LABEL_TEXT}>Currency</span>
            <Select
              size="small"
              className="w-[84px] shrink-0"
              aria-label="Currency"
              value={totals.currency}
              onChange={(v) => set({ currency: v })}
              options={currencyOptions}
              labelRender={(o) => o.value}
              popupMatchSelectWidth={false}
            />
            <span className="min-w-0 text-xs text-slate-500">The totals and the customer&apos;s document are in this currency. Every line keeps its own.</span>
          </div>
          {showRoad && (
            <QuoteRoadCard
              road={road}
              customerId={draft.customerId}
              pricing={draft.roadPricing}
              problems={roadProblems}
              onChange={(next) => set({ road: next })}
              onPrice={() => setModal("roadPrice")}
            />
          )}
          {waitingUpdates.map((update) => (
            <Alert
              key={update.oldRef}
              type="warning"
              showIcon
              message={update.kind === "road" ? `The road tariff "${update.supplierName}" has a new rate` : `The ${update.supplierName} tariff has a new rate`}
              description={`${tariffUpdateChange(update)} ${update.kind === "road" ? "" : "The old tariff is no longer valid. "}${tariffUpdateSelling(update, fclLayout)} The quote can't be sent until you approve this or pick another tariff.`}
              action={
                <Button size="small" type="primary" loading={approvingRate === update.oldRef} onClick={() => void approveTariffUpdate(update)}>
                  Approve new rate
                </Button>
              }
            />
          ))}
          {otherDirection.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="The Trade Direction changed since these rates were priced"
              description={`${otherDirectionBlock(draft)}. A tariff only prices the Trade Direction it is for (Import, Export or both, as set on Tariffs). The quote can't be sent until then.`}
            />
          )}
          {recheck.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="The cargo weight changed since these rates were priced"
              description="Recheck the buying rates marked in yellow against the new cargo weight: pick the tariff again under Tariffs available, or change the rate."
              action={
                <Button size="small" onClick={() => set({ buyingLines: stampPricedFor(draft.buyingLines ?? [], recheck, draft) })}>
                  Rates still hold
                </Button>
              }
            />
          )}
          {fclView ? (
            <>
              <FclPricingEditor
                lineWarn={toRecheck}
                quote={fclView}
                sheet={exchange.rates}
                live={exchange}
                onChange={set}
                lineTag={buyingTag}
                lineAction={buyingAction}
              />
              <FclTruckingBlock
                buyingLines={buyingLines}
                sellingLines={sellingLines}
                currency={totals.currency}
                amountOf={(line, side) => convertLine(line, draft, exchange.rates, { selling: side === "selling", live: exchange })}
                lineTag={(line, side) => (side === "buying" ? buyingTag(line) : sellingTag(line))}
                onRemove={removeLine}
                notes={truckingNotes}
              />
            </>
          ) : (
            <>
              <CostLinesEditor
                kind="buying"
                title="Buying (cost)"
                lines={draft.buyingLines ?? []}
                quote={draft}
                sheet={exchange.rates}
                live={exchange}
                onChange={(l) => updateLines("buyingLines", l)}
                lineTag={buyingTag}
                lineAction={buyingAction}
                lineWarn={toRecheck}
                lineKeys={buyingKeys}
                onAmountSet={(line, index) => {
                  // Not offered when selling has the line already (a copy made before its amount was set).
                  if (offerToSelling(line, sellingLines)) setToSelling({ line, index });
                }}
                onRemove={(index) => removeLine("buying", index)}
              />
              {sideOverrideNote("buying", buyingLines)}
              <CostLinesEditor
                kind="selling"
                title="Selling (rate)"
                lines={draft.sellingLines ?? []}
                quote={draft}
                sheet={exchange.rates}
                live={exchange}
                onChange={(l) => updateLines("sellingLines", l)}
                lineTag={sellingTag}
                lineKeys={sellingKeys}
                basisOf={(line) => buyingBasis(line, buyingLines)}
                quantityOf={(line) => buyingQuantity(line, buyingLines)}
                onAmountChanged={(line, index, before) => {
                  if (line.pairId === WAREHOUSE_PAIR_ID) setFeeChange({ index, amount: Number(line.amount) || 0, before, currency: line.currency, reason: line.changeReason });
                }}
                onRemove={(index) => removeLine("selling", index)}
                actions={
                  <>
                    {/* Quoting as all-in changes what the customer is shown, so it is asked about first;
                        going back to the breakdown is not. */}
                    {draft.allIn ? (
                      <MiniButton onClick={() => set({ allIn: false })}>Show breakdown</MiniButton>
                    ) : (
                      <MiniButton
                        disabled={sellingLines.length === 0}
                        title={sellingLines.length === 0 ? "No selling lines to quote as all-in" : undefined}
                        onClick={() => setModal("allIn")}
                      >
                        Quote as all-in
                      </MiniButton>
                    )}
                    <MiniButton
                      icon={<CopyOutlined />}
                      disabled={buyingLines.length === 0}
                      title={buyingLines.length === 0 ? "No buying lines to copy" : undefined}
                      onClick={() => (sellingLines.length ? setModal("replaceSelling") : copyBuyingToSelling())}
                    >
                      Copy buying → selling
                    </MiniButton>
                  </>
                }
              />
              {sideOverrideNote("selling", sellingLines)}
              {draft.allIn && (
                <div className="text-[12px] font-semibold text-slate-700">
                  Quoted as all-in: the customer&apos;s quotation shows one price of {fmtMoney(totals.selling, totals.currency)}, without the selling lines.
                </div>
              )}
            </>
          )}
          <QuoteRatesEditor data={draft} exchange={exchange} />
          {/* Rates that could not be read leave lines out just the same, but they are not missing:
              the user gets a Retry. */}
          {totals.missingRates.length > 0 &&
            (exchange.isError ? (
              <ExchangeRatesError exchange={exchange} />
            ) : (
              <Alert
                type="warning"
                showIcon
                message={`ČNB publishes no rate for ${totals.missingRates.join(", ")}`}
                description="Lines in those currencies are left out of the totals below. Price them in a currency ČNB publishes."
              />
            ))}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiTile label="Buying" value={fmtMoney(totals.buying, totals.currency)} />
            <KpiTile label="Selling" value={fmtMoney(totals.selling, totals.currency)} />
            <KpiTile
              label={<span className={isThinProfit(totals) ? KPI_TONE_CLASS.red : undefined}>{totals.margin === null ? "Profit" : `Profit · ${totals.margin}%`}</span>}
              value={fmtMoney(totals.profit, totals.currency)}
              tone={marginTone(totals)}
            />
          </div>
          {/* Shown to everybody the gate applies to: a quote below the floor can't be sent by anyone,
              so the reason is on screen for all (Council Outlay 6), not only where Trucking is on. */}
          {roadMargin && (
            <QuoteMarginPanel
              margin={roadMargin}
              canApprove={quote.permissions.canApproveMargin}
              onApprove={() => setModal("approveMargin")}
              inquiry={marginAsk.inquiry}
              onAsk={quoteClosed ? undefined : () => setModal("askMargin")}
              // The server lets only the one who asked, or a manager, take a question back.
              onWithdraw={
                marginAsk.inquiry && (marginAsk.inquiry.requestedById === user?.id || quote.permissions.canApproveMargin) ? (id) => void withdrawMargin(id) : undefined
              }
            />
          )}
          {/* Which rates the totals use: stored on the quote once sent, today's until then. */}
          <div className="text-[13px] text-slate-500">{fxNote(totals)}</div>
          {liveRatesMissing && (
            <div className="text-[13px] text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
              Today&apos;s ČNB rates have not been imported — prices use an older fixing. Sync them on the Exchange page before sending.
            </div>
          )}
        </div>
        </NewSupplierFromQuote.Provider>
      ),
    },
    {
      key: "terms",
      title: "Shipping terms",
      subtitle: "Rate inclusions, exclusions and validity",
      content: (
        <div>
          <InfoRow label="Template">
            <div className="flex items-center gap-3">
              <Select
                size="small"
                className="flex-1 min-w-0"
                aria-label="Template"
                placeholder="Select a T&C template (needed before Ready to Send)…"
                value={draft.shippingTerms}
                onChange={chooseTemplate}
                options={terms.map((t) => ({ value: t.name, label: t.name }))}
              />
              {/* Where the templates are kept: Sales Settings, for managers and admins. */}
              {canManageSales && (
                <Link href={salesSettingsHref("terms")} className={SMALL_LINK_CLASS}>
                  Templates
                </Link>
              )}
            </div>
          </InfoRow>
          {termsOutdated && (
            <Alert
              type="info"
              showIcon
              className="!mb-3"
              message="The template's texts are not the ones on this quote"
              description="It was changed since they were put on the quote, or they came from an older quote."
              action={
                <Button size="small" onClick={() => chooseTemplate(draft.shippingTerms!)}>
                  {"Use the template's texts"}
                </Button>
              }
            />
          )}
          {/* The template's texts: read here, changed only on the template (Sales Settings → Terms & Conditions). */}
          {(
            [
              ["Rate offer includes", draft.shippingIncludes, 4],
              ["Rate offer excludes", draft.shippingExcludes, 4],
              ["Subject to", draft.shippingSubjectTo, 3],
            ] as const
          ).map(([label, text, rows]) => (
            <InfoRow key={label} label={label}>
              <Input.TextArea
                size="small"
                aria-label={label}
                rows={rows}
                readOnly
                value={text ?? ""}
                placeholder={draft.shippingTerms ? "Nothing in the template" : "Choose a template above"}
                className="!bg-slate-50 !text-slate-700 cursor-default"
              />
            </InfoRow>
          ))}
          {/* The quote's one validity date, as the lifecycle band and the document show it. It decides
              when the quote expires, so the server keeps it: picking or clearing it here changes it at
              once, and on a quote the customer already has that goes into its history. A closed quote
              keeps the validity it was given (the server refuses another): it is locked with the rest
              of the step, and a new date is a revision. */}
          <InfoRow label="Valid until">
            <DatePicker
              size="small"
              className="w-44"
              aria-label="Valid until"
              format={DATE_FORMATS}
              placeholder="Select expiry date"
              value={shownValidity ? dayjs(shownValidity) : null}
              onChange={(date) => {
                const picked = date ? date.format(STORED_DATE) : null;
                if (picked !== shownValidity) changeValidity(picked);
              }}
            />
          </InfoRow>
        </div>
      ),
    },
  ];

  // "Save & continue" saves what is waiting right away, without the pause autosave takes, and
  // shows the next step. It moves on whatever the server answers - a refused save is announced
  // by the hook and stays in the header until one works.
  const saveAndContinue = (to: SectionKey) => {
    // Leaving Pricing with the Overweight surcharge still at 0 asks why first.
    if (activeSection === "pricing" && !quoteClosed && overweightUnexplained(draft)) {
      setOverweightAsk({ to, save: true });
      return;
    }
    // Routing saved without an Origin or Destination its terms need asks whether they stay blank;
    // confirmed, the step is complete without them.
    if (activeSection === "routing" && !quoteClosed && !draft.routingBlank && routingMissing(draft).length > 0) {
      setBlankRoutingTo(to);
      return;
    }
    // A Sea LCL shipment of over 2 t is asked whether any piece is over 2 t: the warehouse charges
    // extra handling for those. Not on a quote whose pricing is closed - its lines stay as sent.
    if (activeSection === "cargo" && !quoteClosed && asksHeavyPieces(draft.serviceType, cargo.grossWeight)) {
      setHeavyPiecesTo(to);
      return;
    }
    // Cargo on an open top or flat rack is confirmed before moving on: its measures decide the
    // equipment and the slots the carrier charges.
    if (activeSection === "cargo" && hasOogEquipment(draft)) {
      setConfirmCargoTo(to);
      return;
    }
    saveNow();
    setActiveSection(to);
  };
  const shownSection = activeSection ?? startSection;
  const shownIndex = Math.max(0, sections.findIndex((s) => s.key === shownSection));
  const shown = sections[shownIndex];
  const nextSection = sections[shownIndex + 1];

  // Around a step's content: on a closed quote why nothing can be changed, and at its foot the
  // step's note and the way on. A step in cards has them above and under its cards.
  const closedAlert = (className?: string) =>
    quoteClosed && (
      <Alert
        className={className}
        type="info"
        showIcon
        message={
          quote.status === "replaced"
            ? "This quote was replaced by its revision: its details and prices stay as they were sent."
            : "This quote is closed: its details and prices are what the customer was given. To change anything, click Revise at the top - the revision is a new quote."
        }
      />
    );
  // Locked as a whole while closed: every control of every step, antd's and plain buttons alike,
  // the validity too.
  const shownContent = shown && (
    <ConfigProvider componentDisabled={quoteClosed}>
      <fieldset disabled={quoteClosed} className="contents">
        {shown.content}
      </fieldset>
    </ConfigProvider>
  );
  const stepFooter = (className?: string) =>
    (shown?.note || nextSection) && (
      <div className={`${className ?? ""} flex flex-wrap items-center justify-between gap-x-3 gap-y-2`}>
        <div className="min-w-0">{shown?.note}</div>
        {nextSection &&
          (quoteClosed ? (
            <ToolbarButton onClick={() => setActiveSection(nextSection.key)}>Continue</ToolbarButton>
          ) : (
            <ToolbarButton onClick={() => saveAndContinue(nextSection.key)}>Save &amp; continue</ToolbarButton>
          ))}
      </div>
    );

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      {/* In the shipment detail's shape: the way back and the actions in the top row, the quote at
          a glance in a card under them. */}
      <div className="bg-white border-b border-slate-200 px-6 pt-3.5 pb-3.5">
        {/* Top row: the way back on the left; the actions, all one height and look, on the right. */}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-h-8 flex items-center">
            <BackLink href={back.href}>{back.label}</BackLink>
          </div>

          <div className="flex flex-col items-end gap-1 max-w-full">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Only when the user asks: a sent quote the server lets be revised (Quoted, Feedback, Expired, Won). */}
              {quote.allowedTransitions.includes("revised") && (
                <ToolbarButton icon={<HistoryOutlined />} onClick={() => setModal("revise")}>
                  Revise
                </ToolbarButton>
              )}
              {/* Books a shipment from the quote: the first one, or another beside those booked. A
                  shipment is made from an open, expired or Won quote, and makes it Won; not from a
                  Lost or Replaced one - said by the status the pill shows. */}
              <Tooltip title={createShipmentHint(quote.effectiveStatus)}>
                <span>
                  <ToolbarButton icon={<PlusOutlined />} onClick={() => createShipment(!!quote.shipmentId)} disabled={!!shipmentFromQuoteBlockedText(quote.effectiveStatus)}>
                    Create New Shipment
                  </ToolbarButton>
                </span>
              </Tooltip>
              {/* The shipments booked under this quote (their Sales Number names it): the first one by
                  its number, several by their count; a click lists them. */}
              {quote.shipmentId && (
                <ToolbarButton icon={<ContainerOutlined />} onClick={() => setModal("shipments")}>
                  {quoteShipments && quoteShipments.length > 1 ? `Shipments (${quoteShipments.length})` : `Shipment ${quote.shipmentJobNumber ?? ""}`.trim()}
                </ToolbarButton>
              )}
              <span aria-hidden className="w-px h-6 bg-slate-200" />
              {/* The chat and the preview open over the page, so they are icons, as Notes and
                  Attachments are on a shipment; the chat keeps its count of unread messages. */}
              <Badge count={chatUnread} size="small" offset={[-4, 2]}>
                <Tooltip title="Chat">
                  <button
                    type="button"
                    onClick={() => setChatOpen(true)}
                    aria-label={chatUnread ? `Chat — ${chatUnread} unread` : "Chat"}
                    className={toolbarButtonClass("secondary", "square")}
                  >
                    <MessageOutlined />
                  </button>
                </Tooltip>
              </Badge>
              <Tooltip title="Preview">
                <button type="button" onClick={() => setModal("preview")} aria-label="Preview" className={toolbarButtonClass("secondary", "square")}>
                  <EyeOutlined />
                </button>
              </Tooltip>
              <Tooltip title={emailBlocked}>
                <span>
                  <ToolbarButton icon={<MailOutlined />} onClick={openEmail}>
                    Email
                  </ToolbarButton>
                </span>
              </Tooltip>
              <ToolbarButton variant="primary" icon={<FilePdfOutlined />} onClick={exportPdf}>
                Export PDF
              </ToolbarButton>
              {/* Last in the row, as on every record page: Duplicate, Import data and Delete quote. */}
              <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: actionItems }}>
                <button type="button" className={toolbarButtonClass()}>
                  Actions <DownOutlined className="text-[10px]" />
                </button>
              </Dropdown>
            </div>
            {saveLabel && <div className="text-xs text-right text-red-600">{saveLabel}</div>}
          </div>
        </div>

        {/* The quote at a glance; its reference is the page's title. */}
        <div className={`${CARD} mt-3 px-5 pt-3 pb-2.5`}>
          <QuoteFacts
            quoteNumber={ref}
            status={quote.effectiveStatus}
            customer={customerFact}
            direction={draft.direction}
            serviceType={draft.serviceType}
            incoterm={draft.incoterm}
            pol={draft.pol}
            pod={draft.pod}
            validUntil={quote.validUntil}
            owner={<OwnerFact quote={quote} changing={changingOwner} onChange={changeOwner} />}
          />
        </div>

        {save.problem && (
          <div className="mt-3">
            <SaveProblemBanner problem={save.problem} onRetry={handleSave} onLoadLatest={() => reload({ keepChanges: true })} />
          </div>
        )}
        {pending && !save.problem && (
          <div className="mt-3">
            <Alert
              type="warning"
              showIcon
              message="The latest version is loaded - your earlier changes are kept aside"
              description={`Changed fields: ${Object.keys(pending).join(", ")}. Re-apply them on top of this version, or discard them.`}
              action={
                <span className="flex gap-2">
                  <Button size="small" type="primary" onClick={reapply}>
                    Re-apply my changes
                  </Button>
                  <Button size="small" onClick={dismissPending}>
                    Discard
                  </Button>
                </span>
              }
            />
          </div>
        )}

        {/* Without this the page would look like that of a quote without variants. */}
        {variants.isError && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-red-600">
            The other variants of this quote could not be loaded.
            <Button size="small" onClick={() => variants.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* The variants of one enquiry, each named by its reference and what it offers. The way
            back stays the same while switching between them. */}
        {family.length > 1 && (
          <div role="group" aria-label="Variants of this quote" className="mt-3">
            <PillTabs
              tabs={family.map((q) => ({
                key: q.quoteNumber,
                label: [q.quoteNumber, [q.data.serviceType, q.data.direction].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
              }))}
              active={ref}
              onChange={(quoteNumber) => {
                if (quoteNumber !== ref) router.push(hrefOf(quoteNumber));
              }}
            />
          </div>
        )}
      </div>

      {/* ── Lifecycle ── */}
      <LifecycleBar
        quote={quote}
        sendBlocked={sendBlocked}
        onChange={changeStatus}
        hrefOf={hrefOf}
        price={<QuotePriceTile totals={totals} profitTone={marginTone(totals)} labelTone={isThinProfit(totals) ? "red" : undefined} />}
      />

      {/* ── Form and summary ── */}
      <div className="p-6 flex flex-col gap-3">
        <QuoteStepTiles
          steps={sections.map((s) => ({ key: s.key, title: s.title, status: sectionStatus(s.key) }))}
          active={shownSection}
          onSelect={(key) => {
            // Another step from Pricing, with the Overweight surcharge still at 0: why is asked first.
            if (shownSection === "pricing" && key !== "pricing" && !quoteClosed && overweightUnexplained(draft)) return setOverweightAsk({ to: key as SectionKey });
            setActiveSection(key as SectionKey);
          }}
        />

        <div className="min-w-0">
          <div className="flex flex-col gap-3 min-w-0">
            {shown &&
              (shown.cards ? (
                <div key={shown.key} className="flex flex-col gap-3 min-w-0">
                  {closedAlert()}
                  {shownContent}
                  {stepFooter()}
                </div>
              ) : (
                <QuoteSection key={shown.key} title={shown.title} subtitle={shown.subtitle}>
                  {closedAlert("!mb-3")}
                  {shownContent}
                  {stepFooter("mt-3")}
                </QuoteSection>
              ))}
          </div>
        </div>
      </div>

      <QuoteChatDrawer quoteNumber={chatOpen ? ref : null} onClose={() => setChatOpen(false)} />

      <QuoteHeavyPiecesDialogs
        open={heavyPiecesTo !== null}
        grossWeight={cargo.grossWeight}
        initial={draft.heavyPieces}
        inquiry={draft.warehouseInquiry}
        onInquire={inquireWarehouse}
        onCancel={() => setHeavyPiecesTo(null)}
        onSave={(heavy) => {
          const to = heavyPiecesTo;
          setHeavyPiecesTo(null);
          set(withHeavyPieces(draft, heavy));
          saveNow();
          if (to) setActiveSection(to);
        }}
      />

      <OverweightReasonDialog
        asking={overweightAsk && { removing: overweightAsk.removing !== undefined, ratio: cargo.weightRatio }}
        onConfirm={(reason) => {
          const ask = overweightAsk!;
          setOverweightAsk(null);
          if (ask.removing !== undefined) return applyRemovals([{ side: "selling", index: ask.removing }], { overweightReason: reason });
          set({ overweightReason: reason });
          if (ask.save) saveNow();
          if (ask.to) setActiveSection(ask.to);
        }}
        onCancel={() => setOverweightAsk(null)}
      />

      <HeavyFeeReasonDialog
        change={feeChange}
        onConfirm={(reason) => {
          const { index: at, removing: side } = feeChange!;
          setFeeChange(null);
          if (side) {
            const removals = (["buying", "selling"] as const).flatMap((s) => linesOf(s).flatMap((l, j) => (l.pairId === WAREHOUSE_PAIR_ID ? [{ side: s, index: j }] : [])));
            // The reason is kept, so opening the quote does not put the fee back for this answer.
            applyRemovals(removals, draft.warehouseInquiry ? { heavyFeeRemoved: { inquiryId: draft.warehouseInquiry.id, reason } } : {});
            return;
          }
          updateLines("sellingLines", sellingLines.map((l, j) => (j === at ? { ...l, changeReason: reason } : l)));
        }}
        onCancel={() => {
          const { index: at, before, removing: side } = feeChange!;
          setFeeChange(null);
          if (!side) updateLines("sellingLines", sellingLines.map((l, j) => (j === at ? { ...l, amount: before } : l)));
        }}
      />

      <ConfirmModal
        open={blankRoutingTo !== null}
        onClose={() => setBlankRoutingTo(null)}
        onConfirm={() => {
          const to = blankRoutingTo;
          setBlankRoutingTo(null);
          set({ routingBlank: true });
          saveNow();
          if (to) setActiveSection(to);
        }}
        title={blankRoutingTitle(draft)}
        description="Keep it blank and the Routing step counts as complete. You can still fill it in later."
        confirmLabel="Keep blank"
        cancelLabel="Fill in"
      />

      <ConfirmModal
        open={confirmCargoTo !== null}
        title="Are the cargo details correct?"
        description={`${oogSummary(draft)}. Please confirm the cargo details are correct to proceed.`}
        confirmLabel="Confirm and continue"
        cancelLabel="Check again"
        onClose={() => setConfirmCargoTo(null)}
        onConfirm={() => {
          const to = confirmCargoTo;
          setConfirmCargoTo(null);
          saveNow();
          if (to) setActiveSection(to);
        }}
      />

      {/* On a closed quote an import fills in everything but the prices: the server keeps those as stored. */}
      <ImportInquiryModal open={modal === "import"} onClose={() => setModal(null)} onApply={set} />
      <CopyFromModal open={modal === "copyQuote"} mode="quote" currentRef={ref} onClose={() => setModal(null)} onApply={set} />
      <CopyFromModal open={modal === "copyShipment"} mode="shipment" currentRef={ref} onClose={() => setModal(null)} onApply={set} />
      <DuplicateWizardModal
        open={modal === "duplicate"}
        baseRef={ref}
        data={draft}
        onClose={() => setModal(null)}
        onDone={(r) => {
          setModal(null);
          router.push(hrefOf(r));
        }}
      />
      <PdfPreviewModal open={modal === "preview"} quoteNumber={ref} data={draft} family={family} onExport={exportPdf} onClose={() => setModal(null)} />
      <EmailQuoteModal
        open={modal === "email"}
        quoteNumber={ref}
        data={draft}
        validUntil={quote.validUntil}
        allowedTransitions={quote.allowedTransitions}
        sendBlocked={emailBlocked}
        onExportPdf={exportPdf}
        onMarkSent={markSent}
        onClose={() => setModal(null)}
      />
      {truckingOn && (
        <QuoteRoadPriceDrawer
          open={modal === "roadPrice"}
          road={road}
          customerId={draft.customerId ?? null}
          previousLevel={draft.roadPricing?.serviceLevel ?? null}
          onConfirm={priceRoad}
          onClose={() => setModal(null)}
        />
      )}
      <RailTariffsDrawer
        open={railLine !== null}
        quote={draft}
        quoteCurrency={totals.currency}
        toQuoteCurrency={toQuoteCurrency}
        onPick={pickRailOffer}
        onClose={() => setRailLine(null)}
      />
      <CollectionTariffsDrawer
        open={collectionLine !== null}
        quote={draft}
        hubs={collectionHubs}
        quoteCurrency={totals.currency}
        toQuoteCurrency={toQuoteCurrency}
        onPick={pickCollectionOffer}
        onClose={() => setCollectionLine(null)}
      />
      <OceanTariffsDrawer
        open={oceanLine !== null}
        quote={draft}
        quoteCurrency={totals.currency}
        toQuoteCurrency={toQuoteCurrency}
        onPick={pickOceanOffer}
        onClose={() => setOceanLine(null)}
      />
      {modal === "askMargin" && roadMargin && <AskMarginApprovalDialog quoteNumber={ref} margin={roadMargin} onAsk={askMargin} onClose={() => setModal(null)} />}
      {modal === "approveMargin" && roadMargin && (
        <QuoteMarginApproveDialog quoteNumber={ref} margin={roadMargin} onApprove={approveMargin} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && <DeleteQuoteModal quoteNumber={ref} onDelete={deleteThisQuote} onClose={() => setModal(null)} />}
      {toSelling && (
        <AddToSellingDialog
          line={toSelling.line}
          onClose={() => setToSelling(null)}
          onAdd={(line) => {
            // The two lines share a pairId, so removing one later offers to remove the other.
            const pairId = buyingLines[toSelling.index]?.pairId ?? newPairId();
            set({
              buyingLines: buyingLines.map((l, j) => (j === toSelling.index ? { ...l, pairId } : l)),
              sellingLines: [...sellingLines, { ...line, pairId }],
            });
            setToSelling(null);
          }}
        />
      )}
      {removing && (
        <RemoveBothDialog
          side={removing.side}
          line={(removing.side === "buying" ? buyingLines : sellingLines)[removing.index]!}
          counterpart={(removing.side === "buying" ? sellingLines : buyingLines)[removing.other]!}
          onBoth={() => finishRemoving(true)}
          onOnly={() => finishRemoving(false)}
          onClose={() => setRemoving(null)}
        />
      )}
      {modal === "replaceSelling" && (
        <ConfirmModal
          open
          onClose={() => setModal(null)}
          onConfirm={() => {
            copyBuyingToSelling();
            setModal(null);
          }}
          title="Copy buying → selling"
          description={`Replace the ${sellingLines.length} selling ${sellingLines.length === 1 ? "line" : "lines"} with copies of the buying lines?`}
          confirmLabel="Replace"
          danger
        />
      )}
      {modal === "shipments" && (
        <QuoteShipmentsDialog quoteNumber={ref} shipments={quoteShipments} onClose={() => setModal(null)} />
      )}
      {modal === "revise" && (
        <ConfirmModal
          open
          onClose={() => setModal(null)}
          onConfirm={async () => {
            setRevising(true);
            const refused = await reviseQuote();
            setRevising(false);
            if (refused) toast.error(`${ref} - ${refused}`);
            setModal(null);
          }}
          loading={revising}
          title="Revise as a new quote"
          description={
            quote.status === "won"
              ? `${ref} stays as it was sent and becomes Replaced. Its revision - a new quote with the same content and the next free revision number of ${revisionRoot(ref)} (-R1, -R2, ...) - stays Won, takes over its shipments (their Sales Reference moves to it) and opens with its Valid until and prices open to change. Revise it?`
              : `${ref} stays as it was sent and becomes Replaced. Its revision - a new quote with the same content and the next free revision number of ${revisionRoot(ref)} (-R1, -R2, ...) - opens, ready for new prices. Revise it?`
          }
          confirmLabel="Revise"
        />
      )}
      {modal === "closeQuote" && (
        <ExportCloseDialog quoteNumber={ref} validUntil={quote.validUntil} onConfirm={exportAndClose} onClose={() => setModal(null)} />
      )}
      {modal === "allIn" && (
        <ConfirmModal
          open
          onClose={() => setModal(null)}
          onConfirm={() => {
            set({ allIn: true });
            setModal(null);
          }}
          title="Quote as all-in"
          description={`Do you intend to quote this as an all-in rate? The customer's quotation will show one price of ${fmtMoney(totals.selling, totals.currency)}, without the selling lines. The lines stay here.`}
          confirmLabel="Quote as all-in"
        />
      )}
    </div>
  );
}

interface CustomerSelectProps {
  linked: { id: string; name: string } | null;
  unlinkedName?: string;
  onPick: (customer: CustomerItem) => void;
  onClear: () => void;
}

// The Customer box of a quote. It picks one customer out of the whole Customer Database: the
// server looks for what is typed - in the name, ICO, DIC and city - so no list is downloaded
// before anything is typed and no customer is out of reach, however many there are. The box
// shows the linked customer by `linked.name`; a name the quote carries without a link is not a
// value of the box and stands in it as the hint - behind the words that say so, because the box
// cuts a hint at its end and a name of ordinary length would push them out of it.
function CustomerSelect({
  linked,
  unlinkedName,
  onPick,
  onClear,
}: CustomerSelectProps) {
  const [typed, setTyped] = useState("");
  const wanted = typed.trim();
  // The request waits until typing pauses.
  const search = useDebounced(wanted, 300);
  const searching = wanted.length >= MIN_CUSTOMER_SEARCH && search.length >= MIN_CUSTOMER_SEARCH;
  // Only companies with the customer role: a supplier only (a haulier, a shipping line) is not quoted to.
  const { customers, isFetching, isError } = useCustomers({ search, role: "customer" }, { enabled: searching });
  // Only the answer to what is typed is listed. Until it is here the hook still holds what it
  // had last - an earlier search, or before the first one the whole Customer Database, left
  // behind by the Customers page - and a customer picked from that need not be one that was
  // looked for.
  const answered = searching && search === wanted && !isFetching;
  const found = answered ? customers.slice(0, CUSTOMER_LIMIT) : [];

  let emptyText = "No customers match (a supplier shows here once it has the Customer role)";
  if (wanted.length < MIN_CUSTOMER_SEARCH) emptyText = `Type at least ${MIN_CUSTOMER_SEARCH} letters to search the Customer Database`;
  else if (!answered) emptyText = "Searching…";
  else if (isError) emptyText = "The Customer Database could not be searched";

  return (
    <Select
      showSearch
      allowClear
      labelInValue
      size="small"
      className="w-full"
      aria-label="Customer"
      placeholder={unlinkedName ? `Not linked · ${unlinkedName}` : "Search customer database…"}
      // The server has already searched; filtering again here would hide what it found by DIC.
      filterOption={false}
      onSearch={setTyped}
      // The box empties itself when the list closes; the search has to go with it, or the list
      // would open again on what was typed last time.
      onOpenChange={(open) => !open && setTyped("")}
      loading={searching && isFetching}
      value={linked ? { value: linked.id, label: linked.name } : undefined}
      onChange={(picked?: { value: string; label: ReactNode }) => {
        const customer = found.find((c) => c.id === picked?.value);
        if (customer) onPick(customer);
      }}
      onClear={onClear}
      // In the list a customer is told apart by its ICO and city; the box itself shows the name.
      optionLabelProp="name"
      options={found.map((c) => ({
        value: c.id,
        name: c.companyName,
        label: [c.companyName, c.ico && `ICO ${c.ico}`, c.city].filter(Boolean).join(" · "),
      }))}
      notFoundContent={emptyText}
      popupRender={(menu) => (
        <>
          {menu}
          {answered && customers.length > found.length && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
              Showing {found.length} of {customers.length.toLocaleString("en-US")} matches - type more to narrow them down.
            </div>
          )}
        </>
      )}
    />
  );
}

// Signing in again happens in a new tab: that is a fresh page load, which starts a new session,
// while this page - and whatever was typed into it - stays as it is.
function SignInLink() {
  return (
    <Link href="/login" target="_blank" className={LINK_CLASS}>
      Sign in
    </Link>
  );
}

// Shown for as long as the server has not accepted the changes on screen. "Load latest version"
// keeps the user's changes aside, to re-apply on top of the latest version.
interface SaveProblemBannerProps {
  problem: QuoteProblem;
  onRetry: () => void;
  onLoadLatest: () => void;
}

function SaveProblemBanner({ problem, onRetry, onLoadLatest }: SaveProblemBannerProps) {
  const retry = (
    <Button size="small" onClick={onRetry}>
      Retry
    </Button>
  );
  if (problem.kind === "conflict") {
    return (
      <Alert
        type="error"
        showIcon
        message="This quote was changed by someone else or in another tab"
        description="Your changes on this page were not saved, and nothing more is saved from here. Load the latest version: your changes are kept aside and you can re-apply them on top of it."
        action={
          <Button size="small" danger onClick={onLoadLatest}>
            Load latest version
          </Button>
        }
      />
    );
  }
  if (problem.kind === "signedOut") {
    return (
      <Alert
        type="error"
        showIcon
        message="You are signed out"
        description={
          <>
            Your changes are still on this page but they are not saved. <SignInLink /> again (opens in a new tab), then press Retry here.
          </>
        }
        action={retry}
      />
    );
  }
  return (
    <Alert
      type="error"
      showIcon
      message={`Not saved - ${problem.reason}`}
      description="Your changes are still on this page. They are sent again with your next change, or press Retry."
      action={retry}
    />
  );
}

interface SupplierTariffTagProps {
  line: CostLine;
  /** "Rail tariff", "Collection tariff", "Ocean tariff" */
  label: string;
  /** The tariff version the line was priced from */
  versionId: string | null;
  versionHref: (customerId: string, versionId: string) => string;
}

// The mark of a buying line priced from a supplier's tariff on Tariffs (rail, collections, ocean);
// it opens the tariff version the line came from, in a new tab.
function SupplierTariffTag({ line, label, versionId, versionHref }: SupplierTariffTagProps) {
  if (!versionId || !line.supplierCustomerId) return <Pill tone="slate">{label}</Pill>;
  return (
    <a href={versionHref(line.supplierCustomerId, versionId)} target="_blank" rel="noreferrer" title={`Open the ${label.toLowerCase()} this line was priced from`}>
      <Pill tone="slate" className="hover:bg-slate-200">
        {label} ↗
      </Pill>
    </a>
  );
}

// The marks of a cost line priced from a tariff: its version, and "Override" once it was changed by hand.
function TariffTag({ tag }: { tag: LineTariffTag }) {
  return (
    <>
      <Pill tone="slate">{tag.label}</Pill>
      {tag.override && (
        <Pill tone="amber" title="Changed by hand since it was priced from the tariff">
          Override
        </Pill>
      )}
    </>
  );
}

// The margin under which a profit is too thin: its label says so in red.
const THIN_MARGIN = 5;

// A profit, but a thin one: the figure is no loss, so it stays black and its label is red.
const isThinProfit = ({ profit, margin }: QuoteTotals) => profit > 0 && margin !== null && margin < THIN_MARGIN;

// The colour of the profit: by the margin when there is selling to relate it to, otherwise only a
// loss stands out.
function marginTone(totals: QuoteTotals): KpiTone | undefined {
  const { profit, margin } = totals;
  if (margin === null) return profit < 0 ? "red" : undefined;
  if (isThinProfit(totals)) return undefined;
  return margin >= 15 ? "green" : margin >= THIN_MARGIN ? "amber" : "red";
}

// The KG / CONTAINER field by where the cargo weight stands: no colour within the standard limit,
// amber when it needs a heavy-tested box (or the shipping line's confirmation), red when too heavy.
const WEIGHT_FIELD_CLASS: Record<WeightCheck["level"], string> = {
  standard: "",
  heavyTested: "!bg-amber-100 !border-amber-400",
  confirm: "!bg-amber-100 !border-amber-400",
  tooHeavy: "!bg-red-100 !border-red-400",
};

// Beside a container line: the type's weight limits, and what the cargo weight on it needs.
function ContainerWeightNote({ check }: { check: WeightCheck }) {
  const kg = (n: number) => `${n.toLocaleString("en-US")} kg`;
  return (
    <div className="text-[12px] leading-4 text-slate-500">
      Standard up to {kg(check.standard)} · {check.heavyTested ? "Heavy tested up to" : "Max"} {kg(check.max)}
      {check.level === "heavyTested" && <span className="block text-amber-700">Heavy-tested box needed</span>}
      {check.level === "confirm" && (
        <span className="block text-amber-700">
          {check.heavyTested && "Heavy-tested box needed. "}
          <strong>You need to have it confirmed by shipping line</strong>
        </span>
      )}
      {check.level === "tooHeavy" && <span className="block font-semibold text-red-600">Too heavy for this box</span>}
    </div>
  );
}
