# UI Redesign — Design Spec

## Overview

Complete visual and UX redesign of the Shipment Tracker web app. New layout, color scheme, navigation, and component system — all built on **Ant Design v5** with custom token overrides. The goal is a clean, modern, easy-to-use interface that surfaces the right information at the right time without overwhelming users.

**Reference inspiration:** Perplexity CRM demo (dark sidebar, accordion sections, clean tables). We take the best ideas (clean tables, accordion detail view, summary panels) but adapt the layout to our needs (top nav instead of sidebar, collapsible sidebar only on detail pages).

---

## Design Decisions

| Decision | Choice |
|----------|--------|
| Layout | Top navigation bar (white/grey + indigo) |
| Primary color | Indigo `#6366f1` |
| Sidebar | Only on detail pages, collapsible (180px ↔ 44px) |
| Shipment detail | Full page with accordion sections + right summary panel |
| Data tables | Clean ~7 columns, status tabs, filters, column toggle |
| Dashboard | KPI cards + Needs Attention + Upcoming + Recent Shipments |
| UI library | Ant Design v5 with custom ConfigProvider tokens |
| Inline editing | Removed from table — all editing happens on detail page |

---

## Color System

### Core Palette

| Token | Value | Usage |
|-------|-------|-------|
| `colorPrimary` | `#6366f1` (Indigo) | Buttons, links, active states, focus rings |
| `colorPrimaryHover` | `#4f46e5` | Button hover, link hover |
| `colorPrimaryBg` | `#e0e7ff` | Selected rows, active filter chips, light highlights |
| `colorPrimaryBgHover` | `#f0f0ff` | Subtle hover states |
| `colorBgLayout` | `#f8fafc` | Page background |
| `colorBgContainer` | `#ffffff` | Cards, tables, modals |
| `colorBgElevated` | `#ffffff` | Dropdowns, popovers |
| `colorBorder` | `#e2e8f0` | Borders, dividers |
| `colorBorderSecondary` | `#f1f5f9` | Table row borders, subtle dividers |
| `colorText` | `#1e293b` | Primary text |
| `colorTextSecondary` | `#64748b` | Labels, helper text, secondary info |
| `colorTextTertiary` | `#94a3b8` | Disabled text, placeholders |

### Status Colors

| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| Booking | `#e0e7ff` | `#4f46e5` | New, draft, booking in progress |
| In Transit | `#dbeafe` | `#1d4ed8` | Shipped, on the way |
| Customs | `#fef3c7` | `#d97706` | At customs, pending clearance |
| Delivered | `#dcfce7` | `#16a34a` | Completed, delivered, paid |
| Overdue | `#fee2e2` | `#dc2626` | Overdue, expired, danger |
| Neutral | `#f1f5f9` | `#64748b` | Cancelled, inactive, draft |

### Semantic Colors

| Purpose | Color |
|---------|-------|
| Success | `#22c55e` |
| Warning | `#f59e0b` |
| Error / Danger | `#ef4444` |
| Info | `#3b82f6` |

### Ant Design Token Overrides

```ts
const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#6366f1',
    colorInfo: '#3b82f6',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorBgLayout: '#f8fafc',
    colorBgContainer: '#ffffff',
    colorBorder: '#e2e8f0',
    colorText: '#1e293b',
    colorTextSecondary: '#64748b',
    borderRadius: 6,
    borderRadiusLG: 10,
    fontSize: 13,
    fontSizeHeading4: 16,
    fontSizeHeading3: 20,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 36,
      controlHeightSM: 28,
      fontWeight: 500,
    },
    Table: {
      headerBg: '#fafbfc',
      headerColor: '#64748b',
      rowHoverBg: '#fafaff',
      borderColor: '#f1f5f9',
      headerSplitColor: 'transparent',
      fontSize: 12,
    },
    Modal: {
      borderRadiusLG: 12,
      titleFontSize: 16,
    },
    Input: {
      activeBorderColor: '#6366f1',
      hoverBorderColor: '#a5b4fc',
      activeShadow: '0 0 0 3px rgba(99,102,241,0.1)',
    },
    Select: {
      activeBorderColor: '#6366f1',
      hoverBorderColor: '#a5b4fc',
    },
    Tag: {
      borderRadiusSM: 12,
    },
    Tabs: {
      inkBarColor: '#6366f1',
      itemActiveColor: '#6366f1',
      itemSelectedColor: '#6366f1',
    },
  },
};
```

---

## Layout

### Top Navigation Bar

