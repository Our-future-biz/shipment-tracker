"use client";

import { useState, useMemo } from "react";
import { Input, Select, Button } from "antd";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/AppModal";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ShipmentItem } from "@/hooks/useShipments";
import type { controllers } from "@/lib/api/client";

interface CreateShipmentWizardProps {
  open: boolean;
  onClose: () => void;
  createShipment: (params: controllers.ShipmentCreateRequest) => Promise<controllers.ShipmentCreateResponse>;
  isCreating: boolean;
  existingShipments: ShipmentItem[];
}

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
  const [customer, setCustomer] = useState("");
  const [tradeDirection, setTradeDirection] = useState("Import");
  const [freightMode, setFreightMode] = useState("Sea Freight");
  const [department, setDepartment] = useState("Operation Department");

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

  const handleReset = () => {
    setCustomer("");
    setTradeDirection("Import");
    setFreightMode("Sea Freight");
    setDepartment("Operation Department");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleCreate = async () => {
    const now = new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
    const request: controllers.ShipmentCreateRequest = {
      jobNumber: nextJobNumber,
      customer,
      tradeDirection,
      freightMode,
      department,
      status: tradeDirection === "Export" ? "Booking Confirmation Pending [EXP]" : "Booking Confirmation Pending [IMP]",
      customsStatus: "Waiting For Commercial Paperwork",
      personInCharge: user?.email || "",
      createdBy: `${now} — ${user?.email || "System"}`,
    };

    try {
      const result = await createShipment(request);
      toast.success("Shipment created");
      handleReset();
      onClose();
      if (result?.shipment?.id) {
        router.push(`/shipments/${result.shipment.id}`);
      }
    } catch {
      toast.error("Failed to create shipment");
    }
  };

  const fieldStyle: React.CSSProperties = { marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 4 };

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title="New Shipment"
      subtitle={`Job Number: ${nextJobNumber}`}
      size="small"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" onClick={handleCreate} loading={isCreating}>
            Create & Open
          </Button>
        </div>
      }
    >
      <div style={fieldStyle}>
        <label style={labelStyle}>Customer</label>
        <Input
          placeholder="Customer name"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Trade Direction</label>
        <Select
          value={tradeDirection}
          onChange={setTradeDirection}
          style={{ width: "100%" }}
          options={[
            { value: "Import", label: "Import" },
            { value: "Export", label: "Export" },
          ]}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Freight Mode</label>
        <Select
          value={freightMode}
          onChange={setFreightMode}
          style={{ width: "100%" }}
          options={[
            { value: "Sea Freight", label: "Sea FCL" },
            { value: "Sea Freight", label: "Sea LCL" },
            { value: "Air Freight", label: "Air" },
            { value: "Road Freight", label: "Road" },
            { value: "Rail Freight", label: "Rail" },
          ]}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Department</label>
        <Select
          value={department}
          onChange={setDepartment}
          style={{ width: "100%" }}
          options={[
            { value: "Operation Department", label: "OPS" },
            { value: "Custom Department", label: "CUSTOMS" },
            { value: "Road Department", label: "TRUCKING" },
            { value: "Administration Department", label: "AD / ACCOUNTING" },
          ]}
        />
      </div>
    </AppModal>
  );
};
