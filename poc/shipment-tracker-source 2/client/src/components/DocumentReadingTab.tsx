import { useState, useRef, useCallback } from "react";
import { useShipments } from "@/lib/shipment-context";
import { useAuth } from "@/lib/auth-context";
import { getColumnValue } from "@/lib/shipment-data";
import { apiRequest } from "@/lib/queryClient";
import {
  Upload,
  FileText,
  Type,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Check,
  ArrowRight,
  RotateCcw,
  Table2,
  Receipt,
  ClipboardList,
  Layers,
  Plus,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

type Destination = "fullsheet" | "invoicing" | "quote" | "masterjob";

interface QuoteRecord {
  id: number;
  quoteNumber: string;
  data: string;
}

interface ExtractedField {
  column: string;
  extractedValue: string;
  existingValue: string;
  hasConflict: boolean;
  approved: boolean;
}

interface InvoiceExtracted {
  total_amount?: string;
  currency?: string;
  vendor?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  service_type?: string;
}

type WorkflowStep = "upload" | "extracting" | "review" | "committed";

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection / Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
] as const;

const INVOICING_FIELD_LABELS: Record<string, string> = {
  total_amount: "Total Amount",
  currency: "Currency",
  vendor: "Vendor",
  invoice_number: "Invoice Number",
  invoice_date: "Invoice Date",
  due_date: "Due Date",
  description: "Description",
  service_type: "Suggested Category",
};

// ─── Main Component ─────────────────────────────────────────────────

