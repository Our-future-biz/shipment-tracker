"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Modal, Radio } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { LINK_CLASS } from "@/components/linkClass";
import { CopyToQuoteError, useCopyRateToQuote } from "@/hooks/useCopyRateToQuote";
import type { RateLevelResult } from "@/hooks/useTrucking";
import { QuotePicker } from "@/app/sales/_components/QuotePicker";
import { RoadPricePicker } from "@/app/sales/_components/RoadPricePicker";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { defaultPick, rateFormToRoad, type RatePick } from "@/app/sales/_lib/roadQuote";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import type { RateForm } from "../_lib/rateCalculator";
import { TruckingField } from "./TruckingField";

// The quotes a price may be put on: those still being worked on.
const EDITABLE_STATUSES = "draft,revised";

interface RateCopyToQuoteModalProps {
  /** The calculator's inputs the prices were calculated for. */
  form: RateForm;
  customerName: string | null;
  results: readonly RateLevelResult[];
  onClose: () => void;
}

// "Copy to quote" of the rate calculator: a level and haulier go on an existing quote or a new one.
// The quote is priced again by the server from the same inputs, for the quote's own customer, and
// then opens. Rendered only while open, so every opening starts anew.
export const RateCopyToQuoteModal = ({ form, customerName, results, onClose }: RateCopyToQuoteModalProps) => {
  const router = useRouter();
  const { copyToQuote } = useCopyRateToQuote();
  const [pick, setPick] = useState<RatePick | null>(() => defaultPick(results));
  const [target, setTarget] = useState<"existing" | "new">("existing");
  const [quote, setQuote] = useState<SalesQuote | null>(null);
  const [onlyCustomer, setOnlyCustomer] = useState(!!form.customerId);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; quoteNumber: string | null } | null>(null);

  const otherCustomer = target === "existing" && !!quote && (quote.data.customerId ?? null) !== form.customerId;
  const ready = !!pick && (target === "new" || !!quote);

  const handleCopy = async () => {
    if (!pick) return;
    if (target === "existing" && !quote) return;
    setSaving(true);
    setRefusal(null);
    try {
      const quoteNumber = await copyToQuote({
        target:
          target === "new"
            ? { kind: "new", customer: form.customerId ? { customerId: form.customerId, customerName } : null }
            : { kind: "existing", quoteNumber: (quote as SalesQuote).quoteNumber },
        price: { road: rateFormToRoad(form), ...pick },
      });
      router.push(quoteHref(quoteNumber));
    } catch (e) {
      const quoteNumber = e instanceof CopyToQuoteError ? e.quoteNumber : null;
      const cause = e instanceof CopyToQuoteError ? e.cause : e;
      setRefusal({ message: `${quoteNumber ? `${quoteNumber} was not priced` : "Nothing was copied"} — ${apiErrorMessage(cause)}.`, quoteNumber });
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Copy to quote"
      onCancel={saving ? undefined : onClose}
      maskClosable={!saving}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <div className="flex flex-col gap-4">
        <RoadPricePicker results={results} value={pick} onChange={setPick} disabled={saving} />

        <TruckingField label="Quote">
          <Radio.Group
            aria-label="Quote"
            value={target}
            disabled={saving}
            options={[
              { value: "existing", label: "An existing quote (Draft or Revised)" },
              { value: "new", label: "A new quote" },
            ]}
            onChange={(e) => setTarget(e.target.value)}
          />
        </TruckingField>

        {target === "existing" && (
          <div className="flex flex-col gap-2">
            <QuotePicker
              value={quote}
              onChange={setQuote}
              statuses={EDITABLE_STATUSES}
              customerId={onlyCustomer && form.customerId ? form.customerId : undefined}
            />
            {form.customerId && (
              <Checkbox checked={onlyCustomer} disabled={saving} onChange={(e) => setOnlyCustomer(e.target.checked)}>
                Only quotes of {customerName ?? "this customer"}
              </Checkbox>
            )}
            {otherCustomer && quote && (
              <Alert
                type="info"
                showIcon
                message={`${quote.quoteNumber} is for ${quote.data.customerName || "no customer"}: its sell price comes from that customer's list (else Standard), not the calculator's.`}
              />
            )}
          </div>
        )}
        {target === "new" && (
          <div className="text-[12.5px] text-slate-500">
            A new Road quote{form.customerId ? ` for ${customerName ?? "the chosen customer"}` : " without a customer (priced from the Standard list)"} is created and priced.
          </div>
        )}

        <div className="text-xs text-slate-500">The quote&apos;s lines priced from a tariff are replaced; lines typed by hand stay. The quote opens when it is done.</div>

        {refusal && (
          <Alert
            type="error"
            showIcon
            message={refusal.message}
            action={
              refusal.quoteNumber && (
                <Link href={quoteHref(refusal.quoteNumber)} className={LINK_CLASS}>
                  Open {refusal.quoteNumber}
                </Link>
              )
            }
          />
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="primary" onClick={handleCopy} loading={saving} disabled={!ready}>
          {target === "new" ? "Create quote" : "Copy to quote"}
        </Button>
      </div>
    </Modal>
  );
};
