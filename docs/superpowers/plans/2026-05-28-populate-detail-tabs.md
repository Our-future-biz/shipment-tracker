# Populate Shipment Detail Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move content from the unused `ShipmentDetailModal.tsx` (Costs, Documents, Warehouse, Tracking tabs) into the new page-based `ShipmentDetailContent.tsx`, replacing the 4 empty placeholder tabs.

**Architecture:** Extract each tab's content from the old modal component into standalone tab components (one file per tab). Import them into `ShipmentDetailContent.tsx`. All business logic (API calls, hooks, mutations) stays the same — we're re-housing the UI. The old modal uses inline styles + antd components; the new page uses Tailwind + antd. Each extracted tab must be converted to Tailwind classes (no inline styles). After all tabs are populated, delete the unused modal files.

**Tech Stack:** React, Next.js, TypeScript, Ant Design, Tailwind CSS, TanStack Query, existing API client (`@/lib/api`)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/app/shipments/[jobNumber]/tabs/CostsTab.tsx` | Create | Costs breakdown tab — editable cost table, billing settings, additional charges, quote import, profit summary |
| `apps/web/src/app/shipments/[jobNumber]/tabs/DocumentsTab.tsx` | Create | Documents tab — file upload/download, attachment list |
| `apps/web/src/app/shipments/[jobNumber]/tabs/WarehouseTab.tsx` | Create | Warehouse tab with sub-tabs: Shipment Details (dimensions, stackability, push-to-suppliers), Customs, Pick-up, Invoicing |
| `apps/web/src/app/shipments/[jobNumber]/tabs/TrackingTab.tsx` | Create | Tracking timeline — chronological list of completed tasks |
| `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx` | Modify | Import and render the 4 new tab components, add required state/queries |
| `apps/web/src/app/shipments/_components/ShipmentDetailModal.tsx` | Delete | Unused after migration |
| `apps/web/src/app/shipments/_components/MasterJobDetailModal.tsx` | Delete | Unused (not imported anywhere) |

**Key dependencies already in codebase:**
- `@/lib/api` — API client with `api.shipments.*`, `api.invoicing.*`, `api.warehouse.*`
- `@/hooks/useShipments` — `ShipmentItem` type, `buildRowData`, `getFieldValue`
- `@/hooks/useWarehouseSection` — hook for warehouse section CRUD
- `@/lib/auth/AuthContext` — `useAuth` for current user
- `@/lib/columnConfig` — `computeDimensionTotals`, `COLUMNS`

---

### Task 1: Create CostsTab Component

**Files:**
- Create: `apps/web/src/app/shipments/[jobNumber]/tabs/CostsTab.tsx`
- Modify: `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`

This is the most complex tab. It contains: billing settings bar, editable cost category table (6 rows), additional charges section, quote import, and profit summary. Source: `ShipmentDetailModal.tsx:541-846`.

- [ ] **Step 1: Create the CostsTab file with constants and types**

```tsx
// apps/web/src/app/shipments/[jobNumber]/tabs/CostsTab.tsx
"use client";

import { useState } from "react";
import { Input, Select, Button, Space } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";

const COST_CATEGORIES = [
  { key: "freight", label: "Freight" },
  { key: "collection", label: "Collection/Delivery" },
  { key: "locals", label: "Locals" },
  { key: "others", label: "Others" },
  { key: "insurance", label: "Insurance" },
  { key: "customs", label: "Customs clearance" },
];

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

interface CostRow {
  key: string;
  label: string;
  estAmount: string;
  estCurrency: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  vendor: string;
}

