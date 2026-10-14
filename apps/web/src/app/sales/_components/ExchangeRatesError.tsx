"use client";

import Link from "next/link";
import { Alert, Button } from "antd";
import type { CurrentExchangeRates } from "@/hooks/useExchangeRates";

// Shown wherever quotes are converted with today's ČNB rates and they could not be read. The rates
// are then unknown, not missing: without this notice the lines that need one would only read as
// "no rate". Renders nothing otherwise.
export function ExchangeRatesError({ exchange, className }: { exchange: Pick<CurrentExchangeRates, "isError" | "reload">; className?: string }) {
  if (!exchange.isError) return null;
  return (
    <Alert
      className={className}
      type="error"
      showIcon
      message="ČNB rates could not be loaded"
      description={
        <>
          Lines that need a ČNB rate are left out of the totals until they load. Try again, or check{" "}
          <Link href="/exchange">Exchange</Link>.
        </>
      }
      action={
        <Button size="small" onClick={() => exchange.reload()}>
          Retry
        </Button>
      }
    />
  );
}
