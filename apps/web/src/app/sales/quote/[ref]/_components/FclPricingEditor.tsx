"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ConfigProvider, Radio } from "antd";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { newPairId } from "@/app/sales/_lib/costPairs";
import { ALL_CONTAINERS, PER_SHIPMENT, blockProfitOf, fclBlocks, type FclBlock } from "@/app/sales/_lib/fclPricing";
import { basisUnits, quoteCurrency, withRate } from "@/app/sales/_lib/salesQuote";
import type { CostLine, FclBlockProfit, FclPricing, FclProfit, SalesQuoteData } from "@/app/sales/_lib/types";
import { FCL_NOTE_CLASS } from "../_lib/fclPricingUi";
import { newCostLine, serviceChange } from "./CostLinesEditor";
import { FclBlockCard } from "./FclBlockCard";
import { FclPerChargeModal } from "./FclPerChargeModal";

// The Pricing step of a Sea FCL quote (fclPricing.ts): the offer (all-in or broken down), then a
// block per container type and one for the charges per shipment. In a block the user enters the
// charges' buying - per container - and the block's profit, as a % of the selling price or a sum;
// the selling follows. "Edit per charge" sets each charge's profit instead.

/** What the FCL layout changes on the quote: always its buying lines and blocks together, so they never part. */
export type FclChange = Pick<SalesQuoteData, "buyingLines" | "fclPricing"> & { allIn?: boolean };

interface FclPricingEditorProps {
  /** The quote with its FCL pricing (withFclPricing). */
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  onChange: (change: FclChange) => void;
  // Marks and a control under a charge's description, as on the buying lines (tariffs available).
  lineTag?: (line: CostLine) => ReactNode;
  lineAction?: (line: CostLine, index: number) => ReactNode;
  // Charges to look at again (a rate priced for another cargo weight): marked in yellow.
  lineWarn?: (index: number) => boolean;
}

export function FclPricingEditor({ quote, sheet, onChange, lineTag, lineAction, lineWarn }: FclPricingEditorProps) {
  const { componentDisabled: closed } = ConfigProvider.useConfig();
  const currency = quoteCurrency(quote);
  const lines = useMemo(() => quote.buyingLines ?? [], [quote.buyingLines]);
  const blocks = useMemo(() => fclBlocks(quote), [quote]);
  const pricing: FclPricing = quote.fclPricing ?? { blocks: {} };
  const allIn = !!quote.allIn;
  const [perCharge, setPerCharge] = useState<FclBlock | null>(null);

  const change = (buyingLines: CostLine[], blocksPatch: Record<string, FclBlockProfit> = {}, more: Partial<FclChange> = {}) =>
    onChange({ buyingLines, fclPricing: { blocks: { ...pricing.blocks, ...blocksPatch } }, ...more });
  const patchLine = (i: number, patch: Partial<CostLine>) => change(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setBlock = (key: string, patch: Partial<FclBlockProfit>) => change(lines, { [key]: { ...blockProfitOf(quote, key), ...patch } });

  const addCharge = (block: FclBlock) => {
    // A block's first charge is its freight; the charges per shipment start as documentation.
    const code = block.key === PER_SHIPMENT ? "fcl_documentation" : block.lines.length ? "other" : "ocean_freight";
    const containerType = block.perContainer && block.key !== ALL_CONTAINERS ? block.key : undefined;
    const line = newCostLine(quote, { basis: block.perContainer ? "container" : "lumpsum", containerType, code });
    change([...lines, { ...line, pairId: newPairId() }]);
  };

  const handleSavePerCharge = (block: FclBlock, profits: Map<number, FclProfit>) => {
    change(
      lines.map((l, i) => (profits.has(i) ? { ...l, chargeProfit: profits.get(i)! } : l)),
      { [block.key]: { ...blockProfitOf(quote, block.key), perCharge: true } },
    );
    setPerCharge(null);
  };

  // Back to one profit for the block: the sum it makes now, so no price jumps.
  const handleOneProfit = (block: FclBlock, total: number) => {
    change(lines, { [block.key]: { mode: "sum", value: total, perCharge: false } });
    setPerCharge(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Radio.Group value={allIn ? "allIn" : "breakdown"} onChange={(e) => change(lines, {}, { allIn: e.target.value === "allIn" })} className="flex flex-wrap gap-x-6 gap-y-1">
          <Radio value="allIn">All-in price</Radio>
          <Radio value="breakdown">Break down price</Radio>
        </Radio.Group>
        <span className={FCL_NOTE_CLASS}>
          {allIn ? "For an all-in offer, profit is added to the total all-in price." : "For a breakdown offer, choose the profit basis."}
        </span>
      </div>

      {blocks.map((block) => (
        <FclBlockCard
          key={block.key}
          block={block}
          quote={quote}
          sheet={sheet}
          currency={currency}
          closed={!!closed}
          setting={blockProfitOf(quote, block.key)}
          onAdd={() => addCharge(block)}
          onPatchLine={patchLine}
          onChooseService={(i, code) => patchLine(i, serviceChange(lines[i]!, code).line)}
          onRate={(i, rate) => change(lines.map((l, j) => (j === i ? withRate(l, rate, basisUnits(quote, l.basis, l.containerType)) : l)))}
          onRemove={(i) => change(lines.filter((_, j) => j !== i))}
          onSetting={(patch) => setBlock(block.key, patch)}
          onEditPerCharge={() => setPerCharge(block)}
          lineTag={lineTag}
          lineAction={lineAction}
          lineWarn={lineWarn}
        />
      ))}

      {perCharge && (
        <FclPerChargeModal
          block={perCharge}
          quote={quote}
          sheet={sheet}
          currency={currency}
          onClose={() => setPerCharge(null)}
          onSave={(profits) => handleSavePerCharge(perCharge, profits)}
          onOneProfit={(total) => handleOneProfit(perCharge, total)}
        />
      )}
    </div>
  );
}
