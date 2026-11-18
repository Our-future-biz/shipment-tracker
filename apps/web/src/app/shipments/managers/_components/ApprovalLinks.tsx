"use client";

import Link from "next/link";
import { CockpitLine } from "@/components/cockpit/CockpitLine";
import { useCreditNoteRequests } from "@/hooks/useCreditNoteRequests";
import { useInvoiceChangeRequests } from "@/hooks/useInvoiceChangeRequests";
import { useSupplierInvoiceNotices } from "@/hooks/useSupplierInvoiceNotices";
import { LINK } from "@/styles/ui";
import { approvalLinks } from "../_lib/cockpitMoney";

// What a manager answers on another page, counted on the Approvals tab so it is one place to look
// (Council Outlay 11, D15): the billing approvals of Sales → Managers (partial credit notes and
// issue-day invoice changes) and the supplier invoices to approve on Accounts Payable. Each is a
// count and a link - nothing is answered here, and neither is in the tab's badge. A line with
// nothing waiting is not drawn; a count that could not be read is "–", not a missing line.
// Read only while the Approvals tab is shown.
export function ApprovalLinks() {
  const creditNotes = useCreditNoteRequests();
  const invoiceChanges = useInvoiceChangeRequests();
  const supplierInvoices = useSupplierInvoiceNotices();
  const lines = approvalLinks([creditNotes, invoiceChanges], { waiting: supplierInvoices.toApprove, isLoading: supplierInvoices.isLoading, isError: supplierInvoices.isError });
  if (lines.length === 0) return null;
  return (
    <CockpitLine label="Answered on another page">
      {lines.map((line) => (
        <span key={line.key}>
          <b className="tabular-nums text-slate-900" aria-label={line.count === "–" ? "Count unavailable" : undefined}>
            {line.count}
          </b>{" "}
          {line.words} ·{" "}
          <Link href={line.href} className={LINK}>
            {line.where}
          </Link>
        </span>
      ))}
    </CockpitLine>
  );
}
