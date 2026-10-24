"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import { ContainerOutlined, InfoCircleOutlined, WarningOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { getCellConditionalStyle, getRowConditionalStyle, type CellStyle } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { moneyCz } from "@/lib/money";
import { statusLabel } from "@/lib/shipmentStatus";
import { invoicingStatusOf, serviceDateKey, serviceDateOf, type QueueRow } from "../_lib/queueColumnModel";

export type { QueueRow } from "../_lib/queueColumnModel";

// The Selling header's help (what the old footnote under the table said).
const SELLING_HELP =
  'What is still to bill: the selling lines ticked for Invoice that are on no open invoice, in the job\'s billing currency. To bill = Shipment Status "Billing". Issuing an invoice sets the job to Billed / Invoiced; a credit note puts it back. Amounts are estimates at today\'s ČNB rates (with the ROE % on other currencies); the invoice uses the ČNB rate of its DUZP.';

/** The fields the Shipments conditional formatting reads, by Shipments column key. */
export function queueRowData(r: QueueRow): Record<string, string> {
  return {
    jobNumber: r.jobNumber,
    department: r.department,
    houseBolType: r.houseBolType,
    masterBolType: r.masterBolType,
    tradeDirection: r.tradeDirection,
    status: r.shipmentStatus,
    invoicingStatus: invoicingStatusOf(r),
    estimatedDeparture: r.estimatedDeparture ?? "",
    estimatedArrival: r.estimatedArrival ?? "",
  };
}

export interface RowInfo {
  rowData: Record<string, string>;
  rowStyle: CellStyle | null;
}

/** Row data and the whole-row style (OBL = red text) per shipment, computed once per list. */
export const queueRowInfo = (rows: QueueRow[]) =>
  new Map<string, RowInfo>(
    rows.map((r) => {
      const rowData = queueRowData(r);
      return [r.shipmentId, { rowData, rowStyle: getRowConditionalStyle(rowData) }];
    }),
  );

type Info = Map<string, RowInfo>;

const styleOf = (key: string, value: string, info: Info, r: QueueRow) =>
  getCellConditionalStyle(key, value, info.get(r.shipmentId)?.rowData ?? {});

// As on Shipments: the tint is a background image, so the opaque white of fixed cells cannot
// hide it and the row hover colour still shows under it.
// `key` is the Shipments column whose rule applies; a function when it depends on the row.
const tint = (key: string | ((r: QueueRow) => string), valueOf: (r: QueueRow) => string, info: Info) => (r: QueueRow) => {
  const bg = styleOf(typeof key === "string" ? key : key(r), valueOf(r), info, r)?.backgroundColor;
  return bg ? { style: { backgroundImage: `linear-gradient(${bg}, ${bg})` } } : {};
};

// Cells whose text can run long are capped at the column's width (less its 8px side paddings):
// with fixed columns and scroll x "max-content" antd lays the table out "auto", where a column
// otherwise grows to its longest value. The full text is the title.
const capped = (width: number) => ({ maxWidth: width - 16 });

/**
 * The customer as the Shipments grid shows it (CustomerCell, read only): a link to the customer's
 * page when the job is linked to the Customer Database, plain text when the name was only typed.
 * No "!" on the colours, so an OBL row's red (.cf-row-fg) still wins, as on Shipments.
 */
function CustomerName({ customerId, name, width }: { customerId: string | null; name: string; width: number }) {
  if (!name) return EMPTY_CELL;
  return (
    <span className="block truncate" style={capped(width)} title={name}>
      {customerId ? (
        <Link
          href={`/customers/${customerId}`}
          className="text-indigo-500 hover:underline font-medium"
          // the row opens the job: the click must not open that as well
          onClick={(e) => e.stopPropagation()}
        >
          {name}
        </Link>
      ) : (
        <span className="text-slate-600">{name}</span>
      )}
    </span>
  );
}

// antd draws every column title a second time, in a hidden aria-hidden row it measures widths
// with: the copy there must not take keyboard focus.
const notFocusableInMeasureRow = (el: HTMLElement | null) => {
  if (el?.closest(".ant-table-measure-row")) el.tabIndex = -1;
};

/**
 * Help next to a header label, reachable by keyboard and screen readers too: a button that opens
 * the tooltip on hover and on focus. Its clicks and keys stay off the header, which sorts.
 */