- **Height:** 52px
- **Background:** white with `#e2e8f0` bottom border
- **Structure:** Logo (left) → Nav links (center-left) → User menu (right)
- **Logo:** 28px indigo square with "ST" + "Shipment Tracker" text
- **Nav links:** 6 items — Dashboard, Shipments, Documents, Invoicing, Quotes, Warehouse
  - Inactive: `#64748b` text
  - Hover: `#1e293b` text
  - Active: `#6366f1` text with 2px indigo bottom border
  - Badge: red notification dot on Shipments when overdue items exist
- **User menu:** Avatar circle (indigo bg, white initials) + name + dropdown (settings, logout)
- **Implementation:** Custom component (not antd Layout.Header) for full control. Use Next.js `usePathname()` for active state.

### Main Pages (Dashboard, Shipments list, Documents, Invoicing, Quotes, Warehouse)

- Full-width content below top nav
- `max-width: 1400px`, centered, `padding: 24px`
- No sidebar — content uses full width
- Page header: title left + action buttons right

### Detail Pages (Shipment Detail, Quote Detail)

- Collapsible left sidebar + main content area + optional right summary panel
- Top nav remains visible with the parent section highlighted

---

## Detail Page Sidebar (Collapsible)

### Expanded State (180px)

- **Back link:** "← Back to Shipments" at top
- **Job header:** Job number + status badge
- **Section nav:** Icon + label + status indicator
  - Sections: Overview, Routing, Cargo, Costs, Documents, Warehouse
  - Status indicators: ✓ (green, completed), ● (amber, in progress), — (grey, not started)
- **Tools nav:** Chat (with unread count), Attachments (with file count), Tracking, Tasks (with progress like "8/15")
- **Active item:** `#f0f0ff` background, `#6366f1` text
- **Hover:** `#f8fafc` background

### Collapsed State (44px)

- Icons only, centered vertically
- Active item: `#f0f0ff` background on icon
- Tooltips on hover showing label
- Notification badges visible (small red dot or count)

### Toggle Behavior

- Toggle button at bottom of sidebar (chevron icon)
- Keyboard shortcut: `[` to toggle
- State persisted in localStorage
- Smooth CSS transition (200ms ease)

---

## Pages

### Dashboard

**Layout:** KPI row → two-column cards → recent shipments table

**KPI Row (4 cards):**
- Active Shipments (count + "↑ X new this week")
- In Transit (count + "X arriving this week")
- Overdue (count in red + "Needs attention")
- This Month (count + "↑ X% vs last month")
- Cards: white bg, `#e2e8f0` border, 10px radius, 18px padding

**Needs Attention Card:**
- List of actionable items: overdue shipments, missing docs, pending invoices
- Each row: colored dot (red/amber) + job number link + description + status badge
- Click job number → navigates to detail page

**Upcoming This Week Card:**
- List of upcoming deadlines: arrivals, customs clearance, pickups, departures
- Each row: job number link + description + relative date (Tomorrow, Wednesday, etc.)

**Recent Shipments Table:**
- 6 columns: Job #, Status, Customer, Route, Mode, ETA
- Last 5-10 shipments
- "View all →" link to Shipments page
- Click row → navigates to detail page

### Shipments List

**Toolbar:** Search input (220px) + Filters button + Columns button + spacer + count + Export button + "+ New Shipment" primary button

**Status Tabs:** All (count), Active (count), In Transit (count), Customs (count), Delivered (count)
- Active tab: indigo text + indigo underline + indigo count badge
- Inactive: grey text + grey count badge

**Table:**
- 7 columns: Checkbox, Job #, Status, Customer, Route, Mode, ETA, Actions (⋮)
- Job # is indigo colored link
- Status uses colored badge pills
- Overdue ETAs shown in red with bold weight
- Row hover: `#fafaff` background
- Click row → navigates to shipment detail page
- Checkbox column for bulk actions (future: master job linking, export, delete)
- Actions menu (⋮): View, Copy, Delete

**Pagination:** "Showing 1-20 of X" + Prev/Next + page numbers

**"+ New Shipment" modal:** Medium modal with fields: auto-assigned job number (readonly), Customer, Trade Direction, Freight Mode, Copy from existing dropdown, Department. Footer: Cancel + "Create & Open" primary button.

### Shipment Detail Page

**Layout:** Collapsible sidebar (left) + accordion content (center) + summary panel (right, 260px)

**Page Header:**
- Breadcrumb: "Shipments → CZ00000012"
- Title: Job number + status badge
- Actions: "Master Job" button + "Quick Actions" dropdown

