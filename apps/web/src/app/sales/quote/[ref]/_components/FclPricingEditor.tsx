"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button, Checkbox, ConfigProvider, Input, InputNumber, Radio, Select } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { chargeOptions, toChargeCode } from "@/lib/chargeCodes";
import { CURRENCIES } from "@/lib/enums";
import { fmtMoney, moneyInputParser, roundCents } from "@/lib/money";
import { fmtQuantity } from "../_lib/fmtQuantity";
import { AppModal } from "@/components/AppModal";
import { newPairId } from "@/app/sales/_lib/costPairs";
import {
  MAX_PROFIT_PERCENT,
  PER_SHIPMENT,
  blockProfitOf,
  fclBlocks,
  isInAllIn,
  isProfitBasis,
  priceFclBlock,
  type FclBlock,
  type FclBlockPrice,
} from "@/app/sales/_lib/fclPricing";
import { basisUnits, lineRate, quoteCurrency, withRate } from "@/app/sales/_lib/salesQuote";
import type { CostLine, FclBlockProfit, FclPricing, FclProfit, SalesQuoteData } from "@/app/sales/_lib/types";
import { LockedAmountInput } from "./LockedAmountInput";
import { MiniButton, RemoveLineButton } from "./QuoteButtons";
import { newCostLine, serviceChange } from "./CostLinesEditor";
import { LINE_TD_CLASS, LINE_TH_CLASS, LINE_TH_RIGHT_CLASS, LineBlock, LineBlockEmpty, LineTable } from "./LineBlock";

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
}

const PROFIT_MODES = [
  { value: "percent", label: "%" },
  { value: "sum", label: "SUM" },
];

const NOTE_CLASS = "text-[12px] font-semibold text-red-600";

export function FclPricingEditor({ quote, sheet, onChange, lineTag, lineAction }: FclPricingEditorProps) {
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
    const containerType = block.perContainer && block.key !== "*" ? block.key : undefined;
    const line = newCostLine(quote, { basis: block.perContainer ? "container" : "lumpsum", containerType, code });
    change([...lines, { ...line, pairId: newPairId() }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Radio.Group value={allIn ? "allIn" : "breakdown"} onChange={(e) => change(lines, {}, { allIn: e.target.value === "allIn" })} className="flex flex-wrap gap-x-6 gap-y-1">
          <Radio value="allIn">All-in price</Radio>
          <Radio value="breakdown">Break down price</Radio>
        </Radio.Group>
        <span className={NOTE_CLASS}>
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
        />
      ))}

      {perCharge && (
        <PerChargeModal
          block={perCharge}
          quote={quote}
          sheet={sheet}
          currency={currency}
          onClose={() => setPerCharge(null)}
          onSave={(profits) => {
            change(
              lines.map((l, i) => (profits.has(i) ? { ...l, chargeProfit: profits.get(i)! } : l)),
              { [perCharge.key]: { ...blockProfitOf(quote, perCharge.key), perCharge: true } },
            );
            setPerCharge(null);
          }}
          onOneProfit={(total) => {
            // Back to one profit for the block: the sum it makes now, so no price jumps.
            change(lines, { [perCharge.key]: { mode: "sum", value: total, perCharge: false } });
            setPerCharge(null);
          }}
        />
      )}
    </div>
  );
}

interface FclBlockCardProps {
  block: FclBlock;
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  currency: string;
  closed: boolean;
  setting: FclBlockProfit;
  onAdd: () => void;
  onPatchLine: (index: number, patch: Partial<CostLine>) => void;
  onChooseService: (index: number, code: string) => void;
  onRate: (index: number, rate: number) => void;
  onRemove: (index: number) => void;
  onSetting: (patch: Partial<FclBlockProfit>) => void;
  onEditPerCharge: () => void;
  lineTag?: (line: CostLine) => ReactNode;
  lineAction?: (line: CostLine, index: number) => ReactNode;
}

