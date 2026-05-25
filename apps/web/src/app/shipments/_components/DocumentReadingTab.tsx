"use client";

import { useState, useCallback } from "react";
import { Upload, Button, Input, Segmented, Spin, Table, Checkbox, Select, Tag, Alert, Card, Space, message, Descriptions } from "antd";
import { InboxOutlined, FileTextOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { COLUMNS } from "@/lib/columnConfig";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";

type Destination = "fullsheet" | "invoicing" | "quote" | "masterjob";
type InputMode = "file" | "text";
type Step = "upload" | "extracting" | "review" | "committed";

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

// Map extracted field names to our API field names
const FIELD_NAME_MAP: Record<string, string> = {
  "Shipper": "shipper",
  "Consignee": "consignee",
  "Personal Reference": "personalReference",
  "Container Number": "containerNumber",
  "Booking Number": "bookingNumber",
  "Load Type": "loadType",
  "Shipping line / Coloader": "shippingLine",
  "POL": "pol",
  "POD": "pod",
  "Destination": "destination",
  "HS Code": "hsCode",
  "Cargo Description": "cargoDescription",
  "House BoL Number": "houseBolNumber",
  "Master BoL Number": "masterBolNumber",
  "House BoL Type": "houseBolType",
  "Master BoL Type": "masterBolType",
  "Vessel": "vessel",
  "Voyage": "voyage",
  "PCS": "pcs",
  "Total Weight In Tons": "totalWeightTons",
  "Total Volume In CBM": "totalVolumeCbm",
  "Cargo Origin": "cargoOrigin",
  "Country code": "countryCode",
  "Origin": "origin",
  "Estimated Departure": "estimatedDeparture",
  "Estimated Arrival": "estimatedArrival",
  "Trade Direction": "tradeDirection",
  "Agent": "agent",
  "Incoterm Origin": "incotermOrigin",
  "Incoterm Destination": "incotermDestination",
  "Commercial Invoice Value": "commercialInvoiceValue",
};

function normalizeExtracted(raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    let v = value;
    if (key === "Load Type") {
      if (v === "FCL") v = "Full Load";
      else if (v === "LCL") v = "Consolidation";
    }
    if (key === "Trade Direction") {
      if (v === "IMP") v = "Import";
      else if (v === "EXP") v = "Export";
    }
    result[key] = v;
  }
  return result;
}

const COST_CATEGORIES = [
  { value: "freight", label: "Freight" },
  { value: "collection", label: "Collection/Delivery" },
  { value: "locals", label: "Locals" },
  { value: "others", label: "Others" },
  { value: "insurance", label: "Insurance" },
  { value: "customs", label: "Customs clearance" },
];

interface DocumentReadingTabProps {
  shipments: ShipmentItem[];
}

