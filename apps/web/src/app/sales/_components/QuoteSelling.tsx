"use client";

import { Tooltip } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { fmtMoney } from "@/lib/money";
import type { QuoteTotals } from "../_lib/salesQuote";

interface QuoteSellingProps {
  totals: QuoteTotals;
}

// A quote's selling total as the lists show it. Lines whose exchange rate is known nowhere are not
// in the figure, so such a quote carries a warning in front of it that names the rate - a partial
// total must not pass for the price.
export function QuoteSelling({ totals }: QuoteSellingProps) {
  const missing = totals.missingSellingRates.join(", ");
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {missing && (
        <Tooltip title={`No ${missing} rate. Lines that cannot be converted are not in this total. Open the quote and type the missing rate in Pricing.`}>
          {/* The colour sits on the wrapper: the icon takes its colour from what is around it. */}
          <span role="img" aria-label={`No ${missing} rate`} className="inline-flex text-amber-600">
            <WarningOutlined aria-hidden />
          </span>
        </Tooltip>
      )}
      {fmtMoney(totals.selling, totals.currency)}
    </span>
  );
}
