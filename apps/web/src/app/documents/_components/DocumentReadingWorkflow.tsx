"use client";

import { useEffect, useMemo, useState } from "react";
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
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { fileToBase64 } from "@/lib/files";
import { FULL_LOAD } from "@/lib/enums";
import { existingMczNumbers, nextMczNumber } from "@/lib/mcz";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useShipments, getFieldValue } from "@/hooks/useShipments";
import { useQuotes } from "@/hooks/useQuotes";
import { useCreateMasterJob, useMasterJobs, useUpdateMasterJob } from "@/hooks/useMasterJobs";
import { FieldReviewTable } from "./FieldReviewTable";
import {
  baseCreatePayload,
  bookingExistingValue,
  bookingToMasterJobUpdate,
  invalidBookingDates,
  buildFields,
  withBookingEquipment,
  containerRowsFromNumbers,
  COST_CATEGORY_OPTIONS,
  createdByStamp,
  type Destination,
  type ExtractedField,
  type InputMode,
  INVOICE_FIELD_LABELS,
  type InvoiceExtracted,
  nextCzNumber,
  normalizeCurrency,
  normalizeExtracted,
  parseContainerNumbers,
  MBL_CONTAINERS_LABEL,
  MBL_TO_MASTER_JOB,
  isMblContainerDetail,
  mblContainers,
  mblDefaultTicks,
  mblToMasterJobUpdate,
  SHIPMENT_FIELD_MAP,
  type Step,
  type TargetMode,
  toShipmentUpdate,
  withCargoLine,
  withContainerType,
  withPackageType,
} from "../_lib/extraction";

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
  shipment: "Extract shipping data (B/L, booking, waybill) into Shipments columns.",
  invoicing: "Extract cost data (invoice, debit note) — amount, vendor, invoice number.",
  quote: "Extract shipping data into a Quote record.",
  masterjob: "Extract multiple shipments from a pre-alert and create them under a Master Job (MCZ).",
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