export function DocumentReadingTab({ shipments }: DocumentReadingTabProps) {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const [destination, setDestination] = useState<Destination>("fullsheet");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [step, setStep] = useState<Step>("upload");
  const [fileBase64, setFileBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [textInput, setTextInput] = useState("");

  // Fullsheet / Quote review
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [targetShipmentId, setTargetShipmentId] = useState<string>("");
  const [extractionMethod, setExtractionMethod] = useState("");

  // Invoice review
  const [invoiceData, setInvoiceData] = useState<InvoiceExtracted>({});
  const [selectedCategory, setSelectedCategory] = useState("");
  const [invoiceTargetShipmentId, setInvoiceTargetShipmentId] = useState("");

  // Master Job pipeline
  const [pipelineSessionId, setPipelineSessionId] = useState("");
  const [pipelineClassification, setPipelineClassification] = useState<Record<string, number>>({});
  const [masterShipments, setMasterShipments] = useState<Record<string, string>[]>([]);
  const [masterCurrentIdx, setMasterCurrentIdx] = useState(0);
  const [pipelineStep, setPipelineStep] = useState<"idle" | "classifying" | "classified" | "extracting" | "ready">("idle");

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1] || "";
      setFileBase64(base64);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
    return false; // prevent antd auto upload
  }, []);

  const handleExtract = async () => {
    setStep("extracting");
    try {
      if (destination === "fullsheet") {
        const result = inputMode === "file"
          ? await api.extraction.extractDocument({ fileBase64, fileName })
          : await api.extraction.extractText({ text: textInput, destination: "shipment" });

        const normalized = normalizeExtracted(result.extracted);
        setExtractionMethod(result.method);

        // Build field list with conflict detection
        const target = shipments.find((s) => s.id === targetShipmentId);
        const fieldList: ExtractedField[] = Object.entries(normalized).map(([col, extractedValue]) => {
          const apiField = FIELD_NAME_MAP[col] || col;
          const existingValue = target ? getFieldValue(target, apiField) : "";
          return {
            column: col,
            extractedValue,
            existingValue,
            hasConflict: !!existingValue && existingValue !== extractedValue,
            approved: !existingValue || existingValue === extractedValue, // auto-approve if no conflict
          };
        });
        setFields(fieldList);
        setStep("review");

      } else if (destination === "invoicing") {
        const result = inputMode === "file"
          ? await api.extraction.extractInvoice({ fileBase64, fileName })
          : await api.extraction.extractText({ text: textInput, destination: "invoicing" });

        setInvoiceData(result.extracted);
        if (result.extracted.service_type) {
          const cat = COST_CATEGORIES.find((c) => c.value === result.extracted.service_type);
          if (cat) setSelectedCategory(cat.value);
        }
        setStep("review");

      } else if (destination === "quote") {
        const result = inputMode === "file"
          ? await api.extraction.extractQuote({ fileBase64, fileName })
          : await api.extraction.extractText({ text: textInput, destination: "quote" });

        const normalized = normalizeExtracted(result.extracted);
        const fieldList: ExtractedField[] = Object.entries(normalized).map(([col, extractedValue]) => ({
          column: col,
          extractedValue,
          existingValue: "",
          hasConflict: false,
          approved: true,
        }));
        setFields(fieldList);
        setStep("review");

      } else if (destination === "masterjob") {
        setPipelineStep("classifying");
        const result = await api.extraction.pipelinePrepare({ fileBase64, fileName });
        setPipelineSessionId(result.sessionId);
        setPipelineClassification(result.classification);
        setPipelineStep("classified");
        setStep("review");
      }
    } catch (err) {
      messageApi.error("Extraction failed. Please try again.");
      setStep("upload");
    }
  };

  const handleStartMasterExtraction = async () => {
    setPipelineStep("extracting");
    try {
      // Phase 2a: Extract MBL
      await api.extraction.pipelineExtractMbl({ sessionId: pipelineSessionId });

      // Phase 2b: Extract HBL batch 0
      const hblResult = await api.extraction.pipelineExtractHbl({ sessionId: pipelineSessionId, batchIndex: 0 });
      setMasterShipments(hblResult.shipments);
      setMasterCurrentIdx(0);
      setPipelineStep("ready");
    } catch {
      messageApi.error("Pipeline extraction failed");
      setPipelineStep("classified");
    }
  };

  const handleCommitFullsheet = async () => {
    const approved = fields.filter((f) => f.approved);
    if (approved.length === 0) {
      messageApi.warning("No fields approved");
      return;
    }

    const updateData: Record<string, string> = {};
    for (const f of approved) {
      const apiField = FIELD_NAME_MAP[f.column] || f.column;
      updateData[apiField] = f.extractedValue;
    }

    try {
      if (targetShipmentId) {
        await api.shipments.shipmentUpdate(targetShipmentId, updateData);
      } else {
        // Create new shipment
        const maxNum = shipments.reduce((max, s) => {
          if (s.jobNumber?.startsWith("CZ") && !s.jobNumber.startsWith("CZQ")) {
            const num = parseInt(s.jobNumber.substring(2), 10);
            return isNaN(num) ? max : Math.max(max, num);
          }
          return max;
        }, 0);
        const jobNumber = `CZ${String(maxNum + 1).padStart(8, "0")}`;
        await api.shipments.shipmentCreate({
          jobNumber,
          status: "Booking Confirmation Pending [IMP]",
          tradeDirection: updateData.tradeDirection || "Import",
          customsStatus: "Waiting For Commercial Paperwork",
          ...updateData,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      messageApi.success("Data committed successfully");
      setStep("committed");
    } catch {
      messageApi.error("Failed to commit data");
    }
  };

  const handleCommitInvoice = async () => {
    if (!selectedCategory) {
      messageApi.warning("Please select a cost category");
      return;
    }
    if (!invoiceTargetShipmentId) {
      messageApi.warning("Please select a target shipment");
      return;
    }

    try {
      await api.invoicing.invoicingUpsertCost(invoiceTargetShipmentId, {
        category: selectedCategory,
        realAmount: invoiceData.total_amount || "",
        realCurrency: invoiceData.currency || "CZK",
        invoiceNumber: invoiceData.invoice_number || "",
        vendor: invoiceData.vendor || "",
      });
      queryClient.invalidateQueries({ queryKey: ["invoicing"] });
      messageApi.success("Invoice data committed");
      setStep("committed");
    } catch {
      messageApi.error("Failed to commit invoice data");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setFileBase64("");
    setFileName("");
    setTextInput("");
    setFields([]);
    setInvoiceData({});
    setSelectedCategory("");
    setTargetShipmentId("");
    setInvoiceTargetShipmentId("");
    setPipelineSessionId("");
    setPipelineClassification({});
    setMasterShipments([]);
    setMasterCurrentIdx(0);
    setPipelineStep("idle");
    setExtractionMethod("");
  };

  const toggleFieldApproval = (idx: number) => {
    setFields((prev) => prev.map((f, i) => i === idx ? { ...f, approved: !f.approved } : f));
  };

  const shipmentOptions = shipments.map((s) => ({
    value: s.id,
    label: `${s.jobNumber} — ${s.shipper || s.consignee || ""}`,
  }));

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      {contextHolder}

      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={destination}
          onChange={(v) => { setDestination(v as Destination); handleReset(); }}
          options={[
            { value: "fullsheet", label: "Shipment" },
            { value: "invoicing", label: "Invoice" },
            { value: "quote", label: "Quote" },
            { value: "masterjob", label: "Master Job" },
          ]}
        />
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          {destination !== "masterjob" && (
            <div style={{ marginBottom: 16 }}>
              <Segmented
                size="small"
                value={inputMode}
                onChange={(v) => setInputMode(v as InputMode)}
                options={[
                  { value: "file", label: "Upload File" },
                  { value: "text", label: "Paste Text" },
                ]}
              />
            </div>
          )}

          {(inputMode === "file" || destination === "masterjob") && (
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              beforeUpload={handleFileSelect}
              showUploadList={false}
              style={{ marginBottom: 16 }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{fileName || "Click or drag a file (PDF, JPG, PNG)"}</p>
            </Upload.Dragger>
          )}

          {inputMode === "text" && destination !== "masterjob" && (
            <Input.TextArea
              rows={6}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste document text here (max 1500 characters)..."
              maxLength={1500}
              showCount
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Target shipment selector for fullsheet */}
          {destination === "fullsheet" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
                Update existing shipment (or leave empty to create new):
              </label>
              <Select
                showSearch
                allowClear
                style={{ width: "100%" }}
                placeholder="Select shipment..."
                value={targetShipmentId || undefined}
                onChange={(v) => setTargetShipmentId(v || "")}
                options={shipmentOptions}
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </div>
          )}

          {/* Target shipment for invoicing */}
          {destination === "invoicing" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
                Target shipment for invoice costs:
              </label>
              <Select
                showSearch
                style={{ width: "100%" }}
                placeholder="Select shipment..."
                value={invoiceTargetShipmentId || undefined}
                onChange={(v) => setInvoiceTargetShipmentId(v || "")}
                options={shipmentOptions}
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </div>
          )}

          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={handleExtract}
            disabled={inputMode === "file" ? !fileBase64 : !textInput.trim()}
          >
            Extract Data
          </Button>
        </Card>
      )}

      {/* Step: Extracting */}
      {step === "extracting" && (
        <Card>
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <p style={{ marginTop: 16, color: "#64748b" }}>Extracting data with AI...</p>
          </div>
        </Card>
      )}

      {/* Step: Review — Fullsheet / Quote */}
      {step === "review" && (destination === "fullsheet" || destination === "quote") && (
        <Card>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{fields.length} fields extracted</strong>
              {extractionMethod && <Tag style={{ marginLeft: 8 }}>{extractionMethod}</Tag>}
            </div>
            <Space>
              <Button onClick={handleReset}>Back</Button>
              <Button type="primary" onClick={handleCommitFullsheet}>
                Commit {fields.filter((f) => f.approved).length} Fields
              </Button>
            </Space>
          </div>
          <Table
            size="small"
            pagination={false}
            dataSource={fields.map((f, i) => ({ ...f, key: i }))}
            columns={[
              {
                title: "",
                width: 40,
                render: (_, record, idx) => (
                  <Checkbox checked={record.approved} onChange={() => toggleFieldApproval(idx)} />
                ),
              },
              { title: "Field", dataIndex: "column", width: 200 },
              { title: "Extracted", dataIndex: "extractedValue", ellipsis: true },
              {
                title: "Existing",
                dataIndex: "existingValue",
                ellipsis: true,
                render: (v: string) => v || <span style={{ color: "#d1d5db" }}>—</span>,
              },
              {
                title: "Conflict",
                width: 70,
                render: (_, record) => record.hasConflict ? <Tag color="orange">!</Tag> : null,
              },
            ]}
          />
        </Card>
      )}

      {/* Step: Review — Invoice */}
      {step === "review" && destination === "invoicing" && (
        <Card>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
            <strong>Invoice Data Extracted</strong>
            <Space>
              <Button onClick={handleReset}>Back</Button>
              <Button type="primary" onClick={handleCommitInvoice}>Commit Invoice</Button>
            </Space>
          </div>
          <Descriptions bordered size="small" column={2} items={[
            { key: "amount", label: "Amount", children: invoiceData.total_amount || "—" },
            { key: "currency", label: "Currency", children: invoiceData.currency || "—" },
            { key: "vendor", label: "Vendor", children: invoiceData.vendor || "—" },
            { key: "invoiceNo", label: "Invoice #", children: invoiceData.invoice_number || "—" },
            { key: "invoiceDate", label: "Invoice Date", children: invoiceData.invoice_date || "—" },
            { key: "dueDate", label: "Due Date", children: invoiceData.due_date || "—" },
            { key: "description", label: "Description", children: invoiceData.description || "—", span: 2 },
          ]} />
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Cost Category:</label>
            <Select
              style={{ width: 300 }}
              value={selectedCategory || undefined}
              onChange={setSelectedCategory}
              placeholder="Select category..."
              options={COST_CATEGORIES}
            />
          </div>
        </Card>
      )}

      {/* Step: Review — Master Job */}
      {step === "review" && destination === "masterjob" && (
        <Card>
          {pipelineStep === "classified" && (
            <div>
              <strong>Pages Classified</strong>
              <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
                {Object.entries(pipelineClassification).map(([type, count]) => (
                  <Tag key={type} color={type === "SKIP" ? "default" : "blue"}>{type}: {count}</Tag>
                ))}
              </div>
              <Space>
                <Button onClick={handleReset}>Back</Button>
                <Button type="primary" onClick={handleStartMasterExtraction}>Start Extraction</Button>
              </Space>
            </div>
          )}

          {pipelineStep === "extracting" && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Spin size="large" />
              <p style={{ marginTop: 16, color: "#64748b" }}>Extracting shipments from pages...</p>
            </div>
          )}

          {pipelineStep === "ready" && masterShipments.length > 0 && (
            <div>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <strong>Shipment {masterCurrentIdx + 1} of {masterShipments.length}</strong>
                <Space>
                  <Button disabled={masterCurrentIdx === 0} onClick={() => setMasterCurrentIdx((i) => i - 1)}>Prev</Button>
                  <Button disabled={masterCurrentIdx >= masterShipments.length - 1} onClick={() => setMasterCurrentIdx((i) => i + 1)}>Next</Button>
                  <Button onClick={handleReset}>Done</Button>
                </Space>
              </div>
              <Descriptions bordered size="small" column={2}
                items={Object.entries(masterShipments[masterCurrentIdx] || {}).map(([key, value]) => ({
                  key,
                  label: key,
                  children: value || "—",
                }))}
              />
            </div>
          )}

          {pipelineStep === "ready" && masterShipments.length === 0 && (
            <Alert message="No shipments extracted" type="warning" showIcon />
          )}
        </Card>
      )}

      {/* Step: Committed */}
      {step === "committed" && (
        <Card>
          <Alert
            message="Data committed successfully"
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" onClick={handleReset}>Extract Another</Button>
        </Card>
      )}
    </div>
  );
}
