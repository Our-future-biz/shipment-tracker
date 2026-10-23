"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Checkbox, ConfigProvider, DatePicker, Dropdown, Input, InputNumber, Select, Spin, Tooltip } from "antd";
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
  MoreOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { InfoRow } from "@/components/InfoRow";
import { KpiTile, type KpiTone } from "@/components/KpiTile";
import { Pill } from "@/components/Pill";
import { LINK_CLASS } from "@/components/linkClass";
import { PillTabs } from "@/components/SectionCard";
import { useQuoteFamily } from "@/hooks/useQuoteFamily";
import { useSalesQuoteDraft } from "@/hooks/useSalesQuoteDraft";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useCompanyDetails } from "@/hooks/useSalesPrefs";
import { useCustomer, useCustomers, type CustomerItem } from "@/hooks/useCustomers";
import { useDebounced } from "@/hooks/useDebounced";
import { useTermsConditions } from "@/hooks/useTermsConditions";
import { api } from "@/lib/api";
import { businessToday } from "@/lib/date";
import { fmtMoney, moneyInputParser } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { CustomerAccountTypeBadge } from "@/app/customers/_components/CustomerAccountTypeBadge";
import { GeoFlag, GeoSelect } from "@/components/GeoSelect";
import type { SalesQuoteData, PackageLine, QuoteContainerLine, CostLine } from "../../_lib/types";
import type { QuoteProblem } from "../../_lib/quoteProblem";
import { INCOTERMS, SERVICE_TYPES, DIRECTIONS, PACKING_TYPES } from "../../_lib/types";
import { notWonQuoteText } from "../../_lib/shipmentLink";
import { CURRENCIES } from "@/lib/enums";
import { CONTAINER_KINDS, CONTAINER_KINDS_BY_SIZE, CONTAINER_SIZES, teuForType } from "@/lib/cargo";
import { useListKeys } from "@/hooks/useListKeys";
import { asData, cargoReadyDay, computeTotals, computeCargo, documentBlock, fxNote, hasReefer, isContainerQuote, reeferMissing, revisionRoot, stripProtected, withoutPricing, type QuoteTotals } from "../../_lib/salesQuote";
import { PRINT_WINDOW_BLOCKED, exportClosesQuote } from "../../_lib/exportClose";
import { ExportCloseDialog } from "../../_components/ExportCloseDialog";
import { NO_CUSTOMER, changesCustomer, customerLinkFields, withCustomerUnit } from "../../_lib/quoteCustomer";
import { useQuoteCustomerFields } from "@/hooks/useQuoteCustomerFields";
import { useQuoteListHref } from "../../_lib/quoteListHref";
import { useQuoteOrigin } from "../../_lib/useQuoteOrigin";
import { printQuote } from "../../_lib/printQuote";
import { transitionRequest, type StatusChange } from "../../_lib/statusChange";
import { salesSettingsHref } from "../../_lib/tabs";
import { isRoadQuote, lineTariffTag, roadInputDefaults, roadInputProblems, sendBlockedText, sideOverridden, type LineTariffTag, type RatePick } from "../../_lib/roadQuote";
import { formatAmount as formatMoney } from "@/lib/money";
import { CustomerLink } from "../../_components/CustomerLink";
import { DeleteQuoteModal } from "../../_components/DeleteQuoteModal";
import { ExchangeRatesError } from "../../_components/ExchangeRatesError";
import { QuoteRoute } from "../../_components/QuoteRoute";
import { QuoteStatusPill } from "../../_components/QuoteStatusPill";
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
import { counterpartIndex, lineRemovals, newPairId, offerToSelling, pairedCopies, type LineRemoval, type LineSide } from "../../_lib/costPairs";
import { CostLinesEditor } from "./_components/CostLinesEditor";
import { QuoteRatesEditor } from "./_components/QuoteRatesEditor";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineBlockEmpty, LineTable } from "./_components/LineBlock";
import { MiniButton, RemoveLineButton } from "./_components/QuoteButtons";
import { QuoteReeferBlock } from "./_components/QuoteReeferBlock";
import { QuoteOogBlock } from "./_components/QuoteOogBlock";
import { hasOogEquipment, oogMissing, oogSummary, oogTypes } from "../../_lib/oog";
import { checkContainerWeight, type WeightCheck } from "../../_lib/containerWeight";
import { QuoteSection, QuoteStepTiles, type SectionStatus } from "./_components/QuoteSection";
import { QuoteRoadCard } from "./_components/QuoteRoadCard";
import { QuoteRoadPriceDrawer } from "./_components/QuoteRoadPriceDrawer";
import { QuoteMarginPanel } from "./_components/QuoteMarginPanel";
import { QuoteMarginApproveDialog } from "./_components/QuoteMarginApproveDialog";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";

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

// The label of a field that stands in a line of its own rather than in a label / value row.
const FIELD_LABEL_CLASS = "shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide";