function HeaderHelp({ label, help }: { label: string; help: string }) {
  return (
    <Tooltip title={help} trigger={["hover", "focus"]}>
      <button
        ref={notFocusableInMeasureRow}
        type="button"
        aria-label={`About the ${label} amount`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex items-center bg-transparent border-none p-0 cursor-help text-slate-400 hover:text-slate-600"
      >
        <InfoCircleOutlined aria-hidden className="text-[11px]" />
      </button>
    </Tooltip>
  );
}

interface QueueColumnsArgs {
  info: Info;
  /** The page URL that opens a job in Invoicing (?shipment=…), keeping the queue's tab and filters. */
  jobHref: (shipmentId: string) => string;
  /** Missing selling lines are flagged only where the job waits to be invoiced (To bill). */
  flagMissingLines: boolean;
}

// Widths: Internal Reference and Invoicing Status as on Shipments (lib/columnConfig.ts); the rest
// trimmed to their headers and usual values, so every column fits a 1440px screen with the sidebar
// open (a card of about 1114px) without scrolling sideways. Longer names and statuses are cut
// with an ellipsis and keep the full text as their title.
const W = { job: 140, customer: 135, direction: 115, date: 110, status: 155, selling: 125, invoices: 100, invoicing: 140, open: 40 };

export function queueColumns({ info, jobHref, flagMissingLines }: QueueColumnsArgs): ColumnsType<QueueRow> {
  return [
    {
      key: "jobNumber",
      title: "Internal Reference",
      width: W.job,
      fixed: "left",
      ellipsis: true,
      sorter: (a, b) => a.jobNumber.localeCompare(b.jobNumber),
      onCell: tint("jobNumber", (r) => r.jobNumber, info),
      render: (_, r) => {
        const s = styleOf("jobNumber", r.jobNumber, info, r);
        // An OBL row is red throughout, so the default indigo steps aside for it.
        const coloured = !!s?.color || !!info.get(r.shipmentId)?.rowStyle?.color;
        return (
          <Link
            href={jobHref(r.shipmentId)}
            scroll={false}
            onClick={(e) => e.stopPropagation()}
            className={`font-mono hover:!underline ${coloured ? "" : "!text-indigo-500"} ${s?.fontWeight ? "" : "font-bold"}`}
            style={{ color: s?.color, fontWeight: s?.fontWeight }}
          >
            {r.jobNumber || "—"}
          </Link>
        );
      },
    },
    {
      key: "customer",
      title: "Customer",
      width: W.customer,
      ellipsis: true,
      sorter: (a, b) => (a.customer || "\uffff").localeCompare(b.customer || "\uffff", "cs"),
      render: (_, r) => <CustomerName customerId={r.customerId} name={r.customer} width={W.customer} />,
    },
    {
      key: "tradeDirection",
      title: "Trade Direction",
      width: W.direction,
      ellipsis: true,
      render: (_, r) => (r.tradeDirection ? <span className="text-slate-600">{r.tradeDirection}</span> : EMPTY_CELL),
    },
    {
      // The date the job is billed by, the list's default order (BillingQueue sorts all rows by it).
      key: "serviceDate",
      title: "ETD / ETA",
      width: W.date,
      ellipsis: true,
      defaultSortOrder: "ascend",
      // the default order is always one of the two arrows
      sortDirections: ["ascend", "descend"],
      sorter: (a, b) => (serviceDateOf(a) || "9999").localeCompare(serviceDateOf(b) || "9999"),
      // tinted by the date it shows, with the Shipments rule of that date's column (past = green, bold)
      onCell: tint(serviceDateKey, serviceDateOf, info),
      render: (_, r) => {
        const key = serviceDateKey(r);
        const v = r[key];
        if (!v) return EMPTY_CELL;
        const s = styleOf(key, v, info, r);
        return (
          <span
            className="text-slate-600"
            style={{ color: s?.color, fontWeight: s?.fontWeight }}
            title={key === "estimatedDeparture" ? "Estimated Departure" : "Estimated Arrival"}
          >
            {formatDate(v)}
          </span>
        );
      },
    },
    {
      key: "status",
      title: "Shipment Status",
      width: W.status,
      ellipsis: true,
      onCell: tint("status", (r) => r.shipmentStatus, info),
      render: (_, r) =>
        r.shipmentStatus ? (
          <span className="block truncate text-slate-600" style={capped(W.status)} title={statusLabel(r.shipmentStatus)}>
            {statusLabel(r.shipmentStatus)}
          </span>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      key: "selling",
      title: (
        <span className="inline-flex items-center gap-1">
          Selling
          <HeaderHelp label="Selling" help={SELLING_HELP} />
        </span>
      ),
      width: W.selling,
      align: "right",
      showSorterTooltip: false,
      // amounts are only comparable within one currency: group by currency, then by amount
      sorter: (a, b) => a.billingCurrency.localeCompare(b.billingCurrency) || a.amountToBill - b.amountToBill,
      render: (_, r) => {
        if (r.billingState === "none") {
          if (!flagMissingLines) return EMPTY_CELL;
          return (
            <Tooltip title="No selling costs ticked for Invoice yet — add them in the Costs section of the job">
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-amber-600">
                <WarningOutlined aria-hidden />
                No selling lines
              </span>
            </Tooltip>
          );
        }
        if (r.rowsToBill === 0) return EMPTY_CELL;
        const missing = r.missingCurrencies.join(", ");
        return (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-slate-600 tabular-nums">
            {missing && (
              <Tooltip title={`ČNB publishes no rate for ${missing} — those lines are not in this amount`}>
                <span role="img" aria-label={`No ČNB rate for ${missing}`} className="inline-flex text-amber-600">
                  <WarningOutlined aria-hidden />
                </span>
              </Tooltip>
            )}
            {moneyCz(r.amountToBill)} {r.billingCurrency}
          </span>
        );
      },
    },
    {
      key: "invoices",
      title: "Invoices",
      width: W.invoices,
      ellipsis: true,
      render: (_, r) => {
        if (r.invoiceNumbers.length > 0) {
          const amounts = r.invoiced.map((i) => `${moneyCz(i.gross)} ${i.currency}`).join(" + ");
          return (
            // focusable, so the amounts open by keyboard too; screen readers read them as text.
            // The numbers lead the tooltip as well: in this width a second one is cut off.
            <Tooltip
              title={
                <>
                  {r.invoiceNumbers.join(", ")}
                  {amounts && <div>{amounts}</div>}
                </>
              }
              trigger={["hover", "focus"]}
            >
              <span tabIndex={0} className="block truncate font-mono text-slate-600" style={capped(W.invoices)}>
                {r.invoiceNumbers.join(", ")}
                {amounts && <span className="sr-only">{`, issued for ${amounts}`}</span>}
              </span>
            </Tooltip>
          );
        }
        if (r.rowsToBill > 0) {
          return <span className="text-slate-500">{`${r.rowsToBill} line${r.rowsToBill !== 1 ? "s" : ""}`}</span>;
        }
        return EMPTY_CELL;
      },
    },
    {
      key: "invoicingStatus",
      title: "Invoicing Status",
      width: W.invoicing,
      ellipsis: true,
      sorter: (a, b) => invoicingStatusOf(a).localeCompare(invoicingStatusOf(b)),
      onCell: tint("invoicingStatus", invoicingStatusOf, info),
      render: (_, r) => <span className="text-slate-600">{invoicingStatusOf(r)}</span>,
    },
    {
      key: "__open",
      title: <span className="sr-only">Actions</span>,
      width: W.open,
      fixed: "right",
      align: "center",
      onCell: () => ({ className: "!px-1.5" }),
      render: (_, r) => (
        <Tooltip title="Open shipment">
          {/* A link (Ctrl/Cmd-click opens a new tab); the icon span carries the Shipments row-icon
              colours, which antd's own link colour would beat on the <a>, and which an OBL row's
              red still overrides. */}
          <Link
            href={`/shipments/${r.shipmentId}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open shipment ${r.jobNumber}`}
            className="inline-flex"
            style={{ color: "inherit" }}
          >
            {/* p-1 with a 21px line, as the Shipments row icons: the same row height */}
            <span className="inline-block p-1 leading-[21px] text-slate-400 hover:text-indigo-500">
              <ContainerOutlined />
            </span>
          </Link>
        </Tooltip>
      ),
    },
  ];
}
