"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  Radio,
  Result,
  Segmented,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Upload,
} from "antd";
import { DeleteOutlined, FileOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { fileToBase64, formatFileSize } from "@/lib/files";
import { CURRENCIES, FULL_LOAD } from "@/lib/enums";
import { existingMczNumbers, nextMczNumber } from "@/lib/mcz";
import { useToast } from "@/lib/toast";
import { useShipments, getFieldValue } from "@/hooks/useShipments";
import { shipmentAttachmentsKey } from "@/hooks/useShipmentAttachments";
import { DOCUMENT_TYPES, isReviewedDocumentType, supplierInvoiceType } from "@/lib/documentTypes";
import { chargeLabel, chargeOptions, toChargeCode } from "@/lib/chargeCodes";
import { useCreateMasterJob, useMasterJobs, useUpdateMasterJob } from "@/hooks/useMasterJobs";
import { useNextJobNumber } from "@/hooks/useNextJobNumber";
import { FieldReviewTable } from "./FieldReviewTable";
import { QuoteOpenButton, QuoteReview, QuoteTarget } from "./QuoteReading";
import {
  baseCreatePayload,
  bookingExistingValue,
  bookingToMasterJobUpdate,
  invalidBookingDates,
  buildFields,
  withBookingEquipment,
  containerRowsFromNumbers,
  customerNamed,
  type CustomerRef,
  type Destination,
  type ExtractedField,
  type InputMode,
  INVOICE_FIELD_LABELS,
  type InvoiceExtracted,
  normalizeCurrency,
  normalizeExtracted,
  parseContainerNumbers,
  MBL_CONTAINERS_LABEL,
  MBL_TO_MASTER_JOB,
  isMblContainerDetail,
  keepsPartyLink,
  mblContainers,
  mblDefaultTicks,
  mblToMasterJobUpdate,
  keptPartyDetails,
  partyLinks,
  type PartyLinksHolder,
  SHIPMENT_FIELD_MAP,
  type Step,
  type TargetMode,
  toShipmentUpdate,
  withCargoLine,
  withContainerType,
  withPackageType,
} from "../_lib/extraction";
import { useQuoteReading } from "../_lib/useQuoteReading";
import { documentNumber, numberedFileName, savedDocumentName, suggestedDocumentType } from "../_lib/savedDocument";
import { mergeReads } from "../_lib/mergeReads";
import { missingWm, splitLines, type SplitMethod } from "../_lib/masterInvoice";
import { MasterInvoiceShipments, type MasterInvoiceShipment } from "./MasterInvoiceShipments";
import { shipmentFreight } from "@/lib/freightTons";

type PipelineStep = "idle" | "classified" | "extracting" | "ready";

// Keep roughly one batch of shipments buffered ahead of the reviewer, so the
// next three load in the background while they work on the current three.
const HBL_PREFETCH_AHEAD = 3;

const DESTINATION_OPTIONS = [
  { value: "shipment", label: "Shipments" },
  { value: "invoicing", label: "Invoicing" },
  { value: "quote", label: "Quote" },
  { value: "masterjob", label: "Master Job" },
  { value: "booking", label: "Booking Confirmation" },
  { value: "customs", label: "Customs" },
] as const;

const DESTINATION_HINT: Record<Destination, string> = {
  shipment: "Extract shipping data (B/L, booking, waybill) into Shipments columns; an uploaded file is also saved to the shipment's documents.",
  invoicing:
    "Extract cost data (invoice, debit note) — amount, vendor, invoice number — into one shipment, or split it over the shipments of a master job.",
  quote: "Read a customer's request (inquiry email, rate request, packing list) into a Sales quote: customer, route, cargo and readiness date. Prices are not read.",
  masterjob: "Extract multiple shipments from a pre-alert and create them under a Master Job (MCZ); each House B/L's pages are saved to its shipment's documents.",
  booking: "Read a carrier's booking confirmation into a new or an existing Master Job (MCZ); its details also reach the master job's shipments.",
  customs: "Read the MRN Number, Shipper, Consignee, Total Weight and Container Numbers from a customs declaration into one shipment.",
};

function fieldsToLabelValues(fields: ExtractedField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) if (f.approved && f.extractedValue) out[f.column] = f.extractedValue;
  return out;
}

function recordToFields(record: Record<string, string>): ExtractedField[] {
  return Object.entries(record).map(([column, extractedValue]) => ({
    column,
    extractedValue,
    existingValue: "",
    hasConflict: false,
    approved: true,
  }));
}

// The customer a shipper or consignee read off a document is in the Customer Database: the one
// whose company name it is exactly. Not asked for the name of the customer the party is linked to
// already; a lookup that fails links nothing.
async function customerOf(party: "shipper" | "consignee", name: string | undefined, current: PartyLinksHolder | undefined): Promise<CustomerRef | null> {
  if (!name?.trim() || keepsPartyLink(party, name, current)) return null;
  try {
    const { data } = await api.customers.customerList({ search: name.trim() });
    return customerNamed(name, data);
  } catch {
    return null;
  }
}

// Shipper and consignee names written with their Customer Database links (see partyLinks): a
// linked party is never left showing another company's name. `stored` reads the record written
// to (only when a party name is written); `kept` adds what a link change must carry so the record
// keeps the rest of the party (a shipment: keptPartyDetails). What the document writes wins.
async function withPartyLinks<T extends { shipper?: string; consignee?: string; shipperId?: string | null; consigneeId?: string | null }, C extends PartyLinksHolder>(
  data: T,
  stored: () => Promise<C | undefined>,
  kept: (links: ReturnType<typeof partyLinks>, current: C | undefined) => Partial<T> = () => ({}),
): Promise<T> {
  if (!data.shipper && !data.consignee) return data;
  const current = await stored();
  const [shipper, consignee] = await Promise.all([customerOf("shipper", data.shipper, current), customerOf("consignee", data.consignee, current)]);
  const links = partyLinks(data, current, { shipper, consignee });
  return { ...kept(links, current), ...data, ...links };
}