function FclBlockCard({
  block,
  quote,
  sheet,
  currency,
  closed,
  setting,
  onAdd,
  onPatchLine,
  onChooseService,
  onRate,
  onRemove,
  onSetting,
  onEditPerCharge,
  lineTag,
  lineAction,
}: FclBlockCardProps) {
  const lines = quote.buyingLines ?? [];
  const allIn = !!quote.allIn;
  const priced = priceFclBlock(quote, sheet, block);
  const per = block.perContainer ? " per container" : "";
  const title = block.perContainer ? `${block.label} · ${block.units} ${block.units === 1 ? "container" : "containers"}` : block.label;

  return (
    <LineBlock
      title={title}
      actions={
        <MiniButton icon={<PlusOutlined />} disabled={closed} onClick={onAdd}>
          Add charge
        </MiniButton>
      }
    >
      {block.weights.length > 0 && (
        <div className="px-3 pt-2 text-[12px] text-slate-600">
          Cargo weight{" "}
          <span className="font-semibold">{block.weights.map((w) => `${fmtQuantity(w)} kgs`).join(", ")}</span> per container
        </div>
      )}
      {block.lines.length === 0 ? (
        <LineBlockEmpty>{block.perContainer ? "No charges per container yet." : "No charges per shipment yet (B/L fee, documentation…)."}</LineBlockEmpty>
      ) : (
        <LineTable minWidthClass="min-w-[1080px]">
          <colgroup>
            <col className="w-14" />
            <col className="w-16" />
            <col className="w-[150px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-20" />
            <col className="w-24" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-[104px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={LINE_TH_CLASS}>All in</th>
              <th scope="col" className={LINE_TH_CLASS} title="Profit basis">Profit basis</th>
              <th scope="col" className={LINE_TH_CLASS}>Charge</th>
              <th scope="col" className={LINE_TH_CLASS}>Description</th>
              <th scope="col" className={LINE_TH_CLASS}>Supplier</th>
              <th scope="col" className={LINE_TH_CLASS}>Ccy</th>
              <th scope="col" className={LINE_TH_CLASS}>Buying{per && " / ctr"}</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>In {currency}</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>Profit</th>
              <th scope="col" className={LINE_TH_RIGHT_CLASS}>Selling</th>
              <th scope="col" aria-label="Remove charge" className={LINE_TH_CLASS} />
            </tr>
          </thead>
          <tbody>
            {priced.charges.map((c) => {
              const l = lines[c.index]!;
              const tag = lineTag?.(l);
              const action = lineAction?.(l, c.index);
              return (
                <tr key={l.pairId ?? c.index}>
                  <td className={`${LINE_TD_CLASS} text-center`}>
                    <Checkbox
                      aria-label="In the all-in price"
                      checked={isInAllIn(l)}
                      // Only an all-in offer has an all-in price. `undefined` when open: a closed quote's lock still applies.
                      disabled={!allIn || undefined}
                      onChange={(e) => onPatchLine(c.index, { inAllIn: e.target.checked })}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} text-center`}>
                    <Checkbox
                      aria-label="Profit basis"
                      checked={isProfitBasis(l)}
                      // In an all-in offer the profit goes on the all-in price.
                      disabled={allIn || undefined}
                      onChange={(e) => onPatchLine(c.index, { profitBasis: e.target.checked })}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      size="small"
                      className="w-full"
                      aria-label="Charge"
                      showSearch
                      optionFilterProp="label"
                      popupMatchSelectWidth={380}
                      value={l.chargeCode || toChargeCode(l.type)}
                      onChange={(v) => onChooseService(c.index, v)}
                      options={chargeOptions(l.chargeCode || toChargeCode(l.type), quote.serviceType)}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Input size="small" aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => onPatchLine(c.index, { description: e.target.value })} />
                    {(tag || action) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {tag}
                        {action}
                      </div>
                    )}
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Input size="small" aria-label="Supplier" placeholder="Supplier" value={l.supplier ?? ""} onChange={(e) => onPatchLine(c.index, { supplier: e.target.value })} />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <Select
                      showSearch
                      size="small"
                      className="w-full"
                      aria-label="Currency"
                      optionFilterProp="label"
                      value={l.currency}
                      onChange={(v) => onPatchLine(c.index, { currency: v })}
                      options={CURRENCIES.map((x) => ({ value: x, label: x }))}
                    />
                  </td>
                  <td className={LINE_TD_CLASS}>
                    <LockedAmountInput
                      aria-label={`Buying${per}`}
                      value={block.perContainer ? lineRate(l) : Number(l.amount) || 0}
                      currency={l.currency}
                      onChange={(rate) => onRate(c.index, rate)}
                    />
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${c.buying === null ? "text-red-600" : "text-slate-600"}`}>
                    {c.buying === null ? "no rate" : fmtMoney(c.buying, currency)}
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums whitespace-nowrap ${c.takesProfit ? "text-slate-700" : "text-slate-400"}`}>
                    {c.takesProfit ? fmtMoney(c.profit, currency) : "at cost"}
                    {c.takesProfit && c.percent !== null && <span className="block text-[10.5px] text-slate-400">{c.percent} %</span>}
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right font-semibold tabular-nums whitespace-nowrap text-slate-800`}>
                    {c.selling === null ? "—" : fmtMoney(c.selling, currency)}
                  </td>
                  <td className={`${LINE_TD_CLASS} pl-0`}>
                    <RemoveLineButton label={`Remove charge ${l.description || l.type}`} onClick={() => onRemove(c.index)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </LineTable>
      )}
      <ProfitRow
        block={block}
        priced={priced}
        setting={setting}
        currency={currency}
        closed={closed}
        onSetting={onSetting}
        onEditPerCharge={onEditPerCharge}
      />
    </LineBlock>
  );
}

interface ProfitRowProps {
  block: FclBlock;
  priced: FclBlockPrice;
  setting: FclBlockProfit;
  currency: string;
  closed: boolean;
  onSetting: (patch: Partial<FclBlockProfit>) => void;
  onEditPerCharge: () => void;
}

// The block's profit - % or SUM, then the figure - and what it makes: profit, total buying, total
// selling (per container in a container block, and for all its containers beside).
function ProfitRow({ block, priced, setting, currency, closed, onSetting, onEditPerCharge }: ProfitRowProps) {
  const per = block.perContainer ? " / ctr" : "";
  const many = block.perContainer && block.units > 1;
  const times = (amount: number) => fmtMoney(roundCents(amount * block.units), currency);
  const figure = (label: string, amount: number, strong = false) => (
    <div className="flex flex-col items-end min-w-[120px] px-3 py-1.5 rounded-md border border-slate-200 bg-white">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
        {label}
        {per}
      </span>
      <span className={`tabular-nums ${strong ? "text-[14px] font-bold text-slate-900" : "text-[13px] font-semibold text-slate-700"}`}>{fmtMoney(amount, currency)}</span>
      {many && <span className="text-[10.5px] text-slate-400 tabular-nums">× {block.units} = {times(amount)}</span>}
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 border-t border-slate-200 bg-slate-50/60">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Profit</span>
        {setting.perCharge ? (
          <span className="text-[12px] text-slate-600">Set per charge</span>
        ) : (
          <>
            <Select
              size="small"
              className="w-[76px]"
              aria-label="Profit as"
              value={setting.mode}
              options={PROFIT_MODES}
              onChange={(mode: FclProfit["mode"]) => onSetting({ mode, value: 0 })}
            />
            <InputNumber
              size="small"
              className="!w-[120px]"
              aria-label={setting.mode === "percent" ? "Profit %" : `Profit ${currency}${per}`}
              min={setting.mode === "percent" ? 0 : undefined}
              max={setting.mode === "percent" ? MAX_PROFIT_PERCENT : undefined}
              // % profit is a whole number.
              precision={setting.mode === "percent" ? 0 : 2}
              parser={moneyInputParser}
              addonAfter={setting.mode === "percent" ? "%" : currency}
              value={setting.value}
              onChange={(v) => onSetting({ value: Number(v) || 0 })}
            />
          </>
        )}
        <Button size="small" type="link" icon={<EditOutlined />} disabled={closed || priced.charges.every((c) => !c.takesProfit)} onClick={onEditPerCharge}>
          Edit per charge
        </Button>
        <div className="ml-auto flex flex-wrap items-stretch gap-2">
          {figure(priced.percent === null ? "Profit" : `Profit · ${priced.percent} %`, priced.profit)}
          {figure("Total buying", priced.buying)}
          {figure("Total selling", priced.selling, true)}
        </div>
      </div>
      {priced.profitUnplaced && <span className={NOTE_CLASS}>No charge in this block takes profit: tick the profit basis of one, or put one in the all-in price.</span>}
    </div>
  );
}

interface PerChargeModalProps {
  block: FclBlock;
  quote: SalesQuoteData;
  sheet: ExchangeRates;
  currency: string;
  onClose: () => void;
  onSave: (profits: Map<number, FclProfit>) => void;
  onOneProfit: (total: number) => void;
}

// "Edit per charge": the profit of each charge of a block that takes profit, as a % of its selling
// price or a sum, opened with what the block's profit puts on each now.
function PerChargeModal({ block, quote, sheet, currency, onClose, onSave, onOneProfit }: PerChargeModalProps) {
  const lines = quote.buyingLines ?? [];
  const setting = blockProfitOf(quote, block.key);
  const now = priceFclBlock(quote, sheet, block);
  const taking = now.charges.filter((c) => c.takesProfit && c.buying !== null);
  const [profits, setProfits] = useState<Map<number, FclProfit>>(
    () =>
      new Map(
        taking.map((c) => {
          const own = setting.perCharge ? lines[c.index]!.chargeProfit : undefined;
          return [c.index, own ?? (setting.mode === "percent" && !setting.perCharge ? { mode: "percent", value: setting.value } : { mode: "sum", value: c.profit })];
        }),
      ),
  );
  // The block as the window has it: each charge with the profit set here.
  const preview = priceFclBlock(
    {
      ...quote,
      buyingLines: lines.map((l, i) => (profits.has(i) ? { ...l, chargeProfit: profits.get(i)! } : l)),
      fclPricing: { blocks: { ...quote.fclPricing?.blocks, [block.key]: { ...setting, perCharge: true } } },
    },
    sheet,
    block,
  );
  const per = block.perContainer ? " / ctr" : "";
  const put = (i: number, patch: Partial<FclProfit>) => setProfits((m) => new Map(m).set(i, { ...m.get(i)!, ...patch }));

  return (
    <AppModal
      open
      onClose={onClose}
      size="large"
      title={`Profit per charge - ${block.label}`}
      subtitle={block.perContainer ? "Per container. % profit is a whole number." : "% profit is a whole number."}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button onClick={() => onOneProfit(now.profit)} disabled={!setting.perCharge}>
            Use one profit for the block
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={() => onSave(profits)}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <LineTable minWidthClass="min-w-[640px]">
        <colgroup>
          <col className="w-[150px]" />
          <col />
          <col className="w-[200px]" />
          <col className="w-[110px]" />
          <col className="w-[110px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={LINE_TH_CLASS}>Charge</th>
            <th scope="col" className={LINE_TH_CLASS}>Description</th>
            <th scope="col" className={LINE_TH_CLASS}>Profit{per}</th>
            <th scope="col" className={LINE_TH_RIGHT_CLASS}>Buying{per}</th>
            <th scope="col" className={LINE_TH_RIGHT_CLASS}>Selling{per}</th>
          </tr>
        </thead>
        <tbody>
          {preview.charges
            .filter((c) => profits.has(c.index))
            .map((c) => {
              const l = lines[c.index]!;
              const p = profits.get(c.index)!;
              return (
                <tr key={l.pairId ?? c.index}>
                  <td className={LINE_TD_CLASS}>{l.type}</td>
                  <td className={LINE_TD_CLASS}>{l.description}</td>
                  <td className={LINE_TD_CLASS}>
                    <div className="flex items-center gap-1">
                      <InputNumber
                        size="small"
                        className="!w-[110px]"
                        aria-label={`Profit of ${l.description || l.type}`}
                        min={p.mode === "percent" ? 0 : undefined}
                        max={p.mode === "percent" ? MAX_PROFIT_PERCENT : undefined}
                        precision={p.mode === "percent" ? 0 : 2}
                        parser={moneyInputParser}
                        value={p.value}
                        onChange={(v) => put(c.index, { value: Number(v) || 0 })}
                      />
                      <Select
                        size="small"
                        className="w-[72px]"
                        aria-label={`Profit of ${l.description || l.type} as`}
                        value={p.mode}
                        options={PROFIT_MODES}
                        // The same profit the other way round: a sum as its whole %, a % as its sum.
                        onChange={(mode: FclProfit["mode"]) => put(c.index, { mode, value: mode === "sum" ? c.profit : (c.percent ?? 0) })}
                      />
                    </div>
                    <span className="text-[10.5px] text-slate-400">
                      {p.mode === "percent" ? fmtMoney(c.profit, currency) : c.percent !== null ? `${c.percent} %` : ""}
                    </span>
                  </td>
                  <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{fmtMoney(c.buying, currency)}</td>
                  <td className={`${LINE_TD_CLASS} text-right font-semibold tabular-nums`}>{c.selling === null ? "—" : fmtMoney(c.selling, currency)}</td>
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr>
            <td className={LINE_TD_CLASS} colSpan={2}>
              <span className="font-bold text-slate-700">Block</span>
            </td>
            <td className={`${LINE_TD_CLASS} font-semibold tabular-nums`}>
              {fmtMoney(preview.profit, currency)}
              {preview.percent !== null && <span className="text-slate-400 font-normal"> · {preview.percent} %</span>}
            </td>
            <td className={`${LINE_TD_CLASS} text-right tabular-nums`}>{fmtMoney(preview.buying, currency)}</td>
            <td className={`${LINE_TD_CLASS} text-right font-bold tabular-nums`}>{fmtMoney(preview.selling, currency)}</td>
          </tr>
        </tfoot>
      </LineTable>
      <p className="mt-2 mb-0 text-[12px] text-slate-500">Charges that take no profit are offered at cost and are not listed here.</p>
    </AppModal>
  );
}
