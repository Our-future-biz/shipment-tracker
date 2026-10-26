"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Spin } from "antd";
import { LINK_CLASS } from "@/components/linkClass";
import { PillTabs } from "@/components/SectionCard";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useCompanyDetails } from "@/hooks/useSalesPrefs";
import { useUsers } from "@/hooks/useUsers";
import { useToast } from "@/lib/toast";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import { hasCompanyDetails } from "@/app/sales/_lib/companyDetails";
import { printQuote, quoteDocument } from "@/app/sales/_lib/printQuote";
import { exportClosesQuote } from "@/app/sales/_lib/exportClose";
import { salesSettingsHref } from "@/app/sales/_lib/tabs";

interface PdfPreviewModalProps {
  open: boolean;
  quoteNumber: string;
  data: SalesQuoteData;
  // Sibling variants (-2/-3 refs); when given, the preview shows tabs to flip
  // between them without leaving the modal.
  family?: SalesQuote[];
  // Given when the variants could not be loaded: the preview says so and offers to ask again -
  // without their tabs it would look like that of a quote without variants.
  familyError?: { onRetry: () => void };
  // Exports the PDF of the quote the preview is of, as its page does: that closes a quote that
  // has not gone out yet. Without it the document is printed as shown.
  onExport?: () => void;
  onClose: () => void;
}

export function PdfPreviewModal({
  open,
  quoteNumber,
  data,
  family,
  familyError,
  onExport,
  onClose,
}: PdfPreviewModalProps) {
  const exchange = useCurrentExchangeRates();
  const company = useCompanyDetails();
  // The company's users: the quotation names its sales owner for the customer.
  const people = useUsers();
  const permissions = useSalesPermissions();
  const toast = useToast();
  const [activeRef, setActiveRef] = useState(quoteNumber);
  useEffect(() => {
    if (open) setActiveRef(quoteNumber);
  }, [open, quoteNumber]);

  const activeQuote = family?.find((q) => q.quoteNumber === activeRef);
  const shown: SalesQuoteData = activeRef === quoteNumber ? data : (activeQuote?.data ?? data);
  const shownRef = activeQuote ? activeQuote.quoteNumber : quoteNumber;

  // The preview is not a second layout: it shows the very document Export PDF prints. A quote
  // that has no document - an incomplete total, company details or exchange rates that did not
  // load - shows the reason instead.
  const doc = quoteDocument(shownRef, shown, exchange, company, people);
  // What did not load can be asked for again right here.
  const retry = company.status === "error" ? company.reload : exchange.isError ? exchange.reload : null;

  // Export PDF closes a quote that has not gone out yet, so the quote the preview is of is
  // exported by its owner (`onExport`). Another variant is printed as it is when it is closed;
  // one still open is exported from its own page.
  const own = shownRef === quoteNumber;
  const variantOpen = !own && activeQuote !== undefined && exportClosesQuote(activeQuote.storedStatus);
  const exportPdf = () => {
    if (own && onExport) {
      onClose();
      onExport();
      return;
    }
    const blocked = printQuote(shownRef, shown, exchange, company, people);
    if (blocked) toast.error(blocked);
  };

  return (
    <SalesDialog
      open={open}
      onClose={onClose}
      title="Quote preview"
      size="reading"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            type="primary"
            disabled={doc.blocked !== null || variantOpen}
            title={variantOpen ? `Open ${shownRef} to export it: exporting closes a quote that has not gone out yet` : undefined}
            onClick={exportPdf}
          >
            Export PDF
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {familyError && (
          <Alert
            type="error"
            showIcon
            message="The other variants of this quote could not be loaded."
            action={
              <Button size="small" onClick={familyError.onRetry}>
                Retry
              </Button>
            }
          />
        )}
        {family && family.length > 1 && (
          <PillTabs tabs={family.map((q) => ({ key: q.quoteNumber, label: q.quoteNumber }))} active={activeRef} onChange={setActiveRef} />
        )}
        {company.status === "loading" ? (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        ) : doc.blocked === null ? (
          <>
            {/* Who quotes are from is set in Sales Settings, by those the server lets change it.
                Whoever may not is told whom to ask; until the server's answer is known, neither. */}
            {!hasCompanyDetails(company.details) && (
              <Alert
                type="info"
                showIcon
                message={
                  <>
                    This quote does not say who it is from.
                    {permissions.canEditCompanyDetails ? (
                      <>
                        {" "}
                        Add your company details in{" "}
                        <Link href={salesSettingsHref("company")} className={LINK_CLASS}>
                          Sales Settings
                        </Link>
                        .
                      </>
                    ) : (
                      permissions.status === "ready" && " Ask a manager to add the company details."
                    )}
                  </>
                }
              />
            )}
            {/* The sandbox runs nothing: the document is static HTML and is only looked at here. */}
            <iframe
              title={`Quotation ${shownRef}`}
              srcDoc={doc.html}
              sandbox=""
              className="w-full h-[66vh] rounded-lg border border-slate-200 bg-white"
            />
          </>
        ) : (
          <Alert
            type="error"
            showIcon
            message={doc.blocked}
            action={
              retry && (
                <Button size="small" onClick={() => retry()}>
                  Retry
                </Button>
              )
            }
          />
        )}
      </div>
    </SalesDialog>
  );
}
