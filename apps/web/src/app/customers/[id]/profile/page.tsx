"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// The "Company Profile" page was folded into the Overview tab of the customer detail.
// This keeps its old links and bookmarks working.
export default function CustomerProfileRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/customers/${id}`);
  }, [id, router]);

  return null;
}
