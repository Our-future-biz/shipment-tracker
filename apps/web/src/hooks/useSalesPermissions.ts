"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// What whoever is signed in may do in Sales beyond a single quote: manage Sales as a whole - which
// is what puts Settings into the Sales menu - and change the settings all of Sales shares, the
// Terms & Conditions templates and the company details on quotes. The answer is the server's,
// which refuses by the same policy whatever a screen offers; no screen holds a rule about roles.
// Until the answer is here nothing counts as allowed, so a control is never offered first and
// taken away after. `status` tells "not allowed" ("ready") from "not known".
export const useSalesPermissions = () => {
  const query = useQuery({
    queryKey: ["sales-permissions"],
    queryFn: () => api.sales.salesPermissions(),
  });

  // An answer that is at hand stays the answer when reading it again fails.
  let status: "loading" | "ready" | "error" = "loading";
  if (query.data) status = "ready";
  else if (query.isError) status = "error";

  return {
    status,
    canManageSales: query.data?.canManageSales ?? false,
    canEditTerms: query.data?.canEditTerms ?? false,
    canEditCompanyDetails: query.data?.canEditCompanyDetails ?? false,
    reload: query.refetch,
  };
};
