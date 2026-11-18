"use client";

import { StatementMenu } from "@/app/accounts-receivable/_components/StatementMenu";

interface CustomerStatementMenuProps {
  customerId: string;
  /** The customer's name, as the e-mail dialog names it */
  customer: string;
  /** The currencies the customer owes in (statementCurrencies): one statement each. */
  currencies: string[];
  /** A manager: may e-mail a statement (the server checks again). */
  canSend: boolean;
}

// "Statement EUR ▾": download the customer's statement of one currency as a PDF or a CSV; a manager may e-mail it to
// the customer's reminder contact, after a confirmation. It is Accounts Receivable's own menu (StatementMenu), so the
// send is the same here as there: one idempotency key per confirmation dialog, and the app's mail log read again
// after it. While e-mail from the app is switched off, the server sends nothing and says so.
export function CustomerStatementMenu({ customerId, customer, currencies, canSend }: CustomerStatementMenuProps) {
  if (currencies.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {currencies.map((currency) => (
        <StatementMenu key={currency} customerId={customerId} customer={customer} currency={currency} canSend={canSend} label={`Statement ${currency}`} />
      ))}
    </div>
  );
}
