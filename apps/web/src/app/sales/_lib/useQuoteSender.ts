"use client";

import { useMemo } from "react";
import { useInvoiceProfile } from "@/hooks/useInvoiceProfile";
import { useCompanyDetails } from "@/hooks/useSalesPrefs";
import { quoteSender } from "./companyDetails";

// Who the company's quotes are from, for a quotation printed or previewed: the Sales Settings
// details, else the invoicing details (quoteSender). Reload reads the Sales Settings details again.
export function useQuoteSender() {
  const company = useCompanyDetails();
  const { profile, isLoading } = useInvoiceProfile();
  return useMemo(() => ({ ...company, ...quoteSender(company, { profile, isLoading }) }), [company, profile, isLoading]);
}
