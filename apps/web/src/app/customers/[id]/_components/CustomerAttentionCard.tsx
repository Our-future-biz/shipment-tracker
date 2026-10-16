"use client";

import { useMemo, useState } from "react";
import { RightOutlined, WarningFilled } from "@ant-design/icons";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { useCustomerDocuments } from "@/hooks/useCustomerDocuments";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import { useCustomer } from "@/hooks/useCustomers";
import { useLatestRates } from "@/lib/fx";
import { buildCustomerAttention } from "../../_lib/customerAttention";
import type { AttentionItem, AttentionSeverity } from "../../_lib/customerAttention";

// The list opens with its most serious rows; the rest unfolds on demand, so a long list does not push the page down.
const VISIBLE_ROWS = 6;

interface SeverityStyle {
  // Read out before the row, where a sighted user sees the coloured dot.
  label: string;
  dot: string;
  // The card takes the look of its most serious row.
  border: string;
  header: string;
  icon: string;
  count: string;
  title: string;
}

const SEVERITY_STYLE: Record<AttentionSeverity, SeverityStyle> = {
  critical: {
    label: "Critical:",
    dot: "bg-red-500",
    border: "border-red-200",
    header: "bg-red-50 border-red-100",
    icon: "text-red-500",
    count: "text-red-600",
    title: "text-red-600",
  },
  warning: {
    label: "Warning:",
    dot: "bg-amber-500",
    border: "border-amber-200",
    header: "bg-amber-50 border-amber-100",
    icon: "text-amber-500",
    count: "text-amber-700",
    title: "text-amber-700",
  },
};

const COUNT_CLASS = "min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums";

const ROW_CLASS = "flex items-start gap-3 px-4 py-2.5 text-[13px] leading-5";

// The focus ring is drawn inside the row: the card clips whatever sticks out of its rounded corners.
const CLICKABLE_ROW_CLASS = [
  ROW_CLASS,
  "w-full bg-transparent border-0 text-left cursor-pointer transition-colors hover:bg-slate-50",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500",
].join(" ");

interface CustomerAttentionCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// What needs somebody's attention on this customer right now — overdue money,
// missing paperwork, lapsed contact — each row leading to where it is dealt with. The card is absent when there is nothing.
export function CustomerAttentionCard({ customerId, onSelectTab }: CustomerAttentionCardProps) {
  const { customer, isLoading: customerLoading } = useCustomer(customerId);
  const { invoices, isLoading: invoicesLoading } = useCustomerInvoices(customerId);
  const { rates, isLoading: ratesLoading } = useLatestRates();
  const { contacts, isLoading: contactsLoading, isError: contactsError } = useCustomerContacts(customerId);
  const { documents, isLoading: documentsLoading, isError: documentsError } = useCustomerDocuments(customerId);
  const { notes, isLoading: notesLoading, isError: notesError } = useCustomerNotes(customerId);
  // Remembered per customer, so an unfolded list does not carry over to the next customer opened.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);

  // Until every source is in, the list would appear half-built and then grow or reorder under the reader.
  // The rates too: without them a foreign invoice can't be weighed against the credit limit.
  const isLoading = customerLoading || invoicesLoading || ratesLoading || contactsLoading || documentsLoading || notesLoading;

  const items = useMemo(() => {
    if (isLoading || !customer) return [];
    const built = buildCustomerAttention({
      customer,
      invoices,
      contacts,
      documents,
      notes,
      rates,
    });
    // For contacts, documents and notes an empty list is itself a finding, but a list that could not be loaded is
    // not an empty one: its "nothing on file" row would be untrue.
    return built.filter((item) => !(contactsError && item.key === "no-contact-person") &&
        !(documentsError && item.key === "documents-missing") && !(notesError && item.key === "no-interaction"));
  }, [isLoading, customer, invoices, contacts, documents, notes, rates, contactsError, documentsError, notesError]);

  if (items.length === 0) return null;

  const tone = SEVERITY_STYLE[items.some((item) => item.severity === "critical") ? "critical" : "warning"];
  const expanded = expandedFor === customerId;
  const visibleItems = expanded ? items : items.slice(0, VISIBLE_ROWS);

  // Brings the field into view first, so the input it turns into does not make the page jump when it takes the focus.
  const openField = (id: string) => {
    const trigger = document.getElementById(id);
    if (!trigger) return;
    trigger.scrollIntoView({ block: "center" });
    trigger.focus();
    // A locked field opens on a double click, as a person would open it.
    trigger.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  };

  const handleToggleExpanded = () => setExpandedFor(expanded ? null : customerId);

  const renderRow = (item: AttentionItem) => {
    const { tab, field } = item;
    const style = SEVERITY_STYLE[item.severity];
    const content = (
      <>
        <span aria-hidden className="flex h-5 shrink-0 items-center">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        </span>
        <span className="flex-1 min-w-0 [overflow-wrap:anywhere]">
          <span className="sr-only">{style.label}</span> <span className={`font-semibold ${style.title}`}>{item.title}</span>
          {item.detail && <span className="text-slate-600"> {item.detail}</span>}
        </span>
        {item.meta && <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-slate-800">{item.meta}</span>}
        {(tab || field) && (
          <span className="flex h-5 shrink-0 items-center text-[10px] text-slate-400">
            <RightOutlined aria-hidden />
          </span>
        )}
      </>
    );

    if (field) {
      return (
        <button type="button" onClick={() => openField(field)} className={CLICKABLE_ROW_CLASS}>
          {content}
        </button>
      );
    }
    if (tab) {
      return (
        <button type="button" onClick={() => onSelectTab(tab)} className={CLICKABLE_ROW_CLASS}>
          {content}
        </button>
      );
    }
    return <div className={ROW_CLASS}>{content}</div>;
  };

  return (
    <section className={`bg-white border rounded-xl shadow-sm overflow-hidden min-w-0 ${tone.border}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${tone.header}`}>
        {/* The colour sits on a wrapper: antd icons always take the text colour of their parent. */}
        <span className={`flex shrink-0 ${tone.icon}`}>
          <WarningFilled aria-hidden />
        </span>
        <h3 className="m-0 text-[13px] font-bold uppercase tracking-wider text-slate-800">Needs Attention</h3>
        <span className={`${COUNT_CLASS} ${tone.count}`}>
          {items.length}
          <span className="sr-only"> {items.length === 1 ? "item" : "items"}</span>
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {visibleItems.map((item) => (
          <li key={item.key}>{renderRow(item)}</li>
        ))}
      </ul>

      {items.length > VISIBLE_ROWS && (
        // Indented to start under the row texts, past the severity dots.
        <div className="pl-9 pr-4 py-2 border-t border-slate-100">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={handleToggleExpanded}
            className="bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 cursor-pointer hover:underline"
          >
            {expanded ? "Show fewer" : `Show all ${items.length}`}
          </button>
        </div>
      )}
    </section>
  );
}