export function DocumentReadingTab() {
  const { data, jobNumbers, getExistingValues, updateShipmentFields, refreshFromAPI } = useShipments();
  const { user: authUser } = useAuth();

  // Workflow state
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [destination, setDestination] = useState<Destination>("fullsheet");
  const [jobNumber, setJobNumber] = useState("");
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [inputMode, setInputMode] = useState<"pdf" | "text">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Full Sheet extraction results
  const [fields, setFields] = useState<ExtractedField[]>([]);

  // ─── Post-extraction normalisation ───────────────────────────────
  // The vision model still returns legacy codes (FCL/LCL/IMP/EXP/Czech statuses).
  // We translate them into the English dropdown values now used in Shipments,
  // and derive Freight Mode when the extracted data implies a transport mode.
  function normalizeExtracted(raw: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { ...raw };

    // Load Type: FCL→Full Load, LCL→Consolidation
    const lt = (out["Load Type"] || "").trim().toUpperCase();
    if (lt === "FCL") out["Load Type"] = "Full Load";
    else if (lt === "LCL") out["Load Type"] = "Consolidation";
    else if (lt === "CUSTOMS" || lt === "CUSTOMS CLEARANCE") out["Load Type"] = "Customs Clearance";

    // Trade Direction: IMP→Import, EXP→Export
    const td = (out["Trade Direction"] || "").trim().toUpperCase();
    if (td === "IMP" || td === "IMPORT") out["Trade Direction"] = "Import";
    else if (td === "EXP" || td === "EXPORT") out["Trade Direction"] = "Export";

    // Freight Mode — derive from data when the AI didn't fill it.
    // Vessel or container present → Sea Freight (covers BL / Sea Waybill / Booking Confirmation).
    // AWB / Flight No / aircraft → Air Freight.
    // Wagon / rail no → Rail Freight.
    // Truck / CMR / road consignment → Road Freight.
    if (!out["Freight Mode"]) {
      const hasVessel = !!(out["Vessel"] || out["Vessel / Voyage"] || out["Voyage"]);
      const hasContainer = !!(out["Container Number"] || out["CNTR no."]
        || out["Container's Length (1)"] || out["Amount Of Containers (1)"]);
      if (hasVessel || hasContainer) out["Freight Mode"] = "Sea Freight";
    }

    return out;
  }
  const [extractionMeta, setExtractionMeta] = useState<{ fieldCount: number; fileName: string } | null>(null);

  // Invoicing extraction results
  const [invoiceData, setInvoiceData] = useState<InvoiceExtracted>({});
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [invoiceApproved, setInvoiceApproved] = useState(true);

  // Quote state
  const [quoteList, setQuoteList] = useState<QuoteRecord[]>([]);
  const [quoteNumber, setQuoteNumber] = useState("");
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState("");

  // Master Job state
  const [masterJobMode, setMasterJobMode] = useState<"new" | "existing">("new");

  // Full Sheet target mode — "existing" picks an existing CZ; "new" auto-assigns the next CZ
  const [fullSheetMode, setFullSheetMode] = useState<"existing" | "new">("existing");
  const [newJobPreview, setNewJobPreview] = useState(""); // "CZ00000021"-style preview
  const [masterJobNumber, setMasterJobNumber] = useState("");
  const [existingMasterNumbers, setExistingMasterNumbers] = useState<string[]>([]);
  const [selectedExistingMCZ, setSelectedExistingMCZ] = useState("");
  const [masterShipments, setMasterShipments] = useState<Record<string, string>[]>([]);
  const [masterCurrentIndex, setMasterCurrentIndex] = useState(0);
  const [masterFields, setMasterFields] = useState<ExtractedField[]>([]);
  const [masterCreatedJobs, setMasterCreatedJobs] = useState<string[]>([]);
  // Pipeline state (3-phase)
  const [pipelineSessionId, setPipelineSessionId] = useState("");
  const [pipelineClassification, setPipelineClassification] = useState<{MANIFEST: number, HBL: number, MBL: number, SKIP: number} | null>(null);
  const [pipelineStep, setPipelineStep] = useState<"idle" | "classifying" | "classified" | "extracting" | "ready">("idle");
  const [pipelineMblInfo, setPipelineMblInfo] = useState<Record<string, string> | null>(null);
  const [hblBatchIndex, setHblBatchIndex] = useState(0);
  const [hblTotalBatches, setHblTotalBatches] = useState(0);
  const [hblIsLoading, setHblIsLoading] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobDropdownRef = useRef<HTMLDivElement>(null);
  const catDropdownRef = useRef<HTMLDivElement>(null);
  const quoteDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Job number autocomplete ───────────────────────────────────
  const searchTerm = (jobDropdownOpen ? jobSearch : jobNumber).toLowerCase();
  const filteredJobs = searchTerm
    ? jobNumbers.filter((jn) => jn.toLowerCase().includes(searchTerm))
    : jobNumbers;

  const selectedShipment = jobNumber ? data.find((s) => s.jobNumber === jobNumber) : undefined;

  // Quote list filtering
  const filteredQuotes = quoteSearch
    ? quoteList.filter((q) => q.quoteNumber.toLowerCase().includes(quoteSearch.toLowerCase()))
    : quoteList;

  // Load quotes when destination is "quote"
  const loadQuotes = useCallback(async () => {
    try {
      const resp = await apiRequest("GET", "/api/quotes");
      const data = await resp.json();
      setQuoteList(data);
    } catch (err) {
      console.error("Failed to load quotes:", err);
    }
  }, []);

  // ─── Master Job helpers ────────────────────────────────────────
  const loadExistingMCZ = useCallback(async () => {
    const mczSet = new Set<string>();
    // From visible data
    for (const s of data) {
      const mn = getColumnValue(s, "Master job");
      if (mn && mn.startsWith("MCZ")) mczSet.add(mn);
    }
    // From edit history
    try {
      const resp = await apiRequest("GET", "/api/shipment-edits");
      const edits: any[] = await resp.json();
      for (const edit of edits) {
        if (edit.payload) {
          const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
          const mn = p["Master job"] || (p.extra && p.extra["Master job"]) || "";
          if (mn.startsWith("MCZ")) mczSet.add(mn);
        }
      }
    } catch {}
    setExistingMasterNumbers(Array.from(mczSet).sort());
  }, [data]);

  // Compute the next CZ number for the "create new shipment" preview in Document Reading
  const generateNextCZ = useCallback(async () => {
    let maxNum = 0;
    for (const s of data) {
      const jn = s.jobNumber || "";
      if (jn.startsWith("CZ")) {
        const num = parseInt(jn.substring(2), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    try {
      const resp = await apiRequest("GET", "/api/shipment-edits");
      const edits: any[] = await resp.json();
      for (const edit of edits) {
        if (edit.jobNumber && edit.jobNumber.startsWith("CZ")) {
          const num = parseInt(edit.jobNumber.substring(2), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
        if (edit.payload) {
          const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
          const jn = p.jobNumber || "";
          if (jn.startsWith("CZ")) {
            const num = parseInt(jn.substring(2), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
    } catch {}
    return `CZ${String(maxNum + 1).padStart(8, "0")}`;
  }, [data]);

  const generateNextMCZ = useCallback(async () => {
    let maxNum = 0;
    for (const s of data) {
      const mn = getColumnValue(s, "Master job");
      if (mn && mn.startsWith("MCZ")) {
        const num = parseInt(mn.substring(3), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    try {
      const resp = await apiRequest("GET", "/api/shipment-edits");
      const edits: any[] = await resp.json();
      for (const edit of edits) {
        if (edit.payload) {
          const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
          const mn = p["Master job"] || (p.extra && p.extra["Master job"]) || "";
          if (mn.startsWith("MCZ")) {
            const num = parseInt(mn.substring(3), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      }
    } catch {}
    return `MCZ${String(maxNum + 1).padStart(8, "0")}`;
  }, [data]);

  // ─── File handling ─────────────────────────────────────────────
  const handleFileSelect = useCallback((f: File) => {
    if (f.type !== "application/pdf" && !f.type.startsWith("image/")) {
      setError("Supported formats: PDF, JPEG, PNG");
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect]
  );

  // ─── Extract document ──────────────────────────────────────────
  const handleExtract = useCallback(async () => {
    const hasInput = inputMode === "pdf" ? !!file : textInput.trim().length >= 10;
    if (!hasInput) return;
    if (destination === "quote" && !quoteNumber) return;
    if (destination === "masterjob" && masterJobMode === "existing" && !selectedExistingMCZ) return;
    if (destination !== "quote" && destination !== "masterjob" && fullSheetMode === "existing" && !jobNumber) return;
    if (destination !== "quote" && destination !== "masterjob" && fullSheetMode === "new" && !newJobPreview) return;

    setStep("extracting");
    setError(null);

    try {
      // Determine how to call the API
      const useTextEndpoint = inputMode === "text";

      const callExtractAPI = async (pdfEndpoint: string): Promise<any> => {
        if (useTextEndpoint) {
          const resp = await apiRequest("POST", "/api/extract-text", { text: textInput.trim(), destination });
          return resp.json();
        } else {
          const formData = new FormData();
          formData.append("file", file!);
          const resp = await apiRequest("POST", pdfEndpoint, formData, true);
          return resp.json();
        }
      };

      if (destination === "fullsheet") {
        // ─── Full Sheet extraction ───
        const result = await callExtractAPI("/api/extract-document");

        if (result.error) {
          setError(result.error);
          setStep("upload");
          return;
        }

        const normalized = normalizeExtracted(result.extracted);
        const extractedColumns = Object.keys(normalized);
        const existing = getExistingValues(jobNumber, extractedColumns);

        const fieldList: ExtractedField[] = extractedColumns.map((col) => {
          const extractedValue = normalized[col];
          const existingValue = existing[col] || "";
          const hasConflict = existingValue !== "" && existingValue !== extractedValue;
          return {
            column: col,
            extractedValue,
            existingValue,
            hasConflict,
            approved: !hasConflict,
          };
        });

        setFields(fieldList);
        setExtractionMeta({ fieldCount: result.fieldCount, fileName: result.fileName });
        setStep("review");
      } else if (destination === "invoicing") {
        // ─── Invoicing extraction ───
        const result = await callExtractAPI("/api/extract-invoice");

        if (result.error) {
          setError(result.error);
          setStep("upload");
          return;
        }

        setInvoiceData(result.extracted || {});
        // Pre-select category from LLM suggestion if valid
        const suggested = result.extracted?.service_type || "";
        const validCat = COST_CATEGORIES.find((c) => c.key === suggested);
        setSelectedCategory(validCat ? suggested : "");
        setInvoiceApproved(true);
        setExtractionMeta({ fieldCount: result.fieldCount, fileName: result.fileName });
        setStep("review");
      } else if (destination === "quote") {
        // ─── Quote extraction ───
        const result = await callExtractAPI("/api/extract-quote");

        if (result.error) {
          setError(result.error);
          setStep("upload");
          return;
        }

        // Get existing quote data for conflict detection
        const quoteRecord = quoteList.find((q) => q.quoteNumber === quoteNumber);
        const existingData: Record<string, string> = quoteRecord ? JSON.parse(quoteRecord.data || "{}") : {};

        const normalized = normalizeExtracted(result.extracted);
        const extractedColumns = Object.keys(normalized);
        const fieldList: ExtractedField[] = extractedColumns.map((col) => {
          const extractedValue = normalized[col];
          const existingValue = existingData[col] || "";
          const hasConflict = existingValue !== "" && existingValue !== extractedValue;
          return {
            column: col,
            extractedValue,
            existingValue,
            hasConflict,
            approved: !hasConflict,
          };
        });

        setFields(fieldList);
        setExtractionMeta({ fieldCount: result.fieldCount, fileName: result.fileName });
        setStep("review");
      } else if (destination === "masterjob") {
        // ─── Phase 1: Upload + classify ───
        setPipelineStep("classifying");
        const formData = new FormData();
        formData.append("file", file!);
        const prepResp = await apiRequest("POST", "/api/pipeline/prepare", formData, true);
        const prepResult = await prepResp.json();
        if (prepResult.error) { setError(prepResult.error); setStep("upload"); setPipelineStep("idle"); return; }

        setPipelineSessionId(prepResult.sessionId);
        setPipelineClassification(prepResult.classification);
        setPipelineStep("classified");
        setExtractionMeta({ fieldCount: prepResult.pageCount, fileName: prepResult.fileName || file?.name || "" });
        setStep("review"); // Go to review step which will show classification first
      }
    } catch (err: any) {
      setError(err?.message || "Extraction failed.");
      setStep("upload");
    }
  }, [file, textInput, inputMode, jobNumber, quoteNumber, destination, getExistingValues, quoteList, masterJobMode, selectedExistingMCZ]);

  // ─── Approve/reject field toggles (Full Sheet) ────────────────
  const toggleField = useCallback((index: number) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, approved: !f.approved } : f))
    );
  }, []);

  const approveAll = useCallback(() => {
    setFields((prev) => prev.map((f) => ({ ...f, approved: true })));
  }, []);

  const rejectAll = useCallback(() => {
    setFields((prev) => prev.map((f) => ({ ...f, approved: false })));
  }, []);

  // ─── Commit approved fields (Full Sheet) ──────────────────────
  const handleCommitFullSheet = useCallback(async () => {
    const approvedFields: Record<string, string> = {};
    for (const f of fields) {
      if (f.approved) {
        approvedFields[f.column] = f.extractedValue;
      }
    }

    if (Object.keys(approvedFields).length === 0) {
      setError("No fields approved for writing.");
      return;
    }

    // Branch on mode
    if (fullSheetMode === "existing") {
      updateShipmentFields(jobNumber, approvedFields);
      setStep("committed");
      return;
    }

    // "new" mode — generate next CZ + create a brand-new shipment
    try {
      let maxCZ = 0;
      for (const s of data) {
        const jn = s.jobNumber || "";
        if (jn.startsWith("CZ")) {
          const num = parseInt(jn.substring(2), 10);
          if (!isNaN(num) && num > maxCZ) maxCZ = num;
        }
      }
      try {
        const resp = await apiRequest("GET", "/api/shipment-edits");
        const edits: any[] = await resp.json();
        for (const edit of edits) {
          if (edit.jobNumber && edit.jobNumber.startsWith("CZ")) {
            const num = parseInt(edit.jobNumber.substring(2), 10);
            if (!isNaN(num) && num > maxCZ) maxCZ = num;
          }
          if (edit.payload) {
            const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
            const jn = p.jobNumber || "";
            if (jn.startsWith("CZ")) {
              const num = parseInt(jn.substring(2), 10);
              if (!isNaN(num) && num > maxCZ) maxCZ = num;
            }
          }
        }
      } catch {}
      const newJobNumber = `CZ${String(maxCZ + 1).padStart(8, "0")}`;

      const now = new Date();
      const cetStr = now.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const createdByStr = `${cetStr} \u2014 ${authUser?.email || "Document Reading"}`;
      const shipId = `docread-${Date.now()}`;
      const createPayload: any = {
        row: Date.now(),
        jobNumber: newJobNumber,
        month: "",
        dept: "Operation Department",
        handler: authUser?.email || "",
        shipper: approvedFields["Shipper"] || "",
        consignee: approvedFields["Consignee"] || "",
        customsStatus: "Waiting For Commercial Paperwork",
        status: "Booking Confirmation Pending [IMP]",
        shipmentType: approvedFields["Trade Direction"] || "Import",
        fclLcl: approvedFields["Load Type"] || "",
        shippingLine: approvedFields["Shipping line / Coloader"] || "",
        pol: approvedFields["POL"] || "",
        pod: approvedFields["POD"] || "",
        etd: approvedFields["Estimated Departure"] || "",
        eta: approvedFields["Estimated Arrival"] || "",
        etaDepo: "",
        etaCnee: "",
        vessel: approvedFields["Vessel"] || approvedFields["Vessel / Voyage"] || "",
        goods: approvedFields["Cargo Description"] || "",
        hsCode: approvedFields["HS Code"] || "",
        extra: {
          "Created by": createdByStr,
          ...Object.fromEntries(
            Object.entries(approvedFields).filter(([k]) =>
              !["Shipper","Consignee","Trade Direction","Load Type","Shipping line / Coloader","POL","POD","Estimated Departure","Estimated Arrival","Vessel","Vessel / Voyage","Cargo Description","HS Code"].includes(k)
            )
          ),
        },
        _id: shipId,
      };

      await apiRequest("POST", "/api/shipment-edits", {
        action: "create",
        jobKey: shipId,
        payload: createPayload,
      });
      await refreshFromAPI();
      setNewJobPreview(newJobNumber); // freeze the assigned number for the success view
      setStep("committed");
    } catch (err: any) {
      setError(err?.message || "Failed to create shipment.");
    }
  }, [fields, jobNumber, updateShipmentFields, fullSheetMode, data, authUser, refreshFromAPI]);

  // ─── Commit to Invoicing ──────────────────────────────────────
  const handleCommitInvoicing = useCallback(async () => {
    if (!selectedCategory) {
      setError("Please select a cost category.");
      return;
    }
    if (!invoiceApproved) {
      setError("Extraction not approved for writing.");
      return;
    }

    try {
      // Map extracted currency to supported currencies
      const SUPPORTED_CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CHF", "CNY", "JPY"];
      const extractedCurrency = (invoiceData.currency || "").toUpperCase();
      const realCurrency = SUPPORTED_CURRENCIES.includes(extractedCurrency) ? extractedCurrency : "CZK";

      // Upsert the cost row for the selected category
      await apiRequest("POST", "/api/invoicing/costs", {
        jobNumber,
        category: selectedCategory,
        realAmount: invoiceData.total_amount || "",
        realCurrency,
        invoiceNumber: invoiceData.invoice_number || "",
        vendor: invoiceData.vendor || "",
      });

      setStep("committed");
    } catch (err: any) {
      setError(err?.message || "Failed to save invoicing data.");
    }
  }, [jobNumber, selectedCategory, invoiceApproved, invoiceData]);

  // ─── Reset ─────────────────────────────────────────────────────
  // ─── Commit to Quote ──────────────────────────────────────────
  const handleCommitQuote = useCallback(async () => {
    const approvedFields: Record<string, string> = {};
    for (const f of fields) {
      if (f.approved) {
        approvedFields[f.column] = f.extractedValue;
      }
    }

    if (Object.keys(approvedFields).length === 0) {
      setError("No fields approved for writing.");
      return;
    }

    try {
      // Get existing quote data and merge
      const quoteRecord = quoteList.find((q) => q.quoteNumber === quoteNumber);
      const existingData: Record<string, string> = quoteRecord ? JSON.parse(quoteRecord.data || "{}") : {};
      const merged = { ...existingData, ...approvedFields };

      await apiRequest("PATCH", `/api/quotes/${encodeURIComponent(quoteNumber)}`, { data: merged });
      setStep("committed");
    } catch (err: any) {
      setError(err?.message || "Failed to save quote data.");
    }
  }, [fields, quoteNumber, quoteList]);

  // ─── Master Job field toggles ─────────────────────────────────────
  const toggleMasterField = useCallback((index: number) => {
    setMasterFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, approved: !f.approved } : f))
    );
  }, []);

  const updateMasterFieldValue = useCallback((index: number, value: string) => {
    setMasterFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, extractedValue: value } : f))
    );
  }, []);

  // ─── Validate & Create a Master Job shipment ─────────────────────────
  const handleValidateAndCreate = useCallback(async () => {
    setError(null);
    const mcz = masterJobMode === "existing" ? selectedExistingMCZ : masterJobNumber;
    if (!mcz) {
      setError("No MCZ number available.");
      return;
    }

    try {
      // 1. Generate next CZ job number
      let maxCZ = 0;
      for (const s of data) {
        const jn = s.jobNumber || "";
        if (jn.startsWith("CZ")) {
          const num = parseInt(jn.substring(2), 10);
          if (!isNaN(num) && num > maxCZ) maxCZ = num;
        }
      }
      try {
        const resp = await apiRequest("GET", "/api/shipment-edits");
        const edits: any[] = await resp.json();
        for (const edit of edits) {
          if (edit.jobNumber && edit.jobNumber.startsWith("CZ")) {
            const num = parseInt(edit.jobNumber.substring(2), 10);
            if (!isNaN(num) && num > maxCZ) maxCZ = num;
          }
          if (edit.payload) {
            const p = typeof edit.payload === "string" ? JSON.parse(edit.payload) : edit.payload;
            const jn = p.jobNumber || "";
            if (jn.startsWith("CZ")) {
              const num = parseInt(jn.substring(2), 10);
              if (!isNaN(num) && num > maxCZ) maxCZ = num;
            }
          }
        }
      } catch {}
      const newJobNumber = `CZ${String(maxCZ + 1).padStart(8, "0")}`;

      // 2. Build approved field map
      const approvedFields: Record<string, string> = {};
      for (const f of masterFields) {
        if (f.approved && f.extractedValue) {
          approvedFields[f.column] = f.extractedValue;
        }
      }

      // 3. Build creation timestamp
      const now = new Date();
      const cetStr = now.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const createdByStr = `${cetStr} \u2014 System (Master Job)`;

      // 4. Create full shipment payload (same structure as FullSheetTab)
      const shipId = `masterjob-${Date.now()}`;
      const createPayload = {
        row: Date.now(),
        jobNumber: newJobNumber,
        month: "",
        dept: "Operation Department",
        handler: authUser?.email || "",
        shipper: approvedFields["Shipper"] || "",
        consignee: approvedFields["Consignee"] || "",
        customsStatus: "Waiting For Commercial Paperwork",
        status: "Booking Confirmation Pending [IMP]",
        shipmentType: approvedFields["Trade Direction"] || "Import",
        fclLcl: approvedFields["Load Type"] || "",
        shippingLine: approvedFields["Shipping line / Coloader"] || "",
        pol: approvedFields["POL"] || "",
        pod: approvedFields["POD"] || "",
        etd: approvedFields["Estimated Departure"] || "",
        eta: approvedFields["Estimated Arrival"] || "",
        etaDepo: "",
        etaCnee: "",
        vessel: approvedFields["Vessel / Voyage"] || "",
        goods: approvedFields["Cargo Description"] || "",
        hsCode: approvedFields["HS Code"] || "",
        extra: {
          "Created by": createdByStr,
          "Master job": mcz,
          ...Object.fromEntries(
            Object.entries(approvedFields).filter(([k]) =>
              !["Shipper","Consignee","Trade Direction","Load Type","Shipping line / Coloader","POL","POD","Estimated Departure","Estimated Arrival","Vessel / Voyage","Cargo Description","HS Code"].includes(k)
            )
          ),
        },
        _id: shipId,
      };

      // 5. POST create to API
      await apiRequest("POST", "/api/shipment-edits", {
        action: "create",
        jobKey: shipId,
        payload: createPayload,
      });

      // 6. Refresh Full Sheet data so the new shipment appears
      await refreshFromAPI();

      // 7. Record the created job
      setMasterCreatedJobs((prev) => [...prev, newJobNumber]);

      // 8. Move to next shipment
      const nextIndex = masterCurrentIndex + 1;
      if (nextIndex >= masterShipments.length) {
        if (hblBatchIndex < hblTotalBatches) {
          // More HBL batches available — stay on review
        } else {
          setStep("committed");
        }
      } else {
        setMasterCurrentIndex(nextIndex);
        const nextShipment = masterShipments[nextIndex];
        const fieldList: ExtractedField[] = Object.entries(nextShipment).map(([col, val]) => ({
          column: col,
          extractedValue: val,
          existingValue: "",
          hasConflict: false,
          approved: true,
        }));
        setMasterFields(fieldList);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create shipment.");
    }
  }, [masterJobMode, selectedExistingMCZ, masterJobNumber, masterFields, masterCurrentIndex, masterShipments, data, refreshFromAPI, hblBatchIndex, hblTotalBatches]);

  // ─── Skip current Master Job shipment ──────────────────────────────
  const handleSkipMasterShipment = useCallback(() => {
    const nextIndex = masterCurrentIndex + 1;
    if (nextIndex >= masterShipments.length) {
      if (hblBatchIndex < hblTotalBatches) {
        // More HBL batches available — stay on review
      } else {
        setStep("committed");
      }
    } else {
      setMasterCurrentIndex(nextIndex);
      const nextShipment = masterShipments[nextIndex];
      const fieldList: ExtractedField[] = Object.entries(nextShipment).map(([col, val]) => ({
        column: col,
        extractedValue: val,
        existingValue: "",
        hasConflict: false,
        approved: true,
      }));
      setMasterFields(fieldList);
    }
  }, [masterCurrentIndex, masterShipments, hblBatchIndex, hblTotalBatches]);

  // ─── Start extraction (HBL-first batch) ──────────────────────────────
  const handleStartExtraction = useCallback(async () => {
    setPipelineStep("extracting");
    setError(null);

    // Step 1: Extract MBL shared info
    try {
      const mblResp = await apiRequest("POST", "/api/pipeline/extract-mbl", { sessionId: pipelineSessionId });
      const mblResult = await mblResp.json();
      if (mblResult.mblInfo) setPipelineMblInfo(mblResult.mblInfo);
    } catch (err) {
      console.error("MBL extraction failed:", err);
      // Continue even if MBL fails — it's optional
    }

    // Step 2: Extract first HBL batch
    try {
      const hblResp = await apiRequest("POST", "/api/pipeline/extract-hbl-batch", { sessionId: pipelineSessionId, batchIndex: 0 });
      const hblResult = await hblResp.json();
      if (hblResult.error) { setError(hblResult.error); setPipelineStep("classified"); return; }

      const shipments = hblResult.shipments || [];
      setMasterShipments(shipments);
      setHblBatchIndex(1);
      setHblTotalBatches(hblResult.totalBatches || 1);
      setMasterCurrentIndex(0);
      setMasterCreatedJobs([]);

      if (shipments.length > 0) {
        const first = shipments[0];
        const fieldList = Object.entries(first).map(([col, val]) => ({
          column: col, extractedValue: val as string, existingValue: "", hasConflict: false, approved: true,
        }));
        setMasterFields(fieldList);
      }

      setPipelineStep("ready");
    } catch (err: any) {
      setError(err?.message || "Failed to extract shipments.");
      setPipelineStep("classified");
    }
  }, [pipelineSessionId]);

  // ─── Load next HBL batch ──────────────────────────────────────────────
  const loadNextHblBatch = useCallback(async () => {
    if (hblIsLoading || hblBatchIndex >= hblTotalBatches) return;
    setHblIsLoading(true);
    setError(null);
    try {
      const resp = await apiRequest("POST", "/api/pipeline/extract-hbl-batch", {
        sessionId: pipelineSessionId, batchIndex: hblBatchIndex,
      });
      const result = await resp.json();
      if (result.error) { setError(result.error); }
      else {
        const newShipments = (result.shipments || []).map((s: Record<string, string>) => normalizeExtracted(s));
        setMasterShipments(prev => [...prev, ...newShipments]);
        setHblBatchIndex(prev => prev + 1);
      }
    } catch (err: any) { setError(err?.message || "Failed to load batch."); }
    setHblIsLoading(false);
  }, [hblIsLoading, hblBatchIndex, hblTotalBatches, pipelineSessionId]);



  const handleReset = useCallback(() => {
    setStep("upload");
    setInputMode("pdf");
    setFile(null);
    setTextInput("");
    setFields([]);
    setInvoiceData({});
    setSelectedCategory("");
    setInvoiceApproved(true);
    setExtractionMeta(null);
    setError(null);
    setJobNumber("");
    setJobSearch("");
    setQuoteNumber("");
    setQuoteSearch("");
    // Full Sheet target reset
    setFullSheetMode("existing");
    setNewJobPreview("");
    // Master job reset
    setMasterJobMode("new");
    setMasterJobNumber("");
    setExistingMasterNumbers([]);
    setSelectedExistingMCZ("");
    setMasterShipments([]);
    setMasterCurrentIndex(0);
    setMasterFields([]);
    setMasterCreatedJobs([]);
    // Pipeline reset
    setPipelineSessionId("");
    setPipelineClassification(null);
    setPipelineStep("idle");
    setPipelineMblInfo(null);
    setHblBatchIndex(0);
    setHblTotalBatches(0);
    setHblIsLoading(false);
  }, []);

  // ─── Counts ────────────────────────────────────────────────────
  const conflictCount = fields.filter((f) => f.hasConflict).length;
  const approvedCount = fields.filter((f) => f.approved).length;
  const newFieldCount = fields.filter((f) => !f.hasConflict).length;

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" data-testid="document-reading-tab">
      {/* Progress bar */}
      <div className="flex-none px-6 py-3 border-b border-border/30" style={{ background: "hsl(var(--surface-9))" }}>
        <div className="flex items-center gap-3 text-xs">
          <StepIndicator label="Upload" stepNum={1} active={step === "upload"} done={step !== "upload"} />
          <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
          <StepIndicator label="Extracting" stepNum={2} active={step === "extracting"} done={step === "review" || step === "committed"} />
          <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
          <StepIndicator label="Review" stepNum={3} active={step === "review"} done={step === "committed"} />
          <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
          <StepIndicator label="Done" stepNum={4} active={step === "committed"} done={false} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* ─── STEP 1: Upload ─── */}
          {step === "upload" && (
            <div className="space-y-6">
              {/* Destination selector */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  Extract to
                </label>
                <div className="flex gap-2" data-testid="destination-selector">
                  <button
                    onClick={() => setDestination("fullsheet")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border transition-all"
                    style={{
                      borderColor: destination === "fullsheet" ? "var(--brand-teal)" : "hsl(var(--border-25))",
                      background: destination === "fullsheet" ? "var(--brand-teal-soft)" : "hsl(var(--surface-11))",
                      color: destination === "fullsheet" ? "var(--brand-teal)" : "hsl(var(--fg-60))",
                    }}
                    data-testid="dest-fullsheet"
                  >
                    <Table2 className="w-4 h-4" />
                    Full Sheet
                    {destination === "fullsheet" && <Check className="w-3.5 h-3.5 ml-1" />}
                  </button>
                  <button
                    onClick={() => setDestination("invoicing")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border transition-all"
                    style={{
                      borderColor: destination === "invoicing" ? "var(--brand-teal)" : "hsl(var(--border-25))",
                      background: destination === "invoicing" ? "var(--brand-teal-soft)" : "hsl(var(--surface-11))",
                      color: destination === "invoicing" ? "var(--brand-teal)" : "hsl(var(--fg-60))",
                    }}
                    data-testid="dest-invoicing"
                  >
                    <Receipt className="w-4 h-4" />
                    Invoicing
                    {destination === "invoicing" && <Check className="w-3.5 h-3.5 ml-1" />}
                  </button>
                  <button
                    onClick={() => { setDestination("quote"); loadQuotes(); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border transition-all"
                    style={{
                      borderColor: destination === "quote" ? "var(--brand-teal)" : "hsl(var(--border-25))",
                      background: destination === "quote" ? "var(--brand-teal-soft)" : "hsl(var(--surface-11))",
                      color: destination === "quote" ? "var(--brand-teal)" : "hsl(var(--fg-60))",
                    }}
                    data-testid="dest-quote"
                  >
                    <ClipboardList className="w-4 h-4" />
                    Quote
                    {destination === "quote" && <Check className="w-3.5 h-3.5 ml-1" />}
                  </button>
                  <button
                    onClick={() => {
                      setDestination("masterjob");
                      loadExistingMCZ();
                      generateNextMCZ().then((n) => setMasterJobNumber(n));
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border transition-all"
                    style={{
                      borderColor: destination === "masterjob" ? "var(--brand-amber)" : "hsl(var(--border-25))",
                      background: destination === "masterjob" ? "rgba(245, 158, 11, 0.08)" : "hsl(var(--surface-11))",
                      color: destination === "masterjob" ? "var(--brand-amber)" : "hsl(var(--fg-60))",
                    }}
                    data-testid="dest-masterjob"
                  >
                    <Layers className="w-4 h-4" />
                    Master Job
                    {destination === "masterjob" && <Check className="w-3.5 h-3.5 ml-1" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                  {destination === "fullsheet"
                    ? "Extract shipping data (B/L, booking, waybill) to Full Sheet columns."
                    : destination === "invoicing"
                    ? "Extract cost data (invoice, debit note) to Invoicing tab \u2014 amount, vendor, invoice number."
                    : destination === "masterjob"
                    ? "Extract multiple shipments from a pre-alert document and create them under a Master Job (MCZ)."
                    : "Extract shipping data to a Quote record."}
                </p>
              </div>

              {/* Job Number / Quote Number / MCZ selector */}
              {destination !== "quote" && destination !== "masterjob" ? (
              <div className="space-y-3">
                {/* New / Existing toggle (matches Master Job UX) */}
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="fullSheetMode"
                      value="existing"
                      checked={fullSheetMode === "existing"}
                      onChange={() => setFullSheetMode("existing")}
                      className="accent-[var(--brand-teal)]"
                      data-testid="fs-mode-existing"
                    />
                    <span className="text-xs text-foreground">Add to existing shipment</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="fullSheetMode"
                      value="new"
                      checked={fullSheetMode === "new"}
                      onChange={() => {
                        setFullSheetMode("new");
                        // Lazy-load preview
                        generateNextCZ().then((n) => setNewJobPreview(n));
                      }}
                      className="accent-[var(--brand-teal)]"
                      data-testid="fs-mode-new"
                    />
                    <span className="text-xs text-foreground">Create new shipment</span>
                  </label>
                </div>

              {fullSheetMode === "new" ? (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm"
                  style={{
                    background: "hsl(var(--surface-11))",
                    borderColor: newJobPreview ? "var(--brand-teal)" : "hsl(var(--border-25))",
                  }}
                  data-testid="fs-new-number"
                >
                  <Plus className="w-3.5 h-3.5" style={{ color: "var(--brand-teal)" }} />
                  <span className="font-mono text-sm" style={{ color: "var(--brand-teal)" }}>
                    {newJobPreview || "Generating..."}
                  </span>
                  <span className="text-xs text-muted-foreground/60 ml-1">(will be assigned)</span>
                </div>
              ) : (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Job Number (required)
                </label>
                <div className="relative" ref={jobDropdownRef}>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer"
                    style={{
                      background: "hsl(var(--surface-11))",
                      borderColor: jobNumber ? "var(--brand-teal)" : "hsl(var(--border-25))",
                    }}
                    onClick={() => setJobDropdownOpen(!jobDropdownOpen)}
                    data-testid="job-number-selector"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={jobDropdownOpen ? jobSearch : jobNumber || ""}
                      placeholder="Search or select Job Number..."
                      onChange={(e) => {
                        setJobSearch(e.target.value);
                        if (!jobDropdownOpen) setJobDropdownOpen(true);
                      }}
                      onFocus={() => setJobDropdownOpen(true)}
                      className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/50"
                      data-testid="job-number-input"
                    />
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>

                  {jobDropdownOpen && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-md border overflow-y-auto z-50"
                      style={{
                        background: "hsl(var(--surface-11))",
                        borderColor: "hsl(var(--border-25))",
                        maxHeight: "200px",
                      }}
                    >
                      {filteredJobs.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No matching jobs</div>
                      ) : (
                        filteredJobs.map((jn) => {
                          const s = data.find((d) => d.jobNumber === jn);
                          return (
                            <div
                              key={jn}
                              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-white/5 transition-colors"
                              onClick={() => {
                                setJobNumber(jn);
                                setJobDropdownOpen(false);
                                setJobSearch("");
                              }}
                              data-testid={`job-option-${jn}`}
                            >
                              <span className="font-mono font-medium text-foreground">{jn}</span>
                              {s && (
                                <span className="text-muted-foreground truncate">
                                  — {getColumnValue(s, "Shipper")} → {getColumnValue(s, "Consignee")}
                                </span>
                              )}
                              {jn === jobNumber && <Check className="w-3 h-3 ml-auto" style={{ color: "var(--brand-teal)" }} />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {selectedShipment && (
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    <span>Shipper: <span className="text-foreground">{getColumnValue(selectedShipment, "Shipper")}</span></span>
                    <span>Consignee: <span className="text-foreground">{getColumnValue(selectedShipment, "Consignee")}</span></span>
                    <span>Status: <span className="text-foreground">{getColumnValue(selectedShipment, "Shipment Status")}</span></span>
                  </div>
                )}
              </div>
              )}
              </div>
              ) : destination === "quote" ? (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Quote Number (required)
                </label>
                <div className="relative" ref={quoteDropdownRef}>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer"
                    style={{
                      background: "hsl(var(--surface-11))",
                      borderColor: quoteNumber ? "var(--brand-teal)" : "hsl(var(--border-25))",
                    }}
                    onClick={() => setQuoteDropdownOpen(!quoteDropdownOpen)}
                    data-testid="quote-number-selector"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={quoteDropdownOpen ? quoteSearch : quoteNumber || ""}
                      placeholder="Search or select Quote Number..."
                      onChange={(e) => {
                        setQuoteSearch(e.target.value);
                        if (!quoteDropdownOpen) setQuoteDropdownOpen(true);
                      }}
                      onFocus={() => setQuoteDropdownOpen(true)}
                      className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground/50"
                      data-testid="quote-number-input"
                    />
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>

                  {quoteDropdownOpen && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-md border overflow-y-auto z-50"
                      style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))", maxHeight: "200px" }}
                    >
                      {filteredQuotes.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No matching quotes</div>
                      ) : (
                        filteredQuotes.map((q) => (
                          <div
                            key={q.quoteNumber}
                            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-white/5 transition-colors"
                            onClick={() => {
                              setQuoteNumber(q.quoteNumber);
                              setQuoteDropdownOpen(false);
                              setQuoteSearch("");
                            }}
                            data-testid={`quote-option-${q.quoteNumber}`}
                          >
                            <span className="font-mono font-medium text-foreground">{q.quoteNumber}</span>
                            {q.quoteNumber === quoteNumber && <Check className="w-3 h-3 ml-auto" style={{ color: "var(--brand-teal)" }} />}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              ) : (
              /* ─── MASTER JOB: MCZ mode selector ─── */
              <div className="space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">
                  Master Job Number
                </label>
                {/* New / Existing radio */}
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="masterJobMode"
                      value="new"
                      checked={masterJobMode === "new"}
                      onChange={() => setMasterJobMode("new")}
                      className="accent-amber-400"
                      data-testid="mcz-mode-new"
                    />
                    <span className="text-xs text-foreground">Create new Master Job</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="masterJobMode"
                      value="existing"
                      checked={masterJobMode === "existing"}
                      onChange={() => setMasterJobMode("existing")}
                      className="accent-amber-400"
                      data-testid="mcz-mode-existing"
                    />
                    <span className="text-xs text-foreground">Add to existing</span>
                  </label>
                </div>

                {masterJobMode === "new" ? (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm"
                    style={{
                      background: "hsl(var(--surface-11))",
                      borderColor: masterJobNumber ? "var(--brand-amber)" : "hsl(var(--border-25))",
                    }}
                    data-testid="mcz-new-number"
                  >
                    <Layers className="w-3.5 h-3.5" style={{ color: "var(--brand-amber)" }} />
                    <span className="font-mono text-sm" style={{ color: "var(--brand-amber)" }}>
                      {masterJobNumber || "Generating..."}
                    </span>
                    <span className="text-xs text-muted-foreground/60 ml-1">(will be assigned)</span>
                  </div>
                ) : (
                  <div>
                    {existingMasterNumbers.length === 0 ? (
                      <div className="px-3 py-2 rounded-md border text-xs text-muted-foreground/60 italic"
                        style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))" }}
                      >
                        No existing MCZ numbers found
                      </div>
                    ) : (
                      <select
                        value={selectedExistingMCZ}
                        onChange={(e) => setSelectedExistingMCZ(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border text-sm bg-transparent outline-none"
                        style={{
                          background: "hsl(var(--surface-11))",
                          borderColor: selectedExistingMCZ ? "var(--brand-amber)" : "hsl(var(--border-25))",
                          color: selectedExistingMCZ ? "var(--brand-amber)" : "hsl(var(--fg-60))",
                        }}
                        data-testid="mcz-existing-select"
                      >
                        <option value="">Select existing MCZ...</option>
                        {existingMasterNumbers.map((mcz) => (
                          <option key={mcz} value={mcz}>{mcz}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Input mode toggle */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Input</label>
                <div className="flex gap-2" data-testid="input-mode-selector">
                  <button
                    onClick={() => { setInputMode("pdf"); setTextInput(""); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border transition-all"
                    style={{
                      borderColor: inputMode === "pdf" ? "var(--brand-teal)" : "hsl(var(--border-25))",
                      background: inputMode === "pdf" ? "var(--brand-teal-soft)" : "hsl(var(--surface-11))",
                      color: inputMode === "pdf" ? "var(--brand-teal)" : "hsl(var(--fg-60))",
                    }}
                    data-testid="input-pdf"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    PDF Document
                    {inputMode === "pdf" && <Check className="w-3 h-3 ml-1" />}
                  </button>
                  <button
                    onClick={() => { setInputMode("text"); setFile(null); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border transition-all"
                    style={{
                      borderColor: inputMode === "text" ? "var(--brand-teal)" : "hsl(var(--border-25))",
                      background: inputMode === "text" ? "var(--brand-teal-soft)" : "hsl(var(--surface-11))",
                      color: inputMode === "text" ? "var(--brand-teal)" : "hsl(var(--fg-60))",
                    }}
                    data-testid="input-text"
                  >
                    <Type className="w-3.5 h-3.5" />
                    Text
                    {inputMode === "text" && <Check className="w-3 h-3 ml-1" />}
                  </button>
                </div>
              </div>

              {/* File drop zone OR text input */}
              {inputMode === "pdf" ? (
              <div
                className="rounded-lg border-2 border-dashed p-8 text-center transition-all cursor-pointer"
                style={{
                  borderColor: dragOver ? "var(--brand-teal)" : file ? "hsl(from var(--brand-teal) h s l / 0.4)" : "hsl(var(--border-22))",
                  background: dragOver ? "rgba(20, 184, 166, 0.05)" : file ? "rgba(20, 184, 166, 0.03)" : "hsl(var(--surface-9))",
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="file-drop-zone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff"
                  onChange={handleFileInput}
                  className="hidden"
                  data-testid="file-input"
                />

                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-10 h-10" style={{ color: "var(--brand-teal)" }} />
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="text-xs text-red-400 hover:text-red-300 mt-1"
                      data-testid="remove-file-btn"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Drop PDF here or click to browse</p>
                    <p className="text-xs text-muted-foreground/50">
                      {destination === "fullsheet"
                        ? "Bill of Lading, Sea Waybill, Booking Confirmation, etc."
                        : destination === "invoicing"
                        ? "Invoice, Debit Note, Freight Bill, Customs Declaration, etc."
                        : "Quote request, rate inquiry, booking details, etc."}
                    </p>
                  </div>
                )}
              </div>
              ) : (
              <div>
                <textarea
                  value={textInput}
                  onChange={(e) => {
                    if (e.target.value.length <= 1500) setTextInput(e.target.value);
                  }}
                  placeholder="Paste or type text here to extract data from..."
                  className="w-full h-40 px-3 py-2.5 rounded-lg border-2 text-sm text-foreground placeholder:text-muted-foreground/40 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-[var(--brand-teal)]"
                  style={{
                    borderColor: textInput.length > 0 ? "hsl(from var(--brand-teal) h s l / 0.4)" : "hsl(var(--border-22))",
                    background: "hsl(var(--surface-9))",
                  }}
                  data-testid="text-input-area"
                />
                <div className="flex justify-between mt-1.5">
                  <p className="text-[11px] text-muted-foreground/50">
                    Paste shipping data, email content, or any text with relevant details.
                  </p>
                  <span className={`text-[11px] tabular-nums ${textInput.length >= 1400 ? "text-amber-400" : "text-muted-foreground/50"}`} data-testid="char-counter">
                    {textInput.length.toLocaleString()} / 1,500
                  </span>
                </div>
              </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400" data-testid="error-message">
                  <XCircle className="w-3.5 h-3.5 flex-none" />
                  {error}
                </div>
              )}

              {/* Extract button */}
              {(() => {
                let hasTarget: boolean;
                if (destination === "quote") {
                  hasTarget = !!quoteNumber;
                } else if (destination === "masterjob") {
                  hasTarget = masterJobMode === "new" ? !!masterJobNumber : !!selectedExistingMCZ;
                } else {
                  hasTarget = fullSheetMode === "new" ? !!newJobPreview : !!jobNumber;
                }
                const hasInput = inputMode === "pdf" ? !!file : textInput.trim().length >= 10;
                const canExtract = hasInput && hasTarget;
                const btnLabel =
                  destination === "fullsheet" ? "Extract Data"
                  : destination === "invoicing" ? "Extract Invoice Data"
                  : destination === "masterjob" ? "Extract Pre-Alert"
                  : "Extract Quote Data";
                const btnColor = destination === "masterjob" ? "var(--brand-amber)" : "var(--brand-teal)";
                return (
                  <button
                    onClick={handleExtract}
                    disabled={!canExtract}
                    className="w-full py-2.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: canExtract ? btnColor : "hsl(var(--border-20))",
                      color: canExtract ? "hsl(var(--surface-8))" : "hsl(var(--fg-60))",
                    }}
                    data-testid="extract-btn"
                  >
                    {btnLabel}
                  </button>
                );
              })()}
            </div>
          )}

          {/* ─── STEP 2: Extracting ─── */}
          {step === "extracting" && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: "var(--brand-teal)" }} />
              <p className="text-sm text-muted-foreground">
                {destination === "fullsheet"
                  ? "Analyzing document and extracting shipping data..."
                  : destination === "invoicing"
                  ? "Analyzing invoice and extracting cost data..."
                  : destination === "masterjob"
                  ? (pipelineStep === "classifying" ? "Scanning document pages and classifying..." : "Extracting MBL shared info and first batch of Bills of Lading...")
                  : "Analyzing document and extracting quote data..."}
              </p>
              <p className="text-xs text-muted-foreground/50">{file?.name}</p>
            </div>
          )}

          {/* ─── STEP 3: Review (Full Sheet) ─── */}
          {step === "review" && (destination === "fullsheet" || destination === "quote") && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-md" style={{ background: "hsl(var(--surface-11))" }}>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">
                    Extracted <span className="text-foreground font-medium">{fields.length}</span> fields from{" "}
                    <span className="text-foreground font-medium">{extractionMeta?.fileName}</span>
                  </span>
                  {conflictCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="flex items-center gap-1" style={{ color: "var(--brand-teal)" }}>
                    <CheckCircle2 className="w-3 h-3" />
                    {newFieldCount} new
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={approveAll}
                    className="px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-white/5"
                    style={{ color: "var(--brand-teal)" }}
                    data-testid="approve-all-btn"
                  >
                    Approve All
                  </button>
                  <button
                    onClick={rejectAll}
                    className="px-2 py-1 rounded text-xs font-medium text-red-400 transition-colors hover:bg-white/5"
                    data-testid="reject-all-btn"
                  >
                    Reject All
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <XCircle className="w-3.5 h-3.5 flex-none" />
                  {error}
                </div>
              )}

              {/* Field table */}
              <div className="rounded-md border overflow-hidden" style={{ borderColor: "hsl(var(--border-20))" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "hsl(var(--surface-10))" }}>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10"></th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Field</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Extracted Value</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Existing Value</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, i) => (
                      <tr
                        key={f.column}
                        className="border-t cursor-pointer hover:bg-white/[0.02] transition-colors"
                        style={{ borderColor: "hsl(var(--border-18))" }}
                        onClick={() => toggleField(i)}
                        data-testid={`field-row-${i}`}
                      >
                        <td className="px-3 py-2 text-center">
                          <div
                            className="w-4 h-4 rounded border flex items-center justify-center transition-all"
                            style={{
                              borderColor: f.approved ? "var(--brand-teal)" : "hsl(var(--border-30))",
                              background: f.approved ? "var(--brand-teal)" : "transparent",
                            }}
                          >
                            {f.approved && <Check className="w-2.5 h-2.5 text-black" />}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{f.column}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--brand-teal)" }}>
                          {f.extractedValue}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {f.existingValue || <span className="text-muted-foreground/30 italic">empty</span>}
                        </td>
                        <td className="px-3 py-2">
                          {f.hasConflict ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-amber-400 bg-amber-400/10 text-[10px] font-medium">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Conflict
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: "var(--brand-teal)", background: "rgba(20,184,166,0.1)" }}>
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              New
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Commit button */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep("upload"); setError(null); }}
                  className="flex-none px-4 py-2.5 rounded-md text-sm font-medium border transition-colors hover:bg-white/5"
                  style={{ borderColor: "hsl(var(--border-25))", color: "hsl(var(--fg-70))" }}
                  data-testid="back-btn"
                >
                  Back
                </button>
                <button
                  onClick={destination === "quote" ? handleCommitQuote : handleCommitFullSheet}
                  disabled={approvedCount === 0}
                  className="flex-1 py-2.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: approvedCount > 0 ? "var(--brand-teal)" : "hsl(var(--border-20))",
                    color: approvedCount > 0 ? "hsl(var(--surface-8))" : "hsl(var(--fg-60))",
                  }}
                  data-testid="commit-btn"
                >
                  Write {approvedCount} Field{approvedCount !== 1 ? "s" : ""} to {destination === "quote" ? quoteNumber : jobNumber}
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Review (Invoicing) ─── */}
          {step === "review" && destination === "invoicing" && (
            <div className="space-y-5">
              {/* Summary bar */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-md" style={{ background: "hsl(var(--surface-11))" }}>
                <div className="flex items-center gap-3 text-xs">
                  <Receipt className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                  <span className="text-muted-foreground">
                    Extracted from{" "}
                    <span className="text-foreground font-medium">{extractionMeta?.fileName}</span>
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-foreground font-medium">{jobNumber}</span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <XCircle className="w-3.5 h-3.5 flex-none" />
                  {error}
                </div>
              )}

              {/* Extracted fields display */}
              <div className="rounded-md border overflow-hidden" style={{ borderColor: "hsl(var(--border-20))" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "hsl(var(--surface-10))" }}>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground w-40">Field</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Extracted Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(invoiceData).filter(([, v]) => v).map(([key, value]) => (
                      <tr
                        key={key}
                        className="border-t"
                        style={{ borderColor: "hsl(var(--border-18))" }}
                        data-testid={`inv-field-${key}`}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground/80">
                          {INVOICING_FIELD_LABELS[key] || key}
                        </td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: "var(--brand-teal)" }}>
                          {key === "service_type"
                            ? (COST_CATEGORIES.find((c) => c.key === value)?.label || value)
                            : key === "total_amount" && invoiceData.currency
                            ? `${value} ${invoiceData.currency}`
                            : value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mapping section */}
              <div className="rounded-md border p-4 space-y-4" style={{ borderColor: "hsl(var(--border-20))", background: "hsl(var(--surface-9))" }}>
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Map to Invoicing
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  {/* Target fields (auto-filled) */}
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Real Cost</label>
                    <div className="px-3 py-2 rounded-md border text-sm font-mono" style={{ borderColor: "hsl(var(--border-25))", background: "hsl(var(--surface-11))", color: "var(--brand-teal)" }}>
                      {invoiceData.total_amount
                        ? `${invoiceData.total_amount} ${invoiceData.currency || ""}`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Vendor</label>
                    <div className="px-3 py-2 rounded-md border text-sm font-mono" style={{ borderColor: "hsl(var(--border-25))", background: "hsl(var(--surface-11))", color: "var(--brand-teal)" }}>
                      {invoiceData.vendor || "—"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Invoice Number</label>
                    <div className="px-3 py-2 rounded-md border text-sm font-mono" style={{ borderColor: "hsl(var(--border-25))", background: "hsl(var(--surface-11))", color: "var(--brand-teal)" }}>
                      {invoiceData.invoice_number || "—"}
                    </div>
                  </div>

                  {/* Category selector */}
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">
                      Cost Category <span className="text-red-400">*</span>
                    </label>
                    <div className="relative" ref={catDropdownRef}>
                      <button
                        onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm text-left"
                        style={{
                          borderColor: selectedCategory ? "var(--brand-teal)" : "hsl(var(--border-25))",
                          background: "hsl(var(--surface-11))",
                          color: selectedCategory ? "var(--brand-teal)" : "hsl(var(--fg-60))",
                        }}
                        data-testid="category-selector"
                      >
                        <span>
                          {selectedCategory
                            ? COST_CATEGORIES.find((c) => c.key === selectedCategory)?.label
                            : "Select category..."}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>

                      {categoryDropdownOpen && (
                        <div
                          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border shadow-xl overflow-hidden"
                          style={{ background: "hsl(var(--surface-11))", borderColor: "hsl(var(--border-25))" }}
                        >
                          {COST_CATEGORIES.map((cat) => (
                            <button
                              key={cat.key}
                              onClick={() => {
                                setSelectedCategory(cat.key);
                                setCategoryDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center gap-2 ${
                                cat.key === selectedCategory ? "text-[var(--brand-teal)]" : "text-foreground"
                              }`}
                              data-testid={`cat-opt-${cat.key}`}
                            >
                              {cat.key === selectedCategory && <Check className="w-3 h-3" />}
                              <span className={cat.key === selectedCategory ? "" : "ml-5"}>{cat.label}</span>
                              {cat.key === invoiceData.service_type && cat.key !== selectedCategory && (
                                <span className="ml-auto text-[10px] text-muted-foreground/60 italic">suggested</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Approve toggle */}
                <div
                  className="flex items-center gap-3 pt-2 cursor-pointer"
                  onClick={() => setInvoiceApproved(!invoiceApproved)}
                  data-testid="invoice-approve-toggle"
                >
                  <div
                    className="w-4 h-4 rounded border flex items-center justify-center transition-all"
                    style={{
                      borderColor: invoiceApproved ? "var(--brand-teal)" : "hsl(var(--border-30))",
                      background: invoiceApproved ? "var(--brand-teal)" : "transparent",
                    }}
                  >
                    {invoiceApproved && <Check className="w-2.5 h-2.5 text-black" />}
                  </div>
                  <span className="text-xs text-foreground/80">
                    Approve writing to <span className="font-medium text-foreground">{jobNumber}</span> →{" "}
                    <span className="font-medium" style={{ color: "var(--brand-teal)" }}>
                      {selectedCategory
                        ? COST_CATEGORIES.find((c) => c.key === selectedCategory)?.label
                        : "..."}
                    </span>
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep("upload"); setError(null); }}
                  className="flex-none px-4 py-2.5 rounded-md text-sm font-medium border transition-colors hover:bg-white/5"
                  style={{ borderColor: "hsl(var(--border-25))", color: "hsl(var(--fg-70))" }}
                  data-testid="back-btn"
                >
                  Back
                </button>
                <button
                  onClick={handleCommitInvoicing}
                  disabled={!selectedCategory || !invoiceApproved}
                  className="flex-1 py-2.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: selectedCategory && invoiceApproved ? "var(--brand-teal)" : "hsl(var(--border-20))",
                    color: selectedCategory && invoiceApproved ? "hsl(var(--surface-8))" : "hsl(var(--fg-60))",
                  }}
                  data-testid="commit-invoice-btn"
                >
                  Write to {jobNumber} — {selectedCategory ? COST_CATEGORIES.find((c) => c.key === selectedCategory)?.label : "..."} (Real Cost)
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Review (Master Job) ─── */}
          {step === "review" && destination === "masterjob" && (
            <div className="space-y-4">

              {/* ── Phase: classified (show document analysis results) ── */}
              {pipelineStep === "classified" && pipelineClassification && (
                <div
                  className="rounded-xl border p-6 space-y-5"
                  style={{ background: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.25)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <h3 className="text-sm font-semibold text-foreground">Document Analysis Complete</h3>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground text-xs">
                      {(pipelineClassification.MANIFEST + pipelineClassification.HBL + pipelineClassification.MBL + pipelineClassification.SKIP)} pages scanned:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
                        <span>📋</span>
                        <span className="text-xs text-muted-foreground">Manifest pages:</span>
                        <span className="text-xs font-semibold ml-auto" style={{ color: "var(--brand-amber)" }}>{pipelineClassification.MANIFEST}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
                        <span>📄</span>
                        <span className="text-xs text-muted-foreground">House BL pages:</span>
                        <span className="text-xs font-semibold ml-auto" style={{ color: "var(--brand-amber)" }}>{pipelineClassification.HBL}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
                        <span>📦</span>
                        <span className="text-xs text-muted-foreground">Master BL pages:</span>
                        <span className="text-xs font-semibold ml-auto" style={{ color: "var(--brand-amber)" }}>{pipelineClassification.MBL}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: "hsl(var(--surface-11))", border: "1px solid hsl(var(--border-20))" }}>
                        <span>⏭️</span>
                        <span className="text-xs text-muted-foreground">Skipped:</span>
                        <span className="text-xs font-semibold ml-auto text-muted-foreground">{pipelineClassification.SKIP}</span>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                      <XCircle className="w-3.5 h-3.5 flex-none" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleStartExtraction}
                    className="w-full py-2.5 rounded-md text-sm font-medium transition-all"
                    style={{ background: "var(--brand-amber)", color: "hsl(var(--surface-8))" }}
                    data-testid="extract-shipments-btn"
                  >
                    Extract Shipments from Bills of Lading
                  </button>
                </div>
              )}

              {/* ── Phase: extracting (spinner) ── */}
              {pipelineStep === "extracting" && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin" style={{ color: "var(--brand-amber)" }} />
                  <p className="text-sm text-muted-foreground">Extracting shipments from manifest and MBL...</p>
                </div>
              )}

              {/* ── Phase: ready (per-shipment review) ── */}
              {pipelineStep === "ready" && (
                <>
                  {/* Header: progress + MCZ badge */}
                  <div className="flex items-center justify-between px-4 py-2.5 rounded-md" style={{ background: "hsl(var(--surface-11))" }}>
                    <div className="flex items-center gap-3 text-xs">
                      <Layers className="w-3.5 h-3.5" style={{ color: "var(--brand-amber)" }} />
                      <span className="text-foreground font-medium">
                        Shipment {masterCurrentIndex + 1} of {masterShipments.length}
                      </span>
                      <span className="text-muted-foreground">—</span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                        style={{ background: "rgba(245,158,11,0.12)", color: "var(--brand-amber)", border: "1px solid rgba(245,158,11,0.25)" }}
                      >
                        {masterJobMode === "existing" ? selectedExistingMCZ : masterJobNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{masterCreatedJobs.length} created</span>
                      <div className="flex gap-0.5">
                        {masterShipments.map((_, i) => (
                          <div
                            key={i}
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: i < masterCurrentIndex
                                ? (masterCreatedJobs.length >= i + 1 ? "var(--brand-amber)" : "hsl(var(--border-30))")
                                : i === masterCurrentIndex
                                ? "var(--brand-amber)"
                                : "hsl(var(--border-20))",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                      <XCircle className="w-3.5 h-3.5 flex-none" />
                      {error}
                    </div>
                  )}

                  {/* Field table */}
                  <div className="rounded-md border overflow-hidden" style={{ borderColor: "hsl(var(--border-20))" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "hsl(var(--surface-10))" }}>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10"></th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Field</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Extracted Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {masterFields.map((f, i) => (
                          <tr
                            key={f.column}
                            className="border-t hover:bg-white/[0.02] transition-colors"
                            style={{ borderColor: "hsl(var(--border-18))" }}
                            data-testid={`master-field-row-${i}`}
                          >
                            <td className="px-3 py-2 text-center cursor-pointer" onClick={() => toggleMasterField(i)}>
                              <div
                                className="w-4 h-4 rounded border flex items-center justify-center transition-all"
                                style={{
                                  borderColor: f.approved ? "var(--brand-amber)" : "hsl(var(--border-30))",
                                  background: f.approved ? "var(--brand-amber)" : "transparent",
                                }}
                              >
                                {f.approved && <Check className="w-2.5 h-2.5 text-black" />}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{f.column}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={f.extractedValue}
                                onChange={(e) => updateMasterFieldValue(i, e.target.value)}
                                className="w-full bg-transparent border-none outline-none font-mono text-xs focus:ring-1 focus:ring-amber-400/30 rounded px-1"
                                style={{ color: "var(--brand-amber)" }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setStep("upload"); setError(null); }}
                      className="flex-none px-4 py-2.5 rounded-md text-sm font-medium border transition-colors hover:bg-white/5"
                      style={{ borderColor: "hsl(var(--border-25))", color: "hsl(var(--fg-70))" }}
                      data-testid="master-back-btn"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSkipMasterShipment}
                      className="flex-none px-4 py-2.5 rounded-md text-sm font-medium border transition-colors hover:bg-white/5"
                      style={{ borderColor: "hsl(var(--border-25))", color: "hsl(var(--fg-70))" }}
                      data-testid="master-skip-btn"
                    >
                      Skip
                    </button>
                    <button
                      onClick={handleValidateAndCreate}
                      disabled={masterFields.filter((f) => f.approved).length === 0}
                      className="flex-1 py-2.5 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: masterFields.filter((f) => f.approved).length > 0 ? "var(--brand-amber)" : "hsl(var(--border-20))",
                        color: masterFields.filter((f) => f.approved).length > 0 ? "hsl(var(--surface-8))" : "hsl(var(--fg-60))",
                      }}
                      data-testid="master-validate-btn"
                    >
                      Validate &amp; Create
                      {masterCurrentIndex < masterShipments.length - 1 && " → Next"}
                    </button>
                  </div>

                  {hblTotalBatches > 1 && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-md text-xs mt-3" style={{ background: "hsl(var(--surface-9))", border: "1px solid hsl(var(--border-18))" }}>
                      <span className="text-muted-foreground">
                        Batch {Math.min(hblBatchIndex, hblTotalBatches)} of {hblTotalBatches} · {masterShipments.length} shipments extracted
                      </span>
                      {hblBatchIndex < hblTotalBatches && (
                        <button onClick={loadNextHblBatch} disabled={hblIsLoading}
                          className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                          style={{ background: "rgba(245,158,11,0.15)", color: "var(--brand-amber)", border: "1px solid rgba(245,158,11,0.3)" }}>
                          {hblIsLoading ? "Loading..." : "Load Next Batch"}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}


          {/* ─── STEP 4: Committed ─── */}
          {step === "committed" && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--brand-teal-soft)" }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: "var(--brand-teal)" }} />
              </div>
              {destination === "fullsheet" ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {fullSheetMode === "new"
                      ? `New shipment created — ${newJobPreview} (${approvedCount} field${approvedCount !== 1 ? "s" : ""} pre-filled)`
                      : `${approvedCount} field${approvedCount !== 1 ? "s" : ""} written to ${jobNumber}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Switch to the Shipments tab to see {fullSheetMode === "new" ? "the new shipment" : "the updated data"}.
                  </p>
                </>
              ) : destination === "invoicing" ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    Invoice data written to {jobNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {invoiceData.total_amount && invoiceData.currency
                      ? `${invoiceData.total_amount} ${invoiceData.currency}`
                      : "Amount"}{" "}
                    → {COST_CATEGORIES.find((c) => c.key === selectedCategory)?.label || selectedCategory} (Real Cost)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Switch to the Invoicing tab to see the updated data.
                  </p>
                </>
              ) : destination === "masterjob" ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {masterCreatedJobs.length} shipment{masterCreatedJobs.length !== 1 ? "s" : ""} created under{" "}
                    <span className="font-mono" style={{ color: "var(--brand-amber)" }}>
                      {masterJobMode === "existing" ? selectedExistingMCZ : masterJobNumber}
                    </span>
                  </p>
                  {masterCreatedJobs.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-0.5 text-center">
                      {masterCreatedJobs.map((jn) => (
                        <div key={jn} className="font-mono" style={{ color: "var(--brand-amber)" }}>{jn}</div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Switch to the Full Sheet tab to see the new shipments.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">
                    {approvedCount} field{approvedCount !== 1 ? "s" : ""} written to {quoteNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Switch to the Quote tab to see the updated data.
                  </p>
                </>
              )}
              <button
                onClick={handleReset}
                className="flex items-center gap-2 mt-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-white/5 border"
                style={{ borderColor: "hsl(var(--border-25))", color: destination === "masterjob" ? "var(--brand-amber)" : "var(--brand-teal)" }}
                data-testid="new-extraction-btn"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New Extraction
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step indicator sub-component ────────────────────────────────

function StepIndicator({ label, stepNum, active, done }: { label: string; stepNum: number; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
        style={{
          background: active ? "var(--brand-teal)" : done ? "rgba(20,184,166,0.2)" : "hsl(var(--border-20))",
          color: active ? "hsl(var(--surface-8))" : done ? "var(--brand-teal)" : "hsl(var(--fg-50))",
        }}
      >
        {done ? <Check className="w-3 h-3" /> : stepNum}
      </div>
      <span
        className="font-medium transition-colors"
        style={{ color: active ? "var(--brand-teal)" : done ? "hsl(var(--fg-70))" : "hsl(var(--fg-40))" }}
      >
        {label}
      </span>
    </div>
  );
}