export function DocumentReadingWorkflow() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { shipments, createShipment, updateShipment, linkMasterJob } = useShipments();
  const { quotes, updateQuote } = useQuotes();

  // Workflow
  const [destination, setDestination] = useState<Destination>("shipment");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  // Input
  const [fileBase64, setFileBase64] = useState("");
  const [fileName, setFileName] = useState("");
  // A pre-alert can come as several files; all of them are read as one batch
  // under one master job, and listed so the user sees exactly what was taken.
  const [masterFiles, setMasterFiles] = useState<MasterFile[]>([]);
  const [preparedFiles, setPreparedFiles] = useState<{ fileName: string; pageCount: number }[]>([]);
  const [textInput, setTextInput] = useState("");

  // Shipment / Quote review
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [extractionMethod, setExtractionMethod] = useState("");
  const [shipmentMode, setShipmentMode] = useState<TargetMode>("existing");
  const [targetShipmentId, setTargetShipmentId] = useState("");
  const [committedJobNumber, setCommittedJobNumber] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  // Booking confirmations go to a new master job or to an existing one (by MCZ).
  const [bookingMode, setBookingMode] = useState<TargetMode>("new");
  const [bookingMcz, setBookingMcz] = useState("");
  // Customs reads always go to one existing shipment (by Internal Reference).
  const [customsShipmentId, setCustomsShipmentId] = useState("");

  // Invoicing review
  const [invoiceData, setInvoiceData] = useState<InvoiceExtracted>({});
  const [invoiceCategory, setInvoiceCategory] = useState("");
  const [invoiceTargetShipmentId, setInvoiceTargetShipmentId] = useState("");

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
  const quoteOptions = useMemo(
    () => quotes.map((q) => ({ value: q.quoteNumber, label: q.quoteNumber })),
    [quotes],
  );
  const newShipmentPreview = useMemo(() => nextCzNumber(shipments), [shipments]);
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

  const successTitle = (() => {
    if (destination === "masterjob")
      return `${masterCreatedJobs.length} shipment${masterCreatedJobs.length !== 1 ? "s" : ""} created`;
    if (destination === "invoicing") return `Invoice data written to ${committedJobNumber || "shipment"}`;
    if (destination === "booking")
      return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${committedJobNumber}`;
    if (destination === "customs")
      return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${committedJobNumber}`;
    if (destination === "quote")
      return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${quoteNumber}`;
    if (shipmentMode === "new") return `New shipment ${committedJobNumber} created`;
    return `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${committedJobNumber}`;
  })();
  const successSubtitle =
    destination === "masterjob"
      ? masterCreatedJobs.length > 0
        ? `Under ${activeMcz}: ${masterCreatedJobs.join(", ")}`
        : `Master Job ${activeMcz}`
      : "The extracted data has been saved.";

  // ─── Input handling ──────────────────────────────────────────────
  const beforeUpload = (file: File) => {
    if (destination === "masterjob") {
      fileToBase64(file)
        .then((base64) => {
          // The same file dropped twice is kept once.
          setMasterFiles((prev) =>
            prev.some((f) => f.name === file.name && f.size === file.size)
              ? prev
              : [...prev, { uid: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, base64 }],
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
        setError(null);
      })
      .catch(() => setError("Could not read the selected file."));
    return false;
  };

  const masterFilesSize = masterFiles.reduce((sum, f) => sum + f.size, 0);
  const masterFilesTooLarge = masterFilesSize > MASTER_FILES_MAX_BYTES;

  const canExtract = (() => {
    const hasInput = inputMode === "file" ? !!fileBase64 : textInput.trim().length >= 10;
    if (destination === "invoicing") return hasInput && !!invoiceTargetShipmentId;
    if (destination === "quote") return hasInput && !!quoteNumber;
    if (destination === "booking") return hasInput && (bookingMode === "new" || !!bookingMasterJob);
    if (destination === "customs") return hasInput && !!customsShipmentId;
    if (destination === "masterjob") return masterFiles.length > 0 && !masterFilesTooLarge && !!activeMcz;
    return hasInput && (shipmentMode === "new" || !!targetShipmentId);
  })();

  // ─── Extraction ──────────────────────────────────────────────────
  const handleExtract = async () => {
    setStep("extracting");
    setError(null);
    try {
      if (destination === "shipment") {
        const result =
          inputMode === "file"
            ? await api.extraction.extractDocument({ fileBase64, fileName })
            : await api.extraction.extractText({ text: textInput.trim(), destination: "shipment" });
        const normalized = normalizeExtracted(result.extracted);
        const target = shipmentMode === "existing" ? shipments.find((s) => s.id === targetShipmentId) : undefined;
        setFields(
          buildFields(normalized, (label) => {
            const apiField = SHIPMENT_FIELD_MAP[label];
            return target && apiField ? getFieldValue(target, apiField) : "";
          }),
        );
        setExtractionMethod(result.method);
        setStep("review");
      } else if (destination === "invoicing") {
        const result =
          inputMode === "file"
            ? await api.extraction.extractInvoice({ fileBase64, fileName })
            : await api.extraction.extractText({ text: textInput.trim(), destination: "invoicing" });
        const extracted = result.extracted as InvoiceExtracted;
        setInvoiceData(extracted);
        const suggested = extracted.service_type || "";
        setInvoiceCategory(COST_CATEGORY_OPTIONS.some((c) => c.value === suggested) ? suggested : "");
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
        const result =
          inputMode === "file"
            ? await api.extraction.extractQuote({ fileBase64, fileName })
            : await api.extraction.extractText({ text: textInput.trim(), destination: "quote" });
        const normalized = normalizeExtracted(result.extracted);
        const quote = quotes.find((q) => q.quoteNumber === quoteNumber);
        const existing = quote && quote.data && typeof quote.data === "object" ? (quote.data as Record<string, string>) : {};
        setFields(buildFields(normalized, (label) => existing[label] || ""));
        setExtractionMethod(result.method);
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
  const setAll = (approved: boolean) => setFields((prev) => prev.map((f) => ({ ...f, approved })));

  // ─── Commit: shipment ────────────────────────────────────────────
  const commitShipment = async () => {
    const approved = fieldsToLabelValues(fields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    const newContainers = containerRowsFromNumbers(parseContainerNumbers(approved["Container Number"]));
    try {
      if (shipmentMode === "existing") {
        const target = shipments.find((s) => s.id === targetShipmentId);
        let data = toShipmentUpdate(approved);
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
        setCommittedJobNumber(target?.jobNumber || "");
      } else {
        const jobNumber = nextCzNumber(shipments);
        const created = await createShipment(baseCreatePayload(jobNumber, createdByStamp(user?.email)));
        let data = toShipmentUpdate(approved);
        if (newContainers.length > 0) data.containers = newContainers;
        data = withContainerType(data, approved);
        data = withCargoLine(data, approved);
        data = withPackageType(data, approved["Type Of Packages"]);
        await updateShipment({ id: created.shipment.id, data });
        setCommittedJobNumber(jobNumber);
      }
      setStep("committed");
    } catch {
      toast.error("Failed to write shipment data.");
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

  // ─── Commit: customs ─────────────────────────────────────────────
  const commitCustoms = async () => {
    const approved = fieldsToLabelValues(fields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    try {
      const target = shipments.find((s) => s.id === customsShipmentId);
      const data = toShipmentUpdate(approved);
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

  // ─── Commit: quote ───────────────────────────────────────────────
  const commitQuote = async () => {
    const approved = fieldsToLabelValues(fields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    try {
      const quote = quotes.find((q) => q.quoteNumber === quoteNumber);
      const existing = quote && quote.data && typeof quote.data === "object" ? (quote.data as Record<string, string>) : {};
      await updateQuote({ quoteNumber, params: { data: { ...existing, ...approved } } });
      setStep("committed");
    } catch {
      toast.error("Failed to save quote data.");
    }
  };

  // ─── Master job pipeline ─────────────────────────────────────────
  const loadMasterFields = (record: Record<string, string> | undefined) =>
    setMasterFields(record ? recordToFields(record) : []);

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

  const loadNextBatch = async () => {
    if (hblLoading || hblBatchIndex >= hblTotalBatches) return;
    setHblLoading(true);
    setError(null);
    try {
      const res = await api.extraction.pipelineExtractHbl({ sessionId: pipelineSessionId, batchIndex: hblBatchIndex });
      setMasterShipments((prev) => [...prev, ...(res.shipments || []).map(normalizeExtracted)]);
      setHblBatchIndex((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load next batch.");
    }
    setHblLoading(false);
  };

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
      loadNextBatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineStep, hblLoading, hblBatchIndex, hblTotalBatches, masterShipments.length, masterIdx]);

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
      const data = mblToMasterJobUpdate(mblInfo, mblTicked);
      if (mblLoadTypeLocked) delete data.loadType;
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
    try {
      const jobNumber = nextCzNumber(shipments, masterCreatedJobs);
      const created = await createShipment(baseCreatePayload(jobNumber, createdByStamp(user?.email, "System (Master Job)")));
      let data = toShipmentUpdate(approved);
      const newContainers = containerRowsFromNumbers(parseContainerNumbers(approved["Container Number"]));
      if (newContainers.length > 0) data.containers = newContainers;
      data = withContainerType(data, approved);
      data = withCargoLine(data, approved);
      data = withPackageType(data, approved["Type Of Packages"]);
      await updateShipment({ id: created.shipment.id, data });
      const linked = await linkMasterJob({ shipmentId: created.shipment.id, mczNumber: activeMcz });
      if (masterMode === "new") setBatchMcz(activeMcz);
      if (!mblFiled && linked.shipment.masterJobId) await fileMblToMasterJob(linked.shipment.masterJobId);
      setMasterCreatedJobs((prev) => [...prev, jobNumber]);
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
    setMasterFiles([]);
    setPreparedFiles([]);
    setTextInput("");
    setFields([]);
    setExtractionMethod("");
    setShipmentMode("existing");
    setTargetShipmentId("");
    setCommittedJobNumber("");
    setQuoteNumber("");
    setCustomsShipmentId("");
    setBookingMode("new");
    setBookingMcz("");
    setBookingCreated(null);
    setInvoiceData({});
    setInvoiceCategory("");
    setInvoiceTargetShipmentId("");
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

          {destination === "quote" && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-1.5">Quote Number (required)</div>
              <Select
                showSearch
                className="w-full"
                placeholder="Select quote…"
                value={quoteNumber || undefined}
                onChange={(v) => setQuoteNumber(v || "")}
                options={quoteOptions}
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </div>
          )}

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
              multiple={destination === "masterjob"}
              maxCount={destination === "masterjob" ? undefined : 1}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                {destination === "masterjob"
                  ? "Click or drag files (PDF, JPG, PNG) — you can add several"
                  : fileName || "Click or drag a file (PDF, JPG, PNG)"}
              </p>
              <p className="ant-upload-hint">
                {destination === "invoicing"
                  ? "Invoice, Debit Note, Freight Bill, Customs Declaration…"
                  : destination === "customs"
                    ? "Export / import declaration, transit document (T1), customs release…"
                    : destination === "masterjob"
                    ? "Pre-alert / manifest with multiple Bills of Lading. All files go under one master job."
                    : destination === "booking"
                    ? "Booking confirmation, booking note, release order…"
                    : "Bill of Lading, Sea Waybill, Booking Confirmation…"}
              </p>
            </Upload.Dragger>
          ) : (
            <Input.TextArea
              rows={6}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste shipping data, email content, or any text with relevant details…"
              maxLength={1500}
              showCount
            />
          )}

          {destination === "masterjob" && masterFiles.length > 0 && (
            <MasterFileList files={masterFiles} onRemove={(uid) => setMasterFiles((prev) => prev.filter((f) => f.uid !== uid))} />
          )}
          {destination === "masterjob" && masterFilesTooLarge && (
            <Alert
              className="mt-3"
              type="warning"
              showIcon
              message={`The files add up to ${formatSize(masterFilesSize)}; at most ${formatSize(MASTER_FILES_MAX_BYTES)} can be read in one go. Remove some and read them as a second batch with "Add to existing".`}
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
            ) : (
              fileName && <p className="mt-1 mb-0 text-xs text-slate-400">{fileName}</p>
            )}
          </div>
        </Card>
      )}

      {/* ─── STEP: Review — shipment / quote ─── */}
      {step === "review" && (destination === "shipment" || destination === "quote" || destination === "customs" || destination === "booking") && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <Space size="small" wrap>
              <span className="text-sm font-semibold">{fields.length} fields extracted</span>
              {extractionMethod && <Tag>{extractionMethod}</Tag>}
              {conflictCount > 0 && <Tag color="orange">{conflictCount} conflict{conflictCount > 1 ? "s" : ""}</Tag>}
            </Space>
            <Space>
              <Button size="small" onClick={() => setAll(true)}>Approve All</Button>
              <Button size="small" onClick={() => setAll(false)}>Reject All</Button>
            </Space>
          </div>
          {error && <Alert className="mb-3" type="error" showIcon message={error} />}
          <FieldReviewTable fields={fields} onToggle={toggleField} editable onEdit={editField} />
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setStep("upload")}>Back</Button>
            <Button
              type="primary"
              disabled={approvedCount === 0}
              onClick={
                destination === "quote"
                  ? commitQuote
                  : destination === "customs"
                    ? commitCustoms
                    : destination === "booking"
                      ? handleCommitBooking
                      : commitShipment
              }
              loading={destination === "booking" && bookingSaving}
            >
              Write {approvedCount} field{approvedCount !== 1 ? "s" : ""} to{" "}
              {destination === "booking"
                ? bookingMasterJob?.mczNumber ?? bookingCreated?.mczNumber ?? `${newMcz} (new master job)`
                : destination === "quote"
                ? quoteNumber
                : destination === "customs"
                  ? shipments.find((s) => s.id === customsShipmentId)?.jobNumber || "shipment"
                  : shipmentMode === "new"
                    ? newShipmentPreview
                    : "shipment"}
            </Button>
          </div>
        </Card>
      )}

      {/* ─── STEP: Review — invoicing ─── */}
      {step === "review" && destination === "invoicing" && (
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
                    ? COST_CATEGORY_OPTIONS.find((c) => c.value === value)?.label || value
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
              value={invoiceCategory || undefined}
              onChange={setInvoiceCategory}
              options={COST_CATEGORY_OPTIONS.map((c) => ({
                value: c.value,
                label: c.value === invoiceData.service_type ? `${c.label} (suggested)` : c.label,
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

                  <div className="flex gap-2 mt-4">
                    <Button onClick={() => setStep("upload")}>Back</Button>
                    <Button onClick={advanceMaster}>Skip</Button>
                    <Button
                      type="primary"
                      disabled={masterFields.filter((f) => f.approved).length === 0}
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
              <Button type="primary" size="large" icon={<ReloadOutlined />} onClick={reset}>
                New Extraction
              </Button>
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

interface MasterFile {
  uid: string;
  name: string;
  size: number;
  base64: string;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

// The files picked for one pre-alert, so it is clear exactly what will be read.
function MasterFileList({ files, onRemove }: { files: MasterFile[]; onRemove: (uid: string) => void }) {
  return (
    <div className="mt-3 border border-slate-200 rounded-lg">
      <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
        Uploaded files ({files.length}) · {formatSize(files.reduce((sum, f) => sum + f.size, 0))}
      </div>
      <ul className="m-0 p-0 list-none">
        {files.map((f) => (
          <li key={f.uid} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 text-xs">
            <FileOutlined className="text-indigo-400" />
            <span className="flex-1 min-w-0 truncate text-slate-800 font-medium">{f.name}</span>
            <span className="shrink-0 text-slate-400">{formatSize(f.size)}</span>
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
