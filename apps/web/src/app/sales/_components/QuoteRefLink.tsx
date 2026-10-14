"use client";

import Link from "next/link";
import { LINK_CLASS } from "@/components/linkClass";
import { quoteHref, type QuoteOrigin } from "../_lib/quoteHref";

interface QuoteRefLinkProps {
  quoteNumber: string;
  origin?: QuoteOrigin;
}

// A quote's reference as the link to its page, wherever a list or a card names a quote. A real
// link, so the quote can be opened in a new tab. `origin` says which screen the link is on when
// the quote page should lead back there instead of to Quotes. A reference is never broken over
// two lines, also not at the hyphen of a variant ("…004-2"): its column widens instead.
export function QuoteRefLink({ quoteNumber, origin }: QuoteRefLinkProps) {
  return (
    <Link
      href={quoteHref(quoteNumber, origin)}
      // In a table whose rows open the quote as well: without stopping the click here a
      // Ctrl/Cmd-click would open a new tab and also navigate this one.
      onClick={(e) => e.stopPropagation()}
      className={`font-mono font-semibold whitespace-nowrap ${LINK_CLASS}`}
    >
      {quoteNumber}
    </Link>
  );
}
