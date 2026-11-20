"use client";

import { NewDefaultColumnsNotice } from "@/components/NewDefaultColumnsNotice";
import { DEFAULT_QUOTE_COLUMNS, inDrawnOrder } from "./quoteListColumns";

// The defaults of User Council S23: Status, Valid until and Selling total before the ports.
const QUOTE_DEFAULTS_VERSION = "2026-11-s23";

interface QuoteNewDefaultsNoticeProps {
  /** The columns the list shows (the company's stored set, or the defaults when none is stored). */
  shown: string[];
  /** Whether the company's stored set is known; until then nothing is said or changed. */
  status: "loading" | "ready" | "error";
  /** Stores a column set for the company, as the Columns panel does. */
  onChange: (keys: string[]) => void;
}

// Over the Quotes list: the company's saved columns keep the new defaults from showing, so a user is
// told once what is new and can take it (mock council S9-2). The set is the whole company's, as the
// Columns panel's "Reset to default" says, so taking the defaults changes it for everybody.
export function QuoteNewDefaultsNotice({ shown, status, onChange }: QuoteNewDefaultsNoticeProps) {
  if (status !== "ready") return null;
  return (
    <NewDefaultColumnsNotice
      scope="quotes"
      version={QUOTE_DEFAULTS_VERSION}
      own={inDrawnOrder(shown)}
      defaults={DEFAULT_QUOTE_COLUMNS}
      onReset={() => onChange(DEFAULT_QUOTE_COLUMNS)}
    >
      The list now starts with Status, Valid until and Selling total before the ports, so they are not under the pinned icons.
      Your company&apos;s saved columns are kept, so nothing moved here. &ldquo;Use the new defaults&rdquo; changes the columns for
      everyone in the company, as Columns → Reset to default does.
    </NewDefaultColumnsNotice>
  );
}