// A small link out of the form, as on the customer page's cards.
const SMALL_LINK_CLASS = `shrink-0 text-xs font-semibold whitespace-nowrap ${LINK_CLASS}`;

export function QuoteWorkflow() {
  const canSeeConcepts = useCanSeeConcepts();
  const truckingOn = canSeeConcepts;
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const toast = useToast();
  // Loading, autosave and everything about not losing or overwriting data live in the hook.
  // `draft` is the document being edited; `quote` is the quote as the server last returned it,
  // with everything the server owns - status, validity, owner - and what may be done with them.
  const { draft, quote, change, act, load, reload, discard, save, saveNow, pending, reapply, dismissPending } = useSalesQuoteDraft(ref);
  const { deleteQuote } = useSalesQuotes();
  const exchange = useCurrentExchangeRates();
  const company = useCompanyDetails();
  // Only the variants of this quote are asked for - the page never loads the list of all quotes.
  const variants = useQuoteFamily(ref);
  // The Quotes list as it was left: with its search, filters, sort and page.
  const listHref = useQuoteListHref();
  // Where the quote was opened from: what the back link is called and leads to, and the address
  // of another quote opened from here, which keeps that way back.
  const { back, hrefOf } = useQuoteOrigin();
  // The one customer the quote is linked to, as the Customer Database has it now. The page never
  // loads the list of all customers: the Customer box asks the server for what is typed.
  const linkedCustomer = useCustomer(draft.customerId ?? null);
  const { terms } = useTermsConditions();

  // The step "Save & continue" goes to once the out-of-gauge cargo is confirmed, while that is asked.
  const [confirmCargoTo, setConfirmCargoTo] = useState<SectionKey | null>(null);
  const [modal, setModal] = useState<
    null | "import" | "copyQuote" | "copyShipment" | "duplicate" | "preview" | "email" | "delete" | "replaceSelling" | "allIn" | "closeQuote" | "revise" | "roadPrice" | "approveMargin"
  >(null);
  // The template chosen under Shipping terms while the user is asked whether its text may replace
  // what the quote says; null when no question is open.
  const [templateAsked, setTemplateAsked] = useState<string | null>(null);
  // A buying line that just got its amount (and its place), offered to selling as well with a markup.
  const [toSelling, setToSelling] = useState<{ line: CostLine; index: number } | null>(null);
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
  const set = (patch: Partial<SalesQuoteData>) => {
    const editable = stripProtected(patch);
    if (changesCustomer(draft, editable)) pickedCustomer.current = null;
    const own = withCustomerUnit(draft, editable);
    if (!Object.keys(own).length) return;
    // Rates are not copied onto the quote here: a draft is priced at today's ČNB fixing and the
    // server stores the rates when the quote is sent.
    change(own);
  };

  // A customer picked in the Customer box: the link at once, with the contact fields emptied in
  // that same change, so the previous customer's person never stands under the new name. The
  // customer's main contact follows once its contacts are read - unless another customer was
  // picked or brought in meanwhile, or the customer was taken off: a late answer must not land
  // on a later choice.
  const pickCustomer = async (customer: CustomerItem) => {
    set({ ...NO_CUSTOMER, ...customerLinkFields(customer) });
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
  const priceRoad = async (pick: RatePick) => {
    const road = draft.road ?? roadInputDefaults(draft);
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

  // A manager accepts the margin below the floor; the approval is the server's, like the status.
  const approveMargin = (reason: string) =>
    act((expectedDataVersion) => api.quotes.salesQuoteMarginApprove(ref, { reason, expectedDataVersion }), { versioned: true });

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

  // New Shipment opens for this quote. What was typed is saved first: the shipment is made from
  // the quote as it is stored, and a save that is refused - the hook says why - stops here.
  const createShipment = async () => {
    const result = await saveNow();
    if (!result.problem) router.push(`/shipments?fromQuote=${encodeURIComponent(ref)}`);
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
  // A quote that went out (or is decided) has its buying and selling closed: the server keeps
  // them as stored, and the page shows them locked. New prices are a revision of the quote.
  const pricingClosed = !!quote && !exportClosesQuote(quote.status);
  const printNow = () => {
    const blocked = printQuote(ref, draft, exchange, company);
    if (blocked) toast.error(blocked);
  };
  // Export PDF closes a quote that has not gone out yet: it is sent as it stands (Quoted), which
  // the user confirms first - unless the margin floor stops the sending, which is said instead.
  // A closed quote is printed again as it is.
  const exportPdf = () => {
    if (pricingClosed) printNow();
    else if (documentBlocked) toast.error(documentBlocked);
    else if (sendBlocked) toast.error(sendBlocked);
    else setModal("closeQuote");
  };
  // The print window is opened on the click itself - after the server's answer the browser would
  // take it for a pop-up - and gets the quote as the server stored it when it was sent. A window
  // that does not open closes nothing: the user allows pop-ups and tries again.
  const exportAndClose = async (validityDays?: number) => {
    const target = window.open("", "_blank");
    if (!target) {
      toast.error(PRINT_WINDOW_BLOCKED);
      return;
    }
    let sent: SalesQuoteData | null = null;
    const refused = await act(async (expectedDataVersion) => {
      const answer = await api.quotes.salesQuoteTransition(ref, { ...transitionRequest({ status: "quoted", validityDays }), expectedDataVersion });
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
    const blocked = printQuote(ref, sent ?? draft, exchange, company, target);
    if (blocked) toast.error(blocked);
  };
  const openEmail = () => {
    if (documentBlocked) toast.error(documentBlocked);
    else setModal("email");
  };
  // The user's word that the quotation went out. Resolves like changeStatus: a refusal is shown
  // by the email dialog, which stays open for it.
  // Revise: the server makes the revision, a new quote QCZ…-R1 with this one's content, and this
  // quote becomes Replaced. The page then goes to the revision, where prices can be changed.
  const reviseQuote = async () => {
    let revision: string | null = null;
    const refused = await act(async (expectedDataVersion) => {
      const answer = await api.quotes.salesQuoteRevise(ref, { expectedDataVersion });
      revision = answer.revision.quoteNumber;
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
    shipment: !!(draft.direction && draft.serviceType && draft.incoterm),
    routing: !!(draft.origin && draft.destination),
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

  // The owner is not counted: it is the server's, and its picker stands in the lifecycle band.
  const partial: Record<SectionKey, boolean> = {
    customer: !!(draft.customerName || draft.customerContact || draft.customerEmail || draft.customerPhone),
    shipment: !!(draft.direction || draft.serviceType || draft.incoterm || readyDate),
    routing: !!(draft.origin || draft.destination || draft.pol || draft.pod || draft.pickup || draft.delivery),
    cargo: !!(draft.commodity || packages.length || containers.length || draft.stackable || draft.dangerous),
    pricing: !!(draft.buyingLines?.length || draft.sellingLines?.length),
    terms: !!(draft.shippingTerms || draft.shippingIncludes || draft.shippingExcludes),
  };
  const sectionStatus = (key: SectionKey): SectionStatus => (done[key] ? "completed" : partial[key] ? "in-progress" : "empty");

  const shownValidity = pendingValidity === undefined ? quote.validUntil : pendingValidity;
  // The server refuses another validity for a quote that is decided, whoever asks.
  const decided = quote.status === "won" || quote.status === "lost";

  const airFreight = draft.serviceType === "Air";

  // Road transport: the card shows on a Road quote and on any quote with lines priced from a tariff.
  // Road pricing from the trucking tariffs only while the company has the Trucking Concept.
  const showRoad = truckingOn && isRoadQuote(draft);
  const road = draft.road ?? roadInputDefaults(draft);
  const roadProblems = roadInputProblems(road, businessToday());
  const roadMargin = quote.roadMargin ?? null;
  // Why the quote may not be sent or marked Ready to send: its margin waits for a manager.
  const sendBlocked = sendBlockedText(roadMargin);
  // "Tariff vN" on a line priced from a tariff, and "Override" when it was changed by hand since.
  const buyingTag = (line: CostLine) => {
    const tag = lineTariffTag(line, draft.roadPricing, "buying");
    return tag && <TariffTag tag={tag} />;
  };
  const sellingTag = (line: CostLine) => {
    const tag = lineTariffTag(line, draft.roadPricing, "selling");
    return tag && <TariffTag tag={tag} />;
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
  // Each copy shares a pairId with its buying line, so removing one can offer to remove the other.
  const copyBuyingToSelling = () => {
    const { buying, selling } = pairedCopies(buyingLines);
    set({ buyingLines: buying, sellingLines: selling });
  };

  const linesOf = (side: LineSide) => (side === "buying" ? buyingLines : sellingLines);
  const keysOf = (side: LineSide) => (side === "buying" ? buyingKeys : sellingKeys);
  // The lines without those removed, as one change (two would each start from the same draft and
  // the second undo the first); each removed row's key goes with it, so the rows after keep theirs.
  const applyRemovals = (removals: LineRemoval[]) => {
    const patch: Partial<SalesQuoteData> = {};
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
    const other = counterpartIndex(linesOf(side)[index]!, linesOf(side === "buying" ? "selling" : "buying"));
    if (other >= 0) return setRemoving({ side, index, other });
    applyRemovals(lineRemovals(side, index, other, false));
  };
  const finishRemoving = (both: boolean) => {
    if (!removing) return;
    applyRemovals(lineRemovals(removing.side, removing.index, removing.other, both));
    setRemoving(null);
  };

  // What choosing a template puts on the quote: its name, and its text where it has any - a
  // field the template leaves empty keeps what the quote says.
  const templatePatch = (name: string): Partial<SalesQuoteData> => {
    const template = terms.find((t) => t.name === name);
    return {
      shippingTerms: name,
      shippingIncludes: template?.includes?.trim() ? template.includes : draft.shippingIncludes,
      shippingExcludes: template?.excludes?.trim() ? template.excludes : draft.shippingExcludes,
    };
  };
  // Text the quote already has is replaced only after a question; without such text the template
  // fills the quote at once.
  const chooseTemplate = (name: string) => {
    const next = templatePatch(name);
    const replaces = (own?: string, text?: string) => !!own?.trim() && own !== text;
    if (replaces(draft.shippingIncludes, next.shippingIncludes) || replaces(draft.shippingExcludes, next.shippingExcludes)) setTemplateAsked(name);
    else set(next);
  };

  // While a shipment carries the quote nobody may delete it, and the way there is not obvious:
  // the server's sentence stands under the actions. A user who may not delete the quote for want
  // of a role is shown neither the button nor a reason.
  const deleteBlockedByShipment = quote.shipmentId !== null ? quote.permissions.deleteBlockedReason : undefined;

  // The record the quote is linked to no longer exists: the server answered "not found", which
  // a read that is still on its way or one that failed does not say. The quote keeps the name
  // and its link, but the customer's page would open on "not found", so nothing leads there.
  const customerDeleted = !!draft.customerId && !linkedCustomer.customer && !linkedCustomer.isLoading && !linkedCustomer.isLoadError;
  const customerPageId = customerDeleted ? undefined : draft.customerId;

  // What the header says under the reference: who the quote is for and what it moves where.
  const headline = [
    draft.customerName ? (
      <CustomerLink customerId={customerPageId} deleted={customerDeleted} name={draft.customerName} className="text-base font-bold" />
    ) : (
      <span className="text-slate-400">No customer yet</span>
    ),
    draft.serviceType,
    draft.direction,
    (draft.origin || draft.destination) && <QuoteRoute origin={draft.origin} destination={draft.destination} />,
  ].filter(Boolean);

  // What stands under the Customer step: where a linked customer comes from, or that the name
  // the quote carries is only text - which the Customer box cannot show as its value, so the way
  // to take such a name off the quote is here.
  let customerNote: ReactNode = null;
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
  const sections: { key: SectionKey; title: string; subtitle: string; content: ReactNode; note?: ReactNode }[] = [
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
              <Input size="small" aria-label="Contact person" value={draft.customerContact ?? ""} onChange={(e) => set({ customerContact: e.target.value })} />
            </InfoRow>
          </div>
          <div className="min-w-0">
            <InfoRow label="Email">
              <Input size="small" aria-label="Email" value={draft.customerEmail ?? ""} onChange={(e) => set({ customerEmail: e.target.value })} />
            </InfoRow>
            <InfoRow label="Phone">
              <Input size="small" aria-label="Phone" value={draft.customerPhone ?? ""} onChange={(e) => set({ customerPhone: e.target.value })} />
            </InfoRow>
          </div>
        </div>
      ),
      note: customerNote,
    },
    {
      key: "shipment",
      title: "Shipment details",
      subtitle: "Direction, freight mode and incoterm",
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
                options={SERVICE_TYPES.map((d) => ({ value: d, label: d }))}
              />
            </InfoRow>
          </div>
          <div className="min-w-0">
            <InfoRow label="Incoterm">
              <Select
                size="small"
                className="w-full"
                aria-label="Incoterm"
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
      subtitle: "Origin, destination, ports and addresses",
      content: (
        <div className={FIELD_COLUMNS_CLASS}>
          <div className="min-w-0">
            <InfoRow label="Origin">
              <span className="flex items-center">
                <GeoSelect kind="place" size="small" className="w-full" value={draft.origin} onChange={(v) => set({ origin: v })} />
                <GeoFlag kind="place" value={draft.origin} />
              </span>
            </InfoRow>
            <InfoRow label="POL">
              <span className="flex items-center">
                <GeoSelect kind="place" size="small" className="w-full" placeholder="Port of loading" value={draft.pol} onChange={(v) => set({ pol: v })} />
                <GeoFlag kind="place" value={draft.pol} />
              </span>
            </InfoRow>
            {/* The shipment's Pick-up Address: copied there when a shipment is created from the quote, and back by Copy from shipment. */}
            <InfoRow label="Pickup Address">
              <Input size="small" aria-label="Pickup Address" value={draft.pickup ?? ""} onChange={(e) => set({ pickup: e.target.value })} />
            </InfoRow>
          </div>
          <div className="min-w-0">
            <InfoRow label="Destination">
              <span className="flex items-center">
                <GeoSelect kind="place" size="small" className="w-full" value={draft.destination} onChange={(v) => set({ destination: v })} />
                <GeoFlag kind="place" value={draft.destination} />
              </span>
            </InfoRow>
            <InfoRow label="POD">
              <span className="flex items-center">
                <GeoSelect kind="place" size="small" className="w-full" placeholder="Port of discharge" value={draft.pod} onChange={(v) => set({ pod: v })} />
                <GeoFlag kind="place" value={draft.pod} />
              </span>
            </InfoRow>
            {/* The shipment's Delivery Address, the same way. */}
            <InfoRow label="Delivery Address">
              <Input size="small" aria-label="Delivery Address" value={draft.delivery ?? ""} onChange={(e) => set({ delivery: e.target.value })} />
            </InfoRow>
          </div>
        </div>
      ),
    },
    {
      key: "cargo",
      title: "Cargo details",
      subtitle: containerQuote ? "Commodity, containers and weight" : "Commodity, packages and dimensions",
      content: (
        <div className="flex flex-col gap-3">
          <div className={FIELD_COLUMNS_CLASS}>
            <div className="min-w-0">
              <InfoRow label="Cargo Description">
                <Input size="small" aria-label="Cargo Description" value={draft.commodity ?? ""} onChange={(e) => set({ commodity: e.target.value })} />
              </InfoRow>
            </div>
            <div className="flex items-center gap-4 min-h-[34px]">
              {/* Whether cargo may be stacked is a question of loose cargo; a full container is the box. */}
              {!containerQuote && (
                <Checkbox checked={!!draft.stackable} onChange={(e) => set({ stackable: e.target.checked })}>
                  Stackable
                </Checkbox>
              )}
              <Checkbox checked={!!draft.dangerous} onChange={(e) => set({ dangerous: e.target.checked })}>
                Dangerous goods
              </Checkbox>
            </div>
          </div>

          {draft.dangerous && (
            <Alert
              type="warning"
              showIcon
              message="Dangerous goods declared"
              description="Provide UN number, class, packing group and an SDS before booking. DG surcharges may apply."
            />
          )}

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
                <LineTable minWidthClass="min-w-[520px]">
                  <colgroup>
                    <col className="w-[76px]" />
                    <col />
                    <col className="w-[72px]" />
                    <col className="w-[132px]" />
                    <col className="w-10" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={LINE_TH_CLASS}>Qty</th>
                      <th scope="col" className={LINE_TH_CLASS}>Container type</th>
                      <th scope="col" className={LINE_TH_RIGHT_CLASS}>TEU</th>
                      <th scope="col" className={LINE_TH_CLASS}>Kg / container</th>
                      <th scope="col" aria-label="Remove container" className={LINE_TH_CLASS} />
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((c, i) => {
                      const weightCheck = checkContainerWeight(c.type, c.weight);
                      return (
                      <Fragment key={containerKeys.keys[i]}>
                      <tr>
                        <td className={LINE_TD_CLASS}>
                          <InputNumber size="small" className="!w-full" aria-label="Number of containers" min={1} precision={0} parser={moneyInputParser} value={c.qty} onChange={(v) => patchContainer(i, { qty: v ?? 1 })} />
                        </td>
                        <td className={LINE_TD_CLASS}>
                          <Select
                            size="small"
                            className="w-full"
                            aria-label="Container type"
                            value={c.type}
                            onChange={(v) => patchContainer(i, { type: v })}
                            options={CONTAINER_TYPE_OPTIONS}
                          />
                        </td>
                        <td className={`${LINE_TD_CLASS} text-right tabular-nums text-slate-600`}>{fmtQuantity((Number(c.qty) || 0) * teuForType(c.type))}</td>
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
                        <td className={`${LINE_TD_CLASS} pl-0`}>
                          <RemoveLineButton label={`Remove container ${i + 1}`} onClick={() => {
                              containerKeys.remove(i);
                              updateContainers(containers.filter((_, j) => j !== i));
                            }}
                          />
                        </td>
                      </tr>
                      {weightCheck && (
                        <tr>
                          <td colSpan={5} className="px-2 pb-2 pt-0">
                            <ContainerWeightNote check={weightCheck} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
              <LineTable minWidthClass="min-w-[620px]">
                <colgroup>
                  <col className="w-[76px]" />
                  <col />
                  <col className="w-[84px]" />
                  <col className="w-[84px]" />
                  <col className="w-[84px]" />
                  <col className="w-[92px]" />
                  <col className="w-16" />
                  <col className="w-10" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={LINE_TH_CLASS}>Qty</th>
                    <th scope="col" className={LINE_TH_CLASS}>Packing</th>
                    <th scope="col" className={LINE_TH_CLASS}>L (cm)</th>
                    <th scope="col" className={LINE_TH_CLASS}>W (cm)</th>
                    <th scope="col" className={LINE_TH_CLASS}>H (cm)</th>
                    <th scope="col" className={LINE_TH_CLASS}>Kg/ea</th>
                    <th scope="col" className={LINE_TH_CLASS}>Stack</th>
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
                      <td className={`${LINE_TD_CLASS} pl-0`}>
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
                <KpiTile size="text" label="TEU" value={fmtQuantity(cargo.teu)} hint="20' = 1, 40' and 45' = 2" />
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
              hint={cargo.weightFromContainers ? "From containers" : cargo.weightFromLines ? "From packages" : "Total for the shipment"}
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
              hint={cargo.cbmFromLines ? "From package dimensions" : "Total for the shipment"}
            />
            {containerQuote ? (
              <KpiTile size="text" label="Equipment" value={cargo.equipment || EMPTY_CELL} hint="As the shipment names its containers" />
            ) : (
              <>
                {airFreight ? (
                  <KpiTile size="text" label="Volumetric wt" value={`${fmtQuantity(cargo.volumetricWeight)} kg`} />
                ) : (
                  <KpiTile
                    size="text"
                    label="Weight / measure"
                    value={cargo.weightMeasure ? `${fmtQuantity(cargo.weightMeasure)} W/M` : EMPTY_CELL}
                    hint="1 t or 1 cbm, the greater"
                  />
                )}
                <KpiTile size="text" label="Chargeable wt" value={airFreight ? `${fmtQuantity(cargo.chargeableWeight)} kg` : AIR_ONLY} />
                <KpiTile
                  size="text"
                  label="Weight ratio"
                  value={cargo.weightRatio !== null ? `${fmtQuantity(cargo.weightRatio)} cbm/t` : EMPTY_CELL}
                  hint="Volume ÷ weight in tons"
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
      content: (
        <div className="flex flex-col gap-3">
          {pricingClosed && (
            <Alert
              type="info"
              showIcon
              message={
                quote.status === "replaced"
                  ? "This quote was replaced by its revision: its buying and selling stay as they were sent."
                  : "This quote is closed: its buying and selling are what the customer was given. To change prices, click Revise at the top - the revision is a new quote."
              }
            />
          )}
          {/* Locked as a whole while closed: every control of the prices, antd's and plain buttons alike. */}
          <ConfigProvider componentDisabled={pricingClosed}>
          <fieldset disabled={pricingClosed} className="contents">
          <div className="flex items-center gap-2.5 min-h-6">
            <span className={FIELD_LABEL_CLASS}>Currency</span>
            <Select
              size="small"
              className="w-[84px] shrink-0"
              aria-label="Currency"
              value={totals.currency}
              onChange={(v) => set({ currency: v })}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
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
          <CostLinesEditor
            kind="buying"
            title="Buying (cost)"
            lines={draft.buyingLines ?? []}
            quote={draft}
            sheet={exchange.rates}
            live={exchange}
            onChange={(l) => updateLines("buyingLines", l)}
            lineTag={buyingTag}
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
          </fieldset>
          </ConfigProvider>
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
              label={totals.margin === null ? "Profit" : `Profit · ${totals.margin}%`}
              value={fmtMoney(totals.profit, totals.currency)}
              tone={marginTone(totals)}
            />
          </div>
          {roadMargin && truckingOn && (
            <QuoteMarginPanel margin={roadMargin} canApprove={quote.permissions.canApproveMargin} onApprove={() => setModal("approveMargin")} />
          )}
          {/* Which rates the totals use: stored on the quote once sent, today's until then. */}
          <div className="text-[12.5px] text-slate-500">{fxNote(totals)}</div>
          {liveRatesMissing && (
            <div className="text-[12.5px] text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
              Today&apos;s ČNB rates have not been imported — prices use an older fixing. Sync them on the Exchange page before sending.
            </div>
          )}
        </div>
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
                placeholder="Select a T&C template…"
                value={draft.shippingTerms}
                onChange={chooseTemplate}
                options={terms.map((t) => ({ value: t.name, label: t.name }))}
              />
              {/* Where the templates are kept: Sales Settings, which everybody may read. */}
              <Link href={salesSettingsHref("terms")} className={SMALL_LINK_CLASS}>
                Templates
              </Link>
            </div>
          </InfoRow>
          <InfoRow label="Rate offer includes">
            <Input.TextArea size="small" aria-label="Rate offer includes" rows={4} value={draft.shippingIncludes ?? ""} onChange={(e) => set({ shippingIncludes: e.target.value })} />
          </InfoRow>
          <InfoRow label="Rate offer excludes">
            <Input.TextArea size="small" aria-label="Rate offer excludes" rows={4} value={draft.shippingExcludes ?? ""} onChange={(e) => set({ shippingExcludes: e.target.value })} />
          </InfoRow>
          {/* The quote's one validity date, as the lifecycle band and the document show it. It
              decides when the quote expires, so the server keeps it: picking or clearing it here
              changes it at once, and on a quote the customer already has that goes into its
              history. A won or lost quote keeps the validity it was decided with: the picker is
              locked and says why, instead of offering a change the server refuses. */}
          <InfoRow label="Valid until">
            <span className="inline-block" title={decided ? "The validity of a won or lost quote cannot be changed" : undefined}>
              <DatePicker
                size="small"
                className="w-44"
                aria-label="Valid until"
                format={DATE_FORMATS}
                placeholder="Select expiry date"
                disabled={decided}
                value={shownValidity ? dayjs(shownValidity) : null}
                onChange={(date) => {
                  const picked = date ? date.format(STORED_DATE) : null;
                  if (picked !== shownValidity) changeValidity(picked);
                }}
              />
            </span>
          </InfoRow>
        </div>
      ),
    },
  ];

  // "Save & continue" saves what is waiting right away, without the pause autosave takes, and
  // shows the next step. It moves on whatever the server answers - a refused save is announced
  // by the hook and stays in the header until one works.
  const saveAndContinue = (to: SectionKey) => {
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

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <BackLink href={back.href} className="mb-2">
          {back.label}
        </BackLink>

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex-[1_1_300px] min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="text-[22px] font-bold font-mono text-slate-800 m-0">{ref}</h1>
              <QuoteStatusPill status={quote.effectiveStatus} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[15px] font-bold text-slate-500">
              {headline.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && <span aria-hidden>·</span>}
                  {part}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 max-w-full">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ToolbarButton icon={<CopyOutlined />} onClick={() => setModal("duplicate")}>
                Duplicate
              </ToolbarButton>
              {/* Only when the user asks: a sent quote the server lets be revised (Quoted, Feedback, Expired). */}
              {quote.allowedTransitions.includes("revised") && (
                <ToolbarButton icon={<HistoryOutlined />} onClick={() => setModal("revise")}>
                  Revise
                </ToolbarButton>
              )}
              {/* The shipment that carries this quote as its Sales Number - the oldest when there are
                  several, the others are in the history - or the way to make one. */}
              {quote.shipmentId ? (
                <ToolbarButton icon={<ContainerOutlined />} onClick={() => router.push(`/shipments/${quote.shipmentId}`)}>
                  Shipment {quote.shipmentJobNumber}
                </ToolbarButton>
              ) : (
                // Only a Won quote can be made into a shipment - said by the status the pill shows.
                <Tooltip title={notWonQuoteText(quote.effectiveStatus)}>
                  <span>
                    <ToolbarButton icon={<ContainerOutlined />} onClick={createShipment} disabled={!!notWonQuoteText(quote.effectiveStatus)}>
                      Create shipment
                    </ToolbarButton>
                  </span>
                </Tooltip>
              )}
              <span aria-hidden className="w-px h-6 bg-slate-200" />
              <ToolbarButton icon={<EyeOutlined />} onClick={() => setModal("preview")}>
                Preview
              </ToolbarButton>
              <Tooltip title={sendBlocked}>
                <span>
                  <ToolbarButton icon={<MailOutlined />} onClick={openEmail}>
                    Email
                  </ToolbarButton>
                </span>
              </Tooltip>
              <ToolbarButton variant="primary" icon={<FilePdfOutlined />} onClick={exportPdf}>
                Export PDF
              </ToolbarButton>
              {/* The three ways to fill the quote in from something that exists, behind one button. */}
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{
                  items: [
                    { key: "import", icon: <ImportOutlined />, label: "Import inquiry data", onClick: () => setModal("import") },
                    { key: "copyQuote", icon: <CopyOutlined />, label: "Copy from quote", onClick: () => setModal("copyQuote") },
                    { key: "copyShipment", icon: <ContainerOutlined />, label: "Copy from shipment", onClick: () => setModal("copyShipment") },
                  ],
                }}
              >
                <button type="button" className={toolbarButtonClass()}>
                  <ImportOutlined />
                  Import data
                  <DownOutlined className="text-[10px] !text-slate-500" />
                </button>
              </Dropdown>
              {/* Behind the three dots at the far end, so it is not pressed for one of the others. */}
              {quote.permissions.canDelete && (
                <Dropdown
                  trigger={["click"]}
                  placement="bottomRight"
                  menu={{ items: [{ key: "delete", danger: true, icon: <DeleteOutlined />, label: "Delete quote", onClick: () => setModal("delete") }] }}
                >
                  <button type="button" aria-label="More actions" title="More actions" className={toolbarButtonClass("secondary", "square")}>
                    <MoreOutlined />
                  </button>
                </Dropdown>
              )}
            </div>
            {saveLabel && <div className="text-xs text-right text-red-600">{saveLabel}</div>}
            {deleteBlockedByShipment && <div className="text-xs text-slate-500 text-right">Cannot be deleted: {deleteBlockedByShipment}.</div>}
          </div>
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
        changingOwner={changingOwner}
        onChangeOwner={changeOwner}
      />

      {/* ── Form and summary ── */}
      <div className="p-6 flex flex-col gap-3">
        <QuoteStepTiles
          steps={sections.map((s) => ({ key: s.key, title: s.title, status: sectionStatus(s.key) }))}
          active={shownSection}
          onSelect={(key) => setActiveSection(key as SectionKey)}
        />

        <div className="min-w-0">
          <div className="flex flex-col gap-3 min-w-0">
            {shown && (
              <QuoteSection key={shown.key} title={shown.title} subtitle={shown.subtitle}>
                {shown.content}
                {(shown.note || nextSection) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">{shown.note}</div>
                    {nextSection && <ToolbarButton onClick={() => saveAndContinue(nextSection.key)}>Save &amp; continue</ToolbarButton>}
                  </div>
                )}
              </QuoteSection>
            )}
          </div>
        </div>
      </div>

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
      <ImportInquiryModal open={modal === "import"} onClose={() => setModal(null)} onApply={(p) => set(pricingClosed ? withoutPricing(p) : p)} />
      <CopyFromModal open={modal === "copyQuote"} mode="quote" currentRef={ref} onClose={() => setModal(null)} onApply={(p) => set(pricingClosed ? withoutPricing(p) : p)} />
      <CopyFromModal open={modal === "copyShipment"} mode="shipment" currentRef={ref} onClose={() => setModal(null)} onApply={(p) => set(pricingClosed ? withoutPricing(p) : p)} />
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
        sendBlocked={sendBlocked}
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
      {modal === "revise" && (
        <ConfirmModal
          open
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const refused = await reviseQuote();
            if (refused) toast.error(`${ref} - ${refused}`);
            setModal(null);
          }}
          title="Revise as a new quote"
          description={`${ref} stays as it was sent and becomes Replaced. Its revision - a new quote with the same content and the next free revision number of ${revisionRoot(ref)} (-R1, -R2, ...) - opens, ready for new prices. Revise it?`}
          confirmLabel="Revise"
        />
      )}
      {modal === "closeQuote" && (
        <ExportCloseDialog quoteNumber={ref} validUntil={quote.validUntil} validityDays={draft.validityDays} onConfirm={exportAndClose} onClose={() => setModal(null)} />
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
      {/* Cancel leaves the quote as it was, the template it names included. */}
      {templateAsked !== null && (
        <ConfirmModal
          open
          onClose={() => setTemplateAsked(null)}
          onConfirm={() => {
            set(templatePatch(templateAsked));
            setTemplateAsked(null);
          }}
          title={`Template: ${templateAsked}`}
          description="Replace Includes and Excludes with the template's text?"
          confirmLabel="Replace"
          danger
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
  const { customers, isFetching, isError } = useCustomers({ search }, { enabled: searching });
  // Only the answer to what is typed is listed. Until it is here the hook still holds what it
  // had last - an earlier search, or before the first one the whole Customer Database, left
  // behind by the Customers page - and a customer picked from that need not be one that was
  // looked for.
  const answered = searching && search === wanted && !isFetching;
  const found = answered ? customers.slice(0, CUSTOMER_LIMIT) : [];

  let emptyText = "No customers match";
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

// The colour of the profit: by the margin when there is selling to relate it to, otherwise only a
// loss stands out.
function marginTone({ profit, margin }: QuoteTotals): KpiTone | undefined {
  if (margin === null) return profit < 0 ? "red" : undefined;
  return margin >= 15 ? "green" : margin >= 5 ? "amber" : "red";
}

// The KG / CONTAINER field by where the cargo weight stands: no colour within the standard limit,
// yellow when it needs a heavy-tested box (or the shipping line's confirmation), red when too heavy.
const WEIGHT_FIELD_CLASS: Record<WeightCheck["level"], string> = {
  standard: "",
  heavyTested: "!bg-yellow-100 !border-yellow-400",
  confirm: "!bg-yellow-100 !border-yellow-400",
  tooHeavy: "!bg-red-100 !border-red-400",
};

// Under a container line: the type's weight limits, and what the cargo weight on it needs.
function ContainerWeightNote({ check }: { check: WeightCheck }) {
  const kg = (n: number) => `${n.toLocaleString("en-US")} kg`;
  return (
    <div className="text-[11px] text-slate-500">
      Standard up to {kg(check.standard)} · {check.heavyTested ? "Heavy tested up to" : "Max"} {kg(check.max)}
      {check.level === "heavyTested" && <span className="ml-2 text-yellow-700">Heavy-tested box needed</span>}
      {check.level === "confirm" && (
        <span className="ml-2 text-yellow-700">
          {check.heavyTested && "Heavy-tested box needed. "}
          <strong>You need to have it confirmed by shipping line</strong>
        </span>
      )}
      {check.level === "tooHeavy" && <span className="ml-2 font-semibold text-red-600">Too heavy for this box</span>}
    </div>
  );
}