**Accordion Sections:**
Each section is a white card with 10px radius, `#e2e8f0` border, 8px bottom margin.

1. **Customer Details** — Customer name, Customer PIC, Customer Reference, contact info
2. **Shipment Info** — Department, Person in Charge, Holiday Cover, Trade Direction, Freight Mode, Incoterms, Insurance, Service Type, Agent info
3. **Routing** — Pickup Address, POL, POD, Delivery Address, Shipper, Consignee, all date fields (ETD, ETA, ETA Warehouse, Planned Delivery, etc.)
4. **Cargo & Dimensions** — Container details (4 sets: count + length + type), TEU, Weight, Volume, Freight Ton, Surface, Dimensions popup, Cargo Description, HS Code
5. **Compliance & Documentation** — VGM, Shipping Instructions, AMS, ISF, BoL draft, Switch BoL, House/Master BoL numbers and types, Vessel, Voyage
6. **Costs & Billing** — embedded cost grid (6 categories + additional charges), billing settings, profit summary. "Load from Quote" button.

**Section States:**
- Collapsed (default): header with title + description + status indicator
- Open/active: header + form fields. Left border accent: 3px `#6366f1`
- Status indicators: ✓ Completed (green), In progress (amber), Not started (grey)
- "Save & continue ↓" button advances to next section

**Right Summary Panel (260px, sticky):**
- Summary card: key-value pairs (Customer, Route, Mode, Incoterms, ETD, ETA, Master Job, Department, Handler)
- Progress: progress bar + "X of 6 sections completed"
- Milestones: vertical timeline (Booking confirmed → Cargo loaded → In transit → Customs → Delivered) with completed/active/pending states

**Sidebar Navigation:**
- Clicking a section in the sidebar scrolls to / opens that accordion section
- Clicking Chat opens a slide-in panel from the right (320px)
- Clicking Attachments opens a slide-in panel from the right (300px)
- Clicking Tasks opens the task checklist (import: 15 tasks, export: 13 tasks) as an accordion section or panel
- Clicking Tracking shows milestone timeline

### Documents Page

- Document/text extraction interface
- Upload zone (drag-and-drop or file picker)
- Two input modes: PDF upload or text paste
- Destination selector: Full Sheet, Invoicing, Quote, Master Job
- Extraction results review with conflict resolution
- Field-by-field approval toggles

### Invoicing Page

**Table view:**
- Columns: Job #, Customer, Supplier Total, Billing Total, Profit, Currency, Status, Actions
- Profit shown in green when positive
- Status badges: Draft, Pending, Invoiced, Paid

**Row expand / detail:**
- Cost grid with 6 categories (Freight, Collection/Delivery, Locals, Others, Insurance, Customs)
- Per-category: Estimated amount + currency, Real amount + currency, Invoice #, Vendor
- Additional charges rows (add/remove)
- Billing settings: Currency, ROE
- Summary footer: Supplier total, Billing total, Profit
- "Generate Invoice" button → PDF generation

### Quotes Page

**Table view:**
- Columns: Quote #, Customer, Route, Service, Status, Valid Until, Amount, Actions
- Status badges: Draft, Active, Booked, Expired

**Quote Detail** (full page with sidebar, same pattern as shipment detail):
- Sections: Shipment Details, Costs, Documents, Terms & Conditions
- "Booked" workflow button: converts quote → shipment
- Terms & Conditions auto-saving textarea

### Warehouse Page

- Task list table with inline status/priority badges
- Per-job expandable sections: General info, Remeasure table, Customs declaration, Pickup booking, Invoice list
- Announcement tracking timestamps (VGM, Survey, Remeasurement, Announce)

---

## Reusable Components

### Modal Sizes

| Size | Width | Use Case |
|------|-------|----------|
| Small | 380px | Confirmations, deletions, simple dialogs |
| Medium | 480px | Create forms, simple editors |
| Large | 820px | Cost grids, document previews, complex content |

**Modal Structure:**
- Header: Title + optional subtitle + close button (✕)
- Body: Content with appropriate padding (24px)
- Footer: Grey bg (`#fafbfc`), top border, right-aligned buttons (Cancel secondary + Action primary)
- Border radius: 12px
- Shadow: `0 8px 30px rgba(0,0,0,0.12)`

**Confirmation Modal Pattern:**
- Icon circle (36px, colored bg) + Title + Description
- No separate header/footer — everything in body
- Two buttons right-aligned: Cancel + Action (colored by intent: red for delete, indigo for confirm)

