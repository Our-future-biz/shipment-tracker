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
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1400px] mx-auto">
        <PageHeader title="Invoicing" />

        <AppCard className="mb-5">
          <div className="flex items-center gap-4">
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
                className="bg-indigo-100 text-indigo-500 rounded-xl font-medium text-xs px-2.5 py-0.5"
              >
                {selectedShipment.jobNumber}
              </Tag>
            )}
          </div>
        </AppCard>

        {!selectedShipmentId ? (
          <AppCard>
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
              Select a shipment to view invoicing
            </div>
          </AppCard>
        ) : invoicingLoading ? (
          <AppCard>
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
              Loading...
            </div>
          </AppCard>
        ) : (
          <div className="flex flex-col gap-5 max-w-[1100px]">
            <AppCard title="Costs">
              <CostGrid costs={invoicingData?.costs ?? []} onSave={upsertCost} />
            </AppCard>

            <AppCard title="Billing Settings">
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">Currency:</label>
                <select
                  value={billingCurrency}
                  onChange={(e) => setBillingCurrency(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 text-slate-700 outline-none"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="text-xs text-slate-500">ROE:</label>
                <input
                  value={roe}
                  onChange={(e) => setRoe(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md text-xs px-2 py-1 w-20 text-slate-700 outline-none"
                />
                <Button type="primary" size="small" onClick={saveBilling}>
                  Save
                </Button>
              </div>
            </AppCard>

            <AppCard title="Generate Invoice">
              <div className="flex items-center gap-2">
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handleGenerate("breakdown")}
                  className="border-slate-200"
                >
                  Breakdown
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handleGenerate("total")}
                  className="border-slate-200"
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
