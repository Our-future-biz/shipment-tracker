"use client";

import { useState, useEffect, useCallback } from "react";
import { Select, Button, message, Tag } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useShipments } from "@/hooks/useShipments";
import { useInvoicing } from "@/hooks/useInvoicing";
import { CURRENCIES } from "@/lib/enums";
import { CostGrid } from "./CostGrid";

export const InvoicingView = () => {
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
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
    messageApi.success("Billing saved");
  };

  const handleGenerate = async (type: string) => {
    const result = await generateInvoice({ jobNumber: selectedShipment?.jobNumber ?? "", invoiceType: type, billingCurrency, totalAmount: "0.00" });
    messageApi.success(`Invoice ${result.invoice.invoiceNumber} generated`);
  };

  return (
    <div className="h-full flex flex-col">
      {contextHolder}
      <div className="flex-none flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <Select placeholder="Select a shipment..." value={selectedShipmentId} onChange={setSelectedShipmentId} style={{ width: 380 }} size="small" showSearch filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())} options={shipments.map((s) => ({ value: s.id, label: `${s.jobNumber} — ${s.shipper} → ${s.consignee}` }))} />
        {selectedShipment && <Tag color="blue" className="!text-xs">{selectedShipment.jobNumber}</Tag>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {!selectedShipmentId ? <div className="flex items-center justify-center h-full text-gray-400 text-sm">Select a shipment to view invoicing</div>
        : invoicingLoading ? <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading...</div>
        : (
          <div className="p-4 space-y-6 max-w-[1100px]">
            <CostGrid costs={invoicingData?.costs ?? []} onSave={upsertCost} />
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Billing Settings</h3>
              <div className="flex items-center gap-3">
                <label className="text-[11px] text-gray-500">Currency:</label>
                <select value={billingCurrency} onChange={(e) => setBillingCurrency(e.target.value)} className="bg-transparent border border-gray-200 dark:border-gray-700 rounded text-[11px] px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                <label className="text-[11px] text-gray-500">ROE:</label>
                <input value={roe} onChange={(e) => setRoe(e.target.value)} className="bg-transparent border border-gray-200 dark:border-gray-700 rounded text-[11px] px-2 py-1 w-20 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50" />
                <button onClick={saveBilling} className="text-[11px] px-3 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 transition-colors">Save</button>
              </div>
            </section>
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Generate Invoice</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handleGenerate("breakdown")} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-teal-500 hover:text-teal-600 transition-colors"><PrinterOutlined style={{ fontSize: 12 }} /> Breakdown</button>
                <button onClick={() => handleGenerate("total")} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-teal-500 hover:text-teal-600 transition-colors"><PrinterOutlined style={{ fontSize: 12 }} /> Total Only</button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
