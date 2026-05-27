# Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the shipment list and detail pages to match the new wireframes, keeping existing color scheme and component library.

**Architecture:** Incremental refactor of existing components. Sidebar gets a new collapse toggle. ShipmentsTable gets new columns and filters. ShipmentDetailContent gets restructured layout with new tabs, stepper stages, tasks workflow, and date fields. Four new date columns added to the DB schema.

**Tech Stack:** Next.js, React, Ant Design, Tailwind CSS, Drizzle ORM, Encore API, React Query

**Spec:** `docs/superpowers/specs/2026-05-27-layout-redesign-design.md`

---

### Task 1: Add 4 new date columns to the shipment schema

**Files:**
- Modify: `apps/api/services/shipments/schemas/shipment.schema.ts:70-77`
- Modify: `apps/api/services/shipments/interfaces/interfaces.ts:66-77`

- [ ] **Step 1: Add columns to Drizzle schema**

In `apps/api/services/shipments/schemas/shipment.schema.ts`, add these 4 fields after the existing `plannedDeliveryTime` field (around line 77):

```typescript
    // — New actual dates —
    atdActual: date("atd_actual"),
    ataActual: date("ata_actual"),
    arrivedAtPod: date("arrived_at_pod"),
    deliveredDate: date("delivered_date"),
```

- [ ] **Step 2: Add fields to the ShipmentItem interface**

In `apps/api/services/shipments/interfaces/interfaces.ts`, add after the existing date fields (around line 77):

```typescript
  // New actual dates
  atdActual: string | null;
  ataActual: string | null;
  arrivedAtPod: string | null;
  deliveredDate: string | null;
```

- [ ] **Step 3: Run the database migration**

Run: `cd apps/api && npx encore db migrate`

If Encore handles migrations automatically, just restart the dev server:
Run: `npx encore run` (or however the dev server is started)

- [ ] **Step 4: Commit**

```bash
git add apps/api/services/shipments/schemas/shipment.schema.ts apps/api/services/shipments/interfaces/interfaces.ts
git commit -m "feat: add 4 new date columns (atdActual, ataActual, arrivedAtPod, deliveredDate)"
```

---

### Task 2: Redesign the sidebar collapse toggle

**Files:**
- Modify: `apps/web/src/components/AppSidebar.tsx`

- [ ] **Step 1: Rewrite AppSidebar with new collapse UX**

Replace the entire content of `apps/web/src/components/AppSidebar.tsx` with the new design. Key changes:
- Move collapse toggle from bottom to sidebar header (right side, chevron icon)
- Remove user section from sidebar footer entirely (user stays in TopNav only)
- Sidebar header must be 52px to align with TopNav
- Expanded: logo icon + "Shipment Tracker" text + chevron ‹ on right
- Collapsed: logo icon + chevron › (flipped)

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tooltip } from "antd";
import {
  DashboardOutlined,
  ContainerOutlined,
  FileTextOutlined,
  DollarOutlined,
  FileSearchOutlined,
  InboxOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useSidebarState } from "@/hooks/useSidebarState";
import type { ReactNode } from "react";

