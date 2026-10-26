"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Select, Button, Checkbox, Segmented, Tag } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { AppModal } from "@/components/AppModal";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { api, apiErrorMessage, ErrCode, isAPIError } from "@/lib/api";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useNextJobNumber } from "@/hooks/useNextJobNumber";
import { useSalesQuoteByRef } from "@/hooks/useSalesQuote";
import { invalidateQuoteLists } from "@/hooks/useSalesQuotes";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { quoteProblem } from "@/app/sales/_lib/quoteProblem";
import { toSalesQuote, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import { ExchangeRatesError } from "@/app/sales/_components/ExchangeRatesError";
import { QuotePicker } from "@/app/sales/_components/QuotePicker";
import { QuoteStatusPill } from "@/app/sales/_components/QuoteStatusPill";
import { notWonQuoteText } from "@/app/sales/_lib/shipmentLink";
import { quoteToCreateRequest, quotePreview } from "./quoteToShipment";
import type { controllers, interfaces } from "@/lib/api/client";

interface CreateShipmentWizardProps {
  open: boolean;
  /**
   * The wizard is done. With `openShipmentId` it closes in order to show that shipment - the one
   * it created, or the one its quote already has; going there is the caller's, which may have a
   * navigation of its own to make and can make only one.
   */
  onClose: (openShipmentId?: string) => void;
  createShipment: (params: controllers.ShipmentCreateRequest) => Promise<controllers.ShipmentCreateResponse>;
  isCreating: boolean;
  existingShipments: ShipmentItem[];
  /** The reference of the sales quote the wizard is opened for ("Create shipment" on the quote page). */
  fromQuote?: string | null;
}

// "created": a shipment was made from a quote, but a step after it did not work - the wizard
// stays to say which, instead of opening the shipment as if all was done.
type WizardStep = "ask-copy" | "select-fields" | "confirm-costs" | "created";

// Ordered field keys offered on the "Select Fields to Copy" step. No people: the copy's Person In
// Charge is whoever creates it, never the source's (which may still be an old free-text name).
// "origin" is not part of the create payload — it is applied via a follow-up update.
const COPYABLE_FIELDS = [
  "shipper",
  "consignee",
  "agent",
  "agentPic",
  "incotermOrigin",
  "incotermDestination",
  "cargoOrigin",
  "origin",
  "pol",
  "pod",
  "destination",
  "hsCode",
  "cargoDescription",
] as const;

// What a create from a quote made of the quote and of its cost lines, as the result words it.
// Null for a step that did not work.
function quoteOutcome(link: interfaces.QuoteLinkOutcome | undefined): string | null {
  if (!link?.linked) return null;
  if (link.becameWon) return "quote marked Won";
  if (link.note) return `quote linked (${link.note})`;
  return link.quoteStatus === "won" ? "quote was already Won" : "quote linked";
}

function costsOutcome(costs: interfaces.CostImportOutcome | undefined): string | null {
  if (!costs || costs.error) return null;
  const lines = costs.buying + costs.selling;
  return lines ? `${lines} cost line${lines === 1 ? "" : "s"} copied` : "no cost lines to copy";
}

export const CreateShipmentWizard = ({
  open,
  onClose,
  createShipment,
  isCreating,
  existingShipments,
  fromQuote = null,
}: CreateShipmentWizardProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  // The Exchange sheet converts the quote's totals where the quote stores no rate of its own.
  const exchange = useCurrentExchangeRates();

  const [step, setStep] = useState<WizardStep>("ask-copy");
  const [copyMode, setCopyMode] = useState<"shipment" | "quote">("shipment");
  const [copyFromId, setCopyFromId] = useState<string>("");
  // The sales quote picked in "Copy from Quote", whole, as the picker found it: a Won quote of the
  // company, or the one the wizard was opened for.
  const [selectedQuote, setSelectedQuote] = useState<SalesQuote | null>(null);
  // The shipment the server refused to add another to: the picked quote already has it (HTTP 409).
  const [refusedFor, setRefusedFor] = useState<{ id: string; jobNumber: string } | null>(null);
  // "Create another shipment from this quote" is ticked.
  const [another, setAnother] = useState(false);
  // What the server answered to a create from a quote, while the result step shows it.
  const [created, setCreated] = useState<controllers.ShipmentCreateResponse | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(COPYABLE_FIELDS));
  const [copyEstimatedCosts, setCopyEstimatedCosts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The next job number is generated on the server so it accounts for archived
  // (soft-deleted) shipments and never reuses a reference.
  const { nextJobNumber } = useNextJobNumber(open);

  // Opened for one quote: it is read as it is stored now and picked, as if found in the picker.
  const presetQuery = useSalesQuoteByRef(fromQuote, { enabled: open });
  const preset = {
    loading: !!fromQuote && presetQuery.isLoading,
    error: presetQuery.error ? quoteProblem(presetQuery.error).reason : "",
  };
  const presetQuote = presetQuery.data?.quote;
  useEffect(() => {
    if (!open || !fromQuote) return;
    setCopyMode("quote");
    if (presetQuote) setSelectedQuote(toSalesQuote(presetQuote));
  }, [open, fromQuote, presetQuote]);

  // Another quote is another question: what was answered or ticked for the last one goes.
  const pickQuote = (quote: SalesQuote | null) => {
    setSelectedQuote(quote);
    setRefusedFor(null);
    setAnother(false);
  };

  // The shipment the picked quote already has: as the quote says, or as the server said when it
  // refused - a colleague may have created it after the quote was read.
  const existing =
    refusedFor ??
    (selectedQuote?.shipmentId && selectedQuote.shipmentJobNumber
      ? { id: selectedQuote.shipmentId, jobNumber: selectedQuote.shipmentJobNumber }
      : null);

  // Why the picked quote cannot be made into a shipment: it is not Won - by the status it is shown with.
  const notWon = selectedQuote ? notWonQuoteText(selectedQuote.status) : null;

  const jobOptions = useMemo(
    () =>
      existingShipments
        .filter((s) => s.jobNumber)
        .sort((a, b) => (b.jobNumber ?? "").localeCompare(a.jobNumber ?? ""))
        .map((s) => ({ value: s.id, label: s.jobNumber })),
    [existingShipments],
  );

  const source = existingShipments.find((s) => s.id === copyFromId);
  const sourceJob = source?.jobNumber ?? "";

  // Back to what a newly opened wizard shows.
  const reset = () => {
    setStep("ask-copy");
    setCopyMode("shipment");
    setCopyFromId("");
    pickQuote(null);
    setCreated(null);
    setSelectedFields(new Set(COPYABLE_FIELDS));
    setCopyEstimatedCosts(false);
  };

  // Takes no argument: as the handler of a click it must not pass the click on as a shipment.
  const resetAndClose = () => {
    reset();
    onClose();
  };

  // Closes to show a shipment: the one just created, or the one the picked quote already has.
  const closeAndOpen = (shipmentId: string) => {
    reset();
    onClose(shipmentId);
  };

  const baseRequest = (): controllers.ShipmentCreateRequest => {
    // No job number: the server gives the shipment the next free one when it is stored, so the
    // number shown above is a preview and a parallel create may take it first. No Created By
    // either: the server stamps it from the signed-in user, who is also its Person In Charge
    // (a person is kept by e-mail, in lower case).
    return {
      tradeDirection: "Import",
      freightMode: "Sea Freight",
      department: "Operation Department",
      status: "Booking Confirmation Pending [IMP]",
      personInCharge: (user?.email ?? "").trim().toLowerCase(),
    };
  };

  const handleCreateBlank = async () => {
    setSubmitting(true);
    try {
      const result = await createShipment(baseRequest());
      toast.success(`Shipment ${result.shipment.jobNumber} created`);
      closeAndOpen(result.shipment.id);
    } catch (err) {
      toast.error(`Failed to create shipment - ${apiErrorMessage(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWithCopy = async () => {
    if (!source) return;
    setSubmitting(true);

    const request = baseRequest();
    let originValue = "";
    for (const key of COPYABLE_FIELDS) {
      if (!selectedFields.has(key)) continue;
      const val = getFieldValue(source, key).trim();
      if (!val) continue;
      if (key === "origin") {
        originValue = val;
        continue;
      }
      request[key] = val;
    }

    let newId: string;
    try {
      newId = (await createShipment(request)).shipment.id;
    } catch (err) {
      toast.error(`Failed to create shipment - ${apiErrorMessage(err)}`);
      setSubmitting(false);
      return;
    }
    // The shipment exists from here on: a later step that fails is reported as such, so nobody
    // creates it a second time.
    const failed: string[] = [];
    if (originValue) {
      try {
        await api.shipments.shipmentUpdate(newId, { origin: originValue });
      } catch {
        failed.push("setting the origin");
      }
    }
    if (copyEstimatedCosts) {
      try {
        await copyEstimates(source.id, newId);
      } catch {
        failed.push("copying estimated costs");
      }
    }
    setSubmitting(false);
    if (failed.length) toast.error(`Shipment created, but ${failed.join(" and ")} failed`);
    else toast.success("Shipment created");
    closeAndOpen(newId);
  };

  // Create a shipment from the quote: the mapped fields and cargo lines go in the create call,
  // and the server does the rest - it tells the quote, which becomes Won, and copies the quote's
  // cost lines into Costs Breakdown. Its answer says how each of those went.
  const handleCreateFromQuote = async () => {
    if (!selectedQuote) return;
    setSubmitting(true);

    const request: controllers.ShipmentCreateRequest = {
      ...baseRequest(),
      ...quoteToCreateRequest(selectedQuote.quoteNumber, selectedQuote.data, exchange.rates),
      allowSecondShipment: (existing && another) || undefined,
    };

    try {
      const result = await createShipment(request);
      const done = [quoteOutcome(result.quoteLink), costsOutcome(result.costImport)];
      if (done.every(Boolean) && !result.detailRowsError) {
        toast.success(`Shipment created from ${selectedQuote.quoteNumber} - ${done.join(", ")}`);
        closeAndOpen(result.shipment.id);
      } else {
        setCreated(result);
        setStep("created");
      }
    } catch (err) {
      // The quote already has a shipment and nothing was created: the wizard names that shipment
      // and asks before it makes another.
      if (isAPIError(err) && err.code === ErrCode.AlreadyExists && typeof err.details?.shipmentId === "string") {
        setRefusedFor({ id: err.details.shipmentId, jobNumber: String(err.details.jobNumber ?? "") });
        setAnother(false);
      } else {
        toast.error(`Shipment not created - ${apiErrorMessage(err)}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Tells the quote once more that the shipment was created from it - the step of the create
  // that failed - so an open quote still becomes Won.
  const retryQuoteLink = async () => {
    if (!created) return;
    setRetrying(true);
    let quoteLink: interfaces.QuoteLinkOutcome;
    try {
      const synced = await api.shipments.shipmentQuoteLink(created.shipment.id, { markWon: true });
      quoteLink = synced.found
        ? { linked: synced.shipmentId !== null, becameWon: synced.becameWon, quoteStatus: synced.status, note: synced.note ?? undefined }
        : { linked: false, becameWon: false, quoteStatus: null, error: `quote ${synced.quoteNumber} could not be linked` };
      invalidateQuoteLists(queryClient);
    } catch (err) {
      quoteLink = { linked: false, becameWon: false, quoteStatus: null, error: apiErrorMessage(err) };
    }
    setCreated({ ...created, quoteLink });
    setRetrying(false);
  };

  const copyEstimates = async (sourceId: string, targetId: string) => {
    const invoicing = await api.invoicing.invoicingGet(sourceId);

    // estAmount/realAmount are numeric columns — only send them when they hold a
    // real value, never an empty string (Postgres rejects "" as numeric).
    for (const cost of invoicing.costs) {
      if (!cost.estAmount) continue;
      await api.invoicing.invoicingUpsertCost(targetId, {
        category: cost.category,
        estAmount: cost.estAmount,
        estCurrency: cost.estCurrency || "CZK",
      });
    }

    for (const charge of invoicing.additionalCharges) {
      if (!charge.estAmount && !charge.description) continue;
      const params: controllers.AddChargeRequest = {
        description: charge.description || "",
        estCurrency: charge.estCurrency || "CZK",
        sortOrder: charge.sortOrder,
      };
      if (charge.estAmount) params.estAmount = charge.estAmount;
      await api.invoicing.invoicingAddCharge(targetId, params);
    }
  };

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const busy = submitting || isCreating;

  const title =
    step === "ask-copy"
      ? "New Shipment"
      : step === "select-fields"
        ? "Select Fields to Copy"
        : step === "confirm-costs"
          ? "Copy Estimated Costs?"
          : "Shipment Created";

  const subtitle =
    step === "ask-copy"
      ? `Job Number: ${nextJobNumber}`
      : step === "select-fields"
        ? `From ${sourceJob} → ${nextJobNumber}`
        : step === "confirm-costs"
          ? `From ${sourceJob} to Invoicing`
          : `Job Number: ${created?.shipment.jobNumber ?? ""}`;

  // What worked of a create from a quote; the result step lists the rest.
  const createdQuote = quoteOutcome(created?.quoteLink);
  const createdCosts = costsOutcome(created?.costImport);

  const footer =
    step === "ask-copy" ? (
      <div className="flex justify-end gap-2">
        <Button onClick={resetAndClose}>Cancel</Button>
        <Button onClick={handleCreateBlank} loading={busy}>
          Create Blank
        </Button>
        {copyMode === "shipment" && copyFromId && (
          <Button type="primary" onClick={() => setStep("select-fields")}>
            Next &mdash; Select Fields
          </Button>
        )}
        {copyMode === "quote" && selectedQuote && (
          // Not before the Exchange sheet is in: the quote's totals would be worked out without it.
          <Button type="primary" onClick={handleCreateFromQuote} loading={busy} disabled={exchange.isLoading || !!notWon || (!!existing && !another)}>
            Create from Quote
          </Button>
        )}
      </div>
    ) : step === "select-fields" ? (
      <div className="flex justify-end gap-2">
        <Button onClick={() => setStep("ask-copy")}>Back</Button>
        <Button
          type="primary"
          disabled={selectedFields.size === 0}
          onClick={() => setStep("confirm-costs")}
        >
          Next &mdash; Estimated Costs
        </Button>
      </div>
    ) : step === "confirm-costs" ? (
      <div className="flex justify-end gap-2">
        <Button onClick={() => setStep("select-fields")}>Back</Button>
        <Button type="primary" onClick={handleCreateWithCopy} loading={busy}>
          Create Shipment
        </Button>
      </div>
    ) : (
      <div className="flex justify-end gap-2">
        <Button type="primary" onClick={() => created && closeAndOpen(created.shipment.id)}>
          Open Shipment
        </Button>
      </div>
    );

  return (
    <AppModal open={open} onClose={resetAndClose} title={title} subtitle={subtitle} size="medium" footer={footer}>
      {step === "ask-copy" && (
        <>
          <p className="text-xs text-slate-600 mb-4">Would you like to copy data from a previous shipment or a quote?</p>

          <Segmented
            block
            className="mb-4"
            value={copyMode}
            onChange={(v) => {
              setCopyMode(v as "shipment" | "quote");
              setCopyFromId("");
              pickQuote(null);
            }}
            options={[
              { label: "Copy from Shipment", value: "shipment" },
              { label: "Copy from Quote", value: "quote" },
            ]}
          />

          {copyMode === "shipment" ? (
            <>
              <label className="block text-[11px] text-slate-500 mb-1">Copy from Job Number</label>
              <Select
                showSearch
                allowClear
                className="w-full"
                placeholder="Search or select..."
                value={copyFromId || undefined}
                onChange={(value) => setCopyFromId(value ?? "")}
                options={jobOptions}
                optionFilterProp="label"
              />
            </>
          ) : (
            <>
              <label className="block text-[11px] text-slate-500 mb-1">Copy from Quote Number</label>
              {/* Only Won quotes: no shipment is made from any other. */}
              <QuotePicker value={selectedQuote} onChange={pickQuote} statuses="won" />
              {preset.loading && <div className="mt-2 text-xs text-slate-400">Loading {fromQuote}…</div>}
              {preset.error && <Alert className="mt-3" type="error" showIcon message={`${fromQuote} - ${preset.error}`} />}

              {selectedQuote && (
                <div className="mt-4 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Data to transfer</span>
                    <Tag color="geekblue" className="!m-0 font-mono">{selectedQuote.quoteNumber}</Tag>
                    <QuoteStatusPill status={selectedQuote.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {quotePreview(selectedQuote.data, exchange.rates).map((item) => (
                      <div key={item.label}>
                        <div className="text-[11px] text-slate-400">{item.label}</div>
                        <div className="text-xs font-semibold text-slate-800">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedQuote && <ExchangeRatesError exchange={exchange} className="mt-3" />}

              {/* A quote the wizard is opened for may not be Won yet: the picker never offers one. */}
              {notWon && <Alert className="mt-3" type="warning" showIcon message={notWon} />}

              {existing && (
                <Alert
                  className="mt-3"
                  type="warning"
                  showIcon
                  message={
                    <>
                      Shipment {existing.jobNumber} was already created from this quote.{" "}
                      <button
                        type="button"
                        onClick={() => closeAndOpen(existing.id)}
                        className="font-semibold underline bg-transparent border-none p-0 cursor-pointer"
                      >
                        Open {existing.jobNumber}
                      </button>
                    </>
                  }
                  description={
                    <Checkbox checked={another} onChange={(e) => setAnother(e.target.checked)}>
                      <span className="text-xs">Create another shipment from this quote</span>
                    </Checkbox>
                  }
                />
              )}
            </>
          )}
        </>
      )}

      {step === "created" && created && (
        <>
          <p className="text-xs text-slate-600 mb-3">
            Shipment <strong className="text-slate-700">{created.shipment.jobNumber}</strong> was created from{" "}
            {selectedQuote?.quoteNumber}
            {[createdQuote, createdCosts].some(Boolean) && ` - ${[createdQuote, createdCosts].filter(Boolean).join(", ")}`}.
          </p>
          <div className="space-y-2">
            {!createdQuote && (
              <Alert
                type="warning"
                showIcon
                message="Shipment created, but the quote could not be told"
                description={created.quoteLink?.error}
                action={
                  <Button size="small" loading={retrying} onClick={retryQuoteLink}>
                    Retry
                  </Button>
                }
              />
            )}
            {!createdCosts && (
              <Alert
                type="warning"
                showIcon
                message="Shipment created, but the quote's costs were not copied - use Copy from quote on the Costs tab"
                description={created.costImport?.error}
              />
            )}
            {created.detailRowsError && (
              <Alert type="warning" showIcon message="Shipment created, but some cargo lines were not saved" description={created.detailRowsError} />
            )}
          </div>
        </>
      )}

      {step === "select-fields" && (
        <>
          <div className="flex gap-3 mb-2 pb-2 border-b border-slate-100">
            <button
              onClick={() => setSelectedFields(new Set(COPYABLE_FIELDS))}
              className="text-[11px] text-indigo-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedFields(new Set())}
              className="text-[11px] text-slate-400 hover:underline bg-transparent border-none p-0 cursor-pointer"
            >
              Deselect All
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto -mx-1">
            {COPYABLE_FIELDS.map((key) => {
              const label = COLUMN_MAP.get(key)?.title ?? key;
              const val = source ? getFieldValue(source, key) : "";
              return (
                <label
                  key={key}
                  className="flex items-center gap-3 px-1 py-1.5 rounded-md cursor-pointer hover:bg-slate-50"
                >
                  <Checkbox checked={selectedFields.has(key)} onChange={() => toggleField(key)} />
                  <span className="text-xs text-slate-600 w-36 shrink-0">{label}</span>
                  <span className="text-xs text-slate-400 truncate flex-1 min-w-0">
                    {val || <span className="italic text-slate-300">empty</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {step === "confirm-costs" && (
        <>
          <p className="text-xs text-slate-600 mb-4">
            Would you like to also copy the estimated costs from <strong className="text-slate-700">{sourceJob}</strong>{" "}
            to the Invoicing tab of the new shipment?
          </p>
          <label className="flex items-start gap-3 px-3 py-3 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
            <Checkbox
              checked={copyEstimatedCosts}
              onChange={(e) => setCopyEstimatedCosts(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs font-medium text-slate-700">Yes, copy estimated costs</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                Estimated amounts will be copied to the new shipment&apos;s Invoicing tab
              </span>
            </span>
          </label>
        </>
      )}
    </AppModal>
  );
};
