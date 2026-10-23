"use client";

import { useState } from "react";
import { Alert, Button, Input, InputNumber } from "antd";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import {
  bandSurcharge,
  changedBands,
  heavyBandsFor,
  heavyPiecesProblems,
  heavyTotal,
  rateSurcharge,
  withinWeight,
  type HeavyBandKey,
  type QuoteHeavyPieces,
} from "@/app/sales/_lib/heavyPieces";
import { fmtQuantity } from "../_lib/fmtQuantity";

const eur = (n: number) => `EUR ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

interface QuoteHeavyPiecesDialogsProps {
  open: boolean;
  /** The shipment's gross weight in kg, said in the question. */
  grossWeight: number;
  /** What the quote answered last time, to start from. */
  initial?: QuoteHeavyPieces;
  /** Back to the cargo, nothing saved. */
  onCancel: () => void;
  onSave: (heavy: QuoteHeavyPieces) => void;
}

// Saving a Sea LCL quote's cargo of over 2 t: is any piece over 2 t? No saves it as it is; yes asks
// for the pieces per weight band and shows the warehouse's extra handling for them. A surcharge
// changed from the rate - or the warehouse's figure for 12.5 t and more - then asks for the reason.
export function QuoteHeavyPiecesDialogs({ open, grossWeight, initial, onCancel, onSave }: QuoteHeavyPiecesDialogsProps) {
  const [step, setStep] = useState<"ask" | "pieces" | "reason">("ask");
  const [heavy, setHeavy] = useState<QuoteHeavyPieces>({ anyOver2t: true });
  const [tried, setTried] = useState(false);

  // Each time the dialog opens it asks again, starting from the quote's last answer.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("ask");
      setHeavy(withinWeight({ anyOver2t: true, pieces: initial?.pieces, surcharge: initial?.surcharge, reason: initial?.reason }, grossWeight));
      setTried(false);
    }
  }

  const setPieces = (key: HeavyBandKey, n: number | null) => setHeavy((h) => ({ ...h, pieces: { ...h.pieces, [key]: n ?? 0 } }));
  const setSurcharge = (key: HeavyBandKey, n: number | null) =>
    setHeavy((h) => {
      const surcharge = { ...h.surcharge };
      if (n === null) delete surcharge[key];
      else surcharge[key] = n;
      return { ...h, surcharge };
    });

  // What stops saving, apart from the reason, which the next step asks for.
  const blocking = heavyPiecesProblems({ ...heavy, reason: "-" });
  const changed = changedBands(heavy);
  const savePieces = () => {
    setTried(true);
    if (blocking.length > 0) return;
    if (changed.length > 0) setStep("reason");
    else onSave({ ...heavy, reason: undefined });
  };

  if (step === "ask") {
    return (
      <SalesDialog
        open={open}
        onClose={onCancel}
        title="Is any piece over 2 t?"
        subtitle={`The shipment weighs ${fmtQuantity(grossWeight)} kg. The warehouse charges extra handling for every piece of 2,000 kg or more.`}
        footer={
          <>
            <Button onClick={onCancel}>Back to cargo</Button>
            <Button onClick={() => onSave({ anyOver2t: false })}>No</Button>
            <Button type="primary" onClick={() => setStep("pieces")}>
              Yes
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm text-slate-600">No saves the cargo as it is. Yes asks how many pieces there are by weight.</p>
      </SalesDialog>
    );
  }

  if (step === "pieces") {
    return (
      <SalesDialog
        open={open}
        size="reading"
        onClose={onCancel}
        title="Pieces over 2 t"
        subtitle="How many pieces of each weight the shipment has. The extra handling is charged per piece; change it only with a reason."
        footer={
          <>
            <Button onClick={() => setStep("ask")}>Back</Button>
            <Button type="primary" onClick={savePieces}>
              Save
            </Button>
          </>
        }
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="text-left font-semibold py-2">Weight per piece</th>
              <th className="text-left font-semibold py-2 w-[110px]">Pieces</th>
              <th className="text-right font-semibold py-2 w-[150px]">Rate</th>
              <th className="text-left font-semibold py-2 pl-4 w-[190px]">Extra handling (EUR)</th>
            </tr>
          </thead>
          <tbody>
            {/* Only the bands a piece of the shipment's weight can be in: 2,500 kg in all has no piece of 3 t. */}
            {heavyBandsFor(grossWeight).map((band) => {
              const pieces = heavy.pieces?.[band.key] ?? 0;
              const atRate = rateSurcharge(band, pieces);
              const typed = heavy.surcharge?.[band.key];
              const differs = pieces > 0 && band.rate !== null && typed !== undefined && typed !== atRate;
              return (
                <tr key={band.key} className="border-b border-slate-100 last:border-b-0">
                  <td className="py-2 text-slate-800">{band.label}</td>
                  <td className="py-2">
                    <InputNumber
                      size="small"
                      className="!w-[90px]"
                      min={0}
                      precision={0}
                      aria-label={`Pieces of ${band.label}`}
                      value={pieces || null}
                      placeholder="0"
                      onChange={(v) => setPieces(band.key, v)}
                    />
                  </td>
                  <td className="py-2 text-right text-slate-500">
                    {band.rate === null ? <span className="font-semibold text-amber-600">Inquire Warehouse</span> : `EUR ${band.rate} per piece`}
                  </td>
                  <td className="py-2 pl-4">
                    {pieces > 0 ? (
                      <InputNumber
                        size="small"
                        className={`!w-[150px] ${differs ? "!bg-yellow-100 !border-yellow-400" : ""}`}
                        min={0}
                        aria-label={`Extra handling for ${band.label} in EUR`}
                        value={band.rate === null ? (typed ?? null) : bandSurcharge(band, heavy)}
                        placeholder={band.rate === null ? "From the warehouse" : undefined}
                        status={band.rate === null && typed === undefined && tried ? "error" : undefined}
                        onChange={(v) => setSurcharge(band.key, v)}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold text-slate-800">
              <td className="py-2" colSpan={3}>
                Extra handling in all
              </td>
              <td className="py-2 pl-4">{eur(heavyTotal(heavy))}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 mb-0 text-[11px] text-slate-400">Posted to Pricing as a buying and a selling line of the same amount.</p>
        {tried && blocking.length > 0 && <Alert className="mt-3" type="error" showIcon message={blocking.join(". ")} />}
      </SalesDialog>
    );
  }

  return (
    <SalesDialog
      open={open}
      onClose={onCancel}
      title="Why is the extra handling changed?"
      subtitle="The surcharge differs from the agreed rate. Say why, so it can be traced later."
      footer={
        <>
          <Button onClick={() => setStep("pieces")}>Back</Button>
          <Button type="primary" disabled={!heavy.reason?.trim()} onClick={() => onSave({ ...heavy, reason: heavy.reason?.trim() })}>
            Save
          </Button>
        </>
      }
    >
      <ul className="mt-0 mb-3 pl-4 text-sm text-slate-700">
        {changed.map((band) => {
          const pieces = heavy.pieces?.[band.key] ?? 0;
          const atRate = rateSurcharge(band, pieces);
          return (
            <li key={band.key}>
              {pieces}× {band.label}: {eur(heavy.surcharge?.[band.key] ?? 0)}{" "}
              <span className="text-slate-400">{atRate === null ? "(warehouse's figure)" : `instead of ${eur(atRate)}`}</span>
            </li>
          );
        })}
      </ul>
      <Input.TextArea
        rows={3}
        autoFocus
        aria-label="Reason for the changed extra handling"
        placeholder="e.g. Warehouse quote of 23.10., long-standing customer, waived for this shipment"
        value={heavy.reason ?? ""}
        onChange={(e) => setHeavy((h) => ({ ...h, reason: e.target.value }))}
      />
    </SalesDialog>
  );
}