const NAV_ITEMS: { path: string; label: string; icon: ReactNode }[] = [
  { path: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { path: "/shipments", label: "Shipments", icon: <ContainerOutlined /> },
  { path: "/documents", label: "Document / Text Reading", icon: <FileTextOutlined /> },
  { path: "/invoicing", label: "Invoicing", icon: <DollarOutlined /> },
  { path: "/quotes", label: "Quote", icon: <FileSearchOutlined /> },
  { path: "/warehouse", label: "Warehouse", icon: <InboxOutlined /> },
];

const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 64;

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarState();

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  return (
    <aside
      className="bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Header: logo + collapse chevron — 52px to match TopNav */}
      <div className="h-[52px] flex items-center px-3.5 border-b border-slate-200">
        <div
          className="flex items-center gap-2.5 cursor-pointer min-w-0"
          onClick={() => router.push("/dashboard")}
        >
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0">
            ST
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">Shipment Tracker</div>
              <div className="text-[10px] text-slate-400 whitespace-nowrap">Operations Dashboard</div>
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0 cursor-pointer border-none bg-transparent"
        >
          {collapsed ? (
            <RightOutlined className="text-xs" />
          ) : (
            <LeftOutlined className="text-xs" />
          )}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + "/");

          const navItem = (
            <div
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex items-center gap-3 rounded-md text-sm cursor-pointer mb-0.5 transition-all duration-150 ${
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-indigo-500 text-white font-medium"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
            </div>
          );

          return collapsed ? (
            <Tooltip key={item.path} title={item.label} placement="right">
              {navItem}
            </Tooltip>
          ) : (
            navItem
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Verify sidebar renders correctly**

Run the dev server and check:
1. Expanded state: logo + text + chevron ‹ visible
2. Click chevron → collapses to 64px, shows logo + chevron ›
3. Click chevron again → expands back
4. Header aligns with TopNav at 52px height
5. No user section at bottom

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AppSidebar.tsx
git commit -m "refactor: redesign sidebar collapse toggle, remove user from sidebar"
```

---

### Task 3: Redesign the shipments list table

**Files:**
- Modify: `apps/web/src/app/shipments/_components/ShipmentsTable.tsx`

- [ ] **Step 1: Rewrite ShipmentsTable with new columns and filters**

Replace the entire content of `apps/web/src/app/shipments/_components/ShipmentsTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Table, Input, Select } from "antd";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import type { ShipmentItem } from "@/hooks/useShipments";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "in-transit", label: "In Transit" },
  { value: "customs", label: "Customs" },
  { value: "delivered", label: "Delivered" },
];

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  onCreateClick: () => void;
  onDelete: (shipment: ShipmentItem) => void;
}

