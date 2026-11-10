"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { newPairId } from "@/app/sales/_lib/costPairs";
import { ALL_CONTAINERS, PER_SHIPMENT, blockProfitOf, fclBlocks, type FclBlock } from "@/app/sales/_lib/fclPricing";
import { basisUnits, quoteCurrency, withRate, type LivePricing } from "@/app/sales/_lib/salesQuote";
import type { CostLine, FclBlockProfit, FclPricing, FclProfit, SalesQuoteData } from "@/app/sales/_lib/types";
import { newCostLine, serviceChange } from "./CostLinesEditor";
import { FclBlockCard } from "./FclBlockCard";
import { FclPerChargeModal } from "./FclPerChargeModal";

// The Pricing step of a Sea FCL quote (fclPricing.ts): a block per container type and one for the
// charges per shipment. In a block the user enters the charges' buying - per container - and ticks
// those in the all-in price; "Profit per charge" sets each charge's profit, and the selling follows.

/** What the FCL layout changes on the quote: always its buying lines and blocks together, so they never part. */
export type FclChange = Pick<SalesQuoteData, "buyingLines" | "fclPricing">;

interface FclPricingEditorProps {
  /** The quote with its FCL pricing (withFclPricing). */
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  /** Today's ROE % (a draft's): charges in another currency than the quote's are sold at it. */
  live?: LivePricing;
  onChange: (change: FclChange) => void;
  // Marks and a control under a charge's description, as on the buying lines (tariffs available).
  lineTag?: (line: CostLine) => ReactNode;
  lineAction?: (line: CostLine, index: number) => ReactNode;
  // Charges to look at again (a rate priced for another cargo weight): marked in yellow.
  lineWarn?: (index: number) => boolean;
}

export function FclPricingEditor({ quote, sheet, live, onChange, lineTag, lineAction, lineWarn }: FclPricingEditorProps) {
  const { componentDisabled: closed } = ConfigProvider.useConfig();
  const currency = quoteCurrency(quote);
  const lines = useMemo(() => quote.buyingLines ?? [], [quote.buyingLines]);
  const blocks = useMemo(() => fclBlocks(quote), [quote]);
  const pricing: FclPricing = quote.fclPricing ?? { blocks: {} };
  const [perCharge, setPerCharge] = useState<FclBlock | null>(null);

  const change = (buyingLines: CostLine[], blocksPatch: Record<string, FclBlockProfit> = {}) =>
    onChange({ buyingLines, fclPricing: { ...pricing, blocks: { ...pricing.blocks, ...blocksPatch } } });
  const patchLine = (i: number, patch: Partial<CostLine>) => change(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

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

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) => (
        <FclBlockCard
          key={block.key}
          block={block}
          quote={quote}
          sheet={sheet}
          live={live}
          currency={currency}
          closed={!!closed}
          onAdd={() => addCharge(block)}
          onPatchLine={patchLine}
          onChooseService={(i, code) => patchLine(i, serviceChange(lines[i]!, code).line)}
          onRate={(i, rate) => change(lines.map((l, j) => (j === i ? withRate(l, rate, basisUnits(quote, l.basis, l.containerType)) : l)))}
          onRemove={(i) => change(lines.filter((_, j) => j !== i))}
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
          live={live}
          currency={currency}
          onClose={() => setPerCharge(null)}
          onSave={(profits) => handleSavePerCharge(perCharge, profits)}
        />
      )}
    </div>
  );
}
