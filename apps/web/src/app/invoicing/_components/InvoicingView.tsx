"use client";

import { useState, useEffect } from "react";
import { Select, Button, Tag } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useShipments } from "@/hooks/useShipments";
import { useInvoicing } from "@/hooks/useInvoicing";
import { CURRENCIES } from "@/lib/enums";
import { CostGrid } from "./CostGrid";
import { PageHeader } from "@/components/PageHeader";
import { AppCard } from "@/components/AppCard";
import { useToast } from "@/lib/toast";

export const InvoicingView = () => {
  const toast = useToast();
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const { shipments } = useShipments();
  const { data: invoicingData, isLoading: invoicingLoading, upsertCost, upsertBilling, generateInvoice } = useInvoicing(selectedShipmentId);
  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId);
  const [billingCurrency, setBillingCurrency] = useState("CZK");
  const [roe, setRoe] = useState("1");

  useEffect(() => {
    if (invoicingData?.billingSettings) {
      setBillingCurrency(invoicingData.billingSettings.billingCurrency);
      setRoe(invoicingData.billingSettings.roe);
    }
  }, [invoicingData]);

  const saveBilling = async () => {
    if (!selectedShipmentId) return;
    await upsertBilling({ billingCurrency, roe });
    toast.success("Billing saved");
  };

  const handleGenerate = async (type: string) => {
    const result = await generateInvoice({ jobNumber: selectedShipment?.jobNumber ?? "", invoiceType: type, billingCurrency, totalAmount: "0.00" });
    toast.success(`Invoice ${result.invoice.invoiceNumber} generated`);
  };

  return (
    <div style={{ background: "#f8fafc", minHeight: "100%", padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <PageHeader title="Invoicing" />

        <AppCard style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Select
              placeholder="Select a shipment..."
              value={selectedShipmentId}
              onChange={setSelectedShipmentId}
              style={{ width: 400 }}
              showSearch
              filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              options={shipments.map((s) => ({ value: s.id, label: `${s.jobNumber} \u2014 ${s.shipper} \u2192 ${s.consignee}` }))}
            />
            {selectedShipment && (
              <Tag
                bordered={false}
                style={{
                  backgroundColor: "#e0e7ff",
                  color: "#6366f1",
                  borderRadius: 12,
                  fontWeight: 500,
                  fontSize: 12,
                  padding: "2px 10px",
                }}
              >
                {selectedShipment.jobNumber}
              </Tag>
            )}
          </div>
        </AppCard>

        {!selectedShipmentId ? (
          <AppCard>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#94a3b8", fontSize: 14 }}>
              Select a shipment to view invoicing
            </div>
          </AppCard>
        ) : invoicingLoading ? (
          <AppCard>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#94a3b8", fontSize: 14 }}>
              Loading...
            </div>
          </AppCard>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 }}>
            <AppCard title="Costs">
              <CostGrid costs={invoicingData?.costs ?? []} onSave={upsertCost} />
            </AppCard>

            <AppCard title="Billing Settings">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ fontSize: 12, color: "#64748b" }}>Currency:</label>
                <select
                  value={billingCurrency}
                  onChange={(e) => setBillingCurrency(e.target.value)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                    padding: "4px 8px",
                    color: "#334155",
                    outline: "none",
                  }}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label style={{ fontSize: 12, color: "#64748b" }}>ROE:</label>
                <input
                  value={roe}
                  onChange={(e) => setRoe(e.target.value)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                    padding: "4px 8px",
                    width: 80,
                    color: "#334155",
                    outline: "none",
                  }}
                />
                <Button type="primary" size="small" onClick={saveBilling}>
                  Save
                </Button>
              </div>
            </AppCard>

            <AppCard title="Generate Invoice">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handleGenerate("breakdown")}
                  style={{ borderColor: "#e2e8f0" }}
                >
                  Breakdown
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handleGenerate("total")}
                  style={{ borderColor: "#e2e8f0" }}
                >
                  Total Only
                </Button>
              </div>
            </AppCard>
          </div>
        )}
      </div>
    </div>
  );
};
