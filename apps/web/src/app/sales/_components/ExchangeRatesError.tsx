"use client";

import { Alert, Button } from "antd";
import type { CurrentExchangeRates } from "@/hooks/useExchangeRates";

// Shown wherever quotes are converted with the Exchange sheet and the sheet could not be read. Its
// rates are then unknown, not missing: without this notice the lines that need one would only read
// as "no rate", and somebody would type by hand a rate the sheet has. Renders nothing otherwise.
export function ExchangeRatesError({ exchange, className }: { exchange: Pick<CurrentExchangeRates, "isError" | "reload">; className?: string }) {
  if (!exchange.isError) return null;
  return (
    <Alert
      className={className}
      type="error"
      showIcon
      message="Exchange rates could not be loaded"
      description="Lines that need a rate from the Exchange sheet are left out of the totals until it loads. Its rates are not missing, so do not type them in - try again."
      action={
        <Button size="small" onClick={() => exchange.reload()}>
          Retry
        </Button>
      }
    />
  );
}
