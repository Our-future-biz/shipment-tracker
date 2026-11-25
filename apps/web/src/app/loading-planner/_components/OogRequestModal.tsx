"use client";

import { Button } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { linerText, oogRequestText, type OogRequest } from "../_lib/oogRequest";

const n = (value: number) => value.toLocaleString("en-US");

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={LABEL_TEXT}>{label}</div>
      <div className="text-[13px] text-slate-900 tabular-nums">{children}</div>
    </div>
  );
}

// The out-of-gauge request of one container (Council Outlay 14, P10): what a carrier's form asks,
// as figures and as text to copy. Nothing is sent or saved: the figures are the plan's, as it
// stands on screen.
export function OogRequestModal({ request, planName, onClose }: { request: OogRequest | null; planName: string; onClose: () => void }) {
  const message = useMessages();
  const text = request ? oogRequestText(request, planName) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      message.success("Copied: paste it into the carrier's form or an e-mail");
    } catch {
      message.error("Could not copy: select the text below and copy it by hand.");
    }
  };
  const front = request?.flatRack ? "left end" : "front wall";
  const back = request?.flatRack ? "right end" : "door end";

  return (
    <AppModal
      open={request !== null}
      onClose={onClose}
      size="large"
      title={request ? `Out-of-gauge request · #${request.number} ${request.type}` : "Out-of-gauge request"}
      subtitle="What the carrier's out-of-gauge form asks, measured on the cargo as this plan stows it."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button type="primary" icon={<CopyOutlined />} onClick={copy}>
            Copy as text
          </Button>
        </div>
      }
    >
      {request && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Fact label="Cargo overall (L × W × H)">
              {n(request.overall.length)} × {n(request.overall.width)} × {n(request.overall.height)} cm
            </Fact>
            <Fact label="In gauge up to">
              {n(request.inGauge.length)} × {n(request.inGauge.width)} × {n(request.inGauge.height)} cm
            </Fact>
            <Fact label="Cargo weight">
              {n(request.weightKg)} kg <span className="text-slate-500">· gross about {n(request.grossKg)} kg</span>
            </Fact>
            <Fact label="Over-width">
              left {n(request.overWidth.left)} cm · right {n(request.overWidth.right)} cm
            </Fact>
            <Fact label="Over-height">{n(request.overHeight)} cm</Fact>
            <Fact label="Over-length">
              {front} {n(request.overLength.front)} cm · {back} {n(request.overLength.back)} cm
            </Fact>
            <Fact label="Centre of gravity">
              {n(request.gravity.fromFront)} cm from the {front}, {n(request.gravity.fromLeft)} cm from the left side, about {n(request.gravity.height)} cm high
            </Fact>
            <Fact label="Lost slots, indicative">{request.lostSlots > 0 ? `${n(request.lostSlots)} (20' slots)` : "none"}</Fact>
          </div>
          {/* Past the in-gauge figure but within the liner's limit: out by 0 above, said here as in the text to copy. */}
          {request.liner.length > 0 && (
            <p className="m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="status">
              Within the liner&apos;s limit, to be confirmed by the liner: {linerText(request.liner)}.
            </p>
          )}
          <pre aria-label="The request as text" className="m-0 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-800">
            {text}
          </pre>
          <p className={`${HINT} m-0`}>
            Measured against the app&apos;s out-of-gauge table, the same the quote uses. The centre of gravity takes each piece&apos;s weight at its middle. The carrier&apos;s own equipment and
            stowage planner decide; lost slots are counted with the cargo centred.
          </p>
        </div>
      )}
    </AppModal>
  );
}