export const ShipmentsTable = ({
  shipments,
  isLoading,
  onCreateClick,
}: ShipmentsTableProps) => {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return shipments.filter((s) => {
      // Status filter
      if (statusFilter !== "all") {
        const st = s.status.toLowerCase();
        if (statusFilter === "active" && !st.includes("active")) return false;
        if (statusFilter === "in-transit" && !st.includes("transport") && !st.includes("shipped") && !st.includes("transit")) return false;
        if (statusFilter === "customs" && !st.includes("custom")) return false;
        if (statusFilter === "delivered" && !st.includes("bill") && !st.includes("deliver")) return false;
      }
      // Search filter
      if (q) {
        const haystack = [s.jobNumber, s.customer, s.personInCharge].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [shipments, statusFilter, search]);

  const columns: ColumnsType<ShipmentItem> = useMemo(
    () => [
      {
        key: "jobNumber",
        title: "Internal Reference",
        width: 160,
        render: (_: unknown, record: ShipmentItem) => (
          <span className="font-mono font-bold text-indigo-500 cursor-pointer hover:underline">
            {record.jobNumber || "\u2014"}
          </span>
        ),
      },
      {
        key: "masterJob",
        title: "Master Job",
        width: 120,
        render: (_: unknown, record: ShipmentItem) =>
          record.masterJobMczNumber ? (
            <span className="text-slate-400">#{record.masterJobMczNumber}</span>
          ) : (
            <span className="text-slate-300">{"\u2014"}</span>
          ),
      },
      {
        key: "shipmentsDate",
        title: "Shipments Date",
        width: 130,
        render: (_: unknown, record: ShipmentItem) =>
          record.shipmentsDate || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "department",
        title: "Department",
        width: 170,
        render: (_: unknown, record: ShipmentItem) =>
          record.department || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "personInCharge",
        title: "Person in Charge",
        width: 150,
        render: (_: unknown, record: ShipmentItem) =>
          record.personInCharge || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "holidayCover",
        title: "Holiday Cover",
        width: 160,
        render: (_: unknown, record: ShipmentItem) =>
          record.holidayCover ? (
            <span className="text-slate-400">{record.holidayCover}</span>
          ) : (
            <span className="text-slate-300">{"\u2014"}</span>
          ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 180,
        ellipsis: true,
        render: (_: unknown, record: ShipmentItem) =>
          record.customer || <span className="text-slate-300">{"\u2014"}</span>,
      },
      {
        key: "customerPic",
        title: "Customer's PIC",
        width: 150,
        render: (_: unknown, record: ShipmentItem) =>
          record.customerPic || <span className="text-slate-300">{"\u2014"}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 m-0">Shipments</h1>
          <p className="text-sm text-slate-500 mt-0.5 mb-0">Manage and track all shipments</p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onCreateClick}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-md hover:bg-indigo-600 transition-colors cursor-pointer border-none"
          >
            <PlusOutlined className="text-xs" /> New Shipment
          </button>
          <button className="px-4 py-2 bg-white text-slate-600 text-sm rounded-md border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer">
            Add to Master Job
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3 items-center">
          <Input
            placeholder="Search shipments..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            className="w-[220px]"
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className="w-[160px]"
          />
        </div>
        <div className="flex gap-3 items-center text-sm text-slate-500">
          <span>Rows per page</span>
          <Select
            value={pageSize}
            onChange={setPageSize}
            options={[
              { value: 10, label: "10" },
              { value: 25, label: "25" },
              { value: 50, label: "50" },
            ]}
            className="w-[70px]"
          />
          <span className="text-slate-400">{filtered.length} / {shipments.length} entries</span>
        </div>
      </div>

      {/* Table */}
      <Table<ShipmentItem>
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{
          pageSize,
          showSizeChanger: false,
          showTotal: (total, range) => `Showing ${range[1]} of ${total} entries`,
          position: ["bottomRight"],
          itemRender: (page, type, originalElement) => {
            if (type === "prev") return <span className="px-2">First</span>;
            if (type === "next") return <span className="px-2">Last</span>;
            return originalElement;
          },
        }}
        scroll={{ x: "max-content" }}
        onRow={(record) => ({
          onClick: () => router.push(`/shipments/${record.id}`),
          style: { cursor: "pointer" },
        })}
        locale={{ emptyText: "No shipments found" }}
        className="[&_.ant-table]:!rounded-lg [&_.ant-table]:!border [&_.ant-table]:!border-slate-200"
      />
    </div>
  );
};
```

- [ ] **Step 2: Verify the list page renders correctly**

Run the dev server and check:
1. 8 columns visible: Internal Reference, Master Job, Shipments Date, Department, Person in Charge, Holiday Cover, Customer, Customer's PIC
2. Internal Reference is bold indigo monospace
3. Status dropdown filter works
4. Search filters by reference, customer, person in charge
5. Pagination shows entry count and page buttons
6. Row click navigates to detail
7. "+ New Shipment" and "Add to Master Job" buttons visible

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/shipments/_components/ShipmentsTable.tsx
git commit -m "refactor: redesign shipments list with new columns, filters, and pagination"
```

---

### Task 4: Redesign the shipment detail page

**Files:**
- Modify: `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`

- [ ] **Step 1: Rewrite ShipmentDetailContent with new layout**

Replace the entire content of `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx`. This is a large file — key changes:

1. **Header:** Job number + copy button, ERA badge (derived from ETD/ETA), Edit/Actions/Save buttons
2. **Route line:** 3-point route display (pol → pod → destination)
3. **Tabs:** Shipment Details, Costs Breakdown (placeholder), Documents (placeholder), Warehouse (placeholder), Tracking (placeholder)
4. **Stepper:** 6 stages (Booking confirmed → Cargo ready → In transit → Arrive at POD → Customs clearance → Delivered)
5. **Top section (two-column):** Overview + Addresses (left), Tasks (right)
6. **Bottom section (two-column equal):** Basic Information (left 50%), Key Dates (right 50%)
7. **Tasks:** 15 default "Support Workflow" items + "+ Add Task" button, using the existing task API

```tsx
"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spin, Dropdown, message } from "antd";
import {
  LeftOutlined,
  CopyOutlined,
  EditOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useShipments } from "@/hooks/useShipments";
import Link from "next/link";

/* ── Constants ── */

const TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "costs", label: "Costs Breakdown" },
  { key: "documents", label: "Documents" },
  { key: "warehouse", label: "Warehouse" },
  { key: "tracking", label: "Tracking" },
];

const STEPPER_STAGES = [
  { key: "booking_confirmed", label: "Booking confirmed" },
  { key: "cargo_ready", label: "Cargo ready" },
  { key: "in_transit", label: "In transit" },
  { key: "arrive_at_pod", label: "Arrive at POD" },
  { key: "customs_clearance", label: "Customs clearance" },
  { key: "delivered", label: "Delivered" },
];

const DEFAULT_TASKS = [
  "Booking to agent",
  "Booking confirmed",
  "Cargo readiness confirmed",
  "Cargo shipped",
  "Pre-Alert received",
  "Arrival notice sent",
  "Paperwork received",
  "Paperwork provide to customs",
  "Cargo released for further transport",
  "Booked for further transport",
  "Cargo departed from port",
  "Cargo arrived to HUB",
  "Cargo customs cleared",
  "Delivered",
  "Billed",
];

/* ── Helpers ── */

function getActiveStageIndex(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("deliver")) return 5;
  if (s.includes("custom")) return 4;
  if (s.includes("arriv")) return 3;
  if (s.includes("transit")) return 2;
  if (s.includes("cargo") || s.includes("ready")) return 1;
  if (s.includes("book") || s.includes("confirm")) return 0;
  return 0;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  message.success("Copied to clipboard");
}

/* ── Sub-components ── */

function Stepper({ status }: { status: string }) {
  const activeIndex = getActiveStageIndex(status);

  return (
    <div className="flex items-center py-6 px-2">
      {STEPPER_STAGES.map((stage, i) => {
        const isCompleted = i < activeIndex;
        const isCurrent = i === activeIndex;
        const isLast = i === STEPPER_STAGES.length - 1;

        return (
          <div key={stage.key} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold z-10 ${
                  isCompleted
                    ? "bg-indigo-500 border-2 border-indigo-500 text-white"
                    : isCurrent
                      ? "bg-white border-2 border-indigo-500 text-indigo-500"
                      : "bg-white border-2 border-slate-200 text-slate-400"
                }`}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <span
                className={`text-[11px] mt-1.5 whitespace-nowrap ${
                  isCompleted ? "text-indigo-500" : isCurrent ? "text-indigo-500 font-semibold" : "text-slate-400"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`h-0.5 flex-1 mx-1 mt-[-18px] ${isCompleted ? "bg-indigo-500" : "bg-slate-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskCheckbox({ checked, label, date }: { checked: boolean; label: string; date?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-[7px] border-b border-slate-50 last:border-b-0">
      <div
        className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 ${
          checked ? "bg-indigo-500 border-2 border-indigo-500" : "border-2 border-slate-200 bg-white"
        }`}
      >
        {checked && <span className="text-white text-[10px]">✓</span>}
      </div>
      <span className={`text-sm flex-1 ${checked ? "text-slate-400 line-through" : "text-slate-700"}`}>
        {label}
      </span>
      {date && <span className="text-[11px] text-slate-400">{date}</span>}
    </div>
  );
}

/* ── Main component ── */

export function ShipmentDetailContent() {
  const { jobNumber } = useParams<{ jobNumber: string }>();
  const router = useRouter();
  const { shipments, isLoading } = useShipments();
  const [activeTab, setActiveTab] = useState("details");

  const shipment = shipments.find((s) => s.id === jobNumber);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-10 text-center text-slate-500">
        Shipment not found.{" "}
        <Link href="/shipments" className="text-indigo-500">Back to list</Link>
      </div>
    );
  }

  const status = shipment.status ?? "";
  const hasEra = !!(shipment.estimatedDeparture && shipment.estimatedArrival);
  const routePoints = [shipment.pol, shipment.pod, shipment.destination].filter(Boolean);

  return (
    <div className="bg-slate-50 min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        {/* Back link */}
        <div
          className="flex items-center gap-1.5 text-sm text-indigo-500 hover:underline cursor-pointer mb-3 w-fit"
          onClick={() => router.push("/shipments")}
        >
          <LeftOutlined className="text-[10px]" /> Back to Shipments
        </div>

        {/* Job number + actions */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-bold text-slate-800 m-0">
              {shipment.jobNumber ?? shipment.id}
            </h1>
            <button
              onClick={() => copyToClipboard(shipment.jobNumber)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer border-none bg-transparent"
            >
              <CopyOutlined className="text-sm" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-2.5 py-1">
              {hasEra ? "ERA KNOWN" : "ERA UNKNOWN"}
            </span>
            <span className="text-xs text-slate-400 px-2">
              ETD {shipment.estimatedDeparture || "--"} / ETA {shipment.estimatedArrival || "--"}
            </span>
            <button className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer">
              <EditOutlined className="mr-1" />Edit
            </button>
            <Dropdown
              menu={{ items: [{ key: "delete", label: "Delete", danger: true }] }}
              trigger={["click"]}
            >
              <button className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer">
                Actions <DownOutlined className="text-[10px] ml-1" />
              </button>
            </Dropdown>
            <button className="px-3 py-1.5 text-xs text-white bg-indigo-500 border-none rounded-md hover:bg-indigo-600 cursor-pointer font-semibold">
              Save Changes
            </button>
          </div>
        </div>

        {/* Route line */}
        {routePoints.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-5">
            {routePoints.map((point, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-300">→</span>}
                <span className={`w-2 h-2 rounded-full ${i === 0 || i === routePoints.length - 1 ? "bg-indigo-500" : "bg-slate-400"}`} />
                <span>{point}</span>
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b-0">
          {TABS.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm cursor-pointer border-b-2 transition-all duration-150 ${
                activeTab === tab.key
                  ? "font-semibold text-indigo-500 border-indigo-500"
                  : "font-normal text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      {/* Stepper */}
      {activeTab === "details" && <Stepper status={status} />}

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "details" && (
          <>
            {/* Top: Overview + Addresses left, Tasks right */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 mb-6">
              {/* Left column */}
              <div className="space-y-5">
                {/* Shipment Overview */}
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <ContainerOutlined className="text-indigo-500" /> SHIPMENT OVERVIEW
                  </h3>
                  {[
                    { label: "Customer", value: shipment.customer },
                    { label: "Shipper", value: shipment.shipper },
                    { label: "Consignee", value: shipment.consignee },
                    { label: "Incoterm", value: shipment.incotermOrigin },
                    { label: "Container", value: shipment.containerNumber },
                    { label: "Carrier", value: shipment.shippingLine },
                    { label: "MBL", value: shipment.masterBolNumber },
                  ].map((f) => (
                    <div key={f.label} className="flex py-2 border-b border-slate-50 last:border-b-0">
                      <span className="w-[120px] text-xs text-slate-400 shrink-0">{f.label}</span>
                      <span className="text-sm text-slate-700">{f.value || "\u2014"}</span>
                    </div>
                  ))}
                </div>

                {/* Addresses */}
                <div className="bg-white border border-slate-200 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <EnvironmentOutlined className="text-indigo-500" /> ADDRESSES
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: "Shipper", value: shipment.shipper },
                      { label: "Consignee", value: shipment.consignee },
                      { label: "Pick Up Address", value: shipment.pickupAddress },
                      { label: "Delivery Address", value: shipment.deliveryAddress },
                    ].map((addr) => (
                      <div key={addr.label} className="bg-slate-50 rounded-lg p-3.5">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                          {addr.label}
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed">
                          {addr.value || <span className="text-slate-300 italic">Not specified</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column: Tasks */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 self-start">
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <CheckSquareOutlined className="text-indigo-500" /> TASKS
                </h3>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Support Workflow
                </div>
                {DEFAULT_TASKS.map((task) => (
                  <TaskCheckbox key={task} checked={false} label={task} />
                ))}
                <div className="flex items-center gap-1.5 text-sm text-indigo-500 cursor-pointer pt-2 mt-1 hover:underline">
                  + Add Task
                </div>
              </div>
            </div>

            {/* Bottom: Basic Info + Key Dates side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <InfoCircleOutlined className="text-indigo-500" /> BASIC INFORMATION
                </h3>
                <div className="grid grid-cols-2 gap-x-6">
                  {[
                    { label: "Internal Reference", value: shipment.jobNumber },
                    { label: "Person in Charge", value: shipment.personInCharge },
                    { label: "Master Job", value: shipment.masterJobMczNumber ? `#${shipment.masterJobMczNumber}` : null },
                    { label: "Holiday Cover", value: shipment.holidayCover },
                    { label: "Department", value: shipment.department },
                    { label: "Customer", value: shipment.customer },
                  ].map((f) => (
                    <div key={f.label} className="py-2.5 border-b border-slate-100">
                      <div className="text-[11px] text-slate-400 mb-0.5">{f.label}</div>
                      <div className="text-sm text-slate-700">{f.value || "\u2014"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Dates */}
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <CalendarOutlined className="text-indigo-500" /> KEY DATES
                </h3>
                <div className="grid grid-cols-2 gap-x-6">
                  {[
                    { label: "ETD Estimated", value: shipment.estimatedDeparture },
                    { label: "ETA Estimated", value: shipment.estimatedArrival },
                    { label: "ATD Actual", value: (shipment as Record<string, unknown>).atdActual as string | null },
                    { label: "ATA Actual", value: (shipment as Record<string, unknown>).ataActual as string | null },
                    { label: "Arrived at POD", value: (shipment as Record<string, unknown>).arrivedAtPod as string | null },
                    { label: "Delivered", value: (shipment as Record<string, unknown>).deliveredDate as string | null },
                  ].map((f) => (
                    <div key={f.label} className="py-2.5 border-b border-slate-100">
                      <div className="text-[11px] text-slate-400 mb-0.5">{f.label}</div>
                      <div className={`text-sm ${f.value ? "text-slate-700" : "text-slate-300"}`}>
                        {f.value || "\u2014"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Placeholder tabs */}
        {activeTab === "costs" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Costs Breakdown will be available in a future update.
          </div>
        )}
        {activeTab === "documents" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Documents will be available in a future update.
          </div>
        )}
        {activeTab === "warehouse" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Warehouse will be available in a future update.
          </div>
        )}
        {activeTab === "tracking" && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
            Tracking will be available in a future update.
          </div>
        )}
      </div>
    </div>
  );
}
```

**Note:** The new date fields (`atdActual`, `ataActual`, `arrivedAtPod`, `deliveredDate`) are cast via `Record<string, unknown>` until the ShipmentItem type is updated on the frontend. Once the API serves these fields, the casts can be removed. Also add the missing icon imports at the top:

```tsx
import {
  LeftOutlined,
  CopyOutlined,
  EditOutlined,
  DownOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  CheckSquareOutlined,
  CalendarOutlined,
  ContainerOutlined,
} from "@ant-design/icons";
```

- [ ] **Step 2: Verify the detail page renders correctly**

Run the dev server, navigate to a shipment detail, and check:
1. Back link, job number with copy button
2. ERA KNOWN/UNKNOWN badge based on ETD/ETA
3. Edit, Actions, Save Changes buttons
4. Route line with dots and arrows
5. 5 tabs (only Shipment Details has content, rest are placeholders)
6. 6-stage stepper
7. Left column: Shipment Overview (7 fields) + Addresses (4 blocks)
8. Right column: Tasks (15 items + Add Task)
9. Bottom row: Basic Information (6 fields) | Key Dates (6 fields) — equal width

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx
git commit -m "refactor: redesign shipment detail page with new layout, tabs, stepper, and tasks"
```

---

### Task 5: Final cleanup and verification

**Files:**
- Review: All modified files

- [ ] **Step 1: Run the full app and verify end-to-end**

Start the dev server and verify:
1. Sidebar: white bg, indigo accents, chevron toggle in header, no user at bottom
2. Shipment list: 8 correct columns, status dropdown, search, pagination
3. Shipment detail: all sections render with correct data
4. Navigation between list and detail works
5. Other pages (Dashboard, Documents, Invoicing, Quotes, Warehouse) still work unchanged
6. Collapsed sidebar works on both list and detail pages

- [ ] **Step 2: Fix any TypeScript errors**

Run: `cd apps/web && npx tsc --noEmit`

Fix any type errors. The main expected issue is the new date fields not yet being in the frontend ShipmentItem type — if using React Query, the API response will include them automatically once the schema is updated.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors and polish layout redesign"
```
