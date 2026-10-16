"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Dropdown, Input, Modal, Spin, Tag, Tooltip } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, DownOutlined, MobileOutlined, RightOutlined } from "@ant-design/icons";
import { useWarehouseContainer, useWarehouseContainers, type ContainerStampKind, type WarehouseContainer } from "@/hooks/useWarehouseRecords";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import {
  CONTAINER_STAMP_LABEL,
  CONTAINER_STATUS_TONE,
  KIND_LABEL,
  containerKind,
  containerStampBlocked,
  containerStampWrites,
} from "@/app/warehouse/_lib/containerPlan";
import { Badge, errorMessage, isManager, nf } from "@/app/warehouse/gate-log/_lib/gate";
import { btnDefault, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { ReasonModal } from "@/app/warehouse/gate-log/_components/job/ReleaseGatesPanel";
import { Card } from "../tabs/shared";
import { ContainerFormModal, type ContainerFormMode } from "./containerForm";
import { FillBar } from "./FillBar";
import { StuffingPlan } from "./StuffingPlan";
import { StrippingTally } from "./StrippingTally";

// One container and its houses — the container page. Its stamps in strict order (import:
// gate-in → start stripping → gate-out; export: gate-in → close with the seal → gate-out), the
// houses (export: the stuffing plan; import: the stripping tally), totals against the capacity
// of its type, and its log. A manager voids a wrong stamp with a reason, the last one first.

const CONTAINERS_HREF = "/warehouse?tab=containers";

const SEQUENCE: Record<"import" | "export", ContainerStampKind[]> = {
  import: ["gateIn", "strippingStart", "gateOut"],
  export: ["gateIn", "close", "gateOut"],
};
const COLUMN: Record<ContainerStampKind, "gateInAt" | "strippingStartedAt" | "closedAt" | "gateOutAt"> = {
  gateIn: "gateInAt",
  strippingStart: "strippingStartedAt",
  close: "closedAt",
  gateOut: "gateOutAt",
};

export function ContainerDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const manager = isManager(user);
  const api = useWarehouseContainer(id);
  const { update: updateRecord, remove, isSaving } = useWarehouseContainers();
  const c = api.container;
  const [form, setForm] = useState<ContainerFormMode | null>(null);
  const [stamping, setStamping] = useState<ContainerStampKind | null>(null);
  const [voiding, setVoiding] = useState<ContainerStampKind | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (api.isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="p-10 text-center text-slate-500">
        Container not found.{" "}
        <Link href={CONTAINERS_HREF} className="text-indigo-500">
          Back to Containers
        </Link>
      </div>
    );
  }

  const kind = containerKind(c.direction);
  const steps = SEQUENCE[kind].map((k) => ({ kind: k, label: CONTAINER_STAMP_LABEL[k], at: c[COLUMN[k]], blocked: containerStampBlocked(c, k) }));
  const lastDone = [...steps].reverse().find((s) => s.at);
  const by = (k: ContainerStampKind) => [...c.events].reverse().find((e) => e.kind === k)?.by ?? "";

  const doStamp = async (k: ContainerStampKind, extra: { seal?: string; plate?: string } = {}) => {
    try {
      const res = await api.stamp.mutateAsync({ kind: k, ...extra });
      if (res.outcome === "done") toast.success(`${CONTAINER_STAMP_LABEL[k]} stamped — logged on the container${k === "gateOut" && kind === "export" ? " and its houses" : ""}`);
      else toast.info(res.notice || `${CONTAINER_STAMP_LABEL[k]} was already stamped`);
      setStamping(null);
    } catch (e) {
      toast.error(errorMessage(e, `Failed to stamp ${CONTAINER_STAMP_LABEL[k]}`));
    }
  };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-start gap-2 flex-1 min-w-[260px]">
            <button
              onClick={() => router.push(CONTAINERS_HREF)}
              aria-label="Back to Containers"
              className="mt-1 text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
            >
              <ArrowLeftOutlined />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-bold text-slate-800 m-0 font-mono">{c.number}</h1>
                <Badge tone={kind === "export" ? "i" : "b"}>{KIND_LABEL[kind]}</Badge>
                <Badge tone={CONTAINER_STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-1">
                <span>
                  Type <span className="font-semibold text-slate-800">{c.equipment || "—"}</span>
                </span>
                <span>
                  Seal <span className="font-mono font-semibold text-slate-800">{c.seal || "—"}</span>
                </span>
                {(c.vessel || c.voyage) && (
                  <span>
                    Vessel <span className="font-semibold text-slate-800">{[c.vessel, c.voyage].filter(Boolean).join(" / ")}</span>
                  </span>
                )}
                {(c.bookingNumber || c.mblNumber) && (
                  <span>
                    Booking / MBL <span className="font-mono font-semibold text-slate-800">{[c.bookingNumber, c.mblNumber].filter(Boolean).join(" / ")}</span>
                  </span>
                )}
                {c.plate && (
                  <span>
                    {TERMS.plate} <span className="font-mono font-semibold text-slate-800">{c.plate}</span>
                  </span>
                )}
                {c.daysOnYard != null && <span>{c.daysOnYard} days on the yard</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {/* Container stamps in strict order; only the next one is primary. */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Container stamps">
              {steps.map((s, i) => {
                const first = steps.findIndex((x) => !x.at);
                const next = i === first && !s.blocked;
                return (
                  <Fragment key={s.kind}>
                    {i > 0 && <RightOutlined className="text-[10px] text-slate-300" aria-hidden />}
                    {s.at ? (
                      <StampTag
                        label={s.label}
                        at={s.at}
                        by={by(s.kind)}
                        onVoid={manager ? () => setVoiding(s.kind) : undefined}
                        voidReason={lastDone?.kind === s.kind ? null : "Void the later stamps first"}
                      />
                    ) : (
                      <Tooltip title={s.blocked ?? (next ? undefined : `${steps[first]?.label} first`)}>
                        <span className="inline-flex">
                          <button type="button" className={next ? btnPrimary : btnDefault} disabled={!!s.blocked || (i !== first && s.kind !== "gateOut")} onClick={() => setStamping(s.kind)}>
                            {s.label}
                          </button>
                        </span>
                      </Tooltip>
                    )}
                  </Fragment>
                );
              })}
            </div>
            <Link href={`/warehouse/floor/container/${c.id}`} className={btnDefault} title="The tally / stuffing list on a phone">
              <MobileOutlined /> Floor mode
            </Link>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "register", label: "Edit details…", onClick: () => setForm("register") },
                  { key: "schedule", label: "Schedule…", onClick: () => setForm("schedule") },
                  { key: "vgm", label: "Container VGM…", onClick: () => setForm("vgm") },
                  { type: "divider" },
                  { key: "delete", danger: true, label: "Delete…", onClick: () => setDeleting(true) },
                ],
              }}
            >
              <button type="button" className={btnDefault}>
                Actions <DownOutlined className="text-[10px]" />
              </button>
            </Dropdown>
          </div>
        </div>

        {c.shipmentUpdatesWaiting > 0 && (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={`${c.shipmentUpdatesWaiting} shipment update${c.shipmentUpdatesWaiting === 1 ? "" : "s"} from this container not delivered yet`}
            description="They keep retrying. Each house's gate job shows its own update and lets you retry or set it by hand."
          />
        )}
      </div>

      <div className="p-6 space-y-5">
        <Totals c={c} />
        {kind === "export" ? <StuffingPlan c={c} api={api} /> : <StrippingTally c={c} api={api} manager={manager} />}
        <ContainerHistory c={c} />
      </div>

      {stamping === "gateIn" || stamping === "strippingStart" ? (
        <ConfirmModal
          open
          onClose={() => setStamping(null)}
          onConfirm={() => doStamp(stamping)}
          title={CONTAINER_STAMP_LABEL[stamping]}
          description={`Stamp the ${CONTAINER_STAMP_LABEL[stamping].toLowerCase()} on ${c.number}? The stamp is logged with the time and who; only a manager can void it. ${containerStampWrites(c, stamping)}`}
          confirmLabel={CONTAINER_STAMP_LABEL[stamping]}
          loading={api.stamp.isPending}
        />
      ) : null}
      {(stamping === "close" || stamping === "gateOut") && (
        <SealPlateModal c={c} kind={stamping} saving={api.stamp.isPending} onClose={() => setStamping(null)} onSubmit={(v) => doStamp(stamping, v)} />
      )}

      <ReasonModal
        open={!!voiding}
        title={`Void ${voiding ? CONTAINER_STAMP_LABEL[voiding] : "stamp"}`}
        hint={`Clears the ${voiding ? CONTAINER_STAMP_LABEL[voiding].toLowerCase() : ""} stamp on ${c.number}. Who, when, the old stamp and the reason are logged.`}
        okText="Void stamp"
        danger
        onClose={() => setVoiding(null)}
        onSubmit={async (reason) => {
          try {
            const res = await api.voidStamp.mutateAsync({ kind: voiding!, reason });
            toast.success(`${CONTAINER_STAMP_LABEL[voiding!]} voided — logged on the container`);
            if (res.notice) toast.notify({ type: "warning", title: "Shipments may need correcting", description: res.notice });
          } catch (e) {
            toast.error(errorMessage(e, "Failed to void the stamp"));
            throw e;
          }
        }}
      >
        {voiding === "gateOut" && kind === "export" && (
          <p className="text-xs text-amber-700 mt-0">The houses that left with it come back into the warehouse. Their shipments are not changed back — correct them in Shipments if needed.</p>
        )}
      </ReasonModal>

      {form && (
        <ContainerFormModal
          mode={form}
          container={c}
          saving={isSaving}
          onClose={() => setForm(null)}
          onSubmit={async (input) => {
            const res = (await updateRecord(c.id, input)) as { container?: WarehouseContainer } | undefined;
            if (res?.container) api.onContainer(res.container);
          }}
        />
      )}
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          try {
            await remove(c.id);
            toast.success(`Container ${c.number} deleted`);
            router.push(CONTAINERS_HREF);
          } catch (e) {
            toast.error(errorMessage(e, "Failed to delete the container"));
            setDeleting(false);
          }
        }}
        title="Delete container"
        description={`Delete container ${c.number}? Only a container without stamps and without stuffed or tallied houses can be deleted; its planned houses are taken out of it.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

function StampTag({ label, at, by, onVoid, voidReason }: { label: string; at: string; by: string; onVoid?: () => void; voidReason: string | null }) {
  const tag = (
    <Tag color="success" icon={<CheckCircleOutlined />} className={`m-0 !px-2 !py-1 !text-[12px] ${onVoid ? "cursor-pointer" : ""}`}>
      <span className="font-semibold">{label}</span> <span className="font-mono">{formatDateTime(at)}</span>
      {by ? ` · ${by}` : ""}
      {onVoid && <DownOutlined className="ml-1 text-[9px]" />}
    </Tag>
  );
  if (!onVoid) return tag;
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          {
            key: "void",
            danger: true,
            disabled: !!voidReason,
            label: voidReason ? <Tooltip title={voidReason}>Void this stamp…</Tooltip> : "Void this stamp…",
            onClick: onVoid,
          },
        ],
      }}
    >
      <span className="inline-flex">{tag}</span>
    </Dropdown>
  );
}

// The close takes the seal number; the gate-out the truck that takes the container away (its plate
// goes to the shipments of an export container's stuffed houses).
function SealPlateModal({
  c,
  kind,
  saving,
  onClose,
  onSubmit,
}: {
  c: WarehouseContainer;
  kind: "close" | "gateOut";
  saving: boolean;
  onClose: () => void;
  onSubmit: (v: { seal?: string; plate?: string }) => void;
}) {
  const [value, setValue] = useState(kind === "close" ? c.seal : c.plate);
  const close = kind === "close";
  const exportOut = kind === "gateOut" && containerKind(c.direction) === "export";
  return (
    <Modal
      open
      title={`${CONTAINER_STAMP_LABEL[kind]} — ${c.number}`}
      okText={CONTAINER_STAMP_LABEL[kind]}
      okButtonProps={{ disabled: close && !value.trim(), danger: exportOut }}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => onSubmit(close ? { seal: value.trim() } : { plate: value.trim() })}
      destroyOnHidden
    >
      <p className="text-xs text-slate-500 mt-0">{containerStampWrites(c, kind, close ? "" : value.trim())} The stamp needs a connection and is logged; only a manager can void it.</p>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{close ? "Seal number (required)" : `Truck ${TERMS.plate.toLowerCase()} (optional)`}</span>
        <Input autoFocus value={value} maxLength={close ? 50 : 30} className="font-mono" onChange={(e) => setValue(e.target.value)} />
      </label>
    </Modal>
  );
}

function Totals({ c }: { c: WarehouseContainer }) {
  const t = c.totals;
  const tile = (label: string, value: string, sub?: string) => (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-[22px] leading-tight font-bold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {tile("Houses", String(c.positions.length))}
      {tile(TERMS.pieces, nf(t.pieces))}
      {tile(TERMS.weightKg, nf(t.kg), t.capacityKg ? `of ${nf(t.capacityKg)} kg` : undefined)}
      {tile(TERMS.volumeCbm, nf(t.cbm, 2), t.capacityCbm ? `of ${nf(t.capacityCbm)} cbm` : undefined)}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0 col-span-2 md:col-span-1">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">{TERMS.capacity}</div>
        <FillBar totals={t} />
        {t.overCapacity && <div className="mt-1 text-[11px] font-semibold text-red-600">Over capacity — check before stuffing</div>}
      </div>
    </div>
  );
}

function ContainerHistory({ c }: { c: WarehouseContainer }) {
  const events = [...c.events].reverse();
  return (
    <Card title="History" extra={`${c.events.length} event${c.events.length === 1 ? "" : "s"}`}>
      {events.length === 0 ? (
        <div className="text-xs text-slate-400">Nothing logged yet.</div>
      ) : (
        <ul className="list-none m-0 p-0">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="py-1.5 border-b border-slate-100 last:border-b-0 text-xs flex flex-wrap gap-x-3">
              <span className="font-mono text-slate-500 w-[120px] shrink-0">{formatDateTime(e.at)}</span>
              <span className="font-semibold text-slate-800">{e.label}</span>
              {e.by && <span className="text-slate-500">{e.by}</span>}
              {e.detail && <span className="basis-full pl-[132px] text-[11px] text-slate-500 break-words">{e.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
