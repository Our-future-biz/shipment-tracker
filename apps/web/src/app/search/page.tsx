import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResultsView } from "./SearchResultsView";

export const metadata: Metadata = { title: "Search" };

// What Enter in the main search opens: everything found for ?q=, by kind.
export default function SearchPage() {
  return (
    <Suspense>
      <SearchResultsView />
    </Suspense>
  );
}
