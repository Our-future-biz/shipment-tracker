"use client";

import { useState, useMemo, useCallback } from "react";
import { Modal, Button, Select, Checkbox } from "antd";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import { useAuth } from "@/lib/auth/AuthContext";
import type { controllers } from "@/lib/api/client";

const COPYABLE_FIELDS = [
  { key: "shipper", label: "Shipper" },
  { key: "consignee", label: "Consignee" },
  { key: "agent", label: "Agent" },
  { key: "personInCharge", label: "PIC email" },
  { key: "incotermOrigin", label: "Incoterm Origin" },
  { key: "incotermDestination", label: "Incoterm Destination" },
  { key: "cargoOrigin", label: "Cargo Origin" },
  { key: "pol", label: "POL" },
  { key: "pod", label: "POD" },
  { key: "destination", label: "Destination" },
  { key: "hsCode", label: "HS Code" },
  { key: "cargoDescription", label: "Goods description" },
] as const;

type Step = "ask-copy" | "select-fields" | "confirm";

interface CreateShipmentWizardProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: controllers.ShipmentCreateRequest) => void;
  isLoading: boolean;
  existingShipments: ShipmentItem[];
}

export const CreateShipmentWizard = ({ open, onClose, onSubmit, isLoading, existingShipments }: CreateShipmentWizardProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("ask-copy");
  const [copyFromJob, setCopyFromJob] = useState("");
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set(COPYABLE_FIELDS.map((f) => f.key))
  );
  const [copyEstimatedCosts, setCopyEstimatedCosts] = useState(false);

  const nextJobNumber = useMemo(() => {
    let maxNum = 0;
    for (const s of existingShipments) {
      const jn = s.jobNumber;
      if (jn?.startsWith("CZ") && !jn.startsWith("CZQ")) {
        const num = parseInt(jn.substring(2), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return `CZ${String(maxNum + 1).padStart(8, "0")}`;
  }, [existingShipments]);

  const jobNumberOptions = useMemo(
    () => existingShipments
      .filter((s) => s.jobNumber)
      .map((s) => ({ value: s.jobNumber, label: `${s.jobNumber} — ${s.shipper || s.consignee || ""}` })),
    [existingShipments],
  );

  const handleReset = useCallback(() => {
    setStep("ask-copy");
    setCopyFromJob("");
    setSelectedFields(new Set(COPYABLE_FIELDS.map((f) => f.key)));
    setCopyEstimatedCosts(false);
  }, []);

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleCreateBlank = () => {
    const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
    const request: controllers.ShipmentCreateRequest = {
      jobNumber: nextJobNumber,
      status: "Booking Confirmation Pending [IMP]",
      tradeDirection: "Import",
      customsStatus: "Waiting For Commercial Paperwork",
      department: "Operation Department",
      personInCharge: user?.email || "",
      createdBy: `${now} — ${user?.email || "System"}`,
    };
    onSubmit(request);
    handleReset();
  };

  const handleCreateWithCopy = () => {
    const source = existingShipments.find((s) => s.jobNumber === copyFromJob);
    if (!source) return;

    const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
    const data: controllers.ShipmentCreateRequest = {
      jobNumber: nextJobNumber,
      status: "Booking Confirmation Pending [IMP]",
      tradeDirection: "Import",
      customsStatus: "Waiting For Commercial Paperwork",
      department: "Operation Department",
      personInCharge: user?.email || "",
      createdBy: `${now} — ${user?.email || "System"}`,
    };

    // Copy selected fields from source
    for (const fieldKey of selectedFields) {
      const val = getFieldValue(source, fieldKey);
      if (!val) continue;
      Object.assign(data, { [fieldKey]: val });
    }

    onSubmit(data);
    handleReset();
  };

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <Modal
      title="New Shipment"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={480}
      destroyOnClose
    >
      {/* Step 1: Ask Copy */}
      {step === "ask-copy" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Next Job Number: <span className="font-mono font-semibold text-teal-600">{nextJobNumber}</span>
          </p>
          <p className="text-sm">Would you like to copy data from a previous shipment?</p>
          <div className="flex gap-3">
            <Button block onClick={() => setStep("select-fields")}>
              Yes, copy from previous
            </Button>
            <Button block type="primary" onClick={handleCreateBlank} loading={isLoading}>
              No, create blank
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select fields to copy */}
      {step === "select-fields" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Job Number: <span className="font-mono font-semibold text-teal-600">{nextJobNumber}</span>
          </p>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Copy from shipment:
            </label>
            <Select
              showSearch
              style={{ width: "100%" }}
              placeholder="Search by job number..."
              value={copyFromJob || undefined}
              onChange={setCopyFromJob}
              options={jobNumberOptions}
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">
              Fields to copy:
            </label>
            <div className="grid grid-cols-2 gap-1">
              {COPYABLE_FIELDS.map((f) => (
                <Checkbox
                  key={f.key}
                  checked={selectedFields.has(f.key)}
                  onChange={() => toggleField(f.key)}
                >
                  <span className="text-xs">{f.label}</span>
                </Checkbox>
              ))}
            </div>
          </div>

          <Checkbox
            checked={copyEstimatedCosts}
            onChange={(e) => setCopyEstimatedCosts(e.target.checked)}
          >
            <span className="text-xs">Also copy estimated costs</span>
          </Checkbox>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => setStep("ask-copy")}>Back</Button>
            <Button
              type="primary"
              block
              disabled={!copyFromJob}
              onClick={handleCreateWithCopy}
              loading={isLoading}
            >
              Create Shipment
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
