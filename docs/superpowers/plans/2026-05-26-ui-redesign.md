# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete visual redesign of the Shipment Tracker web app — new top navigation, indigo color scheme, clean tables, accordion detail pages, reusable component library — all on Ant Design v5.

**Architecture:** Replace the current tab-based AppShell with a white top navigation bar. Build a library of reusable components (StatusBadge, AppModal, DataTable, AccordionSection, CollapsibleSidebar, etc.) first, then rebuild each page using those components. All existing hooks, API calls, and data layer remain unchanged — this is a pure UI/UX layer rewrite.

**Tech Stack:** Next.js 15, React 19, Ant Design v5 (ConfigProvider token overrides), TanStack React Query v5, TypeScript

**Design spec:** `docs/superpowers/specs/2026-05-26-ui-redesign-design.md`

**Key constraints:**
- Keep all existing hooks (`useShipments`, `useQuotes`, `useInvoicing`, `useDashboard`, `useWarehouse`, `useWarehouseSection`) unchanged
- Keep API client (`lib/api/client.ts`, `lib/api/index.ts`) unchanged
- Keep `lib/auth/AuthContext.tsx` unchanged
- Keep `lib/columnConfig.ts` unchanged
- Keep `Providers.tsx` structure (QueryClient → Auth → Theme)
- All antd components use ConfigProvider token overrides — no raw CSS color values in components

---

## File Map

### New files to create

| File | Responsibility |
|------|----------------|
| `components/TopNav.tsx` | Top navigation bar with logo, nav links, user menu |
| `components/StatusBadge.tsx` | Color-coded status pill (shipment, quote, invoice statuses) |
| `components/AppModal.tsx` | Modal wrapper with small/medium/large presets |
| `components/ConfirmModal.tsx` | Confirmation dialog (delete, discard, etc.) |
| `components/AppCard.tsx` | Consistent card container |
| `components/AccordionSection.tsx` | Collapsible section with status indicator |
| `components/DataTable.tsx` | Styled antd Table wrapper with toolbar |
| `components/PageHeader.tsx` | Page title + actions bar |
| `components/CollapsibleSidebar.tsx` | Detail page sidebar (expanded/collapsed) |
| `lib/toast.ts` | Toast/notification helper wrappers |
| `lib/statusColors.ts` | Status → color mapping constants |
| `hooks/useSidebarState.ts` | Sidebar collapse state (localStorage) |
| `app/shipments/[jobNumber]/page.tsx` | Shipment detail full page |
| `app/shipments/_components/ShipmentToolbar.tsx` | Search + filters + columns + actions bar |
| `app/shipments/_components/StatusTabs.tsx` | Status filter tabs with counts |
| `app/shipments/_components/DetailSidebar.tsx` | Shipment detail left sidebar nav |
| `app/shipments/_components/SummaryPanel.tsx` | Shipment detail right summary |
| `app/shipments/_components/sections/CustomerSection.tsx` | Customer accordion section |
| `app/shipments/_components/sections/ShipmentInfoSection.tsx` | Shipment info accordion |
| `app/shipments/_components/sections/RoutingSection.tsx` | Routing accordion |
| `app/shipments/_components/sections/CargoSection.tsx` | Cargo & dimensions accordion |
| `app/shipments/_components/sections/ComplianceSection.tsx` | Compliance & docs accordion |
| `app/shipments/_components/sections/CostsSection.tsx` | Costs & billing accordion |
| `app/dashboard/_components/NeedsAttentionCard.tsx` | Dashboard attention items |
| `app/dashboard/_components/UpcomingCard.tsx` | Dashboard upcoming deadlines |
| `app/dashboard/_components/RecentShipmentsTable.tsx` | Dashboard recent shipments |

### Files to modify

| File | Changes |
|------|---------|
| `lib/theme/themeConfig.ts` | Replace teal palette with indigo, update all component tokens |
| `app/AppShell.tsx` | Replace tab nav with TopNav component, remove old header |
| `app/layout.tsx` | No structural changes, just verify imports |
| `app/dashboard/_components/DashboardView.tsx` | Rebuild with new KPI cards + attention/upcoming cards |
| `app/dashboard/_components/KpiCard.tsx` | Restyle to match new design |
| `app/shipments/_components/ShipmentsView.tsx` | Rebuild as clean table page (no inline editing) |
| `app/shipments/_components/ShipmentsTable.tsx` | Rebuild as clean read-only table with ~7 columns |
| `app/shipments/_components/CreateShipmentWizard.tsx` | Convert to medium AppModal |
| `app/quotes/_components/QuotesView.tsx` | Rebuild with DataTable |
| `app/invoicing/_components/InvoicingView.tsx` | Rebuild with DataTable |
| `app/warehouse/_components/WarehouseView.tsx` | Rebuild with DataTable |
| `app/documents/_components/DocumentsView.tsx` | Restyle upload zone |

### Files unchanged (keep as-is)

| File | Reason |
|------|--------|
| `lib/api/*` | API client, no UI changes |
| `lib/auth/AuthContext.tsx` | Auth logic unchanged |
| `lib/columnConfig.ts` | Column definitions unchanged |
| `hooks/useShipments.ts` | Data hooks unchanged |
| `hooks/useDashboard.ts` | Data hooks unchanged |
| `hooks/useQuotes.ts` | Data hooks unchanged |
| `hooks/useInvoicing.ts` | Data hooks unchanged |
| `hooks/useWarehouse.ts` | Data hooks unchanged |
| `hooks/useWarehouseSection.ts` | Data hooks unchanged |
| `app/Providers.tsx` | Provider structure unchanged |
| `app/login/LoginPage.tsx` | Login page unchanged (restyle later if needed) |

---

## Task 1: Theme & Color Constants

**Files:**
- Modify: `apps/web/src/lib/theme/themeConfig.ts`
- Create: `apps/web/src/lib/statusColors.ts`
- Create: `apps/web/src/lib/toast.ts`

- [ ] **Step 1: Replace theme config with indigo palette**

Replace the entire content of `apps/web/src/lib/theme/themeConfig.ts`:

```ts
import type { ThemeConfig } from "antd";

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: "#6366f1",
    colorInfo: "#3b82f6",
    colorSuccess: "#22c55e",
    colorWarning: "#f59e0b",
    colorError: "#ef4444",
    colorBgLayout: "#f8fafc",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBorder: "#e2e8f0",
    colorBorderSecondary: "#f1f5f9",
    colorText: "#1e293b",
    colorTextSecondary: "#64748b",
    colorTextTertiary: "#94a3b8",
    borderRadius: 6,
    borderRadiusLG: 10,
    fontSize: 13,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 36,
      controlHeightSM: 28,
      fontWeight: 500,
    },
    Table: {
      headerBg: "#fafbfc",
      headerColor: "#64748b",
      rowHoverBg: "#fafaff",
      borderColor: "#f1f5f9",
      headerSplitColor: "transparent",
      fontSize: 12,
    },
    Modal: {
      borderRadiusLG: 12,
      titleFontSize: 16,
    },
    Input: {
      activeBorderColor: "#6366f1",
      hoverBorderColor: "#a5b4fc",
      activeShadow: "0 0 0 3px rgba(99,102,241,0.1)",
    },
    Select: {
      activeBorderColor: "#6366f1",
      hoverBorderColor: "#a5b4fc",
    },
    Tag: {
      borderRadiusSM: 12,
    },
    Tabs: {
      inkBarColor: "#6366f1",
      itemActiveColor: "#6366f1",
      itemSelectedColor: "#6366f1",
    },
    Checkbox: {
      colorPrimary: "#6366f1",
      colorPrimaryHover: "#4f46e5",
    },
  },
};

export const darkTheme: ThemeConfig = lightTheme;
```

- [ ] **Step 2: Create status color mapping**

Create `apps/web/src/lib/statusColors.ts`:

```ts
export interface StatusStyle {
  bg: string;
  text: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  // Shipment statuses
  booking: { bg: "#e0e7ff", text: "#4f46e5" },
  "booking confirmation pending": { bg: "#e0e7ff", text: "#4f46e5" },
  "in transit": { bg: "#dbeafe", text: "#1d4ed8" },
  "all done - waiting to be shipped": { bg: "#dbeafe", text: "#1d4ed8" },
  customs: { bg: "#fef3c7", text: "#d97706" },
  "customs clearance": { bg: "#fef3c7", text: "#d97706" },
  delivered: { bg: "#dcfce7", text: "#16a34a" },
  completed: { bg: "#dcfce7", text: "#16a34a" },
  overdue: { bg: "#fee2e2", text: "#dc2626" },
  cancelled: { bg: "#f1f5f9", text: "#64748b" },

  // Quote statuses
  draft: { bg: "#f1f5f9", text: "#64748b" },
  active: { bg: "#dbeafe", text: "#1d4ed8" },
  booked: { bg: "#dcfce7", text: "#16a34a" },
  expired: { bg: "#fee2e2", text: "#dc2626" },

  // Invoice statuses
  pending: { bg: "#fef3c7", text: "#d97706" },
  invoiced: { bg: "#dcfce7", text: "#16a34a" },
  paid: { bg: "#dbeafe", text: "#1d4ed8" },
};

const DEFAULT_STYLE: StatusStyle = { bg: "#f1f5f9", text: "#64748b" };

export function getStatusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status.toLowerCase()] ?? DEFAULT_STYLE;
}
```

- [ ] **Step 3: Create toast helpers**

Create `apps/web/src/lib/toast.ts`:

```ts
import { message, notification } from "antd";

export const toast = {
  success: (content: string) => message.success(content),
  error: (content: string) => message.error(content),
  warning: (content: string) => message.warning(content),
  info: (content: string) => message.info(content),

  notify: ({
    title,
    description,
    type = "info",
    action,
  }: {
    title: string;
    description: string;
    type?: "success" | "info" | "warning" | "error";
    action?: { label: string; onClick: () => void };
  }) => {
    notification[type]({
      message: title,
      description,
      placement: "topRight",
      duration: 8,
      btn: action
        ? undefined // action link rendered in description
        : undefined,
    });
  },
};
```

- [ ] **Step 4: Verify the app still builds**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

Expected: Build succeeds (theme changes are backwards-compatible via ConfigProvider).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/theme/themeConfig.ts apps/web/src/lib/statusColors.ts apps/web/src/lib/toast.ts
git commit -m "feat: update theme to indigo palette, add status colors and toast helpers"
```

---

## Task 2: Reusable Components — StatusBadge, AppCard, PageHeader

**Files:**
- Create: `apps/web/src/components/StatusBadge.tsx`
- Create: `apps/web/src/components/AppCard.tsx`
- Create: `apps/web/src/components/PageHeader.tsx`

- [ ] **Step 1: Create StatusBadge component**

Create `apps/web/src/components/StatusBadge.tsx`:

```tsx
"use client";

import { Tag } from "antd";
import { getStatusStyle } from "@/lib/statusColors";

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = getStatusStyle(status);
  return (
    <Tag
      bordered={false}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderRadius: 12,
        fontWeight: 500,
        fontSize: 11,
        padding: "2px 10px",
        lineHeight: "18px",
      }}
    >
      {label ?? status}
    </Tag>
  );
}
```

- [ ] **Step 2: Create AppCard component**

Create `apps/web/src/components/AppCard.tsx`:

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";

interface AppCardProps {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

export function AppCard({ title, extra, children, style, bodyStyle }: AppCardProps) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        padding: 18,
        ...style,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          {typeof title === "string" ? (
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{title}</span>
          ) : (
            title
          )}
          {extra}
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create PageHeader component**

Create `apps/web/src/components/PageHeader.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  breadcrumb?: ReactNode;
  extra?: ReactNode;
}

export function PageHeader({ title, breadcrumb, extra }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      {breadcrumb && (
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{breadcrumb}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", margin: 0 }}>{title}</h1>
        {extra && <div style={{ display: "flex", gap: 8 }}>{extra}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/StatusBadge.tsx apps/web/src/components/AppCard.tsx apps/web/src/components/PageHeader.tsx
git commit -m "feat: add StatusBadge, AppCard, PageHeader components"
```

---

## Task 3: Reusable Components — AppModal, ConfirmModal

**Files:**
- Create: `apps/web/src/components/AppModal.tsx`
- Create: `apps/web/src/components/ConfirmModal.tsx`

- [ ] **Step 1: Create AppModal component**

Create `apps/web/src/components/AppModal.tsx`:

```tsx
"use client";

import { Modal } from "antd";
import type { ReactNode } from "react";

type ModalSize = "small" | "medium" | "large";

const SIZE_MAP: Record<ModalSize, number> = {
  small: 380,
  medium: 480,
  large: 820,
};

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  destroyOnClose?: boolean;
}

export function AppModal({
  open,
  onClose,
  title,
  subtitle,
  size = "medium",
  footer,
  children,
  destroyOnClose = true,
}: AppModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400, marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
      }
      width={SIZE_MAP[size]}
      footer={footer}
      destroyOnClose={destroyOnClose}
      styles={{
        body: { padding: "16px 24px" },
        footer: {
          padding: "12px 24px",
          borderTop: "1px solid #e2e8f0",
          background: "#fafbfc",
        },
      }}
    >
      {children}
    </Modal>
  );
}
```

- [ ] **Step 2: Create ConfirmModal component**

Create `apps/web/src/components/ConfirmModal.tsx`:

```tsx
"use client";

import { Modal, Button } from "antd";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={380}
      closable={false}
      destroyOnClose
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: danger ? "#fee2e2" : "#e0e7ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {danger ? "⚠️" : "ℹ️"}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          danger={danger}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AppModal.tsx apps/web/src/components/ConfirmModal.tsx
git commit -m "feat: add AppModal and ConfirmModal components"
```

---

## Task 4: Reusable Components — AccordionSection, CollapsibleSidebar, useSidebarState

**Files:**
- Create: `apps/web/src/components/AccordionSection.tsx`
- Create: `apps/web/src/components/CollapsibleSidebar.tsx`
- Create: `apps/web/src/hooks/useSidebarState.ts`

- [ ] **Step 1: Create useSidebarState hook**

Create `apps/web/src/hooks/useSidebarState.ts`:

```ts
"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sidebar-collapsed";

export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return { collapsed, toggle };
}
```

- [ ] **Step 2: Create AccordionSection component**

Create `apps/web/src/components/AccordionSection.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";