export function DocumentReadingWorkflow() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { shipments, createShipment, updateShipment, linkMasterJob } = useShipments();
  const quoteReading = useQuoteReading();

  // Workflow
  const [destination, setDestination] = useState<Destination>("shipment");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  // Input
  const [fileBase64, setFileBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileMeta, setFileMeta] = useState({ type: "", size: 0 });
  // A pre-alert can come as several files; all of them are read as one batch
  // under one master job, and listed so the user sees exactly what was taken.
  const [masterFiles, setMasterFiles] = useState<UploadedFile[]>([]);
  const [preparedFiles, setPreparedFiles] = useState<{ fileName: string; pageCount: number }[]>([]);
  // Shipments can read several files for one shipment too: their fields are merged into
  // one review, and each file is saved to the shipment's documents.
  const [shipmentFiles, setShipmentFiles] = useState<UploadedFile[]>([]);
  const [shipmentDocs, setShipmentDocs] = useState<ShipmentDoc[]>([]);
  const [textInput, setTextInput] = useState("");

  // Shipment review
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [extractionMethod, setExtractionMethod] = useState("");
  const [shipmentMode, setShipmentMode] = useState<TargetMode>("existing");
  const [targetShipmentId, setTargetShipmentId] = useState("");
  const [committedJobNumber, setCommittedJobNumber] = useState("");
  // A file read into Shipments is also saved to the shipment's documents, named after its
  // document number. The user approves the name and type on Review; until they edit them
  // (null) both follow the fields as read.
  const [saveDocument, setSaveDocument] = useState(true);
  const [docNameEdit, setDocNameEdit] = useState<string | null>(null);
  const [docTypeEdit, setDocTypeEdit] = useState<string | null>(null);
  const [savedDocNames, setSavedDocNames] = useState<string[]>([]);
  // Booking confirmations go to a new master job or to an existing one (by MCZ).
  const [bookingMode, setBookingMode] = useState<TargetMode>("new");
  const [bookingMcz, setBookingMcz] = useState("");
  // Customs reads always go to one existing shipment (by Internal Reference).
  const [customsShipmentId, setCustomsShipmentId] = useState("");

  // Invoicing review
  const [invoiceData, setInvoiceData] = useState<InvoiceExtracted>({});
  const [invoiceCategory, setInvoiceCategory] = useState("");
  const [invoiceTargetShipmentId, setInvoiceTargetShipmentId] = useState("");
  // An invoice can instead cover a master job: it is split over the shipments the user ticks,
  // by W/M or in equal parts, and each part is posted as that shipment's real cost.
  const [invoiceTarget, setInvoiceTarget] = useState<"shipment" | "masterjob">("shipment");
  const [invoiceMcz, setInvoiceMcz] = useState("");
  const [invoiceUnticked, setInvoiceUnticked] = useState<Set<string>>(new Set());
  const [splitMethod, setSplitMethod] = useState<SplitMethod | null>(null);
  const [splitOverwrite, setSplitOverwrite] = useState<Set<string>>(new Set());
  const [splitPreview, setSplitPreview] = useState<interfaces.CostSplitResultLine[] | null>(null);
  const [splitError, setSplitError] = useState("");
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitDone, setSplitDone] = useState<{ written: string[]; kept: string[]; docs: number } | null>(null);

  // Master Job pipeline
  const [masterMode, setMasterMode] = useState<TargetMode>("new");
  const [masterMczExisting, setMasterMczExisting] = useState("");
  // The new MCZ a batch was started under. "Next free number" moves on as soon as the
  // first shipment is linked, so the batch keeps the number it began with.
  const [batchMcz, setBatchMcz] = useState("");
  // The master job a booking save created, so a retry after a failed save reuses it.
  const [bookingCreated, setBookingCreated] = useState<{ id: string; mczNumber: string } | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [pipelineSessionId, setPipelineSessionId] = useState("");
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("idle");
  const [classification, setClassification] = useState<Record<string, number>>({});
  // Distinct House B/Ls found — continuation pages and copies of one HBL count once.
  const [hblCount, setHblCount] = useState(0);
  const [mblInfo, setMblInfo] = useState<Record<string, string> | null>(null);
  // MBL details the user ticked to file onto the master job — once per batch,
  // with the batch's first shipment.
  const [mblTicked, setMblTicked] = useState<Record<string, boolean>>({});
  const [mblFiled, setMblFiled] = useState(false);
  const [masterShipments, setMasterShipments] = useState<Record<string, string>[]>([]);
  const [masterIdx, setMasterIdx] = useState(0);
  const [masterFields, setMasterFields] = useState<ExtractedField[]>([]);
  const [masterCreatedJobs, setMasterCreatedJobs] = useState<string[]>([]);
  // Each House B/L's own pages, in step with masterShipments, saved to the shipment made from it.
  const [masterDocs, setMasterDocs] = useState<(interfaces.HblDocument | null)[]>([]);
  const [masterDocsSaved, setMasterDocsSaved] = useState(0);
  const [hblBatchIndex, setHblBatchIndex] = useState(0);
  const [hblTotalBatches, setHblTotalBatches] = useState(0);
  const [hblLoading, setHblLoading] = useState(false);
  const [waitingForBatch, setWaitingForBatch] = useState(false);

  // Derived
  const shipmentOptions = useMemo(
    () =>
      shipments
        .filter((s) => s.jobNumber)
        .map((s) => ({ value: s.id, label: `${s.jobNumber} — ${s.shipper || s.consignee || ""}` })),
    [shipments],
  );
  // Only a preview: the server gives the number out when the shipment is stored.
  const { nextJobNumber: newShipmentPreview } = useNextJobNumber(true);
  const { masterJobs } = useMasterJobs();
  const createMasterJob = useCreateMasterJob();
  const updateMasterJob = useUpdateMasterJob();
  const masterJobMczs = useMemo(() => masterJobs.map((m) => m.mczNumber), [masterJobs]);
  const newMcz = useMemo(() => nextMczNumber(shipments, masterJobMczs), [shipments, masterJobMczs]);
  const existingMcz = useMemo(() => existingMczNumbers(shipments, masterJobMczs), [shipments, masterJobMczs]);
  const activeMcz = masterMode === "existing" ? masterMczExisting : batchMcz || newMcz;
  // The master job the batch goes to, once it exists ("Add to existing", or after the first shipment).
  const currentMasterJob = masterJobs.find((m) => m.mczNumber === activeMcz);
  // Load Type is chosen once per master job; a different one on the MBL can't be filed.
  const mblLoadTypeLocked =
    !!currentMasterJob?.loadType && !!mblInfo?.["Load Type"] && currentMasterJob.loadType !== mblInfo["Load Type"];

  const bookingMasterJob = bookingMode === "existing" ? masterJobs.find((m) => m.mczNumber === bookingMcz) : undefined;

  const approvedCount = fields.filter((f) => f.approved).length;
  const conflictCount = fields.filter((f) => f.hasConflict).length;
  const differCount = fields.filter((f) => f.choices).length;

  // ─── Invoice for a master job ───
  const invoiceToMaster = destination === "invoicing" && invoiceTarget === "masterjob";
  const { shipments: mczShipments } = useShipments({ masterJobMcz: invoiceMcz, enabled: invoiceToMaster && !!invoiceMcz });
  const invoiceRows = useMemo<MasterInvoiceShipment[]>(
    () =>
      mczShipments
        .filter((s) => String(s.masterJobMczNumber ?? "").trim() === invoiceMcz)
        .map((s) => ({
          shipmentId: s.id,
          jobNumber: s.jobNumber || s.id,
          party: s.shipper || s.consignee || "",
          ...shipmentFreight(s),
        })),
    [mczShipments, invoiceMcz],
  );
  const invoiceTicked = useMemo(
    () => new Set(invoiceRows.filter((r) => !invoiceUnticked.has(r.shipmentId)).map((r) => r.shipmentId)),
    [invoiceRows, invoiceUnticked],
  );
  const invoiceMissingWm = splitMethod ? missingWm(invoiceRows, invoiceTicked, splitMethod) : [];
  const invoiceTotal = Number(invoiceData.total_amount ?? "");
  const invoiceCurrency = normalizeCurrency(invoiceData.currency);
  // The split as the server will post it; asked as a dry run while the user reviews.
  const splitRequest = useMemo(
    () =>
      splitMethod && invoiceCategory && invoiceTotal > 0 && invoiceData.invoice_number?.trim() && invoiceTicked.size > 0
        ? {
            category: invoiceCategory,
            total: invoiceTotal.toFixed(2),
            currency: invoiceCurrency,
            invoiceNumber: invoiceData.invoice_number.trim(),
            vendor: invoiceData.vendor?.trim() || undefined,
            lines: splitLines(invoiceRows, invoiceTicked, splitMethod),
          }
        : null,
    [splitMethod, invoiceCategory, invoiceTotal, invoiceCurrency, invoiceData.invoice_number, invoiceData.vendor, invoiceRows, invoiceTicked],
  );
  const splitReady = !!splitRequest && invoiceMissingWm.length === 0;
  const tickInvoiceShipment = (shipmentId: string, ticked: boolean) =>
    setInvoiceUnticked((prev) => {
      const next = new Set(prev);
      if (ticked) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });

  // The file Review offers to save to the shipment: the uploaded invoice of a master job, or
  // the current House B/L's own pages of a pre-alert. A Shipments read saves its files
  // through shipmentDocs instead (pasted text has no file).
  const masterDoc = destination === "masterjob" ? masterDocs[masterIdx] ?? null : null;
  const docToSave =
    invoiceToMaster && inputMode === "file" && fileBase64
      ? { base64: fileBase64, type: fileMeta.type, size: fileMeta.size, name: fileName }
      : masterDoc
        ? { base64: masterDoc.fileBase64, type: masterDoc.fileType, size: masterDoc.fileSize, name: masterDoc.fileName }
        : null;
  // A pre-alert's shipments share the Master B/L and the booking, so only the House B/L names one.
  const docFields = masterDoc ? masterFields.filter((f) => f.column === "House BoL Number") : fields;
  // A master job's vendor invoice is named after its invoice number and filed among the
  // suppliers' invoices by its cost category (Seafreight Charges, …), else as "Other" - never as
  // "Invoice", which customs would take for the shipment's commercial invoice.
  const docName =
    docNameEdit ??
    (!docToSave
      ? ""
      : invoiceToMaster
        ? numberedFileName(invoiceData.invoice_number ?? "", docToSave.name)
        : savedDocumentName(docFields, docToSave.name));
  const docType =
    docTypeEdit ?? (invoiceToMaster ? supplierInvoiceType(invoiceCategory) || "Other" : suggestedDocumentType(docFields, docToSave?.name ?? ""));
  const docNumberLabel = documentNumber(docFields).label;
  const docHint = invoiceToMaster
    ? `Saved to each ticked shipment the invoice is posted to, named after the invoice number. Original file: ${fileName}`
    : masterDoc
    ? `${masterDoc.pages.length === 1 ? "Page" : "Pages"} ${masterDoc.pages.join(", ")} of ${masterDoc.sourceFileName}, named after the House B/L number.`
    : docNumberLabel
      ? `Named after the ${docNumberLabel.replace("BoL", "B/L")}. Original file: ${fileName}`
      : "No House B/L, Master B/L or Booking number was read, so the original name is kept.";
  // Each file of a Shipments read, named after its own document number unless the user renamed it.
  const shipmentDocViews = (destination === "shipment" && inputMode === "file" ? shipmentDocs : []).map((d) => {
    const label = documentNumber(d.fields).label;
    return {
      ...d,
      name: d.nameEdit ?? savedDocumentName(d.fields, d.file.name),
      type: d.typeEdit ?? suggestedDocumentType(d.fields, d.file.name),
      hint: label
        ? `Named after the ${label.replace("BoL", "B/L")}. Original file: ${d.file.name}`
        : `No House B/L, Master B/L or Booking number was read in ${d.file.name}, so its original name is kept.`,
    };
  });
  const editShipmentDoc = (uid: string, change: Partial<ShipmentDoc>) =>
    setShipmentDocs((prev) => prev.map((d) => (d.file.uid === uid ? { ...d, ...change } : d)));
  const docNameMissing =
    (!!docToSave && saveDocument && !docName.trim()) || shipmentDocViews.some((d) => d.save && !d.name.trim());

  const successTitle = (() => {
    if (destination === "masterjob")
      return `${masterCreatedJobs.length} shipment${masterCreatedJobs.length !== 1 ? "s" : ""} created`;
    if (destination === "invoicing" && splitDone)
      return `Invoice split over ${splitDone.written.length} shipment${splitDone.written.length !== 1 ? "s" : ""} of ${invoiceMcz}`;
    if (destination === "invoicing") return `Invoice data written to ${committedJobNumber || "shipment"}`;
    if (destination === "booking")
      return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${committedJobNumber}`;
    if (destination === "customs")
      return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${committedJobNumber}`;
    if (destination === "quote") return quoteReading.doneTitle;
    if (shipmentMode === "new") return `New shipment ${committedJobNumber} created`;
    return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${committedJobNumber}`;
  })();
  const successSubtitle =
    destination === "masterjob"
      ? masterCreatedJobs.length > 0
        ? `Under ${activeMcz}: ${masterCreatedJobs.join(", ")}` +
          (masterDocsSaved > 0 ? ` · ${masterDocsSaved} House B/L${masterDocsSaved !== 1 ? "s" : ""} saved to their shipments' documents` : "")
        : `Master Job ${activeMcz}`
      : destination === "invoicing" && splitDone
        ? [
            splitDone.written.length > 0 && `Real cost posted to ${splitDone.written.join(", ")}.`,
            splitDone.kept.length > 0 && `${splitDone.kept.join(", ")} kept the cost they had.`,
            splitDone.docs > 0 && `The invoice is in the documents of ${splitDone.docs} shipment${splitDone.docs !== 1 ? "s" : ""}.`,
          ]
            .filter(Boolean)
            .join(" ")
      : savedDocNames.length > 0
        ? `The extracted data has been saved, and ${savedDocNames.join(", ")} ${savedDocNames.length === 1 ? "is" : "are"} in the shipment's documents.`
        : "The extracted data has been saved.";

  // ─── Input handling ──────────────────────────────────────────────
  const beforeUpload = (file: File) => {
    if (destination === "masterjob" || destination === "shipment") {
      const setFiles = destination === "masterjob" ? setMasterFiles : setShipmentFiles;
      fileToBase64(file)
        .then((base64) => {
          // The same file dropped twice is kept once.
          setFiles((prev) =>
            prev.some((f) => f.name === file.name && f.size === file.size)
              ? prev
              : [
                  ...prev,
                  { uid: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, type: file.type, base64 },
                ],
          );
          setError(null);
        })
        .catch(() => setError(`Could not read ${file.name}.`));
      return false;
    }
    fileToBase64(file)
      .then((b64) => {
        setFileBase64(b64);
        setFileName(file.name);
        setFileMeta({ type: file.type, size: file.size });
        setError(null);
      })
      .catch(() => setError("Could not read the selected file."));
    return false;
  };

  // A pre-alert and a Shipments read take several files; the other reads take one.
  const severalFiles = destination === "masterjob" || destination === "shipment";
  const masterFilesSize = masterFiles.reduce((sum, f) => sum + f.size, 0);
  const masterFilesTooLarge = masterFilesSize > MASTER_FILES_MAX_BYTES;

  // The same limit the API applies to pasted text (extractText.controller.ts).
  const textMaxLength = destination === "quote" ? 6000 : 1500;

  const canExtract = (() => {
    const textLength = textInput.trim().length;
    const hasInput = inputMode === "file" ? !!fileBase64 : textLength >= 10 && textLength <= textMaxLength;
    if (destination === "invoicing") return hasInput && (invoiceToMaster ? invoiceTicked.size > 0 : !!invoiceTargetShipmentId);
    if (destination === "quote") return hasInput && quoteReading.ready;
    if (destination === "booking") return hasInput && (bookingMode === "new" || !!bookingMasterJob);
    if (destination === "customs") return hasInput && !!customsShipmentId;
    if (destination === "masterjob") return masterFiles.length > 0 && !masterFilesTooLarge && !!activeMcz;
    const hasShipmentInput = inputMode === "file" ? shipmentFiles.length > 0 : hasInput;
    return hasShipmentInput && (shipmentMode === "new" || !!targetShipmentId);
  })();

  // ─── Extraction ──────────────────────────────────────────────────
  const handleExtract = async () => {
    setStep("extracting");
    setError(null);
    // A new read starts from its own name and type, not ones edited for an earlier file.
    setSaveDocument(true);
    setDocNameEdit(null);
    setDocTypeEdit(null);
    setSavedDocNames([]);
    setSplitPreview(null);
    setSplitOverwrite(new Set());
    setSplitDone(null);
    try {
      if (destination === "shipment") {
        // Each file is read on its own, then all of them are merged into one review.
        const reads: { file?: UploadedFile; values: Record<string, string>; method: string }[] = [];
        if (inputMode === "file") {
          for (const file of shipmentFiles) {
            try {
              const result = await api.extraction.extractDocument({ fileBase64: file.base64, fileName: file.name });
              reads.push({ file, values: normalizeExtracted(result.extracted), method: result.method });
            } catch (err) {
              throw new Error(`${file.name} could not be read: ${apiErrorMessage(err)}`);
            }
          }
        } else {
          const result = await api.extraction.extractText({ text: textInput.trim(), destination: "shipment" });
          reads.push({ values: normalizeExtracted(result.extracted), method: result.method });
        }
        const merged = mergeReads(reads.map((r) => ({ source: r.file?.name ?? "text", values: r.values })));
        const target = shipmentMode === "existing" ? shipments.find((s) => s.id === targetShipmentId) : undefined;
        setFields(
          buildFields(merged.values, (label) => {
            const apiField = SHIPMENT_FIELD_MAP[label];
            return target && apiField ? getFieldValue(target, apiField) : "";
          }).map((f) => {
            const choices = merged.choices[f.column];
            // Where the files disagree, nothing is written until the user picks or ticks a value.
            return choices ? { ...f, choices, approved: false } : f;
          }),
        );
        setShipmentDocs(
          reads.flatMap((r) =>
            r.file ? [{ file: r.file, fields: recordToFields(r.values), save: true, nameEdit: null, typeEdit: null }] : [],
          ),
        );
        setExtractionMethod([...new Set(reads.map((r) => r.method))].join(", "));
        setStep("review");
      } else if (destination === "invoicing") {
        const result =
          inputMode === "file"
            ? await api.extraction.extractInvoice({ fileBase64, fileName })
            : await api.extraction.extractText({ text: textInput.trim(), destination: "invoicing" });
        const extracted = result.extracted as InvoiceExtracted;
        setInvoiceData(extracted);
        // The reader suggests a charge code; one the picker does not offer is not taken.
        const suggested = toChargeCode(extracted.service_type || "");
        setInvoiceCategory(chargeOptions().some((c) => c.value === suggested) ? suggested : "");
        setStep("review");
      } else if (destination === "customs") {
        const result =
          inputMode === "file"
            ? await api.extraction.extractCustoms({ fileBase64, fileName })
            : await api.extraction.extractText({ text: textInput.trim(), destination: "customs" });
        if (Object.keys(result.extracted).length === 0) throw new Error("No customs data found in this document.");
        const target = shipments.find((s) => s.id === customsShipmentId);
        const targetContainers = (target?.containers ?? []).map((c) => c.containerNumber).filter(Boolean);
        setFields(
          buildFields(result.extracted, (label) => {
            if (!target) return "";
            if (label === "MRN Number") return target.mrn || "";
            if (label === "Container Number") return targetContainers.join(", ");
            return getFieldValue(target, SHIPMENT_FIELD_MAP[label] ?? "");
          }).map((f) => {
            // Container numbers are only ever added, so they never clash with the ones on file;
            // a weight differing only in decimals (12.5 vs 12.500) is the same weight.
            const sameWeight =
              f.column === "Total Weight In Tons" && parseFloat(f.extractedValue) === parseFloat(f.existingValue);
            const hasConflict = f.column === "Container Number" || sameWeight ? false : f.hasConflict;
            // Only the MRN is ticked up front; everything else waits for the user to tick it.
            return { ...f, hasConflict, approved: f.column === "MRN Number" && !hasConflict };
          }),
        );
        setExtractionMethod(result.method);
        setStep("review");
      } else if (destination === "booking") {
        const result =
          inputMode === "file"
            ? await api.extraction.extractBooking({ fileBase64, fileName })
            : await api.extraction.extractText({ text: textInput.trim(), destination: "booking" });
        const normalized = withBookingEquipment(normalizeExtracted(result.extracted));
        // Freight Mode is derived for shipments; a booking leaves the master job's own.
        delete normalized["Freight Mode"];
        setFields(buildFields(normalized, (label) => bookingExistingValue(bookingMasterJob, label)));
        setExtractionMethod(result.method);
        setStep("review");
      } else if (destination === "quote") {
        await quoteReading.read(inputMode === "file" ? { fileBase64, fileName } : { text: textInput.trim() });
        setStep("review");
      } else {
        // masterjob — Phase 1: prepare + classify. A new batch starts on the next free MCZ.
        setBatchMcz("");
        setMblFiled(false);
        setMasterCreatedJobs([]);
        setPipelineStep("idle");
        const prep = await api.extraction.pipelinePrepare({
          files: masterFiles.map((f) => ({ fileBase64: f.base64, fileName: f.name })),
        });
        setPreparedFiles(prep.files);
        setPipelineSessionId(prep.sessionId);
        setClassification(prep.classification);
        setHblCount(prep.hblCount);
        setPipelineStep("classified");
        setStep("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed. Please try again.");
      setStep("upload");
    }
  };

  // ─── Field toggles ───────────────────────────────────────────────
  const toggleField = (i: number) =>
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, approved: !f.approved } : f)));
  const editField = (i: number, value: string) =>
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, extractedValue: value } : f)));
  // A value picked from the ones the files gave is meant to be written, so it is ticked.
  const pickField = (i: number, value: string) =>
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, extractedValue: value, approved: true } : f)));
  const setAll = (approved: boolean) => setFields((prev) => prev.map((f) => ({ ...f, approved })));

  // ─── Commit: shipment ────────────────────────────────────────────
  const commitShipment = async () => {
    const approved = fieldsToLabelValues(fields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    if (docNameMissing) return toast.warning("Enter a file name for the document, or untick saving it.");
    const newContainers = containerRowsFromNumbers(parseContainerNumbers(approved["Container Number"]));
    let shipmentId = targetShipmentId;
    let jobNumber = "";
    try {
      if (shipmentMode === "existing") {
        const target = shipments.find((s) => s.id === targetShipmentId);
        let data = toShipmentUpdate(approved);
        data = await withPartyLinks(data, async () => target ?? (await api.shipments.shipmentGet(targetShipmentId)).shipment, keptPartyDetails);
        // Append extracted containers to the shipment's existing rows (never replace).
        if (newContainers.length > 0) data.containers = [...(target?.containers ?? []), ...newContainers];
        // An approved package type goes onto all of the shipment's containers and cargo lines.
        if (approved["Type Of Packages"] && !data.containers?.length && target?.containers?.length) {
          data.containers = target.containers;
        }
        data = withContainerType(data, approved);
        data = withCargoLine(data, approved, target?.cargoItems ?? []);
        data = withPackageType(data, approved["Type Of Packages"], target?.cargoItems ?? []);
        await updateShipment({ id: targetShipmentId, data });
        jobNumber = target?.jobNumber || "";
      } else {
        const created = await createShipment(baseCreatePayload());
        shipmentId = created.shipment.id;
        let data = await withPartyLinks(toShipmentUpdate(approved), async () => created.shipment, keptPartyDetails);
        if (newContainers.length > 0) data.containers = newContainers;
        data = withContainerType(data, approved);
        data = withCargoLine(data, approved);
        data = withPackageType(data, approved["Type Of Packages"]);
        await updateShipment({ id: created.shipment.id, data });
        // The number the server gave the shipment (a parallel create may have taken the preview).
        jobNumber = created.shipment.jobNumber;
      }
      setCommittedJobNumber(jobNumber);
    } catch {
      return toast.error("Failed to write shipment data.");
    }
    const saved: string[] = [];
    for (const d of shipmentDocViews) {
      if (!d.save) continue;
      const doc = { base64: d.file.base64, type: d.file.type, size: d.file.size, name: d.name.trim(), documentType: d.type };
      if (await saveReadDocument(shipmentId, jobNumber, doc)) saved.push(doc.name);
    }
    setSavedDocNames(saved);
    setStep("committed");
  };

  // Saves a read file to the shipment's documents: by default the one shown on Review, when the
  // user left it ticked. The shipment's customs status follows its documents as for any other
  // upload. A failure doesn't undo the fields already written. True when a document was saved.
  const saveReadDocument = async (
    shipmentId: string,
    jobNumber: string,
    doc = docToSave && saveDocument ? { ...docToSave, name: docName.trim(), documentType: docType } : null,
  ): Promise<boolean> => {
    if (!doc) return false;
    const name = doc.name;
    try {
      await api.shipments.attachmentCreate(shipmentId, {
        fileName: name,
        fileSize: doc.size,
        fileType: doc.type || "application/octet-stream",
        contentBase64: doc.base64,
        documentType: doc.documentType,
      });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      queryClient.invalidateQueries({ queryKey: shipmentAttachmentsKey(shipmentId) });
      return true;
    } catch {
      toast.error(`The fields were written, but ${name} could not be saved to ${jobNumber || "the shipment"}. Add it on its Documents tab.`);
      return false;
    }
  };

  // ─── Commit: invoicing ───────────────────────────────────────────
  const commitInvoice = async () => {
    if (!invoiceCategory) return toast.warning("Please select a cost category.");
    if (!invoiceTargetShipmentId) return toast.warning("Please select a target shipment.");
    try {
      const params: Parameters<typeof api.invoicing.invoicingUpsertCost>[1] = {
        category: invoiceCategory,
        realCurrency: normalizeCurrency(invoiceData.currency),
        invoiceNumber: invoiceData.invoice_number || "",
        vendor: invoiceData.vendor || "",
      };
      // realAmount is a numeric column — only send it when non-empty.
      if (invoiceData.total_amount) params.realAmount = invoiceData.total_amount;
      await api.invoicing.invoicingUpsertCost(invoiceTargetShipmentId, params);
      setCommittedJobNumber(shipments.find((s) => s.id === invoiceTargetShipmentId)?.jobNumber || "");
      setStep("committed");
    } catch {
      toast.error("Failed to save invoicing data.");
    }
  };

  // While the user reviews a master job's invoice: each ticked shipment's part, and the real
  // cost it already has under the charge (asked of the server without writing anything).
  useEffect(() => {
    if (step !== "review" || !invoiceToMaster || !splitReady || !splitRequest) {
      setSplitPreview(null);
      return;
    }
    let cancelled = false;
    setSplitPreview(null);
    setSplitError("");
    api.invoicing
      .invoicingSplitCost({ ...splitRequest, dryRun: true })
      .then(({ lines }) => !cancelled && setSplitPreview(lines))
      .catch((err) => !cancelled && setSplitError(apiErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [step, invoiceToMaster, splitReady, splitRequest]);

  // ─── Commit: invoice split over a master job ─────────────────────
  const commitMasterInvoice = async () => {
    if (!splitRequest || !splitReady || splitSaving) return;
    if (docNameMissing) return toast.warning("Enter a file name for the document, or untick saving it.");
    setSplitSaving(true);
    try {
      const { lines } = await api.invoicing.invoicingSplitCost({ ...splitRequest, overwriteShipmentIds: [...splitOverwrite] });
      const jobOf = (id: string) => invoiceRows.find((r) => r.shipmentId === id)?.jobNumber ?? id;
      const written = lines.filter((l) => l.written);
      for (const l of written) queryClient.invalidateQueries({ queryKey: ["invoicing", l.shipmentId] });
      // The invoice goes to the documents of each shipment it was posted to.
      let docs = 0;
      for (const l of written) if (await saveReadDocument(l.shipmentId, jobOf(l.shipmentId))) docs += 1;
      setSplitDone({
        written: written.map((l) => jobOf(l.shipmentId)),
        kept: lines.filter((l) => !l.written).map((l) => jobOf(l.shipmentId)),
        docs,
      });
      setStep("committed");
    } catch (err) {
      toast.error(`Failed to split the invoice: ${apiErrorMessage(err)}`);
    } finally {
      setSplitSaving(false);
    }
  };

  // ─── Commit: customs ─────────────────────────────────────────────
  const commitCustoms = async () => {
    const approved = fieldsToLabelValues(fields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    try {
      const target = shipments.find((s) => s.id === customsShipmentId);
      const data = await withPartyLinks(
        toShipmentUpdate(approved),
        async () => target ?? (await api.shipments.shipmentGet(customsShipmentId)).shipment,
        keptPartyDetails,
      );
      if (approved["MRN Number"]) data.mrn = approved["MRN Number"];
      // Add only the containers the shipment doesn't have yet (never replace).
      const existing = target?.containers ?? [];
      const known = new Set(existing.map((c) => c.containerNumber));
      const added = containerRowsFromNumbers(
        parseContainerNumbers(approved["Container Number"]).filter((n) => !known.has(n)),
      );
      if (added.length > 0) data.containers = [...existing, ...added];
      await updateShipment({ id: customsShipmentId, data });
      setCommittedJobNumber(target?.jobNumber || "");
      setStep("committed");
    } catch {
      toast.error("Failed to write the customs data to the shipment.");
    }
  };

  // ─── Commit: booking confirmation ────────────────────────────────
  const handleCommitBooking = async () => {
    if (bookingSaving) return;
    const approved = fieldsToLabelValues(fields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    // Checked before anything is created, so a bad date never leaves an empty master job behind.
    const badDates = invalidBookingDates(approved);
    if (badDates.length > 0) {
      return toast.error(`Not a full date (DD.MM.YYYY): ${badDates.join(", ")}. Correct it or untick it.`);
    }
    setBookingSaving(true);
    try {
      const target = bookingMasterJob ?? bookingCreated ?? (await createMasterJob.mutateAsync()).masterJob;
      if (!bookingMasterJob) setBookingCreated({ id: target.id, mczNumber: target.mczNumber });
      // The master job saves its details onto its shipments too (masterJobSync).
      const data = bookingToMasterJobUpdate(approved);
      if (Object.keys(data).length > 0) await updateMasterJob.mutateAsync({ id: target.id, data });
      setCommittedJobNumber(target.mczNumber);
      setStep("committed");
    } catch (err) {
      toast.error(`Failed to save the booking: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setBookingSaving(false);
    }
  };

  // ─── Master job pipeline ─────────────────────────────────────────
  // Each shipment of a pre-alert starts from its own document name and type.
  const loadMasterFields = (record: Record<string, string> | undefined) => {
    setMasterFields(record ? recordToFields(record) : []);
    setSaveDocument(true);
    setDocNameEdit(null);
    setDocTypeEdit(null);
  };

  // A batch's House B/L documents, one per shipment (none from a server that sends none).
  const batchDocs = (res: interfaces.ExtractHblResult) => (res.shipments ?? []).map((_, i) => res.documents?.[i] ?? null);

  const startMasterExtraction = async () => {
    setPipelineStep("extracting");
    setError(null);
    try {
      const mbl = await api.extraction.pipelineExtractMbl({ sessionId: pipelineSessionId }).catch(() => null);
      if (mbl?.mblInfo) {
        const info = normalizeExtracted(mbl.mblInfo);
        setMblInfo(info);
        setMblTicked(mblDefaultTicks(info));
        setMblFiled(false);
      }

      const hbl = await api.extraction.pipelineExtractHbl({ sessionId: pipelineSessionId, batchIndex: 0 });
      const extracted = (hbl.shipments || []).map(normalizeExtracted);
      setMasterShipments(extracted);
      setMasterDocs(batchDocs(hbl));
      setMasterDocsSaved(0);
      setHblBatchIndex(1);
      setHblTotalBatches(hbl.totalBatches || 1);
      setMasterIdx(0);
      setMasterCreatedJobs([]);
      loadMasterFields(extracted[0]);
      setPipelineStep("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract shipments.");
      setPipelineStep("classified");
    }
  };

  // Reads the current session and batch, so the prefetch below always asks for the right one.
  const loadNextBatch = useCallback(async () => {
    if (hblLoading || hblBatchIndex >= hblTotalBatches) return;
    setHblLoading(true);
    setError(null);
    try {
      const res = await api.extraction.pipelineExtractHbl({ sessionId: pipelineSessionId, batchIndex: hblBatchIndex });
      setMasterShipments((prev) => [...prev, ...(res.shipments || []).map(normalizeExtracted)]);
      setMasterDocs((prev) => [...prev, ...batchDocs(res)]);
      setHblBatchIndex((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load next batch.");
    }
    setHblLoading(false);
  }, [hblLoading, hblBatchIndex, hblTotalBatches, pipelineSessionId]);

  const advanceMaster = () => {
    const nextIdx = masterIdx + 1;
    if (nextIdx < masterShipments.length) {
      setMasterIdx(nextIdx);
      loadMasterFields(masterShipments[nextIdx]);
    } else if (hblBatchIndex >= hblTotalBatches) {
      // Reviewed the last shipment and every batch is loaded → done.
      setStep("committed");
    } else {
      // Outran the loader: park at the boundary and wait for the next batch.
      setMasterIdx(nextIdx);
      setMasterFields([]);
      setWaitingForBatch(true);
    }
  };

  // Auto-prefetch the next batch in the background, keeping ~one batch buffered
  // ahead of the reviewer so the next three load while they work on the current.
  useEffect(() => {
    if (pipelineStep !== "ready" || hblLoading || hblBatchIndex >= hblTotalBatches) return;
    if (masterShipments.length - masterIdx <= HBL_PREFETCH_AHEAD) {
      void loadNextBatch();
    }
  }, [pipelineStep, hblLoading, hblBatchIndex, hblTotalBatches, masterShipments.length, masterIdx, loadNextBatch]);

  // Resolve a "waiting for next batch" pause once more shipments arrive (or finish).
  useEffect(() => {
    if (!waitingForBatch) return;
    if (masterIdx < masterShipments.length) {
      setWaitingForBatch(false);
      loadMasterFields(masterShipments[masterIdx]);
    } else if (hblBatchIndex >= hblTotalBatches && !hblLoading) {
      setWaitingForBatch(false);
      setStep("committed");
    }
  }, [waitingForBatch, masterShipments, masterIdx, hblBatchIndex, hblTotalBatches, hblLoading]);

  // Files the ticked MBL details onto the master job — once per batch, right after its first
  // shipment is linked, so the master job exists and its synced fields reach that shipment too.
  // A failure here doesn't undo the shipment; the user is told and can fill in MBL Details by hand.
  const fileMblToMasterJob = async (masterJobId: string) => {
    if (!mblInfo) return;
    try {
      let data = mblToMasterJobUpdate(mblInfo, mblTicked);
      if (mblLoadTypeLocked) delete data.loadType;
      data = await withPartyLinks(data, async () => (await api.shipments.masterJobGet(masterJobId)).masterJob);
      if (Object.keys(data).length > 0) await api.shipments.masterJobUpdate(masterJobId, data);

      const added = mblTicked[MBL_CONTAINERS_LABEL] ? mblContainers(mblInfo) : [];
      if (added.length > 0) {
        const current = await api.shipments.masterJobGet(masterJobId);
        // A Full Load master job reads its containers from the shipments.
        if (current.masterJob.loadType !== FULL_LOAD) {
          const known = new Set(current.containers.map((c) => c.containerNumber));
          const fresh = added.filter((c) => !known.has(c.containerNumber));
          if (fresh.length > 0) {
            await api.shipments.masterJobContainersUpdate(masterJobId, { containers: [...current.containers, ...fresh] });
          }
        }
      }
      setMblFiled(true);
      queryClient.invalidateQueries({ queryKey: ["master-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    } catch (err) {
      toast.error(`MBL details could not be filed to the master job: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  };

  const validateAndCreate = async () => {
    if (!activeMcz) return toast.warning("No MCZ number available.");
    const approved = fieldsToLabelValues(masterFields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    if (docNameMissing) return toast.warning("Enter a file name for the document, or untick saving it.");
    try {
      const created = await createShipment(baseCreatePayload());
      let data = await withPartyLinks(toShipmentUpdate(approved), async () => created.shipment, keptPartyDetails);
      const newContainers = containerRowsFromNumbers(parseContainerNumbers(approved["Container Number"]));
      if (newContainers.length > 0) data.containers = newContainers;
      data = withContainerType(data, approved);
      data = withCargoLine(data, approved);
      data = withPackageType(data, approved["Type Of Packages"]);
      await updateShipment({ id: created.shipment.id, data });
      const linked = await linkMasterJob({ shipmentId: created.shipment.id, mczNumber: activeMcz });
      if (masterMode === "new") setBatchMcz(activeMcz);
      if (!mblFiled && linked.shipment.masterJobId) await fileMblToMasterJob(linked.shipment.masterJobId);
      if (await saveReadDocument(created.shipment.id, created.shipment.jobNumber)) setMasterDocsSaved((n) => n + 1);
      setMasterCreatedJobs((prev) => [...prev, created.shipment.jobNumber]);
      advanceMaster();
    } catch {
      toast.error("Failed to create shipment.");
    }
  };

  const toggleMasterField = (i: number) =>
    setMasterFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, approved: !f.approved } : f)));
  const editMasterField = (i: number, value: string) =>
    setMasterFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, extractedValue: value } : f)));

  // ─── Reset ───────────────────────────────────────────────────────
  const reset = () => {
    setStep("upload");
    setInputMode("file");
    setError(null);
    setFileBase64("");
    setFileName("");
    setFileMeta({ type: "", size: 0 });
    setSaveDocument(true);
    setDocNameEdit(null);
    setDocTypeEdit(null);
    setSavedDocNames([]);
    setMasterFiles([]);
    setShipmentFiles([]);
    setShipmentDocs([]);
    setPreparedFiles([]);
    setTextInput("");
    setFields([]);
    setExtractionMethod("");
    setShipmentMode("existing");
    setTargetShipmentId("");
    setCommittedJobNumber("");
    quoteReading.reset();
    setCustomsShipmentId("");
    setBookingMode("new");
    setBookingMcz("");
    setBookingCreated(null);
    setInvoiceData({});
    setInvoiceCategory("");
    setInvoiceTargetShipmentId("");
    setInvoiceTarget("shipment");
    setInvoiceMcz("");
    setInvoiceUnticked(new Set());
    setSplitMethod(null);
    setSplitOverwrite(new Set());
    setSplitPreview(null);
    setSplitError("");
    setSplitDone(null);
    setMasterMode("new");
    setMasterMczExisting("");
    setBatchMcz("");
    setPipelineSessionId("");
    setPipelineStep("idle");
    setClassification({});
    setMblInfo(null);
    setMblTicked({});
    setMblFiled(false);
    setMasterShipments([]);
    setMasterIdx(0);
    setMasterFields([]);
    setMasterCreatedJobs([]);
    setMasterDocs([]);
    setMasterDocsSaved(0);
    setHblBatchIndex(0);
    setHblTotalBatches(0);
    setHblLoading(false);
    setWaitingForBatch(false);
  };

  const stepIndex = { upload: 0, extracting: 1, review: 2, committed: 3 }[step];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4">
        <Steps
          size="small"
          current={stepIndex}
          items={[{ title: "Upload" }, { title: "Extract" }, { title: "Review" }, { title: "Done" }]}
        />
      </div>

      {/* ─── STEP: Upload ─── */}
      {step === "upload" && (
        <Card>
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-500 mb-2">Extract to</div>
            <Segmented
              value={destination}
              onChange={(v) => {
                setDestination(v as Destination);
                setError(null);
                setBatchMcz("");
                setBookingCreated(null);
              }}
              options={DESTINATION_OPTIONS as unknown as { value: string; label: string }[]}
            />
            <p className="mt-2 mb-0 text-xs text-slate-400">{DESTINATION_HINT[destination]}</p>
          </div>

          {/* Target selectors */}
          {destination === "shipment" && (
            <div className="mb-4">
              <Radio.Group
                value={shipmentMode}
                onChange={(e) => setShipmentMode(e.target.value)}
                className="mb-2"
              >
                <Radio value="existing">Add to existing shipment</Radio>
                <Radio value="new">Create new shipment</Radio>
              </Radio.Group>
              {shipmentMode === "existing" ? (
                <Select
                  showSearch
                  className="w-full"
                  placeholder="Select shipment…"
                  value={targetShipmentId || undefined}
                  onChange={(v) => setTargetShipmentId(v || "")}
                  options={shipmentOptions}
                  filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                />
              ) : (
                <Tag color="cyan" className="font-mono text-sm py-1 px-2">
                  {newShipmentPreview} (will be assigned)
                </Tag>
              )}
            </div>
          )}

          {destination === "invoicing" && (
            <div className="mb-4">
              <Radio.Group value={invoiceTarget} onChange={(e) => setInvoiceTarget(e.target.value)} className="mb-3">
                <Radio value="shipment">One shipment</Radio>
                <Radio value="masterjob">Master Job</Radio>
              </Radio.Group>
              {invoiceTarget === "shipment" ? (
                <>
                  <div className="text-xs font-medium text-slate-500 mb-1.5">Target shipment for invoice costs</div>
                  <Select
                    showSearch
                    className="w-full"
                    placeholder="Select shipment…"
                    value={invoiceTargetShipmentId || undefined}
                    onChange={(v) => setInvoiceTargetShipmentId(v || "")}
                    options={shipmentOptions}
                    filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                  />
                </>
              ) : (
                <>
                  <div className="text-xs font-medium text-slate-500 mb-1.5">Master Job Number</div>
                  {existingMcz.length === 0 ? (
                    <div className="text-xs italic text-slate-400">No existing MCZ numbers found.</div>
                  ) : (
                    <Select
                      showSearch
                      className="w-full !mb-4"
                      placeholder="Select master job…"
                      value={invoiceMcz || undefined}
                      onChange={(v) => {
                        setInvoiceMcz(v || "");
                        setInvoiceUnticked(new Set());
                      }}
                      options={existingMcz.map((m) => ({ value: m, label: m }))}
                    />
                  )}
                  {invoiceMcz && (
                    <MasterInvoiceShipments
                      rows={invoiceRows}
                      ticked={invoiceTicked}
                      onTick={tickInvoiceShipment}
                      onTickAll={(on) => setInvoiceUnticked(on ? new Set() : new Set(invoiceRows.map((r) => r.shipmentId)))}
                      method={splitMethod}
                      onMethod={setSplitMethod}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {destination === "customs" && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-1.5">Internal Reference (required)</div>
              <Select
                showSearch
                className="w-full"
                placeholder="Select shipment…"
                value={customsShipmentId || undefined}
                onChange={(v) => setCustomsShipmentId(v || "")}
                options={shipmentOptions}
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </div>
          )}

          {destination === "quote" && <QuoteTarget reading={quoteReading} />}

          {destination === "booking" && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-1.5">Master Job Number</div>
              <Radio.Group
                value={bookingMode}
                onChange={(e) => {
                  setBookingMode(e.target.value);
                  setBookingCreated(null);
                }}
                className="mb-2"
              >
                <Radio value="new">Create new Master Job</Radio>
                <Radio value="existing">Add to existing</Radio>
              </Radio.Group>
              {bookingMode === "new" ? (
                <Tag color="gold" className="font-mono text-sm py-1 px-2">
                  {newMcz} (will be assigned)
                </Tag>
              ) : existingMcz.length === 0 ? (
                <div className="text-xs italic text-slate-400">No existing MCZ numbers found.</div>
              ) : (
                <Select
                  showSearch
                  className="w-full"
                  placeholder="Select existing MCZ…"
                  value={bookingMcz || undefined}
                  onChange={(v) => setBookingMcz(v || "")}
                  options={existingMcz.map((m) => ({ value: m, label: m }))}
                />
              )}
            </div>
          )}

          {destination === "masterjob" && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-1.5">Master Job Number</div>
              <Radio.Group
                value={masterMode}
                onChange={(e) => {
                  setMasterMode(e.target.value);
                  setBatchMcz("");
                }}
                className="mb-2"
              >
                <Radio value="new">Create new Master Job</Radio>
                <Radio value="existing">Add to existing</Radio>
              </Radio.Group>
              {masterMode === "new" ? (
                <Tag color="gold" className="font-mono text-sm py-1 px-2">
                  {newMcz} (will be assigned)
                </Tag>
              ) : existingMcz.length === 0 ? (
                <div className="text-xs italic text-slate-400">No existing MCZ numbers found.</div>
              ) : (
                <Select
                  className="w-full"
                  placeholder="Select existing MCZ…"
                  value={masterMczExisting || undefined}
                  onChange={(v) => setMasterMczExisting(v || "")}
                  options={existingMcz.map((m) => ({ value: m, label: m }))}
                />
              )}
            </div>
          )}

          {/* Input mode */}
          {destination !== "masterjob" && (
            <div className="mb-3">
              <Segmented
                size="small"
                value={inputMode}
                onChange={(v) => {
                  setInputMode(v as InputMode);
                  setError(null);
                }}
                options={[
                  { value: "file", label: "Upload File" },
                  { value: "text", label: "Paste Text" },
                ]}
              />
            </div>
          )}

          {inputMode === "file" || destination === "masterjob" ? (
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              beforeUpload={beforeUpload}
              showUploadList={false}
              multiple={severalFiles}
              maxCount={severalFiles ? undefined : 1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                {severalFiles
                  ? "Click or drag files (PDF, JPG, PNG) — you can add several"
                  : fileName || "Click or drag a file (PDF, JPG, PNG)"}
              </p>
              <p className="ant-upload-hint">
                {destination === "invoicing"
                  ? "Invoice, Debit Note, Freight Bill, Customs Declaration…"
                  : destination === "quote"
                    ? "Inquiry email saved as PDF, rate request, packing list…"
                  : destination === "customs"
                    ? "Export / import declaration, transit document (T1), customs release…"
                    : destination === "masterjob"
                    ? "Pre-alert / manifest with multiple Bills of Lading. All files go under one master job."
                    : destination === "booking"
                    ? "Booking confirmation, booking note, release order…"
                    : "Bill of Lading, Sea Waybill, Booking Confirmation… Several files are read together into one shipment."}
              </p>
            </Upload.Dragger>
          ) : (
            <Input.TextArea
              rows={6}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste shipping data, email content, or any text with relevant details…"
              maxLength={textMaxLength}
              showCount
            />
          )}

          {destination === "masterjob" && masterFiles.length > 0 && (
            <UploadedFileList files={masterFiles} onRemove={(uid) => setMasterFiles((prev) => prev.filter((f) => f.uid !== uid))} />
          )}
          {destination === "shipment" && inputMode === "file" && shipmentFiles.length > 0 && (
            <UploadedFileList files={shipmentFiles} onRemove={(uid) => setShipmentFiles((prev) => prev.filter((f) => f.uid !== uid))} />
          )}
          {destination === "masterjob" && masterFilesTooLarge && (
            <Alert
              className="mt-3"
              type="warning"
              showIcon
              message={`The files add up to ${formatFileSize(masterFilesSize)}; at most ${formatFileSize(MASTER_FILES_MAX_BYTES)} can be read in one go. Remove some and read them as a second batch with "Add to existing".`}
            />
          )}

          {error && <Alert className="mt-3" type="error" showIcon message={error} />}

          <Button type="primary" className="mt-4" disabled={!canExtract} onClick={handleExtract}>
            {destination === "masterjob" ? "Extract Pre-Alert" : "Extract Data"}
          </Button>
        </Card>
      )}

      {/* ─── STEP: Extracting ─── */}
      {step === "extracting" && (
        <Card>
          <div className="text-center py-10">
            <Spin size="large" />
            <p className="mt-4 mb-0 text-slate-500">Analyzing document and extracting data…</p>
            {destination === "masterjob" ? (
              <p className="mt-1 mb-0 text-xs text-slate-400">
                {masterFiles.length} file{masterFiles.length === 1 ? "" : "s"}: {masterFiles.map((f) => f.name).join(", ")}
              </p>
            ) : destination === "shipment" ? (
              inputMode === "file" && (
                <p className="mt-1 mb-0 text-xs text-slate-400">
                  {shipmentFiles.length} file{shipmentFiles.length === 1 ? "" : "s"}: {shipmentFiles.map((f) => f.name).join(", ")}
                </p>
              )
            ) : (
              fileName && <p className="mt-1 mb-0 text-xs text-slate-400">{fileName}</p>
            )}
          </div>
        </Card>
      )}

      {/* ─── STEP: Review — shipment / customs / booking ─── */}
      {step === "review" && (destination === "shipment" || destination === "customs" || destination === "booking") && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <Space size="small" wrap>
              <span className="text-sm font-semibold">{fields.length} fields extracted</span>
              {extractionMethod && <Tag>{extractionMethod}</Tag>}
              {conflictCount > 0 && <Tag color="orange">{conflictCount} conflict{conflictCount > 1 ? "s" : ""}</Tag>}
              {differCount > 0 && (
                <Tag color="gold">
                  Files differ on {differCount} field{differCount > 1 ? "s" : ""} — pick a value
                </Tag>
              )}
            </Space>
            <Space>
              <Button size="small" onClick={() => setAll(true)}>Approve All</Button>
              <Button size="small" onClick={() => setAll(false)}>Reject All</Button>
            </Space>
          </div>
          {error && <Alert className="mb-3" type="error" showIcon message={error} />}
          <FieldReviewTable fields={fields} onToggle={toggleField} editable onEdit={editField} onPick={pickField} />
          {shipmentDocViews.map((d) => (
            <SaveDocumentBox
              key={d.file.uid}
              title={shipmentDocViews.length > 1 ? `Save ${d.file.name} to the shipment's documents` : undefined}
              checked={d.save}
              onCheck={(save) => editShipmentDoc(d.file.uid, { save })}
              name={d.name}
              onName={(nameEdit) => editShipmentDoc(d.file.uid, { nameEdit })}
              hint={d.hint}
              type={d.type}
              onType={(typeEdit) => editShipmentDoc(d.file.uid, { typeEdit })}
            />
          ))}
          {docToSave && (
            <SaveDocumentBox
              checked={saveDocument}
              onCheck={setSaveDocument}
              name={docName}
              onName={setDocNameEdit}
              hint={docHint}
              type={docType}
              onType={setDocTypeEdit}
            />
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setStep("upload")}>Back</Button>
            <Button
              type="primary"
              disabled={approvedCount === 0 || docNameMissing}
              onClick={destination === "customs" ? commitCustoms : destination === "booking" ? handleCommitBooking : commitShipment}
              loading={destination === "booking" && bookingSaving}
            >
              Write {approvedCount} field{approvedCount !== 1 ? "s" : ""} to{" "}
              {destination === "booking"
                ? bookingMasterJob?.mczNumber ?? bookingCreated?.mczNumber ?? `${newMcz} (new master job)`
                : destination === "customs"
                  ? shipments.find((s) => s.id === customsShipmentId)?.jobNumber || "shipment"
                  : shipmentMode === "new"
                    ? newShipmentPreview
                    : "shipment"}
            </Button>
          </div>
        </Card>
      )}

      {/* ─── STEP: Review — quote ─── */}
      {step === "review" && destination === "quote" && (
        <QuoteReview reading={quoteReading} onBack={() => setStep("upload")} onWritten={() => setStep("committed")} />
      )}

      {/* ─── STEP: Review — invoicing ─── */}
      {step === "review" && invoiceToMaster && (
        <Card>
          <div className="text-sm font-semibold mb-3">
            Invoice for master job <span className="font-mono">{invoiceMcz}</span>
          </div>
          {error && <Alert className="mb-3" type="error" showIcon message={error} />}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_110px_1fr_1fr] gap-3 mb-4">
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Invoice total <span className="text-red-500">*</span>
              </div>
              <Input
                value={invoiceData.total_amount ?? ""}
                onChange={(e) => setInvoiceData((d) => ({ ...d, total_amount: e.target.value.replace(",", ".") }))}
                status={invoiceTotal > 0 ? undefined : "error"}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">Currency</div>
              <Select
                className="w-full"
                value={invoiceCurrency}
                onChange={(v) => setInvoiceData((d) => ({ ...d, currency: v }))}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">
                Invoice number <span className="text-red-500">*</span>
              </div>
              <Input
                value={invoiceData.invoice_number ?? ""}
                onChange={(e) => setInvoiceData((d) => ({ ...d, invoice_number: e.target.value }))}
                status={invoiceData.invoice_number?.trim() ? undefined : "error"}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1.5">Vendor</div>
              <Input value={invoiceData.vendor ?? ""} onChange={(e) => setInvoiceData((d) => ({ ...d, vendor: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-500 mb-1.5">
              Cost Category <span className="text-red-500">*</span>
            </div>
            <Select
              className="w-72"
              placeholder="Select category…"
              // Every mode's charges: typing finds one.
              showSearch
              optionFilterProp="label"
              value={invoiceCategory || undefined}
              onChange={setInvoiceCategory}
              options={chargeOptions().map((c) => ({
                value: c.value,
                label: c.value === toChargeCode(invoiceData.service_type || "") ? `${c.label} (suggested)` : c.label,
              }))}
            />
          </div>
          <MasterInvoiceShipments
            rows={invoiceRows}
            ticked={invoiceTicked}
            onTick={tickInvoiceShipment}
            onTickAll={(on) => setInvoiceUnticked(on ? new Set() : new Set(invoiceRows.map((r) => r.shipmentId)))}
            method={splitMethod}
            onMethod={setSplitMethod}
            parts={Object.fromEntries((splitPreview ?? []).map((l) => [l.shipmentId, l.amount]))}
            existing={Object.fromEntries((splitPreview ?? []).map((l) => [l.shipmentId, l.existing ?? null]))}
            overwrite={splitOverwrite}
            onOverwrite={(id, on) =>
              setSplitOverwrite((prev) => {
                const next = new Set(prev);
                if (on) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            currency={invoiceCurrency}
          />
          {splitError && <Alert className="mt-3" type="error" showIcon message={splitError} />}
          {docToSave && (
            <SaveDocumentBox
              checked={saveDocument}
              onCheck={setSaveDocument}
              name={docName}
              onName={setDocNameEdit}
              hint={docHint}
              type={docType}
              onType={setDocTypeEdit}
            />
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setStep("upload")}>Back</Button>
            <Button
              type="primary"
              disabled={!splitReady || !splitPreview || !!splitError || docNameMissing}
              loading={splitSaving}
              onClick={commitMasterInvoice}
            >
              Split to {invoiceTicked.size} shipment{invoiceTicked.size !== 1 ? "s" : ""} (Real Cost)
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && destination === "invoicing" && !invoiceToMaster && (
        <Card>
          <div className="text-sm font-semibold mb-3">Invoice data extracted</div>
          {error && <Alert className="mb-3" type="error" showIcon message={error} />}
          <Descriptions
            bordered
            size="small"
            column={2}
            items={Object.entries(invoiceData)
              .filter(([, v]) => v)
              .map(([key, value]) => ({
                key,
                label: INVOICE_FIELD_LABELS[key] || key,
                children:
                  key === "service_type"
                    ? chargeLabel(String(value))
                    : key === "total_amount" && invoiceData.currency
                      ? `${value} ${invoiceData.currency}`
                      : String(value),
              }))}
          />
          <div className="mt-4">
            <div className="text-xs font-medium text-slate-500 mb-1.5">
              Cost Category <span className="text-red-500">*</span>
            </div>
            <Select
              className="w-72"
              placeholder="Select category…"
              // Every mode's charges: typing finds one.
              showSearch
              optionFilterProp="label"
              value={invoiceCategory || undefined}
              onChange={setInvoiceCategory}
              options={chargeOptions().map((c) => ({
                value: c.value,
                label: c.value === toChargeCode(invoiceData.service_type || "") ? `${c.label} (suggested)` : c.label,
              }))}
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setStep("upload")}>Back</Button>
            <Button type="primary" disabled={!invoiceCategory} onClick={commitInvoice}>
              Write to invoicing (Real Cost)
            </Button>
          </div>
        </Card>
      )}

      {/* ─── STEP: Review — master job ─── */}
      {step === "review" && destination === "masterjob" && (
        <Card>
          {pipelineStep === "classified" && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📊</span>
                <h3 className="text-sm font-semibold m-0">Document Analysis Complete</h3>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                {Object.values(classification).reduce((sum, n) => sum + (n || 0), 0)}{" "}
                pages scanned from {preparedFiles.length} file{preparedFiles.length === 1 ? "" : "s"}:
              </p>
              {preparedFiles.length > 0 && (
                <ul className="mb-3 pl-0 list-none flex flex-col gap-1">
                  {preparedFiles.map((f) => (
                    <li key={f.fileName} className="flex items-center gap-2 text-xs text-slate-600">
                      <FileOutlined className="text-slate-400" />
                      <span className="truncate">{f.fileName}</span>
                      <span className="ml-auto shrink-0 text-slate-400">
                        {f.pageCount} page{f.pageCount === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: "Manifest pages", val: classification.MANIFEST || 0 },
                  { label: "House BL pages", val: classification.HBL || 0 },
                  { label: "Master BL pages", val: classification.MBL || 0 },
                  { label: "Commercial invoice pages", val: classification.INVOICE || 0, muted: true },
                  { label: "Packing list pages", val: classification.PACKING_LIST || 0, muted: true },
                  { label: "Skipped", val: classification.SKIP || 0, muted: true },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-50 border border-slate-200"
                  >
                    <span className="text-xs text-slate-500">{c.label}</span>
                    <span className={`text-sm font-semibold ${c.muted ? "text-slate-400" : "text-amber-600"}`}>{c.val}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 mb-4 rounded-md bg-indigo-50 border border-indigo-100">
                <span className="text-xs font-semibold text-indigo-700">
                  House Bills of Lading found — one shipment each
                </span>
                <span className="text-base font-bold text-indigo-700">{hblCount}</span>
              </div>
              {error && <Alert className="mb-3" type="error" showIcon message={error} />}
              <div className="flex gap-2">
                <Button onClick={() => setStep("upload")}>Back</Button>
                <Button type="primary" onClick={startMasterExtraction}>
                  Extract Shipments from Bills of Lading
                </Button>
              </div>
            </div>
          )}

          {pipelineStep === "extracting" && (
            <div className="text-center py-10">
              <Spin size="large" />
              <p className="mt-4 mb-0 text-slate-500">Extracting MBL shared info and Bills of Lading…</p>
            </div>
          )}

          {pipelineStep === "ready" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <Space size="small" wrap>
                  <span className="text-sm font-semibold">
                    Shipment {Math.min(masterIdx + 1, masterShipments.length)} of {masterShipments.length}
                    {hblBatchIndex < hblTotalBatches ? "+" : ""}
                  </span>
                  <Tag color="gold" className="font-mono">{activeMcz}</Tag>
                  <span className="text-xs text-slate-400">{masterCreatedJobs.length} created</span>
                </Space>
              </div>

              {mblInfo && Object.keys(mblInfo).length > 0 && (
                <MblDetailsBox
                  info={mblInfo}
                  ticked={mblTicked}
                  onToggle={(label) => setMblTicked((prev) => ({ ...prev, [label]: !prev[label] }))}
                  filed={mblFiled}
                  mcz={activeMcz}
                  masterJob={currentMasterJob}
                  loadTypeLocked={mblLoadTypeLocked}
                />
              )}

              {error && <Alert className="mb-3" type="error" showIcon message={error} />}

              {waitingForBatch ? (
                <div className="text-center py-10">
                  <Spin />
                  <p className="mt-3 mb-0 text-sm text-slate-500">Loading the next shipments…</p>
                </div>
              ) : (
                <>
                  <FieldReviewTable
                    fields={masterFields}
                    onToggle={toggleMasterField}
                    editable
                    onEdit={editMasterField}
                    showExisting={false}
                    accent="amber"
                  />
                  {docToSave && (
                    <SaveDocumentBox
                      checked={saveDocument}
                      onCheck={setSaveDocument}
                      name={docName}
                      onName={setDocNameEdit}
                      hint={docHint}
                      type={docType}
                      onType={setDocTypeEdit}
                    />
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button onClick={() => setStep("upload")}>Back</Button>
                    <Button onClick={advanceMaster}>Skip</Button>
                    <Button
                      type="primary"
                      disabled={masterFields.filter((f) => f.approved).length === 0 || docNameMissing}
                      onClick={validateAndCreate}
                    >
                      Validate &amp; Create
                      {masterIdx < masterShipments.length - 1 || hblBatchIndex < hblTotalBatches ? " → Next" : ""}
                    </Button>
                  </div>
                </>
              )}

              {hblTotalBatches > 1 && (
                <div className="flex items-center justify-between mt-3 px-3 py-2 rounded-md bg-slate-50 text-xs">
                  <span className="text-slate-500">
                    Batch {Math.min(hblBatchIndex, hblTotalBatches)} of {hblTotalBatches} · {masterShipments.length}{" "}
                    shipments loaded
                  </span>
                  {hblBatchIndex < hblTotalBatches && (
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Spin size="small" /> loading next batch…
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ─── STEP: Committed ─── */}
      {step === "committed" && (
        <Card>
          <Result
            status="success"
            title={successTitle}
            subTitle={successSubtitle}
            extra={
              <Space>
                <Button type="primary" size="large" icon={<ReloadOutlined />} onClick={reset}>
                  New Extraction
                </Button>
                {destination === "quote" && quoteReading.written && <QuoteOpenButton quoteNumber={quoteReading.written.quoteNumber} />}
              </Space>
            }
          />
        </Card>
      )}
    </div>
  );
}

// The server accepts 100 MB per request and the files travel base64-encoded
// (a third larger), so this is the most one batch can carry.
const MASTER_FILES_MAX_BYTES = 70 * 1024 * 1024;

interface UploadedFile {
  uid: string;
  name: string;
  size: number;
  type: string;
  base64: string;
}

// A file read into Shipments, with its own fields (it is named after its own document
// number) and the name and type the user approved for it (null: as read).
interface ShipmentDoc {
  file: UploadedFile;
  fields: ExtractedField[];
  save: boolean;
  nameEdit: string | null;
  typeEdit: string | null;
}

interface UploadedFileListProps {
  files: UploadedFile[];
  onRemove: (uid: string) => void;
}

// The files picked for one read, so it is clear exactly what will be read.
function UploadedFileList({ files, onRemove }: UploadedFileListProps) {
  return (
    <div className="mt-3 border border-slate-200 rounded-lg">
      <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        Uploaded files ({files.length}) · {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
      </div>
      <ul className="m-0 p-0 list-none">
        {files.map((f) => (
          <li key={f.uid} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 text-xs">
            <FileOutlined className="text-indigo-400" />
            <span className="flex-1 min-w-0 truncate text-slate-800 font-medium">{f.name}</span>
            <span className="shrink-0 text-slate-400">{formatFileSize(f.size)}</span>
            <Button
              size="small"
              type="text"
              icon={<DeleteOutlined />}
              aria-label={`Remove ${f.name}`}
              onClick={() => onRemove(f.uid)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SaveDocumentBoxProps {
  checked: boolean;
  onCheck: (checked: boolean) => void;
  name: string;
  onName: (name: string) => void;
  /** Where the file comes from and what it is named after. */
  hint: string;
  type: string;
  onType: (type: string) => void;
  /** Names the file when several are saved; by default "Save the document …". */
  title?: string;
}

// The read file, to be saved to the shipment's documents under its document number. The user
// approves the name and the document type here; both are saved with the fields on Write.
function SaveDocumentBox({ checked, onCheck, name, onName, hint, type, onType, title }: SaveDocumentBoxProps) {
  return (
    <div className="mt-4 border border-slate-200 rounded-lg px-3 py-3">
      <Checkbox checked={checked} onChange={(e) => onCheck(e.target.checked)}>
        <span className="text-sm font-semibold text-slate-800">{title ?? "Save the document to the shipment's documents"}</span>
      </Checkbox>
      {checked && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">
              File name <span className="text-red-500">*</span>
            </div>
            <Input value={name} onChange={(e) => onName(e.target.value)} status={name.trim() ? undefined : "error"} />
            <p className="mt-1 mb-0 text-[11px] text-slate-400">{hint}</p>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Document type</div>
            <Select
              className="w-full"
              value={type}
              onChange={onType}
              options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
            />
            {isReviewedDocumentType(type) && (
              <p className="mt-1 mb-0 text-[11px] text-amber-600">Customs reviews this type of document.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface MblDetailsBoxProps {
  info: Record<string, string>;
  ticked: Record<string, boolean>;
  onToggle: (label: string) => void;
  /** Already filed to the master job — the ticks are shown but locked. */
  filed: boolean;
  mcz: string;
  masterJob?: interfaces.MasterJobItem;
  loadTypeLocked: boolean;
}

// The MBL details read from the pre-alert, each with a tick: ticked ones are filed to the
// master job (once, with the batch's first shipment). When the master job already holds a
// different value, it is shown so the overwrite is visible before saving.
function MblDetailsBox({ info, ticked, onToggle, filed, mcz, masterJob, loadTypeLocked }: MblDetailsBoxProps) {
  const rows = Object.entries(info).filter(([, value]) => value);
  const current = (label: string): string => {
    const field = MBL_TO_MASTER_JOB[label];
    if (!field || !masterJob) return "";
    const v = (masterJob as unknown as Record<string, unknown>)[field];
    return v == null ? "" : String(v);
  };
  const tickedCount = rows.filter(([label]) => ticked[label]).length;
  // A Full Load master job reads its containers from its shipments, so MBL containers aren't added.
  const fullLoad = (masterJob?.loadType || (ticked["Load Type"] ? info["Load Type"] : "")) === FULL_LOAD;

  return (
    <div className="mb-3 border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-800">MBL shared info</span>
        <span className="text-xs text-slate-500">
          {filed
            ? `Filed to ${mcz}`
            : `${tickedCount} ticked — filed to ${mcz} with the first shipment`}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {rows.map(([label, value]) => {
          const cntrDetail = isMblContainerDetail(label);
          const fileable = !cntrDetail && (label in MBL_TO_MASTER_JOB || label === MBL_CONTAINERS_LABEL);
          const locked = label === "Load Type" && loadTypeLocked;
          const existing = current(label);
          return (
            <div key={label} className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 text-xs">
              <span className="w-5 shrink-0 pt-0.5">
                {fileable && !locked && (
                  <Checkbox
                    checked={!!ticked[label]}
                    disabled={filed}
                    onChange={() => onToggle(label)}
                    aria-label={`File ${label} to the master job`}
                  />
                )}
              </span>
              <span className="w-[150px] shrink-0 text-slate-500">{label}</span>
              <span className="flex-1 min-w-0">
                <span className="text-slate-900 font-medium break-words">{value}</span>
                {cntrDetail && <span className="block text-[11px] text-slate-400">Used for the container type</span>}
                {label === MBL_CONTAINERS_LABEL && fullLoad && (
                  <span className="block text-[11px] text-slate-400">Full Load: the containers come from the shipments</span>
                )}
                {locked && (
                  <span className="block text-[11px] text-amber-600">
                    Master job is already {masterJob?.loadType}; Load Type can&apos;t be changed
                  </span>
                )}
                {!locked && existing && existing !== value && fileable && (
                  <span className="block text-[11px] text-slate-400">On master job now: {existing}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