export function CostsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();
  const [quoteInput, setQuoteInput] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoicing", shipment.id],
    queryFn: () => api.invoicing.invoicingGet(shipment.id),
  });

  const upsertCost = useMutation({
    mutationFn: (params: { category: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; invoiceNumber?: string; vendor?: string }) =>
      api.invoicing.invoicingUpsertCost(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const upsertBilling = useMutation({
    mutationFn: (params: { billingCurrency?: string; roe?: string }) =>
      api.invoicing.invoicingUpsertBillingSettings(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const upsertOverride = useMutation({
    mutationFn: (params: { rowKey: string; billingAmount: string }) =>
      api.invoicing.invoicingUpsertBillingOverride(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const addCharge = useMutation({
    mutationFn: (params: { description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string }) =>
      api.invoicing.invoicingAddCharge(shipment.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const updateCharge = useMutation({
    mutationFn: ({ chargeId, ...params }: { chargeId: string; description?: string; estAmount?: string; estCurrency?: string; realAmount?: string; realCurrency?: string; invoiceNumber?: string; vendor?: string }) =>
      api.invoicing.invoicingUpdateCharge(shipment.id, chargeId, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const deleteCharge = useMutation({
    mutationFn: (chargeId: string) => api.invoicing.invoicingDeleteCharge(shipment.id, chargeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] }),
  });

  const importQuoteCosts = async () => {
    if (!quoteInput.trim()) return;
    setQuoteLoading(true);
    setQuoteStatus(null);
    const qn = quoteInput.trim().replace(/-\d+$/, "");
    try {
      const quoteData = await api.invoicing.invoicingGet(qn);
      const quoteCosts = quoteData.costs ?? [];
      if (quoteCosts.length === 0) {
        setQuoteStatus("No costs found for this quote");
        setQuoteLoading(false);
        return;
      }
      let imported = 0;
      for (const c of quoteCosts) {
        if (c.realAmount) {
          await api.invoicing.invoicingUpsertCost(shipment.id, {
            category: c.category,
            estAmount: c.realAmount,
            estCurrency: c.realCurrency || "CZK",
          });
          imported++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["invoicing", shipment.id] });
      setQuoteStatus(`Imported ${imported} cost(s) from ${qn}`);
    } catch {
      setQuoteStatus("Quote not found or error");
    }
    setQuoteLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        Loading costs...
      </div>
    );
  }

  const costs = data?.costs ?? [];
  const charges = data?.additionalCharges ?? [];
  const billing = data?.billingSettings;
  const overrides = data?.billingOverrides ?? [];
  const overrideMap: Record<string, string> = {};
  for (const ov of overrides) if (ov.billingAmount) overrideMap[ov.rowKey] = ov.billingAmount;

  const parseCostNum = (v: string | null | undefined) => { const n = parseFloat(v || ""); return isNaN(n) ? 0 : n; };
  const fmtNum = (n: number) => n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const costRows: CostRow[] = COST_CATEGORIES.map((cat) => {
    const row = costs.find((c) => c.category === cat.key);
    return {
      key: cat.key,
      label: cat.label,
      estAmount: row?.estAmount || "",
      estCurrency: row?.estCurrency || "CZK",
      realAmount: row?.realAmount || "",
      realCurrency: row?.realCurrency || "CZK",
      invoiceNumber: row?.invoiceNumber || "",
      vendor: row?.vendor || "",
    };
  });

  const subtotalEst = costRows.reduce((s, c) => s + parseCostNum(c.estAmount), 0);
  const subtotalReal = costRows.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const chargesReal = charges.reduce((s, c) => s + parseCostNum(c.realAmount), 0);
  const subtotalBilling = costRows.reduce((s, c) => s + parseCostNum(overrideMap[c.key] || c.realAmount), 0);
  const profit = subtotalBilling - (subtotalReal + chargesReal);

  const handleCostBlur = (category: string, field: string, value: string) => {
    upsertCost.mutate({ category, [field]: value });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      {/* Billing settings bar */}
      <div className="flex items-center gap-3 mb-4 p-2 px-3 bg-slate-50 rounded-md border border-slate-200 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Billing</span>
        <Select
          size="small"
          value={billing?.billingCurrency || "CZK"}
          onChange={(v) => upsertBilling.mutate({ billingCurrency: v })}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          className="w-[75px]"
        />
        <span className="text-[11px] text-slate-500">ROE:</span>
        <Input
          size="small"
          className="w-[60px]"
          defaultValue={billing?.roe || "1"}
          onBlur={(e) => upsertBilling.mutate({ roe: e.target.value })}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            size="small"
            placeholder="CZQ00000001"
            value={quoteInput}
            onChange={(e) => { setQuoteInput(e.target.value); setQuoteStatus(null); }}
            onPressEnter={importQuoteCosts}
            className="w-[130px]"
          />
          <Button size="small" type="primary" onClick={importQuoteCosts} loading={quoteLoading} disabled={!quoteInput.trim()}>
            Import
          </Button>
          {quoteStatus && (
            <span className={`text-[11px] ${quoteStatus.startsWith("Imported") ? "text-green-600" : "text-amber-500"}`}>
              {quoteStatus}
            </span>
          )}
        </div>
      </div>

      {/* Editable costs table */}
      <table className="w-full border-collapse text-xs mb-4">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left p-2 px-3 font-semibold text-slate-500">Category</th>
            <th className="text-right p-2 font-semibold text-slate-500">Est. Amount</th>
            <th className="text-center p-2 px-1 font-semibold text-slate-500">Cur</th>
            <th className="text-right p-2 font-semibold text-slate-500">Real Cost</th>
            <th className="text-center p-2 px-1 font-semibold text-slate-500">Cur</th>
            <th className="text-left p-2 font-semibold text-slate-500">Invoice #</th>
            <th className="text-left p-2 font-semibold text-slate-500">Vendor</th>
            <th className="text-right p-2 font-semibold text-slate-500">Billing</th>
          </tr>
        </thead>
        <tbody>
          {costRows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100">
              <td className="p-1.5 px-3 text-slate-700">{row.label}</td>
              <td className="p-1 text-right">
                <Input size="small" defaultValue={row.estAmount} placeholder="—" className="w-[76px] text-right"
                  onBlur={(e) => handleCostBlur(row.key, "estAmount", e.target.value)} />
              </td>
              <td className="p-1 px-0.5 text-center">
                <Select size="small" defaultValue={row.estCurrency} className="w-[62px]"
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "estCurrency", v)} />
              </td>
              <td className="p-1 text-right">
                <Input size="small" defaultValue={row.realAmount} placeholder="—" className="w-[76px] text-right"
                  onBlur={(e) => handleCostBlur(row.key, "realAmount", e.target.value)} />
              </td>
              <td className="p-1 px-0.5 text-center">
                <Select size="small" defaultValue={row.realCurrency} className="w-[62px]"
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => handleCostBlur(row.key, "realCurrency", v)} />
              </td>
              <td className="p-1">
                <Input size="small" defaultValue={row.invoiceNumber} placeholder="—" className="w-[85px]"
                  onBlur={(e) => handleCostBlur(row.key, "invoiceNumber", e.target.value)} />
              </td>
              <td className="p-1">
                <Input size="small" defaultValue={row.vendor} placeholder="—" className="w-[85px]"
                  onBlur={(e) => handleCostBlur(row.key, "vendor", e.target.value)} />
              </td>
              <td className="p-1 text-right">
                <Input size="small" defaultValue={overrideMap[row.key] || row.realAmount} placeholder="—" className="w-[76px] text-right font-semibold"
                  onBlur={(e) => upsertOverride.mutate({ rowKey: row.key, billingAmount: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 font-bold">
            <td className="p-2 px-3">Subtotal</td>
            <td className="p-2 text-right">{fmtNum(subtotalEst)}</td>
            <td />
            <td className="p-2 text-right">{fmtNum(subtotalReal)}</td>
            <td />
            <td colSpan={2} />
            <td className="p-2 text-right">{fmtNum(subtotalBilling)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Additional Charges */}
      <div className="flex items-center justify-between mb-2">
        <strong className="text-xs">Additional Charges</strong>
        <Button size="small" onClick={() => addCharge.mutate({})}>+ Add</Button>
      </div>

      {charges.length > 0 && (
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Description</th>
              <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Est.</th>
              <th className="text-center p-1.5 px-1 font-semibold text-slate-500">Cur</th>
              <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Real</th>
              <th className="text-center p-1.5 px-1 font-semibold text-slate-500">Cur</th>
              <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Invoice</th>
              <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Vendor</th>
              <th className="w-[30px]" />
            </tr>
          </thead>
          <tbody>
            {charges.map((ac) => (
              <tr key={ac.id} className="border-b border-slate-100">
                <td className="p-1">
                  <Input size="small" defaultValue={ac.description} placeholder="Description"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, description: e.target.value })} />
                </td>
                <td className="p-1 text-right">
                  <Input size="small" defaultValue={ac.estAmount || ""} placeholder="—" className="w-[70px] text-right"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, estAmount: e.target.value })} />
                </td>
                <td className="p-1 px-0.5">
                  <Select size="small" defaultValue={ac.estCurrency || "CZK"} className="w-[60px]"
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onChange={(v) => updateCharge.mutate({ chargeId: ac.id, estCurrency: v })} />
                </td>
                <td className="p-1 text-right">
                  <Input size="small" defaultValue={ac.realAmount || ""} placeholder="—" className="w-[70px] text-right"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, realAmount: e.target.value })} />
                </td>
                <td className="p-1 px-0.5">
                  <Select size="small" defaultValue={ac.realCurrency || "CZK"} className="w-[60px]"
                    options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                    onChange={(v) => updateCharge.mutate({ chargeId: ac.id, realCurrency: v })} />
                </td>
                <td className="p-1">
                  <Input size="small" defaultValue={ac.invoiceNumber} placeholder="—" className="w-[80px]"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, invoiceNumber: e.target.value })} />
                </td>
                <td className="p-1">
                  <Input size="small" defaultValue={ac.vendor} placeholder="—" className="w-[80px]"
                    onBlur={(e) => updateCharge.mutate({ chargeId: ac.id, vendor: e.target.value })} />
                </td>
                <td className="p-1 px-0.5">
                  <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />}
                    onClick={() => deleteCharge.mutate(ac.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {charges.length === 0 && (
        <div className="p-4 text-center border border-dashed border-slate-200 rounded-md text-slate-400 text-xs">
          No additional charges. Click + Add to create one.
        </div>
      )}

      {/* Profit summary */}
      <div className="mt-3 p-2.5 px-3 bg-slate-50 rounded-md flex justify-between items-center">
        <span className="text-xs font-semibold">Profit</span>
        <span className={`text-sm font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
          {profit >= 0 ? "+" : ""}{fmtNum(profit)} {billing?.billingCurrency || "CZK"}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire CostsTab into ShipmentDetailContent**

In `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`, add the import at the top (after existing imports):

```tsx
import { CostsTab } from "./tabs/CostsTab";
```

Replace the costs placeholder (lines 426-430):

```tsx
{activeTab === "costs" && <CostsTab shipment={shipment} />}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && npx next build --no-lint 2>&1 | tail -20` or check the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/shipments/[jobNumber]/tabs/CostsTab.tsx apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx
git commit -m "feat: populate Costs Breakdown tab with editable cost table"
```

---

### Task 2: Create DocumentsTab Component

**Files:**
- Create: `apps/web/src/app/shipments/[jobNumber]/tabs/DocumentsTab.tsx`
- Modify: `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`

Documents tab: file upload via drag-and-drop, list of attachments with delete. Source: `ShipmentDetailModal.tsx:288-328`.

- [ ] **Step 1: Create the DocumentsTab file**

```tsx
// apps/web/src/app/shipments/[jobNumber]/tabs/DocumentsTab.tsx
"use client";

import { Upload, Button, message } from "antd";
import { InboxOutlined, FileOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";

interface AttachmentFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsTab({ shipment }: { shipment: ShipmentItem }) {
  const queryClient = useQueryClient();

  const attachmentsQuery = useQuery({
    queryKey: ["shipment-attachments", shipment.id],
    queryFn: () => api.shipments.attachmentList(shipment.id),
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.shipments.attachmentDelete(shipment.id, attachmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] }),
  });

  const attachments: AttachmentFile[] = (attachmentsQuery.data?.attachments ?? []) as AttachmentFile[];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <Upload.Dragger
        name="file"
        multiple
        action={`/api/shipments/${shipment.id}/attachments`}
        onChange={(info) => {
          if (info.file.status === "done") {
            queryClient.invalidateQueries({ queryKey: ["shipment-attachments", shipment.id] });
            message.success(`${info.file.name} uploaded`);
          }
        }}
        showUploadList={false}
        className="mb-4"
      >
        <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
        <p className="text-sm mt-2">Drag files here or click to browse</p>
      </Upload.Dragger>

      {attachments.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">No documents yet</p>
      ) : (
        <div className="flex flex-col gap-1">
          {attachments.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-2 px-3 border border-slate-100 rounded-md">
              <FileOutlined className="text-slate-400" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{file.fileName}</div>
                <div className="text-[11px] text-slate-400">{formatFileSize(file.fileSize)} · {file.fileType}</div>
              </div>
              <span className="text-[11px] text-slate-400">{new Date(file.createdAt).toLocaleDateString()}</span>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteAttachment.mutate(file.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire DocumentsTab into ShipmentDetailContent**

Add import:

```tsx
import { DocumentsTab } from "./tabs/DocumentsTab";
```

Replace the documents placeholder:

```tsx
{activeTab === "documents" && <DocumentsTab shipment={shipment} />}
```

- [ ] **Step 3: Verify it compiles**

Check dev server or run build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/shipments/[jobNumber]/tabs/DocumentsTab.tsx apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx
git commit -m "feat: populate Documents tab with upload and file list"
```

---

### Task 3: Create TrackingTab Component

**Files:**
- Create: `apps/web/src/app/shipments/[jobNumber]/tabs/TrackingTab.tsx`
- Modify: `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`

Tracking tab: timeline of completed tasks sorted newest-first. Needs task data from API. Source: `ShipmentDetailModal.tsx:1449-1485` (TrackingTimeline) + task query from `ShipmentDetailModal.tsx:131-136`.

- [ ] **Step 1: Create the TrackingTab file**

```tsx
// apps/web/src/app/shipments/[jobNumber]/tabs/TrackingTab.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShipmentItem } from "@/hooks/useShipments";

interface TaskState {
  taskKey: string;
  completed: boolean;
  completedAt: string | null;
  completedById: string | null;
}

const IMPORT_TASKS = [
  { key: "imp_booking_to_agent", label: "Booking to agent" },
  { key: "imp_booking_confirmed", label: "Booking confirmed" },
  { key: "imp_cargo_readiness", label: "Cargo readiness confirmed" },
  { key: "imp_cargo_shipped", label: "Cargo shipped" },
  { key: "imp_pre_alert", label: "Pre-Alert received" },
  { key: "imp_arrival_notice", label: "Arrival notice sent" },
  { key: "imp_paperwork_received", label: "Paperwork received" },
  { key: "imp_paperwork_customs", label: "Paperwork provided to customs" },
  { key: "imp_cargo_released", label: "Cargo released for further transport" },
  { key: "imp_booked_transport", label: "Booked for further transport" },
  { key: "imp_departed_port", label: "Cargo departed from port" },
  { key: "imp_arrived_hub", label: "Cargo arrived to HUB" },
  { key: "imp_customs_cleared", label: "Cargo customs cleared" },
  { key: "imp_delivered", label: "Delivered" },
  { key: "imp_billed", label: "Billed" },
];

const EXPORT_TASKS = [
  { key: "exp_cargo_readiness", label: "Cargo readiness checked with customer" },
  { key: "exp_booked_line", label: "Booked with shipping line" },
  { key: "exp_booking_received", label: "Booking received" },
  { key: "exp_pre_carriage", label: "Pre-carriage booked" },
  { key: "exp_paperwork_customer", label: "Paperwork received from customer" },
  { key: "exp_draft_sent", label: "Draft sent to customer" },
  { key: "exp_vgm_filed", label: "VGM filed" },
  { key: "exp_si_filed", label: "Shipping Instructions filed" },
  { key: "exp_ams_filed", label: "AMS filed (only for US related cargo)" },
  { key: "exp_zapp_issued", label: "Zapp issued" },
  { key: "exp_zapp_released", label: "Zapp released" },
  { key: "exp_billed", label: "Billed" },
  { key: "exp_bl_provided", label: "Bill Of Lading provided to customer" },
];

export function TrackingTab({ shipment }: { shipment: ShipmentItem }) {
  const tradeDirection = shipment.tradeDirection || "Import";
  const taskList = tradeDirection === "Export" ? EXPORT_TASKS : IMPORT_TASKS;

  const tasksQuery = useQuery({
    queryKey: ["shipment-tasks", shipment.id],
    queryFn: () => api.shipments.taskList(shipment.id),
  });

  const tasks: TaskState[] = tasksQuery.data?.tasks ?? [];

  const completedTasks = tasks
    .filter((t) => t.completed && t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  if (completedTasks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <p className="text-center text-slate-400 text-sm py-8">No tracking events yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-sm" />
        {completedTasks.map((task, i) => {
          const def = taskList.find((t) => t.key === task.taskKey);
          const isLatest = i === 0;
          return (
            <div key={task.taskKey} className="relative mb-4">
              <div
                className={`absolute -left-[18px] top-1 w-3 h-3 rounded-full border-2 ${
                  isLatest
                    ? "border-indigo-500 bg-indigo-500"
                    : "border-slate-300 bg-white"
                }`}
              />
              <div>
                <p className={`text-sm font-medium ${isLatest ? "text-indigo-500" : "text-slate-700"}`}>
                  {def?.label || task.taskKey}
                </p>
                <p className="text-[11px] text-slate-400">
                  {new Date(task.completedAt!).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire TrackingTab into ShipmentDetailContent**

Add import:

```tsx
import { TrackingTab } from "./tabs/TrackingTab";
```

Replace the tracking placeholder:

```tsx
{activeTab === "tracking" && <TrackingTab shipment={shipment} />}
```

- [ ] **Step 3: Verify it compiles**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/shipments/[jobNumber]/tabs/TrackingTab.tsx apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx
git commit -m "feat: populate Tracking tab with task timeline"
```

---

### Task 4: Create WarehouseTab Component

**Files:**
- Create: `apps/web/src/app/shipments/[jobNumber]/tabs/WarehouseTab.tsx`
- Modify: `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`

This is the second-most complex tab. It contains 4 sub-tabs: Shipment Details (stackability badge, descriptions, dimensions editor, push-to-suppliers buttons), Customs (spreadsheet), Pick-up (PIN + table), Invoicing (spreadsheet). Source: `ShipmentDetailModal.tsx:848-1486`.

All sub-components live in the same file since they share the `shipment` prop and `useWarehouseSection` hook pattern.

- [ ] **Step 1: Create the WarehouseTab file**

```tsx
// apps/web/src/app/shipments/[jobNumber]/tabs/WarehouseTab.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Tabs, Descriptions, Tag, Input, Select, Button, Space, Card, Upload, Modal, message } from "antd";
import { DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buildRowData, type ShipmentItem } from "@/hooks/useShipments";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";

type MessageApi = ReturnType<typeof message.useMessage>[0];

const CURRENCIES = ["CZK", "USD", "EUR", "GBP", "CNY"];

interface RowsSectionData { rows?: string }
interface PickupSectionData { pin?: string; rows?: string }
interface JobSectionData { vgm_sent?: string; survey_sent?: string; remeasurement_sent?: string; [key: string]: string | undefined }

function asRowsSection(data: unknown): RowsSectionData {
  if (data && typeof data === "object") return data as RowsSectionData;
  return {};
}
function asPickupSection(data: unknown): PickupSectionData {
  if (data && typeof data === "object") return data as PickupSectionData;
  return {};
}
function asJobSection(data: unknown): JobSectionData {
  if (data && typeof data === "object") return data as JobSectionData;
  return {};
}

// ─── Main WarehouseTab ──────────────────────────────────────────

export function WarehouseTab({ shipment }: { shipment: ShipmentItem }) {
  const [subTab, setSubTab] = useState<string>("details");
  const [messageApi, contextHolder] = message.useMessage();
  const rowData = buildRowData(shipment);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 px-5">
      {contextHolder}
      <Tabs
        size="small"
        activeKey={subTab}
        onChange={setSubTab}
        items={[
          {
            key: "details",
            label: "Shipment Details",
            children: (
              <div>
                <StackabilityBadge shipment={shipment} />
                <Descriptions size="small" column={3} bordered className="mb-4" items={[
                  { key: "container", label: "Container #", children: shipment.containerNumber || "—" },
                  { key: "colli", label: "Colli / PCS", children: shipment.pcs || "—" },
                  { key: "loadType", label: "Load Type", children: shipment.loadType || "—" },
                  { key: "weight", label: "Weight (tons)", children: shipment.totalWeightTons || "—" },
                  { key: "volume", label: "Volume (CBM)", children: shipment.totalVolumeCbm || "—" },
                  { key: "customs", label: "Customs Procedure", children: rowData["customsProcedure"] || "—" },
                ]} />
                <DimensionsEditor shipment={shipment} messageApi={messageApi} />
                <ActionPushButtons shipment={shipment} messageApi={messageApi} />
              </div>
            ),
          },
          {
            key: "customs",
            label: "Customs",
            children: (
              <div>
                <div className="p-3 bg-blue-50 rounded-md mb-3 text-xs">
                  <p><strong>Colli:</strong> {shipment.pcs || "—"} | <strong>Weight:</strong> {shipment.totalWeightTons || "—"} tons</p>
                  <p><strong>Invoice Value:</strong> {shipment.commercialInvoiceValue || "—"} | <strong>HS Code:</strong> {shipment.hsCode || "—"}</p>
                  <p><strong>Description:</strong> {shipment.cargoDescription || "—"}</p>
                </div>
                <CustomsSpreadsheet shipment={shipment} messageApi={messageApi} />
              </div>
            ),
          },
          {
            key: "pickup",
            label: "Pick-up",
            children: <PickupSubTab shipment={shipment} messageApi={messageApi} />,
          },
          {
            key: "invoicing",
            label: "Invoicing",
            children: <InvoicingSpreadsheet shipment={shipment} messageApi={messageApi} />,
          },
        ]}
      />
    </div>
  );
}

// ─── Stackability Badge ─────────────────────────────────────────

function StackabilityBadge({ shipment }: { shipment: ShipmentItem }) {
  const raw = shipment.dimensions ? String(shipment.dimensions) : undefined;
  let stackability: "stackable" | "not_stackable" | "unknown" = "unknown";

  if (raw) {
    try {
      const rows = JSON.parse(raw as string) as Array<Record<string, unknown>>;
      const hasStackable = rows.some((r) => r.stackable === true || r.stackable === "true");
      const hasNotStackable = rows.some((r) => r.stackable === false || r.stackable === "false");
      if (hasNotStackable) stackability = "not_stackable";
      else if (hasStackable) stackability = "stackable";
    } catch { /* ignore */ }
  }

  return (
    <div className="mb-3">
      {stackability === "stackable" && <Tag color="green">Stackable</Tag>}
      {stackability === "not_stackable" && <Tag color="red">Not Stackable</Tag>}
      {stackability === "unknown" && <Tag>Unknown Stackability</Tag>}
    </div>
  );
}

// ─── Dimensions Editor ──────────────────────────────────────────

interface DimensionRow {
  colli: string;
  length: string;
  width: string;
  height: string;
  weightPerPiece: string;
  stackable?: boolean;
}

const EMPTY_DIM: DimensionRow = { colli: "", length: "", width: "", height: "", weightPerPiece: "" };

function DimensionsEditor({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const queryClient = useQueryClient();
  const initial: DimensionRow[] = (() => {
    const dims = shipment.dimensions;
    if (!dims) return [{ ...EMPTY_DIM }];
    const arr = Array.isArray(dims) ? dims : (() => { try { return JSON.parse(String(dims)); } catch { return []; } })();
    return arr.length > 0 ? arr : [{ ...EMPTY_DIM }];
  })();

  const [rows, setRows] = useState<DimensionRow[]>(initial);
  const [dirty, setDirty] = useState(false);

  const updateRow = (idx: number, field: keyof DimensionRow, value: string | boolean) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const addRow = () => { setRows((prev) => [...prev, { ...EMPTY_DIM }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };

  const save = async () => {
    const filtered = rows.filter((r) => r.colli || r.length || r.width || r.height || r.weightPerPiece);
    const dimData = filtered.length > 0 ? filtered : null;
    try {
      await api.shipments.shipmentUpdate(shipment.id, { dimensions: dimData });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const rowCbms: number[] = [];
  let totalColli = 0, totalWeightKg = 0, totalVolumeCbm = 0;
  for (const r of rows) {
    const c = parseFloat(r.colli) || 0;
    const L = parseFloat(r.length) || 0;
    const W = parseFloat(r.width) || 0;
    const H = parseFloat(r.height) || 0;
    const w = parseFloat(r.weightPerPiece) || 0;
    const cbm = c * (L * W * H) / 1_000_000;
    rowCbms.push(cbm);
    totalColli += c;
    totalWeightKg += c * w;
    totalVolumeCbm += cbm;
  }

  const shipmentDims = useMemo(() => {
    const dims = shipment.dimensions;
    if (!dims) return { colli: 0, weightKg: 0, volumeCbm: 0 };
    try {
      const parsed: DimensionRow[] = Array.isArray(dims) ? dims : JSON.parse(String(dims));
      let sColli = 0, sWeight = 0, sVolume = 0;
      for (const r of parsed) {
        const c = parseFloat(r.colli) || 0;
        const L = parseFloat(r.length) || 0;
        const W = parseFloat(r.width) || 0;
        const H = parseFloat(r.height) || 0;
        const w = parseFloat(r.weightPerPiece) || 0;
        sColli += c;
        sWeight += c * w;
        sVolume += c * (L * W * H) / 1_000_000;
      }
      return { colli: sColli, weightKg: sWeight, volumeCbm: sVolume };
    } catch { return { colli: 0, weightKg: 0, volumeCbm: 0 }; }
  }, [shipment.dimensions]);

  const mismatchCls = (a: number, b: number) =>
    a !== b && a > 0 && b > 0 ? "bg-amber-500/15 px-1.5 py-0.5 rounded" : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <strong className="text-sm">Dimensions / Remeasurement</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={save}>Save</Button>}
        </Space>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Qty</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">L (cm)</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">W (cm)</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">H (cm)</th>
            <th className="text-left p-1.5 px-2 font-semibold text-slate-500">Weight/pc (kg)</th>
            <th className="text-right p-1.5 px-2 font-semibold text-slate-500">Vol (CBM)</th>
            <th className="w-[30px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {(["colli", "length", "width", "height", "weightPerPiece"] as const).map((field) => (
                <td key={field} className="p-0.5 px-1">
                  <Input size="small" value={row[field]} placeholder="0" onChange={(e) => updateRow(idx, field, e.target.value)} className="w-full" />
                </td>
              ))}
              <td className="p-0.5 px-1 text-right text-[11px] text-slate-500">
                {(rowCbms[idx] ?? 0) > 0 ? rowCbms[idx]!.toFixed(4) : "—"}
              </td>
              <td className="p-0.5 px-1">
                {rows.length > 1 && (
                  <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex gap-6 mt-3 py-2 border-t border-slate-200">
        <div><span className="text-[10px] uppercase text-slate-500">Total Colli</span><div className="text-sm font-semibold">{totalColli || "—"}</div></div>
        <div><span className="text-[10px] uppercase text-slate-500">Total Weight</span><div className="text-sm font-semibold">{totalWeightKg > 0 ? `${totalWeightKg.toFixed(1)} kg` : "—"}</div></div>
        <div><span className="text-[10px] uppercase text-slate-500">Total Volume</span><div className="text-sm font-semibold">{totalVolumeCbm > 0 ? `${totalVolumeCbm.toFixed(3)} CBM` : "—"}</div></div>
      </div>

      {/* Comparison Cards */}
      <div className="flex gap-4 mt-4">
        <Card size="small" title="Shipment Values" className="flex-1">
          <div className="flex gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Colli</div>
              <div className={`font-semibold ${mismatchCls(shipmentDims.colli, totalColli)}`}>{shipmentDims.colli || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Weight (kg)</div>
              <div className={`font-semibold ${mismatchCls(shipmentDims.weightKg, totalWeightKg)}`}>{shipmentDims.weightKg > 0 ? shipmentDims.weightKg.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div>
              <div className={`font-semibold ${mismatchCls(shipmentDims.volumeCbm, totalVolumeCbm)}`}>{shipmentDims.volumeCbm > 0 ? shipmentDims.volumeCbm.toFixed(3) : "—"}</div>
            </div>
          </div>
        </Card>
        <Card size="small" title="Remeasured Values" className="flex-1">
          <div className="flex gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase text-slate-500">Colli</div>
              <div className={`font-semibold ${mismatchCls(totalColli, shipmentDims.colli)}`}>{totalColli || "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Weight (kg)</div>
              <div className={`font-semibold ${mismatchCls(totalWeightKg, shipmentDims.weightKg)}`}>{totalWeightKg > 0 ? totalWeightKg.toFixed(1) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Volume (CBM)</div>
              <div className={`font-semibold ${mismatchCls(totalVolumeCbm, shipmentDims.volumeCbm)}`}>{totalVolumeCbm > 0 ? totalVolumeCbm.toFixed(3) : "—"}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Action Push Buttons (VGM, Survey, Remeasurement) ───────────

interface ActionModalState {
  actionKey: string;
  label: string;
  note: string;
  fileList: unknown[];
}

function ActionPushButtons({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "job");
  const section = asJobSection(sectionData);
  const [modalState, setModalState] = useState<ActionModalState | null>(null);

  const vgmSent = section.vgm_sent;
  const surveySent = section.survey_sent;
  const remeasSent = section.remeasurement_sent;

  const actions = [
    { key: "vgm_sent", label: "VGM", sent: vgmSent },
    { key: "survey_sent", label: "Survey", sent: surveySent },
    { key: "remeasurement_sent", label: "Remeasurement", sent: remeasSent },
  ];

  const openModal = (actionKey: string, label: string) => {
    setModalState({ actionKey, label, note: "", fileList: [] });
  };

  const handleSend = async () => {
    if (!modalState) return;
    const now = new Date().toISOString();
    try {
      await save({
        ...section,
        [modalState.actionKey]: JSON.stringify({ timestamp: now, note: modalState.note }),
      });
      setModalState(null);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const parseActionData = (val: string | undefined): { timestamp: string; note?: string } | null => {
    if (!val) return null;
    try { return JSON.parse(val); } catch { return { timestamp: val }; }
  };

  return (
    <div className="mt-4">
      <strong className="text-xs block mb-2">Push to Suppliers</strong>
      <Space>
        {actions.map((action) => {
          const data = parseActionData(action.sent);
          return (
            <div key={action.key} className="flex flex-col items-center gap-1">
              {data ? (
                <Tag color="green" className="text-[11px]">
                  {action.label} — {new Date(data.timestamp).toLocaleDateString()}
                  {data.note && <span className="block text-[10px] text-slate-500">{data.note}</span>}
                </Tag>
              ) : (
                <Button size="small" onClick={() => openModal(action.key, action.label)}>
                  Send {action.label}
                </Button>
              )}
            </div>
          );
        })}
      </Space>

      <Modal
        open={!!modalState}
        title={`Send ${modalState?.label || ""}`}
        onCancel={() => setModalState(null)}
        footer={[
          <Button key="cancel" onClick={() => setModalState(null)}>Cancel</Button>,
          <Button key="send" type="primary" onClick={handleSend} loading={isSaving}>Send</Button>,
        ]}
        destroyOnClose
      >
        <div className="mb-4">
          <Upload.Dragger
            name="file"
            multiple
            beforeUpload={() => false}
            onChange={(info) => {
              if (modalState) setModalState({ ...modalState, fileList: info.fileList });
            }}
          >
            <p><InboxOutlined className="text-[28px] text-indigo-500" /></p>
            <p className="text-sm mt-2">Attach files (optional)</p>
          </Upload.Dragger>
        </div>
        <Input.TextArea
          placeholder="Add a note..."
          rows={3}
          value={modalState?.note || ""}
          onChange={(e) => {
            if (modalState) setModalState({ ...modalState, note: e.target.value });
          }}
        />
      </Modal>
    </div>
  );
}

// ─── Customs Spreadsheet ────────────────────────────────────────

function CustomsSpreadsheet({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "customs");
  const rawRows = asRowsSection(sectionData).rows;
  const initial = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ colli: "", packing: "", weight: "", value: "", currency: "CZK", commodity: "", hsCode: "" }]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const parsed = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
    if (parsed.length > 0) { setRows(parsed); setDirty(false); }
  }, [rawRows]);

  const update = (idx: number, field: string, value: string) => { setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); setDirty(true); };
  const addRow = () => { setRows((prev) => [...prev, { colli: "", packing: "", weight: "", value: "", currency: "CZK", commodity: "", hsCode: "" }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div>
      <div className="flex justify-between mb-2">
        <strong className="text-xs">Customs Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {["Colli", "Packing", "Weight (kg)", "Value", "Currency", "Commodity", "HS Code", ""].map((h) => (
            <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {["colli", "packing", "weight", "value", "currency", "commodity", "hsCode"].map((f) => (
                <td key={f} className="p-0.5">
                  {f === "currency" ? (
                    <Select size="small" value={row[f] || "CZK"} onChange={(v) => update(idx, f, v)} className="w-full"
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pickup Sub-Tab ─────────────────────────────────────────────

function PickupSubTab({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "pickup");
  const section = asPickupSection(sectionData);
  const existingPin = section.pin || "";
  const rawRows = section.rows || "";
  const [pin, setPin] = useState<string | null>(existingPin || null);

  const initial: Record<string, string>[] = (() => { try { return JSON.parse(rawRows || "[]"); } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ haulier: "", licensePlate: "", driver: "" }]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const sec = asPickupSection(sectionData);
    if (sec.pin) setPin(sec.pin);
    const parsed: Record<string, string>[] = (() => { try { return JSON.parse(sec.rows || "[]"); } catch { return []; } })();
    if (parsed.length > 0) { setRows(parsed); setDirty(false); }
  }, [sectionData]);

  const generatePin = async () => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    try {
      await save({ pin: newPin, rows: rawRows || "[]" });
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  const update = (idx: number, field: string, value: string) => { setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); setDirty(true); };
  const addRow = () => { setRows((prev) => [...prev, { haulier: "", licensePlate: "", driver: "" }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ pin: pin || "", rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div>
      {/* PIN */}
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">PIN</div>
        <Space align="center">
          <span className="font-mono text-[32px] tracking-[0.3em] text-slate-800">
            {pin ? pin.split("").join(" ") : "– – – –"}
          </span>
          {!pin && <Button type="primary" size="small" onClick={generatePin} loading={isSaving}>Generate PIN</Button>}
          {pin && <Tag color="green">Locked</Tag>}
        </Space>
      </div>

      {/* Pickup table */}
      <div className="flex justify-between mb-2">
        <strong className="text-xs">Pickup Details</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {["PIN", "Haulier", "License Plate", "Driver", ""].map((h) => (
            <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              <td className="p-0.5 px-1.5 font-mono text-indigo-500">{idx === 0 && pin ? pin : ""}</td>
              {["haulier", "licensePlate", "driver"].map((f) => (
                <td key={f} className="p-0.5">
                  <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Invoicing Spreadsheet ──────────────────────────────────────

function InvoicingSpreadsheet({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: MessageApi }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(shipment.id, "invoicing");
  const rawRows = asRowsSection(sectionData).rows;
  const initial = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
  const [rows, setRows] = useState<Record<string, string>[]>(initial.length > 0 ? initial : [{ invoiceNo: "", date: "", amount: "", currency: "CZK", status: "", notes: "" }]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const parsed = (() => { try { const r: Record<string, string>[] = JSON.parse(rawRows || "[]"); return r; } catch { return []; } })();
    if (parsed.length > 0) { setRows(parsed); setDirty(false); }
  }, [rawRows]);

  const update = (idx: number, field: string, value: string) => { setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r)); setDirty(true); };
  const addRow = () => { setRows((prev) => [...prev, { invoiceNo: "", date: "", amount: "", currency: "CZK", status: "", notes: "" }]); setDirty(true); };
  const deleteRow = (idx: number) => { setRows((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); };
  const handleSave = async () => {
    try {
      await save({ rows: JSON.stringify(rows) });
      setDirty(false);
      messageApi.success("Saved");
    } catch {
      messageApi.error("Failed to save");
    }
  };

  return (
    <div className="py-3">
      <div className="flex justify-between mb-2">
        <strong className="text-xs">Invoice Records</strong>
        <Space size="small">
          <Button size="small" onClick={addRow}>+ Row</Button>
          {dirty && <Button size="small" type="primary" onClick={handleSave} loading={isSaving}>Save</Button>}
        </Space>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200">
          {["Invoice #", "Date", "Amount", "Currency", "Status", "Notes", ""].map((h) => (
            <th key={h} className="text-left p-1.5 font-semibold text-slate-500">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-100">
              {["invoiceNo", "date", "amount", "currency", "status", "notes"].map((f) => (
                <td key={f} className="p-0.5">
                  {f === "currency" ? (
                    <Select size="small" value={row[f] || "CZK"} onChange={(v) => update(idx, f, v)} className="w-full"
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  ) : (
                    <Input size="small" value={row[f] || ""} onChange={(e) => update(idx, f, e.target.value)} />
                  )}
                </td>
              ))}
              <td className="p-0.5">
                {rows.length > 1 && <Button type="text" size="small" danger icon={<DeleteOutlined className="text-[11px]" />} onClick={() => deleteRow(idx)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire WarehouseTab into ShipmentDetailContent**

Add import:

```tsx
import { WarehouseTab } from "./tabs/WarehouseTab";
```

Replace the warehouse placeholder:

```tsx
{activeTab === "warehouse" && <WarehouseTab shipment={shipment} />}
```

- [ ] **Step 3: Verify it compiles**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/shipments/[jobNumber]/tabs/WarehouseTab.tsx apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx
git commit -m "feat: populate Warehouse tab with sub-tabs (details, customs, pickup, invoicing)"
```

---

### Task 5: Clean Up Unused Modal Files

**Files:**
- Delete: `apps/web/src/app/shipments/_components/ShipmentDetailModal.tsx`
- Delete: `apps/web/src/app/shipments/_components/MasterJobDetailModal.tsx`

These files are confirmed unused — no imports found anywhere in the codebase.

- [ ] **Step 1: Verify no imports exist**

Run:
```bash
grep -r "ShipmentDetailModal\|MasterJobDetailModal" apps/web/src/ --include="*.tsx" --include="*.ts" -l
```

Expected: only the two files themselves appear. If anything else imports them, do NOT delete.

- [ ] **Step 2: Delete the files**

```bash
rm apps/web/src/app/shipments/_components/ShipmentDetailModal.tsx
rm apps/web/src/app/shipments/_components/MasterJobDetailModal.tsx
```

- [ ] **Step 3: Verify build still works**

- [ ] **Step 4: Commit**

```bash
git add -u apps/web/src/app/shipments/_components/ShipmentDetailModal.tsx apps/web/src/app/shipments/_components/MasterJobDetailModal.tsx
git commit -m "chore: remove unused ShipmentDetailModal and MasterJobDetailModal"
```

---

### Task 6: Smoke Test All Tabs

- [ ] **Step 1: Run the dev server and verify each tab renders**

```bash
cd /Users/marekmojzis/our_biz/shipment-tracker && npm run dev
```

Open a shipment detail page and click through all 5 tabs:
1. **Shipment Details** — existing content, should be unchanged
2. **Costs Breakdown** — billing bar, 6 cost rows, additional charges, profit
3. **Documents** — upload area, file list (may be empty)
4. **Warehouse** — 4 sub-tabs (Details with dimensions, Customs, Pick-up with PIN, Invoicing)
5. **Tracking** — timeline of completed tasks (may show "No tracking events yet")

- [ ] **Step 2: Verify no console errors**

Check browser dev tools console for React errors or missing imports.