### Toast System

**Brief Toasts (antd `message` API):**
- Position: top center
- Auto-dismiss: 3 seconds
- Types: success (green ✓), error (red ✕), warning (amber !), info (blue i)
- Usage: Quick feedback — "Saved", "Deleted", "Copied", "Failed to update"
- Styling: white card, subtle shadow, colored icon circle

**Rich Notifications (antd `notification` API):**
- Position: top right
- Auto-dismiss: 8 seconds (or manual close)
- Colored left border (4px) matching severity
- Structure: Icon + Title (bold) + Description + optional Action link
- Usage: Important events — "Invoice generated" (with "View Invoice →" link), "Field conflicts detected" (with "Review →" link), automation rule triggers

### Button Hierarchy

| Variant | Style | Usage |
|---------|-------|-------|
| Primary | Indigo bg, white text | Main action per view (Create, Save, Confirm) |
| Secondary | White bg, grey border | Supporting actions (Export, Cancel, Filter) |
| Text/Link | No bg, indigo text | Inline actions, "View all →" links |
| Danger | Red bg, white text | Destructive actions (Delete) |
| Ghost | No bg, no border, grey text | Toolbar icons, subtle toggles |
| Icon | 32x32, border, centered icon | Action menu (⋮), add (+), toggle sidebar |

**Sizes:**
- Default: 36px height, 13px font, 8px 16px padding
- Small: 28px height, 12px font, 6px 12px padding

### Status Badge Component

Built on antd `Tag` with `borderless` variant and custom colors.

```tsx
// Usage: <StatusBadge status="in-transit" />
// Maps status string to bg + text color from the status colors table
```

Consistent 12px border-radius pill shape. Used across shipments, quotes, invoices.

### Form Fields

- All inputs: 6px border-radius, `#e2e8f0` border, `#6366f1` focus border + `0 0 0 3px rgba(99,102,241,0.1)` focus shadow
- Labels: 11px, `#64748b`, 500 weight, 4px bottom margin
- Form rows: 2-column grid with 12px gap
- Built on antd Input, Select, DatePicker with token overrides

### Data Table

Wrapper around antd Table with:
- Custom header styling (uppercase labels, grey, 11px)
- Row hover color `#fafaff`
- Subtle row borders `#f1f5f9`
- Consistent column widths
- Checkbox column for selection
- Job number column always indigo colored link
- Status column always uses StatusBadge
- Actions column (⋮) with Dropdown menu

### Card Component

- White bg, `#e2e8f0` border, 10px radius, 18px padding
- Title: 14px, 600 weight + optional right-side element
- No antd Card — just a simple styled div for more control

### Accordion Component

- White bg, `#e2e8f0` border, 10px radius
- Active state: 3px left border in `#6366f1`
- Header: clickable, 14px 18px padding, title + description left, status right
- Body: 0 18px 16px padding, top border `#f1f5f9`
- Smooth expand/collapse animation
- Can use antd Collapse internally but with heavy style overrides

---

## Navigation & Routing

### URL Structure

```
/                       → Redirect to /dashboard
/login                  → Login page
/dashboard              → Dashboard
/shipments              → Shipments list
/shipments/:jobNumber   → Shipment detail (full page)
/documents              → Document extraction
/invoicing              → Invoicing list
/invoicing/:jobNumber   → Invoice detail (optional, or modal)
/quotes                 → Quotes list
/quotes/:quoteNumber    → Quote detail (full page)
/warehouse              → Warehouse tasks
```

### Navigation Behavior

- Top nav links use Next.js `<Link>` with `usePathname()` for active state
- Shipments list: click row → `router.push(/shipments/${jobNumber})`
- Detail page back: "← Back to Shipments" link → `router.push(/shipments)`
- Browser back button works naturally with this routing
- No modals for detail views — always full page navigation

---

## Responsive Considerations

- Minimum supported width: 1024px (desktop-focused logistics tool)
- Top nav collapses to hamburger menu below 1024px (stretch goal)
- Detail sidebar auto-collapses to icon mode below 1280px
- Tables scroll horizontally if needed below 1200px
- KPI grid: 4 columns → 2 columns below 1024px

---

## Typography

- Font: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`)
- Base size: 13px (antd token override)
- Page titles: 20px, 700 weight
- Section titles: 14px, 600 weight
- Table headers: 11px, 500 weight, uppercase, `#64748b`
- Body text: 13px, normal weight
- Labels: 11px, 500 weight, `#64748b`
- Small text / badges: 11px

