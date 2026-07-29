"use client";

import { Modal, Button } from "antd";
import type { SalesQuoteData, PackageLine, CostLine } from "@/app/sales/_lib/types";
import { computeTotals, fmt } from "@/app/sales/_lib/salesQuote";
import { printQuote } from "@/app/sales/_lib/printQuote";

export function PdfPreviewModal({
  open,
  quoteNumber,
  data,
  onClose,
}: {
  open: boolean;
  quoteNumber: string;
  data: SalesQuoteData;
  onClose: () => void;
}) {
  const currency = data.currency ?? "EUR";
  const totals = computeTotals(data);
  const packages: PackageLine[] = data.packages ?? [];
  const sellingLines: CostLine[] = data.sellingLines ?? [];
  const totalPackages = packages.reduce((sum, p) => sum + (Number(p.qty) || 0), 0);

  const Field = ({ label, value }: { label: string; value?: string }) => (
    <div className="flex text-[13px]">
      <span className="w-32 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-700">{value || "—"}</span>
    </div>
  );

  const SectionTitle = ({ children }: { children: string }) => (
    <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</h3>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={820}
      title="Quotation preview"
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="print" type="primary" onClick={() => printQuote(quoteNumber, data)}>
          Download / Print
        </Button>,
      ]}
    >
      <div className="bg-white">
        {/* Header bar */}
        <div className="bg-slate-800 text-white rounded-t-lg px-6 py-4 flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">Freight Quotation</div>
            <div className="font-mono text-xs text-slate-300">{quoteNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-sm">{data.serviceType || "—"}</div>
            <div className="font-mono text-xs text-slate-300">{data.incoterm || "—"}</div>
          </div>
        </div>

        <div className="border border-t-0 border-slate-200 rounded-b-lg px-6 py-5">
          {/* Prepared for */}
          <SectionTitle>Prepared for</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Field label="Customer" value={data.customerName} />
            <Field label="Contact" value={data.customerContact} />
            <Field label="Email" value={data.customerEmail} />
            <Field label="Phone" value={data.customerPhone} />
          </div>

          {/* Routing */}
          <SectionTitle>Routing</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <Field label="Direction" value={data.direction} />
            <Field label="Incoterm" value={data.incoterm} />
            <Field
              label="Origin → Dest."
              value={`${data.origin || "—"} → ${data.destination || "—"}`}
            />
            <Field label="Pickup" value={data.pickup} />
            <Field label="Delivery" value={data.delivery} />
            <Field label="Cargo ready" value={data.readyDate} />
          </div>

          {/* Cargo */}
          <SectionTitle>Cargo</SectionTitle>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Commodity</th>
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Packing type</th>
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Qty</th>
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">L×W×H</th>
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {packages.length > 0 ? (
                packages.map((p: PackageLine, i) => (
                  <tr key={i}>
                    <td className="border border-slate-200 px-2.5 py-1.5">{data.commodity || "—"}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5">{p.type || "—"}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5">{p.qty}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5">
                      {p.length}×{p.width}×{p.height} cm
                    </td>
                    <td className="border border-slate-200 px-2.5 py-1.5">{p.weight} kg</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="border border-slate-200 px-2.5 py-1.5" colSpan={5}>
                    {data.commodity || "—"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-2 text-[12px] text-slate-500">
            Total packages: {totalPackages || packages.length} · Total weight: {data.weight ?? 0} kg · CBM:{" "}
            {data.cbm ?? 0}
          </div>

          {/* Charges */}
          <SectionTitle>Charges</SectionTitle>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Service</th>
                <th className="border border-slate-200 px-2.5 py-1.5 font-medium">Description</th>
                <th className="border border-slate-200 px-2.5 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sellingLines.length > 0 ? (
                sellingLines.map((l: CostLine, i) => (
                  <tr key={i}>
                    <td className="border border-slate-200 px-2.5 py-1.5">{l.type || "—"}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5">{l.description || "—"}</td>
                    <td className="border border-slate-200 px-2.5 py-1.5 text-right">
                      {l.amount} {l.currency || currency}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="border border-slate-200 px-2.5 py-1.5" colSpan={3}>
                    —
                  </td>
                </tr>
              )}
              <tr className="font-semibold">
                <td className="border border-slate-200 px-2.5 py-1.5" colSpan={2}>
                  Total
                </td>
                <td className="border border-slate-200 px-2.5 py-1.5 text-right">
                  {fmt(totals.selling, currency)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Shipping conditions */}
          <SectionTitle>Shipping conditions</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-green-700">
                Includes
              </div>
              <div className="whitespace-pre-wrap text-[13px] text-slate-700">
                {data.shippingIncludes || "—"}
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-red-700">
                Excludes
              </div>
              <div className="whitespace-pre-wrap text-[13px] text-slate-700">
                {data.shippingExcludes || "—"}
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-7 text-[12px] text-slate-400">
            Validity: {data.validityDays ?? 14} days. Indicative quotation, subject to space and equipment
            availability.
          </div>
        </div>
      </div>
    </Modal>
  );
}
