"use client";

import { useEffect, useMemo, useState } from "react";
import { Select, Button, Checkbox } from "antd";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/AppModal";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { api } from "@/lib/api";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import type { controllers } from "@/lib/api/client";

interface CreateShipmentWizardProps {
  open: boolean;
  onClose: () => void;
  createShipment: (params: controllers.ShipmentCreateRequest) => Promise<controllers.ShipmentCreateResponse>;
  isCreating: boolean;
  existingShipments: ShipmentItem[];
}

type WizardStep = "ask-copy" | "select-fields" | "confirm-costs";

// Ordered field keys offered on the "Select Fields to Copy" step.
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

export const CreateShipmentWizard = ({
  open,
  onClose,
  createShipment,
  isCreating,
  existingShipments,
}: CreateShipmentWizardProps) => {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<WizardStep>("ask-copy");
  const [copyFromId, setCopyFromId] = useState<string>("");
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(COPYABLE_FIELDS));
  const [copyEstimatedCosts, setCopyEstimatedCosts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The next job number is generated on the server so it accounts for archived
  // (soft-deleted) shipments and never reuses a reference.
  const [nextJobNumber, setNextJobNumber] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    api.shipments
      .shipmentNextJobNumber()
      .then((r) => {
        if (active) setNextJobNumber(r.jobNumber);
      })
      .catch(() => {
        if (active) setNextJobNumber("");
      });
    return () => {
      active = false;
    };
  }, [open]);

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

  const resetAndClose = () => {
    setStep("ask-copy");
    setCopyFromId("");
    setSelectedFields(new Set(COPYABLE_FIELDS));
    setCopyEstimatedCosts(false);
    onClose();
  };

  const baseRequest = (): controllers.ShipmentCreateRequest => {
    const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
    return {
      jobNumber: nextJobNumber,
      tradeDirection: "Import",
      freightMode: "Sea Freight",
      department: "Operation Department",
      status: "Booking Confirmation Pending [IMP]",
      customsStatus: "Waiting For Commercial Paperwork",
      personInCharge: user?.email || "",
      createdBy: `${now} — ${user?.email || "System"}`,
    };
  };

  const openCreated = (id: string) => {
    resetAndClose();
    router.push(`/shipments/${id}`);
  };

  const handleCreateBlank = async () => {
    if (!nextJobNumber) {
      toast.error("Generating job number, please wait…");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createShipment(baseRequest());
      toast.success("Shipment created");
      openCreated(result.shipment.id);
    } catch {
      toast.error("Failed to create shipment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateWithCopy = async () => {
    if (!source || !nextJobNumber) return;
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
      (request as unknown as Record<string, string>)[key] = val;
    }

    try {
      const result = await createShipment(request);
      const newId = result.shipment.id;

      if (originValue) {
        await api.shipments.shipmentUpdate(newId, { origin: originValue });
      }

      if (copyEstimatedCosts) {
        try {
          await copyEstimates(source.id, newId);
        } catch {
          toast.error("Shipment created, but copying estimated costs failed");
          openCreated(newId);
          return;
        }
      }

      toast.success("Shipment created");
      openCreated(newId);
    } catch {
      toast.error("Failed to create shipment");
    } finally {
      setSubmitting(false);
    }
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
        : "Copy Estimated Costs?";

  const subtitle =
    step === "ask-copy"
      ? `Job Number: ${nextJobNumber}`
      : step === "select-fields"
        ? `From ${sourceJob} → ${nextJobNumber}`
        : `From ${sourceJob} to Invoicing`;

  const footer =
    step === "ask-copy" ? (
      <div className="flex justify-end gap-2">
        <Button onClick={resetAndClose}>Cancel</Button>
        <Button onClick={handleCreateBlank} loading={busy}>
          Create Blank
        </Button>
        {copyFromId && (
          <Button type="primary" onClick={() => setStep("select-fields")}>
            Next &mdash; Select Fields
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
    ) : (
      <div className="flex justify-end gap-2">
        <Button onClick={() => setStep("select-fields")}>Back</Button>
        <Button type="primary" onClick={handleCreateWithCopy} loading={busy}>
          Create Shipment
        </Button>
      </div>
    );

  return (
    <AppModal open={open} onClose={resetAndClose} title={title} subtitle={subtitle} size="medium" footer={footer}>
      {step === "ask-copy" && (
        <>
          <p className="text-xs text-slate-600 mb-4">Would you like to copy data from a previous shipment?</p>
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
