# Shipment List & Detail Layout Redesign

## Approach
Incremental refactor of existing components. Keep existing color scheme (indigo/slate/white), antd + Tailwind stack, sidebar + topnav shell.

## Sidebar Changes
- Remove user from sidebar footer (user stays in TopNav only)
- Replace collapse toggle: chevron button on the right side of sidebar header
- When collapsed: show ST logo icon + chevron (flipped)
- Sidebar header height must match TopNav (52px)

## Shipment List Page

### Header
- Title: "Shipments" + subtitle "Manage and track all shipments"
- Buttons: "+ New Shipment" (indigo primary), "Add to Master Job" (outlined)
- Remove: Export button, "Show Shipment" button

### Filters
- Replace status tabs with "All Statuses" dropdown
- Keep search input
- Add: "Rows per page" selector + entry count display ("23 / 23 entries")

### Table Columns (8 columns, replacing current 6)
| Column | DB Field | Notes |
|--------|----------|-------|
| Internal Reference | `jobNumber` | Bold indigo, monospace, clickable link |
| Master Job | `masterJobId` → `master_job.mczNumber` | Shown with # prefix, muted color |
| Shipments Date | `shipmentsDate` | DD/MM/YYYY format |
| Department | `department` | |
| Person in Charge | `personInCharge` | |
| Holiday Cover | `holidayCover` | Muted color |
| Customer | `customer` | |
| Customer's PIC | `customerPic` | |

### Pagination
- Bottom: "Showing X of Y entries" left, "First | 1 | 2 | ... | Last" buttons right
- Active page button in indigo

## Shipment Detail Page

### Header Section (top to bottom)
1. **← Back to Shipments** link
2. **Job number** (large, bold) + **copy button** (clipboard icon)
3. **Right side:** ERA badge (derived: shows "ERA KNOWN" if ETD+ETA have values, "ERA UNKNOWN" otherwise) | ETD/ETA display | Edit button | Actions dropdown | Save Changes button (indigo, shown when unsaved changes)
4. **Route line:** Start point → Middle point → Destination (3 dots with arrows, indigo/grey colors). Field mapping TBD.
5. **Tabs:** Shipment Details (active) | Costs Breakdown (placeholder) | Documents (placeholder) | Warehouse (placeholder) | Tracking (placeholder)
6. **Progress stepper** (6 stages): Booking confirmed → Cargo ready → In transit → Arrive at POD → Customs clearance → Delivered

### Content Layout (two sections)

#### Top Section: Two-column grid (wider left + 380px right)

**Left column:**

**SHIPMENT OVERVIEW** card (7 fields):
| Field | DB Field |
|-------|----------|
| Customer | `customer` |
| Shipper | `shipper` |
| Consignee | `consignee` |
| Incoterm | `incotermOrigin` |
| Container | `containerNumber` |
| Carrier | `shippingLine` |
| MBL | `masterBolNumber` |

**ADDRESSES** card (4 address blocks in 2x2 grid):
- Shipper address (from `shipper` field)
- Consignee address (from `consignee` field)
- Pick Up Address (`pickupAddress`)
- Delivery Address (`deliveryAddress`)

**Right column:**

**TASKS** card:
- Header: "SUPPORT WORKFLOW"
- 15 default tasks (checkbox + name + completion date):
  1. Booking to agent
  2. Booking confirmed
  3. Cargo readiness confirmed
  4. Cargo shipped
  5. Pre-Alert received
  6. Arrival notice sent
  7. Paperwork received
  8. Paperwork provide to customs
  9. Cargo released for further transport
  10. Booked for further transport
  11. Cargo departed from port
  12. Cargo arrived to HUB
  13. Cargo customs cleared
  14. Delivered
  15. Billed
- "+ Add Task" button for custom tasks (free text)
- Completed tasks: indigo checkbox, strikethrough text, muted color, shows date

#### Bottom Section: Two-column grid (50/50 equal width)

**BASIC INFORMATION** card (6 fields in 2-col grid):
| Field | DB Field |
|-------|----------|
| Internal Reference | `jobNumber` |
| Person in Charge | `personInCharge` |
| Master Job | `masterJobId` → `master_job.mczNumber` |
| Holiday Cover | `holidayCover` |
| Department | `department` |
| Customer | `customer` |

**KEY DATES** card (6 fields in 2-col grid):
| Field | DB Field |
|-------|----------|
| ETD Estimated | `estimatedDeparture` |
| ETA Estimated | `estimatedArrival` |
| ATD Actual | **NEW** - needs schema migration |
| ATA Actual | **NEW** - needs schema migration |
| Arrived at POD | **NEW** - needs schema migration |
| Delivered | **NEW** - needs schema migration |

## Schema Changes Required
Add 4 new date columns to the `shipment` table:
- `atdActual` (date, nullable) - Actual Time of Departure
- `ataActual` (date, nullable) - Actual Time of Arrival
- `arrivedAtPod` (date, nullable) - Date arrived at Port of Discharge
- `deliveredDate` (date, nullable) - Date delivered

## Files to Modify
- `apps/web/src/components/AppSidebar.tsx` — sidebar collapse button, remove user
- `apps/web/src/app/shipments/page.tsx` or `ShipmentsView.tsx` — list page restructure
- `apps/web/src/app/shipments/_components/ShipmentsTable.tsx` — new columns, filters, pagination
- `apps/web/src/app/shipments/[jobNumber]/ShipmentDetailContent.tsx` — full detail redesign
- `apps/api/shipments/schema.ts` (or equivalent) — 4 new date columns
- `apps/api/shipments/shipments.ts` (or equivalent) — expose new fields in API

## What Stays The Same
- Sidebar navigation items and routes
- TopNav (search, date, user menu)
- Dashboard page
- Documents, Invoicing, Quotes, Warehouse pages
- Color scheme (indigo-500/600, slate palette, white cards)
- Create shipment wizard
- Authentication flow
