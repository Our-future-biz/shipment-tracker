"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Tooltip } from "antd";
import { CalculatorOutlined, CopyOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDateTime } from "@/lib/date";
import { useRate, useTruckingSettings, type RateRequest } from "@/hooks/useTrucking";
import { emptyRateForm, rateFormProblems, toRateRequest, type RateForm } from "../_lib/rateCalculator";
import { RateCalculatorForm } from "./RateCalculatorForm";
import { RateCopyToQuoteModal } from "./RateCopyToQuoteModal";
import { RateResultsTable } from "./RateResultsTable";

interface RateCalculatorProps {
  /** Values to start from (a consignment or quote line opening the calculator in a drawer). */
  initial?: Partial<RateForm>;
  /** The customer's name for an `initial.customerId`. */
  initialCustomerName?: string | null;
}

/** A button of a later phase: shown so people know it is coming, never clickable yet. */
const LaterButton = ({ label, phase }: { label: string; phase: number }) => (
  <Tooltip title={`Arrives in Phase ${phase}`}>
    <span>
      <Button disabled>{label}</Button>
    </span>
  </Tooltip>
);

// The rate calculator: prices a consignment from the tariffs for every active service level —
// sell, the hauliers that can run it, margin and internal. Nothing is stored. Self-contained, so a
// drawer in Consignments or Quotes can open it with `initial` values.
export const RateCalculator = ({ initial, initialCustomerName = null }: RateCalculatorProps) => {
  const [form, setForm] = useState<RateForm>(() => ({ ...emptyRateForm(businessToday()), ...initial }));
  const [customerName, setCustomerName] = useState<string | null>(initialCustomerName);
  const [asked, setAsked] = useState<RateRequest | null>(null);
  // The form the shown prices were calculated for: what "Copy to quote" puts on a quote.
  const [askedForm, setAskedForm] = useState<RateForm | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const { rate, isRating, result, error, reset } = useRate();
  const { settings } = useTruckingSettings();

  const problems = useMemo(() => rateFormProblems(form), [form]);
  const request = useMemo(() => toRateRequest(form), [form]);
  const changed = !!asked && JSON.stringify(asked) !== JSON.stringify(request);

  const handleCalculate = async () => {
    setAsked(request);
    setAskedForm(form);
    try {
      await rate(request);
    } catch {
      // Shown from `error` below.
    }
  };
  const handleClear = () => {
    setForm(emptyRateForm(businessToday()));
    setCustomerName(null);
    setAsked(null);
    setAskedForm(null);
    reset();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <RateCalculatorForm
          form={form}
          onChange={setForm}
          customer={{
            name: customerName,
            onChange: (id, name) => {
              setForm((f) => ({ ...f, customerId: id }));
              setCustomerName(name);
            },
          }}
        />
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <Button type="primary" icon={<CalculatorOutlined />} onClick={handleCalculate} loading={isRating} disabled={problems.length > 0}>
            Calculate
          </Button>
          <Button onClick={handleClear} disabled={isRating}>
            Clear
          </Button>
          {problems.length > 0 && <span className="text-xs text-slate-500">{problems.join(" · ")}</span>}
        </div>
      </section>

      {error && <Alert type="error" showIcon message={`Could not price it — ${apiErrorMessage(error)}.`} />}

      {result && !error && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-100">
            <h3 className="m-0 text-[13px] font-bold uppercase tracking-wider text-slate-800">Prices</h3>
            <span className="text-[11.5px] text-slate-500">rated {formatDateTime(result.ratedAt)} · click a row for the price lines and every haulier</span>
            <span className="ml-auto flex flex-wrap gap-2">
              <LaterButton label="Create consignment" phase={4} />
              <Tooltip title={changed ? "Calculate again first: the inputs changed" : undefined}>
                <span>
                  <Button icon={<CopyOutlined />} disabled={changed || !askedForm} onClick={() => setCopyOpen(true)}>
                    Copy to quote
                  </Button>
                </span>
              </Tooltip>
            </span>
          </div>
          {changed && (
            <Alert type="warning" showIcon banner message="The inputs changed since these prices were calculated — calculate again." />
          )}
          <RateResultsTable
            results={result.results}
            includeBuy={result.request.includeBuy}
            includeInternal={result.request.includeInternal}
            marginFloor={settings?.marginFloor ?? null}
          />
        </section>
      )}
      {copyOpen && result && askedForm && (
        <RateCopyToQuoteModal form={askedForm} customerName={customerName} results={result.results} onClose={() => setCopyOpen(false)} />
      )}
    </div>
  );
};
