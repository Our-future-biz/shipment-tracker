"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// The standalone section pages were folded into the tabs of the customer detail. This keeps
// their old links and bookmarks working by sending them to the matching tab (the detail page
// maps the former "financial", "credit" and "payment" sections to its Finance tab).
export default function CustomerSectionRedirectPage() {
  const { id, section } = useParams<{ id: string; section: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/customers/${id}?tab=${encodeURIComponent(section)}`);
  }, [id, section, router]);

  return null;
}