type SectionStatus = "completed" | "in-progress" | "not-started";

interface AccordionSectionProps {
  title: string;
  description: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}

const STATUS_LABELS: Record<SectionStatus, { label: string; color: string }> = {
  completed: { label: "✓ Completed", color: "#22c55e" },
  "in-progress": { label: "In progress", color: "#f59e0b" },
  "not-started": { label: "Not started", color: "#94a3b8" },
};

export function AccordionSection({
  title,
  description,
  status,
  defaultOpen = false,
  children,
  id,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const statusInfo = STATUS_LABELS[status];

  return (
    <div
      id={id}
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e2e8f0",
        borderLeft: open ? "3px solid #6366f1" : "1px solid #e2e8f0",
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          cursor: "pointer",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{description}</div>
        </div>
        <span style={{ fontSize: 11, color: statusInfo.color }}>{statusInfo.label}</span>
      </div>
      {open && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" }}>{children}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create CollapsibleSidebar component**

Create `apps/web/src/components/CollapsibleSidebar.tsx`:

```tsx
"use client";

import { Tooltip } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

interface NavItem {
  key: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  badgeColor?: string;
}

interface CollapsibleSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  header?: ReactNode;
  bottomItems?: NavItem[];
}

const EXPANDED_WIDTH = 180;
const COLLAPSED_WIDTH = 44;

export function CollapsibleSidebar({
  collapsed,
  onToggle,
  items,
  activeKey,
  onSelect,
  header,
  bottomItems,
}: CollapsibleSidebarProps) {
  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const renderItem = (item: NavItem) => {
    const isActive = item.key === activeKey;
    const content = (
      <div
        key={item.key}
        onClick={() => onSelect(item.key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 8,
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "8px 0" : "8px 12px",
          borderRadius: 6,
          fontSize: 13,
          color: isActive ? "#6366f1" : "#64748b",
          background: isActive ? "#f0f0ff" : "transparent",
          cursor: "pointer",
          marginBottom: 2,
          transition: "all 0.15s",
          position: "relative",
        }}
      >
        <span style={{ fontSize: 14, width: collapsed ? "auto" : 18, textAlign: "center", flexShrink: 0 }}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge !== undefined && (
              <span
                style={{
                  fontSize: 10,
                  color: item.badgeColor ?? "#94a3b8",
                }}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && item.badge !== undefined && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: item.badgeColor ?? "#94a3b8",
              color: "white",
              fontSize: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            {typeof item.badge === "number" ? item.badge : ""}
          </span>
        )}
      </div>
    );

    return collapsed ? (
      <Tooltip key={item.key} title={item.label} placement="right">
        {content}
      </Tooltip>
    ) : (
      content
    );
  };

  return (
    <div
      style={{
        width,
        background: "#fff",
        borderRight: "1px solid #e2e8f0",
        padding: collapsed ? "12px 4px" : "12px 8px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {header && !collapsed && <div style={{ marginBottom: 8 }}>{header}</div>}

      {!collapsed && (
        <div
          style={{
            fontSize: 10,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            padding: "4px 12px",
            fontWeight: 500,
          }}
        >
          Sections
        </div>
      )}

      <div style={{ flex: 1 }}>
        {items.map(renderItem)}
        {bottomItems && bottomItems.length > 0 && (
          <>
            <div style={{ borderTop: "1px solid #e2e8f0", margin: "6px 0" }} />
            {!collapsed && (
              <div
                style={{
                  fontSize: 10,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  padding: "4px 12px",
                  fontWeight: 500,
                }}
              >
                Tools
              </div>
            )}
            {bottomItems.map(renderItem)}
          </>
        )}
      </div>

      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 0",
          cursor: "pointer",
          color: "#94a3b8",
          borderTop: "1px solid #e2e8f0",
          marginTop: 8,
        }}
      >
        {collapsed ? <RightOutlined style={{ fontSize: 12 }} /> : <LeftOutlined style={{ fontSize: 12 }} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AccordionSection.tsx apps/web/src/components/CollapsibleSidebar.tsx apps/web/src/hooks/useSidebarState.ts
git commit -m "feat: add AccordionSection, CollapsibleSidebar, useSidebarState"
```

---

## Task 5: Top Navigation — Replace AppShell

**Files:**
- Create: `apps/web/src/components/TopNav.tsx`
- Modify: `apps/web/src/app/AppShell.tsx`

- [ ] **Step 1: Create TopNav component**

Create `apps/web/src/components/TopNav.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { Dropdown, type MenuProps } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/shipments", label: "Shipments" },
  { path: "/documents", label: "Documents" },
  { path: "/invoicing", label: "Invoicing" },
  { path: "/quotes", label: "Quotes" },
  { path: "/warehouse", label: "Warehouse" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const userMenuItems: MenuProps["items"] = [
    {
      key: "user",
      label: (
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {user?.email}
        </span>
      ),
      disabled: true,
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      onClick: logout,
    },
  ];

  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        height: 52,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 32, cursor: "pointer" }}
        onClick={() => router.push("/dashboard")}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: "#6366f1",
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          ST
        </div>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#1e293b" }}>Shipment Tracker</span>
      </div>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + "/");
          return (
            <div
              key={item.path}
              onClick={() => router.push(item.path)}
              style={{
                padding: "14px 14px",
                fontSize: 13,
                fontWeight: isActive ? 500 : 450,
                color: isActive ? "#6366f1" : "#64748b",
                cursor: "pointer",
                borderBottom: isActive ? "2px solid #6366f1" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      {/* User menu */}
      <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="bottomRight">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "#e0e7ff",
              color: "#6366f1",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {user?.displayName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) ?? <UserOutlined />}
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {user?.displayName ?? "User"}
          </span>
        </div>
      </Dropdown>
    </nav>
  );
}
```

- [ ] **Step 2: Replace AppShell with TopNav layout**

Replace the entire content of `apps/web/src/app/AppShell.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { TopNav } from "@/components/TopNav";
import { useEffect } from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user && pathname !== "/login") {
    return null;
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TopNav />
      <main style={{ flex: 1, background: "#f8fafc" }}>{children}</main>
    </div>
  );
};
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

Expected: Build succeeds. The app now shows a white top nav with indigo active states instead of the old tab bar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/TopNav.tsx apps/web/src/app/AppShell.tsx
git commit -m "feat: replace tab navigation with white top nav bar"
```

---

## Task 6: Dashboard Page Rebuild

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/DashboardView.tsx`
- Modify: `apps/web/src/app/dashboard/_components/KpiCard.tsx`
- Create: `apps/web/src/app/dashboard/_components/NeedsAttentionCard.tsx`
- Create: `apps/web/src/app/dashboard/_components/UpcomingCard.tsx`
- Create: `apps/web/src/app/dashboard/_components/RecentShipmentsTable.tsx`

- [ ] **Step 1: Rebuild KpiCard**

Replace `apps/web/src/app/dashboard/_components/KpiCard.tsx`:

```tsx
"use client";

interface KpiCardProps {
  label: string;
  value: number | string;
  valueColor?: string;
  trend?: string;
  trendType?: "up" | "down" | "neutral";
}

export function KpiCard({ label, value, valueColor, trend, trendType = "neutral" }: KpiCardProps) {
  const trendColors = { up: "#22c55e", down: "#ef4444", neutral: "#64748b" };
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: 18,
        border: "1px solid #e2e8f0",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: valueColor ?? "#1e293b" }}>{value}</div>
      {trend && (
        <div style={{ fontSize: 11, color: trendColors[trendType], marginTop: 6 }}>{trend}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create NeedsAttentionCard**

Create `apps/web/src/app/dashboard/_components/NeedsAttentionCard.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";

interface AttentionItem {
  jobNumber: string;
  shipmentId: string;
  reason: string;
  status: string;
  severity: "danger" | "warning";
}

interface NeedsAttentionCardProps {
  items: AttentionItem[];
}

export function NeedsAttentionCard({ items }: NeedsAttentionCardProps) {
  const router = useRouter();
  return (
    <AppCard
      title="Needs Attention"
      extra={
        items.length > 0 ? (
          <span style={{ fontSize: 11, color: "#ef4444" }}>{items.length} items</span>
        ) : null
      }
    >
      {items.length === 0 && (
        <div style={{ color: "#94a3b8", fontSize: 12, padding: "8px 0" }}>All good — nothing needs attention.</div>
      )}
      {items.map((item) => (
        <div
          key={item.jobNumber}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: "1px solid #f1f5f9",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: item.severity === "danger" ? "#ef4444" : "#f59e0b" }}>●</span>
            <span
              style={{ color: "#6366f1", fontWeight: 500, cursor: "pointer" }}
              onClick={() => router.push(`/shipments/${item.shipmentId}`)}
            >
              {item.jobNumber}
            </span>
            <span style={{ color: "#64748b" }}>{item.reason}</span>
          </div>
          <StatusBadge status={item.status} />
        </div>
      ))}
    </AppCard>
  );
}
```

- [ ] **Step 3: Create UpcomingCard**

Create `apps/web/src/app/dashboard/_components/UpcomingCard.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { AppCard } from "@/components/AppCard";

interface UpcomingItem {
  jobNumber: string;
  shipmentId: string;
  description: string;
  when: string;
}

interface UpcomingCardProps {
  items: UpcomingItem[];
}

export function UpcomingCard({ items }: UpcomingCardProps) {
  const router = useRouter();
  return (
    <AppCard title="Upcoming This Week">
      {items.length === 0 && (
        <div style={{ color: "#94a3b8", fontSize: 12, padding: "8px 0" }}>No upcoming events.</div>
      )}
      {items.map((item) => (
        <div
          key={item.jobNumber + item.description}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: "1px solid #f1f5f9",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{ color: "#6366f1", fontWeight: 500, cursor: "pointer" }}
              onClick={() => router.push(`/shipments/${item.shipmentId}`)}
            >
              {item.jobNumber}
            </span>
            <span style={{ color: "#64748b" }}>{item.description}</span>
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>{item.when}</span>
        </div>
      ))}
    </AppCard>
  );
}
```

- [ ] **Step 4: Create RecentShipmentsTable**

Create `apps/web/src/app/dashboard/_components/RecentShipmentsTable.tsx`:

```tsx
"use client";

import { Table } from "antd";
import { useRouter } from "next/navigation";
import { AppCard } from "@/components/AppCard";
import { StatusBadge } from "@/components/StatusBadge";
import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";

interface RecentShipmentsTableProps {
  shipments: ShipmentItem[];
}

export function RecentShipmentsTable({ shipments }: RecentShipmentsTableProps) {
  const router = useRouter();

  const columns = [
    {
      title: "JOB #",
      dataIndex: "id",
      key: "job",
      render: (_: unknown, record: ShipmentItem) => (
        <span style={{ color: "#6366f1", fontWeight: 500, cursor: "pointer" }}>
          {getFieldValue(record, "jobNumber") || record.id}
        </span>
      ),
    },
    {
      title: "STATUS",
      key: "status",
      render: (_: unknown, record: ShipmentItem) => {
        const status = getFieldValue(record, "shipmentStatus");
        return status ? <StatusBadge status={status} /> : <span style={{ color: "#94a3b8" }}>—</span>;
      },
    },
    {
      title: "CUSTOMER",
      key: "customer",
      render: (_: unknown, record: ShipmentItem) => getFieldValue(record, "customer") || "—",
    },
    {
      title: "ROUTE",
      key: "route",
      render: (_: unknown, record: ShipmentItem) => {
        const pol = getFieldValue(record, "pol");
        const pod = getFieldValue(record, "pod");
        return pol || pod ? (
          <span style={{ color: "#64748b" }}>{[pol, pod].filter(Boolean).join(" → ")}</span>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        );
      },
    },
    {
      title: "MODE",
      key: "mode",
      render: (_: unknown, record: ShipmentItem) => (
        <span style={{ color: "#64748b" }}>{getFieldValue(record, "freightMode") || "—"}</span>
      ),
    },
    {
      title: "ETA",
      key: "eta",
      render: (_: unknown, record: ShipmentItem) => (
        <span style={{ color: "#64748b" }}>{getFieldValue(record, "estimatedArrival") || "—"}</span>
      ),
    },
  ];

  return (
    <AppCard
      title="Recent Shipments"
      extra={
        <span
          style={{ color: "#6366f1", fontSize: 12, cursor: "pointer" }}
          onClick={() => router.push("/shipments")}
        >
          View all →
        </span>
      }
    >
      <Table
        dataSource={shipments.slice(0, 5)}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        onRow={(record) => ({
          onClick: () => router.push(`/shipments/${record.id}`),
          style: { cursor: "pointer" },
        })}
      />
    </AppCard>
  );
}
```

- [ ] **Step 5: Rebuild DashboardView**

Replace `apps/web/src/app/dashboard/_components/DashboardView.tsx`:

```tsx
"use client";

import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/PageHeader";
import { KpiCard } from "./KpiCard";
import { NeedsAttentionCard } from "./NeedsAttentionCard";
import { UpcomingCard } from "./UpcomingCard";
import { RecentShipmentsTable } from "./RecentShipmentsTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useShipments } from "@/hooks/useShipments";
import { useRouter } from "next/navigation";

export function DashboardView() {
  const router = useRouter();
  const { data: dashboardData } = useDashboard();
  const { shipments } = useShipments();

  // Derive KPIs from shipments data
  const activeCount = shipments.filter(
    (s) => {
      const status = (s as Record<string, unknown>).shipmentStatus as string | undefined;
      return status && !["delivered", "cancelled"].includes(status.toLowerCase());
    }
  ).length;
  const totalCount = shipments.length;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Dashboard"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/shipments")}>
            New Shipment
          </Button>
        }
      />

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Active Shipments" value={activeCount} />
        <KpiCard label="Total Shipments" value={totalCount} />
        <KpiCard label="This Month" value={dashboardData?.thisMonth ?? "—"} />
        <KpiCard label="Completed" value={dashboardData?.completed ?? "—"} valueColor="#22c55e" />
      </div>

      {/* Two-column cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <NeedsAttentionCard items={dashboardData?.needsAttention ?? []} />
        <UpcomingCard items={dashboardData?.upcoming ?? []} />
      </div>

      {/* Recent shipments */}
      <RecentShipmentsTable shipments={shipments} />
    </div>
  );
}
```

Note: The `dashboardData` shape may not perfectly match the API response yet. The implementer should check the actual response from `api.shipments.shipmentDashboard()` and adapt the field names. The KPI values can initially be derived directly from the `shipments` array if the dashboard endpoint doesn't return them.

- [ ] **Step 6: Build and verify**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/
git commit -m "feat: rebuild dashboard with KPIs, attention, upcoming, recent table"
```

---

## Task 7: Shipments List Page Rebuild

**Files:**
- Modify: `apps/web/src/app/shipments/_components/ShipmentsView.tsx`
- Modify: `apps/web/src/app/shipments/_components/ShipmentsTable.tsx`
- Modify: `apps/web/src/app/shipments/_components/CreateShipmentWizard.tsx`

- [ ] **Step 1: Rebuild ShipmentsTable as clean read-only table**

Replace `apps/web/src/app/shipments/_components/ShipmentsTable.tsx`:

```tsx
"use client";

import { Table, Input, Button, Dropdown, type MenuProps } from "antd";
import {
  PlusOutlined,
  FilterOutlined,
  DownloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";
import { isDateInPast } from "@/lib/columnConfig";

interface ShipmentsTableProps {
  shipments: ShipmentItem[];
  isLoading: boolean;
  onCreateNew: () => void;
  onDelete: (id: string) => void;
}

const STATUS_FILTERS = ["All", "Active", "In Transit", "Customs", "Delivered"];

export function ShipmentsTable({ shipments, isLoading, onCreateNew, onDelete }: ShipmentsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() => {
    let result = shipments;

    if (statusFilter !== "All") {
      result = result.filter((s) => {
        const status = getFieldValue(s, "shipmentStatus").toLowerCase();
        return status.includes(statusFilter.toLowerCase());
      });
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) => {
        const jobNum = getFieldValue(s, "jobNumber").toLowerCase();
        const customer = getFieldValue(s, "customer").toLowerCase();
        const pol = getFieldValue(s, "pol").toLowerCase();
        const pod = getFieldValue(s, "pod").toLowerCase();
        return jobNum.includes(q) || customer.includes(q) || pol.includes(q) || pod.includes(q);
      });
    }

    return result;
  }, [shipments, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: shipments.length };
    for (const s of shipments) {
      const status = getFieldValue(s, "shipmentStatus").toLowerCase();
      if (status.includes("transit")) counts["In Transit"] = (counts["In Transit"] ?? 0) + 1;
      else if (status.includes("customs")) counts["Customs"] = (counts["Customs"] ?? 0) + 1;
      else if (status.includes("delivered")) counts["Delivered"] = (counts["Delivered"] ?? 0) + 1;
      else counts["Active"] = (counts["Active"] ?? 0) + 1;
    }
    return counts;
  }, [shipments]);

  const rowActions = (record: ShipmentItem): MenuProps["items"] => [
    { key: "view", label: "View", onClick: () => router.push(`/shipments/${record.id}`) },
    { type: "divider" },
    { key: "delete", label: "Delete", danger: true, onClick: () => onDelete(record.id) },
  ];

  const columns = [
    {
      title: "JOB #",
      key: "job",
      width: 140,
      render: (_: unknown, record: ShipmentItem) => (
        <span style={{ color: "#6366f1", fontWeight: 500 }}>
          {getFieldValue(record, "jobNumber") || record.id}
        </span>
      ),
    },
    {
      title: "STATUS",
      key: "status",
      width: 130,
      render: (_: unknown, record: ShipmentItem) => {
        const status = getFieldValue(record, "shipmentStatus");
        return status ? <StatusBadge status={status} /> : <span style={{ color: "#94a3b8" }}>—</span>;
      },
    },
    {
      title: "CUSTOMER",
      key: "customer",
      render: (_: unknown, record: ShipmentItem) => getFieldValue(record, "customer") || "—",
    },
    {
      title: "ROUTE",
      key: "route",
      render: (_: unknown, record: ShipmentItem) => {
        const pol = getFieldValue(record, "pol");
        const pod = getFieldValue(record, "pod");
        return (
          <span style={{ color: "#64748b" }}>{[pol, pod].filter(Boolean).join(" → ") || "—"}</span>
        );
      },
    },
    {
      title: "MODE",
      key: "mode",
      width: 100,
      render: (_: unknown, record: ShipmentItem) => (
        <span style={{ color: "#64748b" }}>{getFieldValue(record, "freightMode") || "—"}</span>
      ),
    },
    {
      title: "ETA",
      key: "eta",
      width: 110,
      render: (_: unknown, record: ShipmentItem) => {
        const eta = getFieldValue(record, "estimatedArrival");
        const isOverdue = eta && isDateInPast(eta);
        return (
          <span style={{ color: isOverdue ? "#ef4444" : "#64748b", fontWeight: isOverdue ? 500 : 400 }}>
            {eta || "—"}
          </span>
        );
      },
    },
    {
      title: "",
      key: "actions",
      width: 40,
      render: (_: unknown, record: ShipmentItem) => (
        <Dropdown menu={{ items: rowActions(record) }} trigger={["click"]}>
          <span style={{ color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>⋮</span>
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Shipments"
        extra={
          <>
            <Button icon={<DownloadOutlined />}>Export</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateNew}>
              New Shipment
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Input
          prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
          placeholder="Search shipments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220 }}
          allowClear
        />
        <Button icon={<FilterOutlined />}>Filters</Button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#64748b" }}>{filtered.length} shipments</span>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 20, marginBottom: 14, borderBottom: "1px solid #e2e8f0" }}>
        {STATUS_FILTERS.map((tab) => (
          <div
            key={tab}
            onClick={() => setStatusFilter(tab)}
            style={{
              fontSize: 12,
              color: statusFilter === tab ? "#6366f1" : "#64748b",
              fontWeight: statusFilter === tab ? 500 : 400,
              paddingBottom: 10,
              cursor: "pointer",
              borderBottom: statusFilter === tab ? "2px solid #6366f1" : "2px solid transparent",
            }}
          >
            {tab}{" "}
            <span
              style={{
                background: statusFilter === tab ? "#e0e7ff" : "#f1f5f9",
                color: statusFilter === tab ? "#4f46e5" : "#64748b",
                padding: "1px 7px",
                borderRadius: 8,
                fontSize: 10,
                marginLeft: 4,
              }}
            >
              {statusCounts[tab] ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* Table */}
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total, range) => `Showing ${range[0]}–${range[1]} of ${total}` }}
        onRow={(record) => ({
          onClick: () => router.push(`/shipments/${record.id}`),
          style: { cursor: "pointer" },
        })}
        style={{ background: "white", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Rebuild CreateShipmentWizard as AppModal**

Replace `apps/web/src/app/shipments/_components/CreateShipmentWizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Input, Select, Button } from "antd";
import { AppModal } from "@/components/AppModal";
import { useShipments } from "@/hooks/useShipments";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

interface CreateShipmentWizardProps {
  open: boolean;
  onClose: () => void;
}

export function CreateShipmentWizard({ open, onClose }: CreateShipmentWizardProps) {
  const { createShipment, isCreating } = useShipments();
  const router = useRouter();
  const [customer, setCustomer] = useState("");
  const [tradeDirection, setTradeDirection] = useState("Import");
  const [freightMode, setFreightMode] = useState("Sea FCL");
  const [department, setDepartment] = useState("OPS");

  const handleCreate = async () => {
    try {
      const result = await createShipment({
        customer,
        tradeDirection,
        freightMode,
        department,
      });
      toast.success("Shipment created");
      onClose();
      if (result?.id) router.push(`/shipments/${result.id}`);
    } catch {
      toast.error("Failed to create shipment");
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Create New Shipment"
      subtitle="A unique job number will be assigned automatically."
      size="medium"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleCreate} loading={isCreating}>
            Create & Open
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
            Customer
          </label>
          <Input
            placeholder="Enter customer name"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
              Trade Direction
            </label>
            <Select value={tradeDirection} onChange={setTradeDirection} style={{ width: "100%" }}>
              <Select.Option value="Import">Import</Select.Option>
              <Select.Option value="Export">Export</Select.Option>
            </Select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
              Freight Mode
            </label>
            <Select value={freightMode} onChange={setFreightMode} style={{ width: "100%" }}>
              <Select.Option value="Sea FCL">Sea FCL</Select.Option>
              <Select.Option value="Sea LCL">Sea LCL</Select.Option>
              <Select.Option value="Air">Air</Select.Option>
              <Select.Option value="Road">Road</Select.Option>
              <Select.Option value="Rail">Rail</Select.Option>
            </Select>
          </div>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
            Department
          </label>
          <Select value={department} onChange={setDepartment} style={{ width: "100%" }}>
            <Select.Option value="OPS">OPS</Select.Option>
            <Select.Option value="CUSTOMS">CUSTOMS</Select.Option>
            <Select.Option value="TRUCKING">TRUCKING</Select.Option>
            <Select.Option value="AD">AD</Select.Option>
            <Select.Option value="ACCOUNTING">ACCOUNTING</Select.Option>
          </Select>
        </div>
      </div>
    </AppModal>
  );
}
```

- [ ] **Step 3: Rebuild ShipmentsView as thin wrapper**

Replace `apps/web/src/app/shipments/_components/ShipmentsView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useShipments } from "@/hooks/useShipments";
import { ShipmentsTable } from "./ShipmentsTable";
import { CreateShipmentWizard } from "./CreateShipmentWizard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { toast } from "@/lib/toast";

export function ShipmentsView() {
  const { shipments, isLoading, deleteShipment, isDeleting } = useShipments();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShipment(deleteTarget);
      toast.success("Shipment deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete shipment");
    }
  };

  return (
    <>
      <ShipmentsTable
        shipments={shipments}
        isLoading={isLoading}
        onCreateNew={() => setCreateOpen(true)}
        onDelete={(id) => setDeleteTarget(id)}
      />
      <CreateShipmentWizard open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Shipment?"
        description="This will soft-delete the shipment. It will be hidden but kept in the database."
        confirmLabel="Delete"
        danger
        loading={isDeleting}
      />
    </>
  );
}
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/shipments/_components/ShipmentsView.tsx apps/web/src/app/shipments/_components/ShipmentsTable.tsx apps/web/src/app/shipments/_components/CreateShipmentWizard.tsx
git commit -m "feat: rebuild shipments list with clean table, status tabs, create modal"
```

---

## Task 8: Shipment Detail Page — Layout, Sidebar, Summary

**Files:**
- Create: `apps/web/src/app/shipments/[jobNumber]/page.tsx`
- Create: `apps/web/src/app/shipments/_components/DetailSidebar.tsx`
- Create: `apps/web/src/app/shipments/_components/SummaryPanel.tsx`

- [ ] **Step 1: Create DetailSidebar**

Create `apps/web/src/app/shipments/_components/DetailSidebar.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { CollapsibleSidebar } from "@/components/CollapsibleSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { useSidebarState } from "@/hooks/useSidebarState";
import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";

interface DetailSidebarProps {
  shipment: ShipmentItem;
  activeSection: string;
  onSelectSection: (key: string) => void;
}

export function DetailSidebar({ shipment, activeSection, onSelectSection }: DetailSidebarProps) {
  const router = useRouter();
  const { collapsed, toggle } = useSidebarState();
  const jobNumber = getFieldValue(shipment, "jobNumber") || shipment.id;
  const status = getFieldValue(shipment, "shipmentStatus");

  const sectionItems = [
    { key: "customer", icon: "👤", label: "Customer" },
    { key: "shipment-info", icon: "📋", label: "Shipment Info" },
    { key: "routing", icon: "🚢", label: "Routing" },
    { key: "cargo", icon: "📦", label: "Cargo" },
    { key: "compliance", icon: "📄", label: "Compliance" },
    { key: "costs", icon: "💰", label: "Costs" },
  ];

  const toolItems = [
    { key: "chat", icon: "💬", label: "Chat" },
    { key: "attachments", icon: "📎", label: "Attachments" },
    { key: "tracking", icon: "📊", label: "Tracking" },
    { key: "tasks", icon: "⚡", label: "Tasks" },
  ];

  return (
    <CollapsibleSidebar
      collapsed={collapsed}
      onToggle={toggle}
      items={sectionItems}
      bottomItems={toolItems}
      activeKey={activeSection}
      onSelect={onSelectSection}
      header={
        <div style={{ padding: "0 4px" }}>
          <div
            style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", marginBottom: 12 }}
            onClick={() => router.push("/shipments")}
          >
            ← Back to Shipments
          </div>
          <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{jobNumber}</div>
            {status && <StatusBadge status={status} />}
          </div>
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Create SummaryPanel**

Create `apps/web/src/app/shipments/_components/SummaryPanel.tsx`:

```tsx
"use client";

import type { ShipmentItem } from "@/hooks/useShipments";
import { getFieldValue } from "@/hooks/useShipments";

interface SummaryPanelProps {
  shipment: ShipmentItem;
}

export function SummaryPanel({ shipment }: SummaryPanelProps) {
  const gv = (key: string) => getFieldValue(shipment, key);

  const summaryRows = [
    { label: "Customer", value: gv("customer") },
    { label: "Route", value: [gv("pol"), gv("pod")].filter(Boolean).join(" → ") },
    { label: "Mode", value: gv("freightMode") },
    { label: "Incoterms", value: [gv("incotermOrigin"), gv("incotermDestination")].filter(Boolean).join(" / ") },
    { label: "ETD", value: gv("estimatedDeparture") },
    { label: "ETA", value: gv("estimatedArrival") },
    { label: "Department", value: gv("department") },
    { label: "Handler", value: gv("personInCharge") },
  ];

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          padding: 18,
          position: "sticky",
          top: 76,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Summary</div>
        {summaryRows.map(
          (row) =>
            row.value && (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#64748b" }}>{row.label}</span>
                <span style={{ color: "#1e293b", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>
                  {row.value}
                </span>
              </div>
            )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create shipment detail page**

Create `apps/web/src/app/shipments/[jobNumber]/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Spin } from "antd";
import { useShipments } from "@/hooks/useShipments";
import { DetailSidebar } from "../_components/DetailSidebar";
import { SummaryPanel } from "../_components/SummaryPanel";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { AccordionSection } from "@/components/AccordionSection";
import { getFieldValue } from "@/hooks/useShipments";
import Link from "next/link";

export default function ShipmentDetailPage() {
  const { jobNumber } = useParams<{ jobNumber: string }>();
  const { shipments, isLoading } = useShipments();
  const [activeSection, setActiveSection] = useState("customer");

  const shipment = shipments.find((s) => s.id === jobNumber);

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Shipment not found. <Link href="/shipments" style={{ color: "#6366f1" }}>Back to list</Link>
      </div>
    );
  }

  const gv = (key: string) => getFieldValue(shipment, key);
  const jobNum = gv("jobNumber") || shipment.id;
  const status = gv("shipmentStatus");

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 52px)" }}>
      <DetailSidebar
        shipment={shipment}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
      />

      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <PageHeader
              title={jobNum}
              breadcrumb={
                <span>
                  <Link href="/shipments" style={{ color: "#6366f1", textDecoration: "none" }}>
                    Shipments
                  </Link>
                  {" → "}
                  {jobNum}
                </span>
              }
              extra={
                status ? <StatusBadge status={status} /> : undefined
              }
            />

            {/* Accordion sections — placeholder content for now, detailed sections in Task 9 */}
            <AccordionSection
              id="customer"
              title="Customer Details"
              description="Contact, references, person in charge"
              status={gv("customer") ? "completed" : "not-started"}
              defaultOpen={activeSection === "customer"}
            >
              <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><strong>Customer:</strong> {gv("customer") || "—"}</div>
                  <div><strong>Customer PIC:</strong> {gv("customerPic") || "—"}</div>
                  <div><strong>Customer Ref:</strong> {gv("customerReference") || "—"}</div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="shipment-info"
              title="Shipment Info"
              description="Type, mode, incoterms, trade direction, department"
              status={gv("freightMode") ? "completed" : "not-started"}
            >
              <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><strong>Trade Direction:</strong> {gv("tradeDirection") || "—"}</div>
                  <div><strong>Freight Mode:</strong> {gv("freightMode") || "—"}</div>
                  <div><strong>Department:</strong> {gv("department") || "—"}</div>
                  <div><strong>Person in Charge:</strong> {gv("personInCharge") || "—"}</div>
                  <div><strong>Incoterms:</strong> {gv("incotermOrigin") || "—"}</div>
                  <div><strong>Service Type:</strong> {gv("serviceType") || "—"}</div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="routing"
              title="Routing"
              description="Origin, destination, ports, dates"
              status={gv("pol") ? "in-progress" : "not-started"}
            >
              <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><strong>POL:</strong> {gv("pol") || "—"}</div>
                  <div><strong>POD:</strong> {gv("pod") || "—"}</div>
                  <div><strong>ETD:</strong> {gv("estimatedDeparture") || "—"}</div>
                  <div><strong>ETA:</strong> {gv("estimatedArrival") || "—"}</div>
                  <div><strong>Shipper:</strong> {gv("shipper") || "—"}</div>
                  <div><strong>Consignee:</strong> {gv("consignee") || "—"}</div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="cargo"
              title="Cargo & Dimensions"
              description="Packages, containers, weight, volume, freight tons"
              status="not-started"
            >
              <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><strong>Weight:</strong> {gv("totalWeightTons") || "—"} tons</div>
                  <div><strong>Volume:</strong> {gv("totalVolumeCbm") || "—"} CBM</div>
                  <div><strong>Cargo Description:</strong> {gv("cargoDescription") || "—"}</div>
                  <div><strong>HS Code:</strong> {gv("hsCode") || "—"}</div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="compliance"
              title="Compliance & Documentation"
              description="VGM, shipping instructions, AMS, ISF, BoL"
              status="not-started"
            >
              <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><strong>VGM:</strong> {gv("vgm") || "—"}</div>
                  <div><strong>Shipping Instructions:</strong> {gv("shippingInstructions") || "—"}</div>
                  <div><strong>House BoL:</strong> {gv("houseBoLNumber") || "—"}</div>
                  <div><strong>Master BoL:</strong> {gv("masterBoLNumber") || "—"}</div>
                  <div><strong>Vessel:</strong> {gv("vessel") || "—"}</div>
                  <div><strong>Voyage:</strong> {gv("voyage") || "—"}</div>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection
              id="costs"
              title="Costs & Billing"
              description="Freight, locals, insurance, customs — supplier vs billing"
              status="not-started"
            >
              <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>
                Cost grid will be implemented here — uses useInvoicing hook.
              </div>
            </AccordionSection>
          </div>

          <SummaryPanel shipment={shipment} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/shipments/[jobNumber] apps/web/src/app/shipments/_components/DetailSidebar.tsx apps/web/src/app/shipments/_components/SummaryPanel.tsx
git commit -m "feat: add shipment detail page with collapsible sidebar, accordion sections, summary panel"
```

---

## Task 9: Quotes, Invoicing, Warehouse Page Restyling

**Files:**
- Modify: `apps/web/src/app/quotes/_components/QuotesView.tsx`
- Modify: `apps/web/src/app/invoicing/_components/InvoicingView.tsx`
- Modify: `apps/web/src/app/warehouse/_components/WarehouseView.tsx`

- [ ] **Step 1: Rebuild QuotesView**

Replace `apps/web/src/app/quotes/_components/QuotesView.tsx` with a clean table layout using the same patterns as ShipmentsTable: `PageHeader` + search input + `Table` from antd + `StatusBadge` for status column + "New Quote" button. Columns: Quote #, Customer, Route, Service, Status, Valid Until, Actions (⋮). Use `useQuotes()` hook for data. Quote # links should be `#6366f1` colored. Keep existing create/detail drawer logic but wrap any modals with `AppModal`.

- [ ] **Step 2: Rebuild InvoicingView**

Replace `apps/web/src/app/invoicing/_components/InvoicingView.tsx` with a clean table layout: `PageHeader` + search + `Table` from antd. Columns: Job #, Customer, Supplier Total, Billing Total, Profit (green), Currency, Status, Actions. Use `useShipments()` to list jobs and `useInvoicing()` for cost data per selected job. Wrap invoice generation in `AppModal`. Profit column: green text when positive.

- [ ] **Step 3: Rebuild WarehouseView**

Replace `apps/web/src/app/warehouse/_components/WarehouseView.tsx` with a clean table layout: `PageHeader` + `Table` from antd. Columns: Task ID, Type, Priority, Status, Assignee, Due Date. Use `useWarehouse()` hook. Status badges use `StatusBadge` component. Keep existing CRUD logic but use `ConfirmModal` for deletes, `AppModal` for create/edit.

- [ ] **Step 4: Build and verify**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/quotes/ apps/web/src/app/invoicing/ apps/web/src/app/warehouse/
git commit -m "feat: restyle quotes, invoicing, warehouse pages with new design system"
```

---

## Task 10: Documents Page Restyling + Cleanup

**Files:**
- Modify: `apps/web/src/app/documents/_components/DocumentsView.tsx`
- Delete unused components that were replaced

- [ ] **Step 1: Restyle DocumentsView**

Update `apps/web/src/app/documents/_components/DocumentsView.tsx` to use `PageHeader` + the same card/container styling. The upload zone should use antd `Upload.Dragger` with the new indigo accent for the upload icon. Keep all existing extraction logic — just restyle the containers, buttons, and layout to match the new design system.

- [ ] **Step 2: Remove unused old components**

Check if any old components are now completely unused (e.g., the old `Dashboard.tsx` from shipments view if it existed as an alternate view). Remove any dead code. Do NOT remove `MasterJobDialog.tsx`, `MasterJobDetailModal.tsx`, `ChatPanel.tsx`, `AttachmentsPanel.tsx`, `DimensionsPopup.tsx`, `DocumentReadingTab.tsx`, or `ShipmentDetailModal.tsx` yet — they contain complex logic that will be migrated into the new accordion sections in future tasks.

- [ ] **Step 3: Final build verification**

Run: `cd /Users/marekmojzis/our_biz/shipment-tracker && pnpm --filter web build`

Expected: Clean build with no errors. All pages render with the new design.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: restyle documents page, clean up unused components"
```

---

## Implementation Notes for Executor

1. **API response shapes:** The hooks return data from the Encore API. When implementing, check the actual `ShipmentItem` type from the generated API client. Field access via `getFieldValue()` should work for most cases, but some fields may need direct property access on the typed object.

2. **Accordion section forms:** Task 8 creates the detail page with read-only accordion content. The full editable forms for each section (with antd Form, Input, Select, DatePicker) should be built as follow-up work, reusing the field keys from `columnConfig.ts`. Each section form should call `updateField()` from `useShipments()` on blur/save.

3. **Chat and Attachments panels:** These currently exist as side panels in the old ShipmentsTable. They should be adapted to slide in from the right on the detail page when selected in the sidebar. This is a follow-up task after the core layout is done.

4. **Cost grid:** The Costs accordion section needs the full cost grid from the old invoicing components. This reuses `useInvoicing(shipmentId)` and should be implemented as a follow-up task.

5. **Master job linking:** Currently handled via a dialog in the old table view. This should be added as a "Quick Actions" dropdown option on the detail page header. Follow-up task.

6. **The old components are preserved.** The old `ShipmentDetailModal.tsx`, `MasterJobDialog.tsx`, etc. contain complex business logic. They should be referenced when building the full editable accordion section forms — the logic should be migrated, not rewritten from scratch.