---

## File Structure (Target)

```
apps/web/src/
├── app/
│   ├── layout.tsx                    # Root layout with Providers
│   ├── page.tsx                      # Redirect to /dashboard
│   ├── login/
│   │   └── page.tsx                  # Login page
│   ├── dashboard/
│   │   ├── page.tsx
│   │   └── _components/
│   │       ├── KpiCard.tsx
│   │       ├── NeedsAttentionCard.tsx
│   │       ├── UpcomingCard.tsx
│   │       └── RecentShipmentsTable.tsx
│   ├── shipments/
│   │   ├── page.tsx                  # Shipments list
│   │   ├── [jobNumber]/
│   │   │   └── page.tsx              # Shipment detail
│   │   └── _components/
│   │       ├── ShipmentsTable.tsx
│   │       ├── ShipmentToolbar.tsx
│   │       ├── StatusTabs.tsx
│   │       ├── CreateShipmentModal.tsx
│   │       ├── DetailSidebar.tsx
│   │       ├── SummaryPanel.tsx
│   │       ├── sections/
│   │       │   ├── CustomerSection.tsx
│   │       │   ├── ShipmentInfoSection.tsx
│   │       │   ├── RoutingSection.tsx
│   │       │   ├── CargoSection.tsx
│   │       │   ├── ComplianceSection.tsx
│   │       │   └── CostsSection.tsx
│   │       ├── ChatPanel.tsx
│   │       └── AttachmentsPanel.tsx
│   ├── documents/
│   │   ├── page.tsx
│   │   └── _components/
│   │       └── DocumentsView.tsx
│   ├── invoicing/
│   │   ├── page.tsx
│   │   └── _components/
│   │       ├── InvoicingTable.tsx
│   │       └── CostGrid.tsx
│   ├── quotes/
│   │   ├── page.tsx
│   │   ├── [quoteNumber]/
│   │   │   └── page.tsx
│   │   └── _components/
│   │       └── QuotesTable.tsx
│   └── warehouse/
│       ├── page.tsx
│       └── _components/
│           └── WarehouseView.tsx
├── components/
│   ├── TopNav.tsx                    # Top navigation bar
│   ├── StatusBadge.tsx               # Reusable status badge
│   ├── AppModal.tsx                  # Modal wrapper (small/medium/large)
│   ├── ConfirmModal.tsx              # Confirmation dialog
│   ├── AppCard.tsx                   # Consistent card component
│   ├── AccordionSection.tsx          # Collapsible accordion
│   ├── DataTable.tsx                 # Styled antd Table wrapper
│   ├── PageHeader.tsx                # Title + actions layout
│   └── CollapsibleSidebar.tsx        # Detail page sidebar
├── hooks/
│   ├── useShipments.ts
│   ├── useDashboard.ts
│   ├── useInvoicing.ts
│   ├── useQuotes.ts
│   ├── useWarehouse.ts
│   └── useSidebarState.ts           # Collapse state (localStorage)
├── lib/
│   ├── theme/
│   │   ├── themeConfig.ts            # Ant Design token config
│   │   └── ThemeProvider.tsx
│   ├── auth/
│   │   └── AuthContext.tsx
│   ├── statusColors.ts               # Status → color mapping
│   └── toast.ts                      # message/notification helpers
└── styles/
    └── globals.css
```

---

## Implementation Notes

- **No inline editing in tables.** All editing happens on the detail page via accordion sections. Tables are read-only with click-to-navigate.
- **Ant Design everywhere.** All form inputs, selects, date pickers, tables, modals, dropdowns, tags, buttons use antd components with token overrides. No custom HTML form elements.
- **Reusable components first.** Build StatusBadge, AppModal, ConfirmModal, AppCard, AccordionSection, DataTable, PageHeader, CollapsibleSidebar, TopNav before building pages. Pages compose these components.
- **Toast helpers.** Create `toast.success("Saved")`, `toast.error("Failed")`, `toast.notify({ title, description, action })` wrappers around antd message/notification APIs for consistent usage across the app.
- **Sidebar state.** Collapse/expand state persisted in localStorage via `useSidebarState` hook. Default: expanded. Keyboard shortcut `[` to toggle.
- **URL-based routing.** Detail views are full pages (not modals), so browser back/forward works. Use Next.js dynamic routes `[jobNumber]` and `[quoteNumber]`.
- **98 columns → 6 accordion sections.** The 98 spreadsheet columns are reorganized into the 6 detail sections listed above. Each section contains a logical grouping of related fields.
