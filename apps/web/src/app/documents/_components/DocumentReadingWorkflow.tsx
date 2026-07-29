"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
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
import { InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { useShipments, getFieldValue } from "@/hooks/useShipments";
import { useQuotes } from "@/hooks/useQuotes";
import { FieldReviewTable } from "./FieldReviewTable";
import {
  baseCreatePayload,
  buildFields,
  COST_CATEGORY_OPTIONS,
  createdByStamp,
  type Destination,
  existingMczNumbers,
  type ExtractedField,
  type InputMode,
  INVOICE_FIELD_LABELS,
  type InvoiceExtracted,
  nextCzNumber,
  nextMczNumber,
  normalizeCurrency,
  normalizeExtracted,
  SHIPMENT_FIELD_MAP,
  type Step,
  type TargetMode,
  toShipmentUpdate,
} from "../_lib/extraction";

type PipelineStep = "idle" | "classified" | "extracting" | "ready";

// Keep roughly one batch of shipments buffered ahead of the reviewer, so the
// next three load in the background while they work on the current three.
const HBL_PREFETCH_AHEAD = 3;

const DESTINATION_OPTIONS = [
  { value: "shipment", label: "Full Sheet" },
  { value: "invoicing", label: "Invoicing" },
  { value: "quote", label: "Quote" },
  { value: "masterjob", label: "Master Job" },
] as const;

const DESTINATION_HINT: Record<Destination, string> = {
  shipment: "Extract shipping data (B/L, booking, waybill) into Full Sheet columns.",
  invoicing: "Extract cost data (invoice, debit note) — amount, vendor, invoice number.",
  quote: "Extract shipping data into a Quote record.",
  masterjob: "Extract multiple shipments from a pre-alert and create them under a Master Job (MCZ).",
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
  const [textInput, setTextInput] = useState("");

  // Shipment / Quote review
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [extractionMethod, setExtractionMethod] = useState("");
  const [shipmentMode, setShipmentMode] = useState<TargetMode>("existing");
  const [targetShipmentId, setTargetShipmentId] = useState("");
  const [committedJobNumber, setCommittedJobNumber] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");

  // Invoicing review
  const [invoiceData, setInvoiceData] = useState<InvoiceExtracted>({});
  const [invoiceCategory, setInvoiceCategory] = useState("");
  const [invoiceTargetShipmentId, setInvoiceTargetShipmentId] = useState("");

  // Master Job pipeline
  const [masterMode, setMasterMode] = useState<TargetMode>("new");
  const [masterMczExisting, setMasterMczExisting] = useState("");
  const [pipelineSessionId, setPipelineSessionId] = useState("");
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("idle");
  const [classification, setClassification] = useState<Record<string, number>>({});
  const [mblInfo, setMblInfo] = useState<Record<string, string> | null>(null);
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
  const newMcz = useMemo(() => nextMczNumber(shipments), [shipments]);
  const existingMcz = useMemo(() => existingMczNumbers(shipments), [shipments]);
  const activeMcz = masterMode === "existing" ? masterMczExisting : newMcz;

  const approvedCount = fields.filter((f) => f.approved).length;
  const conflictCount = fields.filter((f) => f.hasConflict).length;

  const successTitle = (() => {
    if (destination === "masterjob")
      return `${masterCreatedJobs.length} shipment${masterCreatedJobs.length !== 1 ? "s" : ""} created`;
    if (destination === "invoicing") return `Invoice data written to ${committedJobNumber || "shipment"}`;
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
    fileToBase64(file)
      .then((b64) => {
        setFileBase64(b64);
        setFileName(file.name);
        setError(null);
      })
      .catch(() => setError("Could not read the selected file."));
    return false;
  };

  const canExtract = (() => {
    const hasInput = destination === "masterjob" || inputMode === "file" ? !!fileBase64 : textInput.trim().length >= 10;
    if (destination === "invoicing") return hasInput && !!invoiceTargetShipmentId;
    if (destination === "quote") return hasInput && !!quoteNumber;
    if (destination === "masterjob") return !!fileBase64 && !!activeMcz;
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
        // masterjob — Phase 1: prepare + classify
        setPipelineStep("idle");
        const prep = await api.extraction.pipelinePrepare({ fileBase64, fileName });
        setPipelineSessionId(prep.sessionId);
        setClassification(prep.classification);
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
    try {
      if (shipmentMode === "existing") {
        await updateShipment({ id: targetShipmentId, data: toShipmentUpdate(approved) });
        setCommittedJobNumber(shipments.find((s) => s.id === targetShipmentId)?.jobNumber || "");
      } else {
        const jobNumber = nextCzNumber(shipments);
        const created = await createShipment(baseCreatePayload(jobNumber, createdByStamp(user?.email)));
        await updateShipment({ id: created.shipment.id, data: toShipmentUpdate(approved) });
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
      if (mbl?.mblInfo) setMblInfo(mbl.mblInfo);

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

  const validateAndCreate = async () => {
    if (!activeMcz) return toast.warning("No MCZ number available.");
    const approved = fieldsToLabelValues(masterFields);
    if (Object.keys(approved).length === 0) return toast.warning("No fields approved.");
    try {
      const jobNumber = nextCzNumber(shipments, masterCreatedJobs);
      const created = await createShipment(baseCreatePayload(jobNumber, createdByStamp(user?.email, "System (Master Job)")));
      await updateShipment({ id: created.shipment.id, data: toShipmentUpdate(approved) });
      await linkMasterJob({ shipmentId: created.shipment.id, mczNumber: activeMcz });
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
    setTextInput("");
    setFields([]);
    setExtractionMethod("");
    setShipmentMode("existing");
    setTargetShipmentId("");
    setCommittedJobNumber("");
    setQuoteNumber("");
    setInvoiceData({});
    setInvoiceCategory("");
    setInvoiceTargetShipmentId("");
    setMasterMode("new");
    setMasterMczExisting("");
    setPipelineSessionId("");
    setPipelineStep("idle");
    setClassification({});
    setMblInfo(null);
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

          {destination === "masterjob" && (
            <div className="mb-4">
              <div className="text-xs font-medium text-slate-500 mb-1.5">Master Job Number</div>
              <Radio.Group value={masterMode} onChange={(e) => setMasterMode(e.target.value)} className="mb-2">
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
            <Upload.Dragger accept=".pdf,.jpg,.jpeg,.png" beforeUpload={beforeUpload} showUploadList={false} maxCount={1}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{fileName || "Click or drag a file (PDF, JPG, PNG)"}</p>
              <p className="ant-upload-hint">
                {destination === "invoicing"
                  ? "Invoice, Debit Note, Freight Bill, Customs Declaration…"
                  : destination === "masterjob"
                    ? "Pre-alert / manifest with multiple Bills of Lading."
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
            {fileName && <p className="mt-1 mb-0 text-xs text-slate-400">{fileName}</p>}
          </div>
        </Card>
      )}

      {/* ─── STEP: Review — shipment / quote ─── */}
      {step === "review" && (destination === "shipment" || destination === "quote") && (
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
              onClick={destination === "quote" ? commitQuote : commitShipment}
            >
              Write {approvedCount} field{approvedCount !== 1 ? "s" : ""} to{" "}
              {destination === "quote" ? quoteNumber : shipmentMode === "new" ? newShipmentPreview : "shipment"}
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
                {(classification.MANIFEST || 0) + (classification.HBL || 0) + (classification.MBL || 0) + (classification.SKIP || 0)}{" "}
                pages scanned:
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: "Manifest pages", val: classification.MANIFEST || 0 },
                  { label: "House BL pages", val: classification.HBL || 0 },
                  { label: "Master BL pages", val: classification.MBL || 0 },
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
                <Descriptions
                  className="mb-3"
                  title="MBL shared info"
                  bordered
                  size="small"
                  column={2}
                  items={Object.entries(mblInfo).map(([key, value]) => ({ key, label: key, children: value || "—" }))}
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
