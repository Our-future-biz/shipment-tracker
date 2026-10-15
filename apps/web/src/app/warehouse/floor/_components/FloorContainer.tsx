"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircleFilled, ClockCircleOutlined } from "@ant-design/icons";
import { Input } from "antd";
import { useWarehouseContainer, type ContainerHouse, type WarehouseContainer } from "@/hooks/useWarehouseRecords";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import {
  CONTAINER_STAMP_LABEL,
  CONTAINER_STATUS_TONE,
  KIND_LABEL,
  QUEUEABLE_CONTAINER_STAMPS,
  TALLY_CONDITIONS,
  TALLY_LABEL,
  TALLY_TONE,
  containerKind,
  containerStampBlocked,
  nextContainerStamp,
  openHouses,
  strippingComplete,
  tallyExempt,
  tallyHouses,
} from "@/app/warehouse/_lib/containerPlan";
import { Badge, hhmm, nf } from "@/app/warehouse/gate-log/_lib/gate";
import { useFloorQueue, type SubmitResult } from "../_lib/useFloorQueue";
import { applyPendingContainer, pendingInContainer } from "../_lib/queue";
import { Chip, FloorCard, NeedsConnection, Stepper, bigDanger, bigDefault, bigPrimary } from "./floorUi";

// A container on the phone (scan its number): an import container's stripping tally — tick each
// house off as it comes out (pieces counted, condition, location), or mark it short / not arrived
// with a reason — and an export container's stuffing — mark each planned house stuffed as it goes
// in. The container's gate-in and the start of stripping are stamped here too. All of it works
// offline (kept on the phone with the time it was done). The close with the seal and the gate-out
// need a connection and the desk page: they are checked against all houses when stamped.

type Draft = { pieces: number; condition: string; location: string; reason: string };

