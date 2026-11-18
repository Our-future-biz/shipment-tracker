import { formatAmount } from "@/lib/money";
import type { CurrencyAmount } from "@/lib/amounts";

// A Finance tile's money (Accounts Payable, Accounts Receivable): one line per currency, never converted nor added
// into one total; "0" when there is none.

export function Amounts({ list }: { list: readonly CurrencyAmount[] }) {
  if (!list.length) return <>0</>;
  // One figure per currency, never converted nor added into one total.
  return (
    <>
      {list.map((a) => (
        <div key={a.currency} className="truncate">
          {formatAmount(a.amount, a.currency)}
        </div>
      ))}
    </>
  );
}
