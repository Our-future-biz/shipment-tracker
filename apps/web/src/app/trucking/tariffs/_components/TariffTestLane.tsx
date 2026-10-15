"use client";

import { useMemo, useState } from "react";
import { Alert, Button } from "antd";
import { CalculatorOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { businessToday } from "@/lib/date";
import { useTariffTestLane, type TariffDetail, type TariffVersionDetail, type TestLaneRequest } from "@/hooks/useTrucking";
import { emptyRateForm, rateFormProblems, toTestLaneRequest, type RateForm } from "../../_lib/rateCalculator";
import { defaultActivationDate } from "../../_lib/tariffUpload";
import { isPriced } from "../../_lib/tariffs";
import { RateCalculatorForm } from "../../_components/RateCalculatorForm";
import { RatePricedSide } from "../../_components/RatePricedSide";
import { RateUnpricedNote } from "../../_components/RateUnpricedNote";

interface TariffTestLaneProps {
  tariff: Pick<TariffDetail, "scope">;
  version: Pick<TariffVersionDetail, "id" | "validFrom">;
}

// Tries one lane on a version before it is activated (any status): the price per service level the
// version has, line by line, or why a level cannot be priced. Nothing is stored.
export const TariffTestLane = ({ tariff, version }: TariffTestLaneProps) => {
  const [form, setForm] = useState<RateForm>(() => ({ ...emptyRateForm(defaultActivationDate(version.validFrom, businessToday())), scope: tariff.scope }));
  const [asked, setAsked] = useState<TestLaneRequest | null>(null);
  const { testLane, isTesting, levels, error } = useTariffTestLane(version.id);

  const problems = useMemo(() => rateFormProblems(form), [form]);
  const request = useMemo(() => toTestLaneRequest(form), [form]);
  const changed = !!asked && JSON.stringify(asked) !== JSON.stringify(request);

  const handleTest = async () => {
    setAsked(request);
    try {
      await testLane(request);
    } catch {
      // Shown from `error` below.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <RateCalculatorForm form={form} onChange={setForm} laneOnly />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="primary" icon={<CalculatorOutlined />} onClick={handleTest} loading={isTesting} disabled={problems.length > 0}>
          Price this lane
        </Button>
        {problems.length > 0 && <span className="text-xs text-slate-500">{problems.join(" · ")}</span>}
      </div>

      {error && <Alert type="error" showIcon message={`Could not price it — ${apiErrorMessage(error)}.`} />}
      {changed && levels && !error && <Alert type="warning" showIcon message="The inputs changed since these prices were calculated — price again." />}
      {levels && !error && levels.length === 0 && <p className="m-0 text-[13px] text-slate-500">This version has no service levels to price.</p>}
      {levels && !error && levels.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {levels.map((l) =>
            isPriced(l.result) ? (
              <RatePricedSide key={l.serviceLevel} title={l.label} side={l.result} />
            ) : (
              <RateUnpricedNote key={l.serviceLevel} title={l.label} reason={l.result.reason} />
            ),
          )}
        </div>
      )}
    </div>
  );
};
