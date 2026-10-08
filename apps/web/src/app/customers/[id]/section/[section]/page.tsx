"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Where the content of each former section page lives now; the other section keys equal their tab key.
const SECTION_QUERY = new Map<string, string>([
  ["financial", "?tab=finance&view=profitability"],
  ["credit", "?tab=finance"],
  // Payment terms are edited in the CRM card on the Overview tab.
  ["payment", ""],
]);

// The standalone section pages were folded into the tabs of the customer detail. This keeps
// their old links and bookmarks working by sending them to the matching tab.
export default function CustomerSectionRedirectPage() {
  const { id, section } = useParams<{ id: string; section: string }>();
  const router = useRouter();

  useEffect(() => {
    const query = SECTION_QUERY.get(section) ?? `?tab=${encodeURIComponent(section)}`;
    router.replace(`/customers/${id}${query}`);
  }, [id, section, router]);

  return null;
}
