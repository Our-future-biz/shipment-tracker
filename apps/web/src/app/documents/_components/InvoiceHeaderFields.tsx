"use client";

import { Input, Select } from "antd";
import { LABEL_TEXT } from "@/styles/ui";
import { currencyOptions, currencyProblem, readCurrency, type InvoiceExtracted } from "../_lib/extraction";

interface InvoiceHeaderFieldsProps {
  /** "Invoice" or "Credit note", as the labels name it. */
  docWord: string;
  data: InvoiceExtracted;
  onChange: (patch: Partial<InvoiceExtracted>) => void;
  /** The total can be posted (an invoice's above 0, a credit note's other than 0). */
  totalValid: boolean;
  className?: string;
}

// The invoice's total, currency, number and vendor as read, for the user to correct before it is
// posted. A currency that is no code is not guessed: it is marked, and the user chooses one.
export function InvoiceHeaderFields({ docWord, data, onChange, totalValid, className = "" }: InvoiceHeaderFieldsProps) {
  const currency = readCurrency(data.currency);
  const problem = currencyProblem(data.currency);
  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[1fr_110px_1fr_1fr] gap-3 ${className}`}>
      <div>
        <div className={`${LABEL_TEXT} mb-1.5`}>
          {docWord} total <span className="text-red-500">*</span>
        </div>
        <Input
          aria-label={`${docWord} total`}
          value={data.total_amount ?? ""}
          onChange={(e) => onChange({ total_amount: e.target.value })}
          status={totalValid ? undefined : "error"}
        />
      </div>
      <div>
        <div className={`${LABEL_TEXT} mb-1.5`}>
          Currency <span className="text-red-500">*</span>
        </div>
        <Select
          className="w-full"
          showSearch
          aria-label={`${docWord} currency`}
          placeholder="Choose"
          value={currency || undefined}
          status={problem ? "error" : undefined}
          onChange={(v: string) => onChange({ currency: v })}
          options={currencyOptions(currency)}
        />
        {problem && <p className="mt-1 mb-0 text-[12px] text-red-600">{problem}</p>}
      </div>
      <div>
        <div className={`${LABEL_TEXT} mb-1.5`}>
          {docWord} number <span className="text-red-500">*</span>
        </div>
        <Input
          aria-label={`${docWord} number`}
          value={data.invoice_number ?? ""}
          onChange={(e) => onChange({ invoice_number: e.target.value })}
          status={data.invoice_number?.trim() ? undefined : "error"}
        />
      </div>
      <div>
        <div className={`${LABEL_TEXT} mb-1.5`}>Vendor</div>
        <Input aria-label="Vendor" value={data.vendor ?? ""} onChange={(e) => onChange({ vendor: e.target.value })} />
      </div>
    </div>
  );
}
