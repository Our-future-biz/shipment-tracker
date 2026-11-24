"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Dropdown, Input, Tooltip } from "antd";
import { DisconnectOutlined, DownOutlined, PlusOutlined, SwapOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { BoxFillChip } from "@/app/co-loading/_components/BoxFillChip";
import { containersWords, fillWords } from "@/app/co-loading/_lib/boxUtilization";
import { CUTOFF_TONE, cutoffState, cutoffWords, linkNeedsReason, SAILING_STAGE_LABEL, SAILING_STAGE_TONE, sailingHref, sailingTitle, stageOf } from "@/app/co-loading/_lib/sailings";
import { useShipmentSailing, type ShipmentSailingItem } from "@/hooks/useCoLoadingServices";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";

/** A shipment as its Co-Loading chip needs it. */
interface ChipShipment {
  id: string;
  jobNumber: string;
  serviceName?: string | null;
  freightMode?: string | null;
  loadType?: string | null;
}

/** The sailing's place in the header, in a few words: "WEEK 51 · cut-off 03.12.2026 · box 13%". */
export function sailingChipWords(s: { vessel: string; voyage: string; cutoffDate: string | null; fill?: { fullPct: number | null } }, formatDay: (d: string) => string = (d) => d): string {
  return [sailingTitle(s), s.cutoffDate ? `cut-off ${formatDay(s.cutoffDate)}` : "", s.fill && s.fill.fullPct !== null ? `box ${s.fill.fullPct}%` : ""].filter(Boolean).join(" · ");
}

/** One sailing to pick, as a row: its name and service, its dates, how full it is. */
function SailingChoice({ sailing, picked, onPick, today }: { sailing: ShipmentSailingItem; picked: boolean; onPick: () => void; today: string }) {
  const near = cutoffWords(sailing.cutoffDate, today);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={picked}
      onClick={onPick}
      className={`flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-left ${picked ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{sailingTitle(sailing)}</span>
        <span className="block text-[12px] text-slate-500">
          {sailing.serviceLabel} · {containersWords(sailing)}
          {linkNeedsReason(sailing) && <span className="ml-1 font-medium text-amber-700">· {SAILING_STAGE_LABEL[stageOf(sailing)].toLowerCase()}</span>}
        </span>
      </span>
      <span className="text-[12px] text-slate-700 tabular-nums">
        Cut-off {formatDate(sailing.cutoffDate) || "—"}
        {near && <span className={`ml-1 font-medium ${CUTOFF_TONE[cutoffState(sailing.cutoffDate, today)]}`}>{near}</span>}
        <span className="mx-1.5 text-slate-300">·</span>
        Departure {formatDate(sailing.departureDate) || "—"}
      </span>
      {sailing.fill && <BoxFillChip fill={sailing.fill} />}
    </button>
  );
}

// A shipment's Co-Loading Concept sailing, in the header of its own page on every tab (Council Outlay
// 14, A1): the sailing it is on, as a link, with its cut-off and how full its box is - or, for a
// shipment Co-Loading is for and that is on none, "Put on a sailing". Moving it on and taking it off
// are here too. The calls are the sailing page's own, so the server holds to the same rules.
// Nothing shows for a shipment Co-Loading is not for.
export function ShipmentSailingChip({ shipment, className }: { shipment: ChipShipment; className: string }) {
  const kind = [shipment.serviceName, shipment.freightMode, shipment.loadType].map((v) => (v ?? "").trim()).join("|");
  const { place, link, unlink, move } = useShipmentSailing(shipment.id, kind);
  const message = useMessages();
  const today = businessToday();
  // "put": on no sailing, picking one. "move": on one, picking another of its service with the reason. "remove": asked before it is taken off.
  const [dialog, setDialog] = useState<"put" | "move" | "remove" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPicked(null);
    setReason("");
    setError(null);
  }, [dialog]);

  if (!place) return null;
  const { on, services, coming } = place;
  if (!on && services.length === 0) return null;

  const busy = link.isPending || unlink.isPending || move.isPending;
  // A shipment moves only within its sailing's service, never onto the sailing it is on.
  const choices = dialog === "move" && on ? coming.filter((c) => c.serviceId === on.serviceId && c.id !== on.id) : coming;
  const close = () => !busy && setDialog(null);
  // Putting it on a sailing closed for cargo asks why (Council Outlay 14, C3).
  const pickedNeedsReason = choices.some((c) => c.id === picked && linkNeedsReason(c));

  const confirm = async () => {
    try {
      if (dialog === "remove" && on) {
        await unlink.mutateAsync(on.id);
        message.success(`${shipment.jobNumber} taken off ${sailingTitle(on)}`);
      } else {
        const to = choices.find((c) => c.id === picked);
        if (!to) return setError("Pick the sailing.");
        if (dialog === "move" && on) {
          if (!reason.trim()) return setError("Say why the shipment is moved.");
          await move.mutateAsync({ fromSailingId: on.id, toSailingId: to.id, reason: reason.trim() });
          message.success(`${shipment.jobNumber} moved to ${sailingTitle(to)}`);
        } else {
          if (linkNeedsReason(to) && !reason.trim()) return setError(`This sailing is ${SAILING_STAGE_LABEL[stageOf(to)].toLowerCase()}: say why the shipment still goes on it.`);
          await link.mutateAsync({ sailingId: to.id, reason: linkNeedsReason(to) ? reason.trim() : undefined });
          message.success(`${shipment.jobNumber} put on ${sailingTitle(to)}`);
        }
      }
      setDialog(null);
    } catch (err) {
      // In the server's words: on another sailing meanwhile, the service closed, not this box's kind of shipment.
      setError(apiErrorMessage(err));
    }
  };

  const closedHint = "Its service is closed: nothing moves until a manager reopens it.";
  return (
    <>
      {on ? (
        <span className="inline-flex items-center">
          <Tooltip title={`${on.serviceLabel} · ${on.fill ? fillWords(on.fill) : "box not read"}`}>
            <Link href={sailingHref(on)} className={`${className} !rounded-r-none`} aria-label={`Co-Loading sailing ${sailingChipWords(on, formatDate)}`}>
              <span className="text-slate-500">Co-Loading</span>
              <span className="font-semibold">{sailingTitle(on)}</span>
              {on.cutoffDate && (
                <span className={CUTOFF_TONE[cutoffState(on.cutoffDate, today)] || "text-slate-500"}>cut-off {formatDate(on.cutoffDate)}</span>
              )}
              {on.fill && on.fill.fullPct !== null && <span className={on.fill.fullPct > 100 ? "font-semibold text-red-600" : "text-slate-500"}>box {on.fill.fullPct}%</span>}
              {stageOf(on) !== "open" && <span className={SAILING_STAGE_TONE[stageOf(on)] === "amber" ? "font-medium text-amber-700" : "text-slate-500"}>{SAILING_STAGE_LABEL[stageOf(on)].toLowerCase()}</span>}
            </Link>
          </Tooltip>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                { key: "move", disabled: on.serviceClosed, icon: <SwapOutlined />, label: on.serviceClosed ? <span title={closedHint}>Move to another sailing</span> : "Move to another sailing" },
                { key: "remove", danger: !on.serviceClosed, disabled: on.serviceClosed, icon: <DisconnectOutlined />, label: on.serviceClosed ? <span title={closedHint}>Remove from sailing</span> : "Remove from sailing" },
              ],
              onClick: ({ key }) => setDialog(key === "move" ? "move" : "remove"),
            }}
          >
            <button type="button" className={`${className} !rounded-l-none !border-l-0 !px-2`} aria-label="Move or remove from the sailing">
              <DownOutlined className="text-[10px]" />
            </button>
          </Dropdown>
        </span>
      ) : (
        <button type="button" className={className} onClick={() => setDialog("put")}>
          <PlusOutlined />
          Put on a sailing
        </button>
      )}

      <AppModal
        open={dialog === "put" || dialog === "move"}
        onClose={close}
        size="large"
        title={dialog === "move" && on ? `Move ${shipment.jobNumber} to another sailing` : `Put ${shipment.jobNumber} on a sailing`}
        subtitle={
          dialog === "move" && on
            ? `It leaves ${sailingTitle(on)}. That sailing's history keeps where it went and why.`
            : "The sailings still to come of the services for its Service Name, the soonest first."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="primary" loading={busy} disabled={choices.length === 0} onClick={confirm}>
              {dialog === "move" ? "Move" : "Put on the sailing"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {choices.length === 0 ? (
            <p className="m-0 text-[13px] text-slate-700" role="status">
              No {dialog === "move" ? "other " : ""}sailing still to come. Create the next one on the service&apos;s page:{" "}
              {(dialog === "move" && on ? [{ id: on.serviceId, name: on.serviceLabel }] : services).map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ", "}
                  <Link href={`/co-loading/${s.id}`} className={LINK}>
                    {s.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          ) : (
            <div role="radiogroup" aria-label="Sailing" className="flex flex-col gap-2">
              {choices.map((c) => (
                <SailingChoice
                  key={c.id}
                  sailing={c}
                  today={today}
                  picked={picked === c.id}
                  onPick={() => {
                    setPicked(c.id);
                    setError(null);
                  }}
                />
              ))}
            </div>
          )}
          {(dialog === "move" || (dialog === "put" && pickedNeedsReason)) && choices.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_TEXT}>Why</span>
              <Input.TextArea
                aria-label={dialog === "move" ? "Why the shipment is moved" : "Why the shipment still goes on this sailing"}
                rows={2}
                maxLength={300}
                placeholder={dialog === "move" ? "e.g. Box full, rolled to the next week" : "e.g. Carrier accepted late cargo"}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
              />
            </label>
          )}
          {choices.length > 0 && <p className={`${HINT} m-0`}>A box past its cut-off or over its limit still takes the shipment: the marks say so, and you decide.</p>}
          {error && (
            <p className="m-0 text-[13px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </AppModal>

      <AppModal
        open={dialog === "remove"}
        onClose={close}
        title={`Remove ${shipment.jobNumber} from ${on ? sailingTitle(on) : "the sailing"}?`}
        subtitle="The sailing's history keeps who took it off. It can be put on a sailing again."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={close} disabled={busy}>
              Keep it
            </Button>
            <Button danger type="primary" loading={busy} onClick={confirm}>
              Remove
            </Button>
          </div>
        }
      >
        {error ? (
          <p className="m-0 text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : (
          <p className="m-0 text-[13px] text-slate-700">Its cargo leaves the box&apos;s figures at once.</p>
        )}
      </AppModal>
    </>
  );
}