export function FloorContainer({ id }: { id: string }) {
  const q = useFloorQueue();
  const { container: base, isLoading } = useWarehouseContainer(id);
  const c = useMemo(() => (base ? applyPendingContainer(base, q.items) : undefined), [base, q.items]);
  const [confirm, setConfirm] = useState<"gateIn" | "strippingStart" | null>(null);
  // A second tap while the first stamp is on its way would send a second write.
  const [stamping, setStamping] = useState(false);
  const toast = useToast();

  if (!c) {
    return <div className="py-10 text-center text-[15px] text-slate-500">{isLoading ? "Loading…" : "Container not found (or not loaded while offline)."}</div>;
  }
  const kind = containerKind(c.direction);
  const waiting = pendingInContainer(q.items, c.id);
  const next = nextContainerStamp(c);
  const queueable = next && QUEUEABLE_CONTAINER_STAMPS.includes(next) ? (next as "gateIn" | "strippingStart") : null;

  const report = (res: SubmitResult, what: string) => {
    if (res.type === "sent") {
      if (res.outcome === "done" && !res.notice) toast.success(what);
      else if (res.notice) toast.info(res.notice);
      else toast.info(`${what} — already there`);
    } else if (res.type === "queued") toast.info(`${what} — recorded at ${hhmm(res.recordedAt)}, waiting to send`);
    else toast.error(res.type === "refused" ? res.error : `${what} — not kept`);
    return res.type === "sent" || res.type === "queued";
  };

  const stamp = async (k: "gateIn" | "strippingStart") => {
    if (stamping) return;
    setStamping(true);
    try {
      const res = await q.submit({ kind: "containerStamp", label: CONTAINER_STAMP_LABEL[k], payload: { containerId: c.id, containerNumber: c.number, kind: k } });
      report(res, `${CONTAINER_STAMP_LABEL[k]} stamped`);
    } finally {
      setStamping(false);
      setConfirm(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-28">
      <FloorCard>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Container</div>
            <div className="break-all font-mono text-[22px] font-bold leading-tight text-slate-900">{c.number}</div>
          </div>
          <Badge tone={CONTAINER_STATUS_TONE[c.status] ?? ""} className="!text-[12px]">
            {c.status}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          <Badge tone={kind === "export" ? "i" : "b"} className="!text-[12px]">
            {KIND_LABEL[kind]}
          </Badge>
          <span>{c.equipment || "—"}</span>
          {c.seal && <span className="font-mono">seal {c.seal}</span>}
          {waiting.length > 0 && <span className="font-semibold text-amber-700">{waiting.length} waiting to send</span>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Tile label="Houses" value={String(c.positions.length)} />
          <Tile label={TERMS.pieces} value={nf(c.totals.pieces)} />
          <Tile label={kind === "export" ? "Stuffed" : "Done"} value={`${kind === "export" ? c.positions.filter((h) => h.stuffedAt).length : tallyHouses(c).length - openHouses(c).length}`} />
        </div>
      </FloorCard>

      {kind === "import" && strippingComplete(c) && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-[16px] font-bold text-emerald-700">Stripping complete — every house accounted for</div>}

      {kind === "import" ? <TallyList c={c} report={report} /> : <StuffList c={c} report={report} />}

      {next && !queueable && (
        <FloorCard title={CONTAINER_STAMP_LABEL[next]}>
          <p className="m-0 text-[14px] text-slate-600">
            {containerStampBlocked(c, next) ?? `${CONTAINER_STAMP_LABEL[next]} is stamped on the container page — it needs a connection and is checked against every house.`}
          </p>
          {!q.online && (
            <div className="mt-2">
              <NeedsConnection what={CONTAINER_STAMP_LABEL[next]} />
            </div>
          )}
          <Link href={`/warehouse/containers/${c.id}`} className={`${bigDefault} mt-3 flex items-center justify-center`}>
            Open the container page
          </Link>
        </FloorCard>
      )}

      {queueable && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto max-w-[560px]">
            {containerStampBlocked(c, queueable) && <div className="mb-2 text-[13px] font-semibold text-red-600">{containerStampBlocked(c, queueable)}</div>}
            <button type="button" className={bigPrimary} disabled={!!containerStampBlocked(c, queueable) || stamping} onClick={() => setConfirm(queueable)}>
              {CONTAINER_STAMP_LABEL[queueable]}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          open
          onClose={() => setConfirm(null)}
          onConfirm={() => stamp(confirm)}
          title={CONTAINER_STAMP_LABEL[confirm]}
          description={`Stamp the ${CONTAINER_STAMP_LABEL[confirm].toLowerCase()} on ${c.number}? Only a manager can void it.${
            q.online ? "" : ` No connection — it will be sent when the phone is back online, with the time now (${hhmm(new Date().toISOString())}).`
          }`}
          confirmLabel={CONTAINER_STAMP_LABEL[confirm]}
          loading={stamping}
        />
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[18px] font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

const by = (at: string | null, who: string) => `${at ? formatDateTime(at) : ""}${who ? ` · ${who}` : ""}`;

// ─── Import: the stripping tally ───────────────────────────────

function TallyList({ c, report }: { c: WarehouseContainer; report: (res: SubmitResult, what: string) => boolean }) {
  const q = useFloorQueue();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const blocked = !c.gateInAt ? "Stamp the container gate-in first" : c.gateOutAt ? "The container has gone out" : null;

  const draftOf = (h: ContainerHouse): Draft => drafts[h.movementId] ?? { pieces: h.pieces, condition: "Good", location: "", reason: "" };
  const set = (h: ContainerHouse, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [h.movementId]: { ...draftOf(h), ...patch } }));

  const send = async (h: ContainerHouse, outcome: "received" | "short" | "not_arrived") => {
    const d = draftOf(h);
    const ref = h.positionRef || h.gateRef;
    setBusy(true);
    try {
      const res = await q.submit({
        kind: "tally",
        movement: { movementId: h.movementId, ref },
        label: `${TALLY_LABEL[outcome]} · ${c.number}`,
        payload: {
          containerId: c.id,
          containerNumber: c.number,
          tally: { outcome, pieces: d.pieces, condition: d.condition, location: d.location.trim(), reason: d.reason.trim() },
        },
      });
      if (report(res, outcome === "received" ? `${ref} ticked off — received` : `${ref} marked ${TALLY_LABEL[outcome]!.toLowerCase()}`)) setOpenId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FloorCard title={`${TERMS.strippingTally} (${openHouses(c).length} open)`}>
      {blocked && <div className="mb-2 text-[14px] font-semibold text-red-600">{blocked}</div>}
      <ul className="-mx-4 m-0 list-none p-0">
        {c.positions.map((h) => {
          const ref = h.positionRef || h.gateRef;
          const done = !!h.tallyOutcome;
          const pending = h.tickedBy.endsWith("waiting to send");
          const needsWeigh = h.needsReweigh && h.reweighKg == null;
          const d = draftOf(h);
          // Old register links and inbound cargo are not tallied (the server refuses them too).
          const exempt = done ? null : tallyExempt(h, c.direction);
          const open = openId === h.movementId && !done && !exempt;
          return (
            <li key={h.id} className="border-t border-slate-100 px-4 py-3 first:border-t-0">
              <button
                type="button"
                className="flex w-full min-h-[48px] items-center gap-3 bg-transparent border-none p-0 text-left cursor-pointer"
                disabled={done || !!blocked || !!exempt}
                onClick={() => setOpenId(open ? null : h.movementId)}
              >
                {done ? (
                  pending ? <ClockCircleOutlined className="text-[22px] text-amber-500" /> : <CheckCircleFilled className={`text-[22px] ${h.tallyOutcome === "received" ? "text-emerald-500" : "text-amber-500"}`} />
                ) : (
                  <span className="h-6 w-6 rounded-full border-2 border-indigo-500" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[16px] font-bold text-slate-900">{ref}</span>
                  <span className="block truncate text-[13px] text-slate-600">
                    {h.customer || "—"} · {nf(h.pieces)} pcs expected
                  </span>
                  {done && (
                    <span className="block text-[13px] text-slate-500">
                      <Badge tone={TALLY_TONE[h.tallyOutcome] ?? ""}>{TALLY_LABEL[h.tallyOutcome] ?? h.tallyOutcome}</Badge>
                      {h.tallyPieces != null ? ` ${h.tallyPieces} pcs` : ""} {by(h.tickedAt, h.tickedBy)}
                    </span>
                  )}
                  {exempt && <span className="block text-[13px] text-slate-500">Not tallied. {exempt}</span>}
                  {!done && !exempt && needsWeigh && <span className="block text-[13px] font-semibold text-red-600">Re-weigh first (LCL)</span>}
                </span>
              </button>
              {open && (
                <div className="mt-3 flex flex-col gap-3">
                  {needsWeigh && (
                    <Link href={`/warehouse/floor/${h.movementId}?view=reweigh`} className={`${bigPrimary} flex items-center justify-center`}>
                      {TERMS.reweigh} {ref}
                    </Link>
                  )}
                  <Stepper label="Pieces counted" value={d.pieces} onChange={(v) => set(h, { pieces: v })} />
                  {d.pieces !== h.pieces && (
                    <div className="text-[13px] font-semibold text-amber-700">
                      {d.pieces < h.pieces ? "Short" : "Over"} {Math.abs(h.pieces - d.pieces)} — record an exception after the tally (Damage / short / over)
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Condition">
                    {TALLY_CONDITIONS.map((x) => (
                      <Chip key={x} on={d.condition === x} tone={x === "Good" ? "indigo" : "red"} onClick={() => set(h, { condition: x })}>
                        {x}
                      </Chip>
                    ))}
                  </div>
                  <Input value={d.location} placeholder="Location (zone / rack)" maxLength={100} onChange={(e) => set(h, { location: e.target.value })} className="!h-12 !text-[16px]" />
                  <button type="button" className={bigPrimary} disabled={busy || needsWeigh} onClick={() => send(h, "received")}>
                    Tick received
                  </button>
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    value={d.reason}
                    placeholder="Reason — for short / not arrived"
                    onChange={(e) => set(h, { reason: e.target.value })}
                    className="!text-[16px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={bigDefault} disabled={busy || !d.reason.trim()} onClick={() => send(h, "short")}>
                      {TERMS.short}
                    </button>
                    <button type="button" className={bigDanger} disabled={busy || !d.reason.trim()} onClick={() => send(h, "not_arrived")}>
                      {TERMS.notArrived}
                    </button>
                  </div>
                  <Link href={`/warehouse/floor/${h.movementId}`} className="text-center text-[14px] font-semibold text-indigo-600 underline">
                    Open position {ref}
                  </Link>
                </div>
              )}
            </li>
          );
        })}
        {c.positions.length === 0 && <li className="px-4 py-3 text-[15px] text-slate-500">No houses in this container — they are added on the container page.</li>}
      </ul>
    </FloorCard>
  );
}

// ─── Export: stuffing ─────────────────────────────────────────

function StuffList({ c, report }: { c: WarehouseContainer; report: (res: SubmitResult, what: string) => boolean }) {
  const q = useFloorQueue();
  const [busy, setBusy] = useState<string | null>(null);
  const blocked = !c.gateInAt ? "Stamp the container gate-in first — it must be at the dock" : c.closedAt || c.gateOutAt ? "The stuffing is closed" : null;

  const toggle = async (h: ContainerHouse) => {
    const ref = h.positionRef || h.gateRef;
    const stuffed = !h.stuffedAt;
    setBusy(h.movementId);
    try {
      const res = await q.submit({
        kind: "stuffed",
        movement: { movementId: h.movementId, ref },
        label: `${stuffed ? "Stuffed" : "Taken back out"} · ${c.number}`,
        payload: { containerId: c.id, containerNumber: c.number, stuffed },
      });
      report(res, `${ref} ${stuffed ? "stuffed" : "taken back out"}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <FloorCard title={`${TERMS.stuffingPlan} (${c.positions.filter((h) => h.stuffedAt).length} of ${c.positions.length} stuffed)`}>
      {blocked && <div className="mb-2 text-[14px] font-semibold text-red-600">{blocked}</div>}
      <ul className="-mx-4 m-0 list-none p-0">
        {c.positions.map((h, i) => {
          const ref = h.positionRef || h.gateRef;
          const pending = h.stuffedBy.endsWith("waiting to send");
          return (
            <li key={h.id} className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0">
              <span className="w-6 text-center text-[14px] font-bold tabular-nums text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[16px] font-bold text-slate-900">{ref}</span>
                <span className="block truncate text-[13px] text-slate-600">
                  {h.customer || "—"} · {nf(h.pieces)} pcs · {nf(h.weightKg)} kg
                </span>
                {h.stuffedAt && <span className="block text-[13px] text-slate-500">{pending ? "Waiting to send" : `Stuffed ${by(h.stuffedAt, h.stuffedBy)}`}</span>}
              </span>
              <button
                type="button"
                aria-pressed={!!h.stuffedAt}
                disabled={!!blocked || busy === h.movementId}
                onClick={() => toggle(h)}
                className={`min-h-[48px] min-w-[112px] rounded-xl border px-3 text-[15px] font-bold cursor-pointer disabled:opacity-50 ${
                  h.stuffedAt ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-indigo-500 bg-indigo-600 text-white"
                }`}
              >
                {h.stuffedAt ? "Stuffed ✓" : "Stuff"}
              </button>
            </li>
          );
        })}
        {c.positions.length === 0 && <li className="px-4 py-3 text-[15px] text-slate-500">Nothing planned — the stuffing plan is made on the container page.</li>}
      </ul>
    </FloorCard>
  );
}
