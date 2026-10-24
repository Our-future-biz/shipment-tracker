"use client";

import { Fragment, useState } from "react";
import { Alert, Button, Input, InputNumber } from "antd";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import {
  approvedFee,
  bandSurcharge,
  changedBands,
  HEAVY_CARGO_MARKUP_EUR,
  heavyBandsFor,
  heavyPiecesProblems,
  heavyTotal,
  rateSurcharge,
  warehouseStanding,
  withinWeight,
  type HeavyBandKey,
  type QuoteHeavyPieces,
} from "@/app/sales/_lib/heavyPieces";
import type { QuoteWarehouseInquiry } from "@/app/sales/_lib/types";
import { formatDateTime } from "@/lib/date";
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
  /** The warehouse's answer about pieces of 12.5 t or more (or the question waiting); none when never asked. */
  inquiry?: QuoteWarehouseInquiry | null;
  /** Asks the warehouse about `pieces` of 12.5 t or more; resolves with why it was refused, or null. */
  onInquire?: (pieces: number, note: string) => Promise<string | null>;
}

// The 12.5 t+ band has no rate: the warehouse is asked ("Inquire Warehouse") and answers on the
// Warehouse Concept Managers page. The cell says where the question stands.
function InquiryCell({ pieces, inquiry, onAsk }: { pieces: number; inquiry?: QuoteWarehouseInquiry | null; onAsk?: () => void }) {
  const ask = (label: string) =>
    onAsk ? (
      <Button size="small" className="!border-amber-400 !text-amber-700 hover:!bg-amber-50" onClick={onAsk}>
        {label}
      </Button>
    ) : (
      <span className="font-semibold text-amber-600">Inquire Warehouse</span>
    );
  if (pieces <= 0 && inquiry?.status !== "pending") return <span className="font-semibold text-amber-600">Inquire Warehouse</span>;
  if (!inquiry) return ask("Inquire Warehouse");
  const who = (name: string | null, at: string | null) => (
    <span className="block text-[11px] text-slate-400">
      {name || "—"} · {formatDateTime(at)}
    </span>
  );
  if (inquiry.status === "pending") {
    return (
      <span className="inline-block text-right">
        <span className="font-semibold text-amber-600">Waiting for the warehouse</span>
        {who(inquiry.requestedByName, inquiry.requestedAt)}
        {inquiry.pieces !== pieces && <span className="block text-[11px] text-amber-600">asked about {inquiry.pieces} piece{inquiry.pieces === 1 ? "" : "s"}</span>}
      </span>
    );
  }
  if (inquiry.status === "approved") {
    // Approved for another number of pieces: the warehouse is asked again.
    if (inquiry.pieces !== pieces) {
      return (
        <span className="inline-flex flex-col items-end gap-1 text-right">
          <span className="text-[11px] text-amber-600">
            Approved for {inquiry.pieces} piece{inquiry.pieces === 1 ? "" : "s"}, not {pieces}
          </span>
          {ask("Ask again")}
        </span>
      );
    }
    return (
      <span className="inline-block text-right">
        <span className="font-semibold text-emerald-700">Approved: EUR {inquiry.priceEurPerPiece} per piece</span>
        {who(inquiry.decidedByName, inquiry.decidedAt)}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1 text-right">
      <span className="font-semibold text-red-600">Rejected by the warehouse</span>
      {inquiry.comment && <span className="block max-w-[220px] text-[11px] text-slate-600">{inquiry.comment}</span>}
      {who(inquiry.decidedByName, inquiry.decidedAt)}
      {ask("Ask again")}
    </span>
  );
}

// Saving a Sea LCL quote's cargo of over 2 t: is any piece over 2 t? No saves it as it is; yes asks
// for the pieces per weight band and shows the warehouse's extra handling for them. A surcharge
// changed from the rate then asks for the reason. Pieces of 12.5 t or more are saved only once the
// warehouse approved them; until then the dialog can only go back or be closed.
export function QuoteHeavyPiecesDialogs({ open, grossWeight, initial, onCancel, onSave, inquiry, onInquire }: QuoteHeavyPiecesDialogsProps) {
  const [step, setStep] = useState<"ask" | "pieces" | "reason">("ask");
  const [heavy, setHeavy] = useState<QuoteHeavyPieces>({ anyOver2t: true });
  const [tried, setTried] = useState(false);
  // The question to the warehouse being written (12.5 t+ pieces), and its sending.
  const [asking, setAsking] = useState(false);
  const [inquiryNote, setInquiryNote] = useState("");
  const [sending, setSending] = useState(false);
  const [inquiryError, setInquiryError] = useState("");

  // Each time the dialog opens it asks again, starting from the quote's last answer.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("ask");
      setHeavy(withinWeight({ anyOver2t: true, pieces: initial?.pieces, surcharge: initial?.surcharge, reason: initial?.reason }, grossWeight));
      setTried(false);
      setAsking(false);
      setInquiryError("");
    }
  }

  const sendInquiry = async (pieces: number) => {
    if (!onInquire) return;
    setSending(true);
    setInquiryError("");
    const refused = await onInquire(pieces, inquiryNote.trim());
    setSending(false);
    if (refused) setInquiryError(refused);
    else {
      setAsking(false);
      setInquiryNote("");
    }
  };

  const setPieces = (key: HeavyBandKey, n: number | null) => setHeavy((h) => ({ ...h, pieces: { ...h.pieces, [key]: n ?? 0 } }));
  const setSurcharge = (key: HeavyBandKey, n: number | null) =>
    setHeavy((h) => {
      const surcharge = { ...h.surcharge };
      if (n === null) delete surcharge[key];
      else surcharge[key] = n;
      return { ...h, surcharge };
    });

  // What stops saving, apart from the reason, which the next step asks for.
  const blocking = heavyPiecesProblems({ ...heavy, reason: "-" }, inquiry);
  // Pieces of 12.5 t or more the warehouse has not approved are never saved: while it is asked (or
  // about to be), only Back and closing are left. Its approval puts the fee to Pricing by itself.
  const standing = warehouseStanding(heavy, inquiry);
  const waitsForWarehouse = asking || (standing !== "none" && standing !== "approved");
  const changed = changedBands(heavy);
  const savePieces = () => {
    setTried(true);
    if (waitsForWarehouse || blocking.length > 0) return;
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
            <Button
              type="primary"
              disabled={waitsForWarehouse}
              title={waitsForWarehouse ? "Pieces of 12,500 kg and more are saved once the warehouse approves them" : undefined}
              onClick={savePieces}
            >
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
                <Fragment key={band.key}>
                <tr className="border-b border-slate-100 last:border-b-0">
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
                    {band.rate === null ? (
                      <InquiryCell pieces={pieces} inquiry={inquiry} onAsk={onInquire && inquiry?.status !== "pending" ? () => setAsking(true) : undefined} />
                    ) : (
                      `EUR ${band.rate} per piece`
                    )}
                  </td>
                  <td className="py-2 pl-4">
                    {band.rate === null ? (
                      // The warehouse's fee is no figure to type: its approval posts it to Pricing.
                      pieces > 0 && standing === "approved" && inquiry ? (
                        <span className="text-slate-800">
                          {eur(approvedFee(inquiry))}
                          <span className="block text-[11px] text-slate-400">Heavy Cargo Handling Fee in Pricing</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">{pieces > 0 ? "From the warehouse" : "—"}</span>
                      )
                    ) : pieces > 0 ? (
                      <InputNumber
                        size="small"
                        className={`!w-[150px] ${differs ? "!bg-yellow-100 !border-yellow-400" : ""}`}
                        min={0}
                        aria-label={`Extra handling for ${band.label} in EUR`}
                        value={bandSurcharge(band, heavy)}
                        onChange={(v) => setSurcharge(band.key, v)}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
                {band.rate === null && pieces > 0 && asking && (
                  <tr className="border-b border-slate-100">
                    <td colSpan={4} className="pb-3">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="text-[12px] font-semibold text-amber-800">
                          Ask the warehouse about {pieces} piece{pieces === 1 ? "" : "s"} of 12,500 kg or more ({fmtQuantity(grossWeight)} kg in all)
                        </div>
                        <div className="text-[11px] text-amber-700 mb-2">
                          A warehouse manager approves with the extra handling per piece, or rejects; the answer comes to your notifications. Once approved, the fee is put to
                          Pricing by itself (buying, and selling EUR {HEAVY_CARGO_MARKUP_EUR} above it) and the quote can be sent. Until then the pieces cannot be saved.
                        </div>
                        <Input.TextArea
                          rows={2}
                          autoFocus
                          aria-label="Note for the warehouse"
                          placeholder="What the warehouse should know (dimensions, lifting points, …) — optional"
                          value={inquiryNote}
                          maxLength={1000}
                          onChange={(e) => setInquiryNote(e.target.value)}
                        />
                        {inquiryError && <Alert className="mt-2" type="error" showIcon message={inquiryError} />}
                        <div className="mt-2 flex gap-2">
                          <Button type="primary" size="small" loading={sending} onClick={() => sendInquiry(pieces)}>
                            Send to the warehouse
                          </Button>
                          <Button size="small" disabled={sending} onClick={() => setAsking(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
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
        <p className="mt-2 mb-0 text-[11px] text-slate-400">
          Posted to Pricing as a buying and a selling line of the same amount. The warehouse&apos;s fee for pieces of 12,500 kg and more is a line of its own, &quot;Heavy
          Cargo Handling Fee&quot;, put there by its approval.
        </p>
        {waitsForWarehouse && !asking && (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={standing === "pending" ? "Waiting for the warehouse. Save is possible once it approves - its fee then goes to Pricing by itself." : blocking.filter((p) => p.includes("12,500") || p.includes("warehouse")).join(". ")}
          />
        )}
        {tried && !waitsForWarehouse && blocking.length > 0 && <Alert className="mt-3" type="error" showIcon message={blocking.join(". ")} />}
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
              <span className="text-slate-400">instead of {eur(atRate ?? 0)}</span>
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
