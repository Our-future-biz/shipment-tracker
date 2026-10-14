"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Checkbox, Dropdown, Input, InputNumber, Modal, Select, Tooltip } from "antd";
import { DeleteOutlined, DownOutlined } from "@ant-design/icons";
import { useGateLog } from "@/hooks/useGateLog";
import type { useWarehouseContainer, WarehouseContainer, ContainerHouse } from "@/hooks/useWarehouseRecords";
import { api as apiClient } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { TALLY_CONDITIONS, TALLY_LABEL, TALLY_TONE, openHouses, planCandidates, strippingComplete, tallyExempt, tallyHouses } from "@/app/warehouse/_lib/containerPlan";
import { stageLabel, stageTone } from "@/app/warehouse/_lib/lifecycle";
import { Badge, errorMessage, nf } from "@/app/warehouse/gate-log/_lib/gate";
import { btnDefault, btnInline, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { ReasonModal } from "@/app/warehouse/gate-log/_components/job/ReleaseGatesPanel";
import { ReweighModal } from "@/app/warehouse/gate-log/_components/job/ReweighSection";
import { Card } from "../tabs/shared";

// The stripping tally of an import container: after its gate-in each house is counted (pieces,
// condition, location) and ticked off. Ticking a house off RECEIVES it — its "Received in
// warehouse" date is the day of the tick, its free time starts, and its shipment gets the
// received date and the WCZ reference. LCL cargo is re-weighed first. A house not (fully) there is
// marked short / not arrived with a reason; a count that differs offers the Short / Over
// exception. Stripping is complete when every house is accounted for. A manager voids a tick.

type Api = ReturnType<typeof useWarehouseContainer>;
type Draft = { pieces: number | null; condition: string; location: string; note: string };

const th = "text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
const td = "px-3 py-1.5 align-middle";

export function StrippingTally({ c, api, manager }: { c: WarehouseContainer; api: Api; manager: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { movements } = useGateLog();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reasonFor, setReasonFor] = useState<{ h: ContainerHouse; outcome: "short" | "not_arrived" } | null>(null);
  const [voidFor, setVoidFor] = useState<ContainerHouse | null>(null);
  const [reweighFor, setReweighFor] = useState<ContainerHouse | null>(null);
  const [suggestion, setSuggestion] = useState<{ h: ContainerHouse; type: "Short" | "Over"; pieces: number } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const gone = !!c.gateOutAt;

  const candidates = useMemo(() => (gone ? [] : planCandidates(movements, c.direction, c.id)), [movements, c.direction, c.id, gone]);
  const draftOf = (h: ContainerHouse): Draft => drafts[h.movementId] ?? { pieces: h.pieces || null, condition: "Good", location: "", note: "" };
  const setDraft = (h: ContainerHouse, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [h.movementId]: { ...draftOf(h), ...patch } }));

  const tallyBlocked = !c.gateInAt ? "Stamp the container gate-in first — houses are tallied when the container is stripped" : gone ? "The container has gone out" : null;
  const open = openHouses(c).length;
  const tallied = tallyHouses(c).length;
  const complete = strippingComplete(c);

  const tally = async (h: ContainerHouse, outcome: "received" | "short" | "not_arrived", reason = "") => {
    const d = draftOf(h);
    try {
      const res = await api.tally.mutateAsync({
        movementId: h.movementId,
        tally: { outcome, pieces: d.pieces, condition: d.condition, location: d.location.trim(), note: d.note.trim(), reason },
      });
      const ref = h.positionRef || h.gateRef;
      if (res.outcome !== "done") toast.info(res.notice);
      else if (outcome === "received") toast.success(`${ref} ticked off — received; its shipment gets the received date`);
      else toast.success(`${ref} marked ${TALLY_LABEL[outcome]!.toLowerCase()} — logged`);
      if (res.suggestException) setSuggestion({ h, ...res.suggestException });
      setDrafts((all) => {
        const next = { ...all };
        delete next[h.movementId];
        return next;
      });
    } catch (e) {
      toast.error(errorMessage(e, "Failed to record the tally"));
      throw e;
    }
  };

  const recordException = async () => {
    if (!suggestion) return;
    try {
      await apiClient.warehouse.gateExceptionCreate(suggestion.h.movementId, {
        exception: { type: suggestion.type, pieces: suggestion.pieces, container: c.number, source: "tally", note: `Found at the stripping tally of container ${c.number}` },
      });
      toast.success(`${suggestion.type} recorded on ${suggestion.h.positionRef || suggestion.h.gateRef} — the cargo is on hold until it is resolved`);
      setSuggestion(null);
      queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-records", "containers"] });
    } catch (e) {
      toast.error(errorMessage(e, "Failed to record the exception"));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {c.positions.length > 0 &&
        (complete ? (
          <Alert type="success" showIcon message={`Stripping complete${c.strippingCompletedAt ? ` — ${formatDateTime(c.strippingCompletedAt)}` : ""}`} description="Every house is accounted for. The container can gate out." />
        ) : c.gateInAt ? (
          <Alert type="info" showIcon message={`${tallied - open} of ${tallied} houses accounted for`} description="Tick each house off as it comes out of the container, or mark it short / not arrived with a reason." />
        ) : null)}

      {suggestion && (
        <Alert
          type="warning"
          showIcon
          message={`${suggestion.h.positionRef || suggestion.h.gateRef}: ${suggestion.type.toLowerCase()} ${suggestion.pieces} pc${suggestion.pieces === 1 ? "" : "s"} against the expected ${suggestion.h.pieces}`}
          description="Record it as an exception? While it is open the cargo is on hold."
          action={
            <div className="flex flex-col gap-1.5">
              <button type="button" className={btnPrimary} onClick={recordException}>
                Record {suggestion.type.toLowerCase()} — {suggestion.pieces} pc{suggestion.pieces === 1 ? "" : "s"}
              </button>
              <button type="button" className={btnDefault} onClick={() => setSuggestion(null)}>
                Not now
              </button>
            </div>
          }
        />
      )}

      <Card title={TERMS.strippingTally} extra={tallyBlocked ?? `${open} open`} bodyClassName="p-0">
        {c.positions.length === 0 ? (
          <div className="p-4 text-xs text-slate-400">No houses in this container yet — add the outbound positions it brings.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className={th}>{TERMS.warehouseRef}</th>
                  <th className={th}>Customer</th>
                  <th className={`${th} !text-right`}>Expected</th>
                  <th className={th}>Counted</th>
                  <th className={th}>Condition</th>
                  <th className={th}>Location</th>
                  <th className={th}>{TERMS.reweigh}</th>
                  <th className={th}>Tally</th>
                  <th className={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {c.positions.map((h) => {
                  const d = draftOf(h);
                  const done = !!h.tallyOutcome;
                  const ref = h.positionRef || h.gateRef;
                  const needsWeigh = h.needsReweigh && h.reweighKg == null;
                  // Old register links and inbound cargo are not tallied (the server refuses them too).
                  const exempt = done ? null : tallyExempt(h, c.direction);
                  const inputsBlocked = tallyBlocked ?? exempt;
                  const tickBlocked = inputsBlocked ?? (needsWeigh ? "LCL cargo is re-weighed before the tick-off — re-weigh it first" : null);
                  return (
                    <tr key={h.id} className={`border-b border-slate-100 last:border-b-0 ${done ? "bg-slate-50/60" : ""}`}>
                      <td className={td}>
                        <Link href={`/warehouse/gate-log/${h.movementId}`} className="font-mono font-bold text-indigo-500 hover:underline">
                          {ref}
                        </Link>
                        <div>
                          <Badge tone={stageTone(h.stage)}>{stageLabel(h.stage, h.stageLabel)}</Badge>
                        </div>
                        {exempt && <div className="text-[11px] text-slate-500 max-w-[220px] whitespace-normal">Not tallied. {exempt}</div>}
                      </td>
                      <td className={`${td} text-slate-700`}>{h.customer || "—"}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {nf(h.pieces)} pcs
                        <div className="text-[11px] text-slate-400">{nf(h.weightKg)} kg</div>
                      </td>
                      {done ? (
                        <>
                          <td className={`${td} tabular-nums ${h.tallyPieces != null && h.tallyPieces !== h.pieces ? "text-amber-700 font-semibold" : ""}`}>
                            {h.tallyPieces != null ? `${nf(h.tallyPieces)} pcs` : "—"}
                          </td>
                          <td className={`${td} text-slate-600`}>{h.tallyCondition || "—"}</td>
                          <td className={`${td} text-slate-600`}>{h.tallyLocation || "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className={td}>
                            <InputNumber
                              size="small"
                              min={0}
                              precision={0}
                              value={d.pieces}
                              disabled={!!inputsBlocked}
                              onChange={(v) => setDraft(h, { pieces: v == null ? null : Number(v) })}
                              className="!w-[90px]"
                              aria-label={`${ref}: pieces counted`}
                            />
                          </td>
                          <td className={td}>
                            <Select
                              size="small"
                              value={d.condition}
                              disabled={!!inputsBlocked}
                              onChange={(v) => setDraft(h, { condition: v })}
                              options={TALLY_CONDITIONS.map((x) => ({ value: x, label: x }))}
                              className="!w-[150px]"
                              aria-label={`${ref}: condition`}
                            />
                          </td>
                          <td className={td}>
                            <Input
                              size="small"
                              value={d.location}
                              disabled={!!inputsBlocked}
                              placeholder="Zone / rack"
                              maxLength={100}
                              onChange={(e) => setDraft(h, { location: e.target.value })}
                              className="!w-[120px]"
                              aria-label={`${ref}: location`}
                            />
                          </td>
                        </>
                      )}
                      <td className={td}>
                        {h.reweighKg != null ? (
                          <Badge tone={h.reweighFlagged ? "a" : "g"}>{nf(h.reweighKg)} kg{h.reweighFlagged ? " · variance" : ""}</Badge>
                        ) : h.needsReweigh ? (
                          <Badge tone="r">Missing</Badge>
                        ) : (
                          <span className="text-slate-300">Not needed</span>
                        )}
                        {h.needsReweigh && !gone && h.stage !== "left" && c.gateInAt && (
                          <button type="button" className={`${btnInline} ml-1`} onClick={() => setReweighFor(h)}>
                            {h.reweighKg != null ? "Again" : "Re-weigh"}
                          </button>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {done ? (
                          <div>
                            <Badge tone={TALLY_TONE[h.tallyOutcome] ?? ""}>{TALLY_LABEL[h.tallyOutcome] ?? h.tallyOutcome}</Badge>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {h.tickedAt ? formatDateTime(h.tickedAt) : ""}
                              {h.tickedBy ? ` · ${h.tickedBy}` : ""}
                            </div>
                            {h.tallyReason && <div className="text-[11px] text-slate-500 max-w-[220px] whitespace-normal break-words">{h.tallyReason}</div>}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Tooltip title={tickBlocked ?? `Receives ${ref}: its free time starts and its shipment gets the received date`}>
                              <span className="inline-flex">
                                <button type="button" className={btnPrimary} disabled={!!tickBlocked || api.tally.isPending} onClick={() => tally(h, "received").catch(() => undefined)}>
                                  Tick received
                                </button>
                              </span>
                            </Tooltip>
                            <Dropdown
                              disabled={!!inputsBlocked}
                              trigger={["click"]}
                              menu={{
                                items: [
                                  { key: "short", label: `${TERMS.short}…`, onClick: () => setReasonFor({ h, outcome: "short" }) },
                                  { key: "not_arrived", label: `${TERMS.notArrived}…`, onClick: () => setReasonFor({ h, outcome: "not_arrived" }) },
                                ],
                              }}
                            >
                              <button type="button" className={btnDefault} disabled={!!inputsBlocked} aria-label={`${ref}: short or not arrived`}>
                                <DownOutlined className="text-[10px]" />
                              </button>
                            </Dropdown>
                          </span>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {done ? (
                          manager &&
                          !gone && (
                            <button type="button" className={btnInline} onClick={() => setVoidFor(h)}>
                              Void tally…
                            </button>
                          )
                        ) : (
                          !gone && (
                            <Tooltip title="Take out of this container">
                              <button
                                type="button"
                                className={btnDefault}
                                aria-label={`Take ${ref} out of the container`}
                                disabled={api.removePosition.isPending}
                                onClick={() =>
                                  api.removePosition
                                    .mutateAsync(h.movementId)
                                    .then(() => toast.success(`${ref} taken out of the container`))
                                    .catch((e) => toast.error(errorMessage(e, "Failed to take the house out")))
                                }
                              >
                                <DeleteOutlined />
                              </button>
                            </Tooltip>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!gone && <AddHouses candidates={candidates} picked={picked} setPicked={setPicked} saving={api.addPositions.isPending} onAdd={() => api.addPositions.mutateAsync(picked).then(() => {
        toast.success(`${picked.length} house${picked.length === 1 ? "" : "s"} added`);
        setPicked([]);
      }).catch((e) => toast.error(errorMessage(e, "Failed to add the houses")))} />}

      <ReasonModal
        open={!!reasonFor}
        title={reasonFor ? `${TALLY_LABEL[reasonFor.outcome]} — ${reasonFor.h.positionRef || reasonFor.h.gateRef}` : ""}
        hint={`The house is not received; the reason, the count and who are logged. ${reasonFor?.outcome === "short" ? "Enter the pieces counted in the list first." : ""}`}
        okText={reasonFor ? `Mark ${TALLY_LABEL[reasonFor.outcome]!.toLowerCase()}` : "Save"}
        onClose={() => setReasonFor(null)}
        onSubmit={(reason) => tally(reasonFor!.h, reasonFor!.outcome, reason)}
      />
      <ReasonModal
        open={!!voidFor}
        title={`Void the tally of ${voidFor?.positionRef || voidFor?.gateRef || ""}`}
        hint="The house goes back to not tallied; a tick-off is undone (its received date set by the tally is cleared). What the tick still owed the shipment is cancelled; a shipment already updated is not changed back. Logged."
        okText="Void tally"
        danger
        onClose={() => setVoidFor(null)}
        onSubmit={(reason) =>
          api.voidTally
            .mutateAsync({ movementId: voidFor!.movementId, reason })
            .then((res) => {
              toast.success("Tally voided — logged on the container and the position");
              if (res.notice) toast.notify({ type: "warning", title: "Shipment may need correcting", description: res.notice });
            })
            .catch((e) => {
              toast.error(errorMessage(e, "Failed to void the tally"));
              throw e;
            })
        }
      />
      <ReweighModal
        open={!!reweighFor}
        movementId={reweighFor?.movementId ?? ""}
        label={reweighFor?.positionRef || reweighFor?.gateRef || ""}
        declaredKg={reweighFor?.weightKg}
        onClose={() => setReweighFor(null)}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["warehouse-records", "containers", c.id] })}
      />
    </div>
  );
}

function AddHouses({
  candidates,
  picked,
  setPicked,
  saving,
  onAdd,
}: {
  candidates: ReturnType<typeof useGateLog>["movements"];
  picked: string[];
  setPicked: (fn: (p: string[]) => string[]) => void;
  saving: boolean;
  onAdd: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <Card title="Add houses" extra={`${candidates.length} outbound positions not received yet`}>
      {!show ? (
        <button type="button" className={btnDefault} disabled={!candidates.length} onClick={() => setShow(true)}>
          Choose positions…
        </button>
      ) : (
        <Modal
          open
          title="Add houses to the container"
          okText={`Add ${picked.length || ""}`}
          okButtonProps={{ disabled: !picked.length }}
          confirmLoading={saving}
          onCancel={() => setShow(false)}
          onOk={() => {
            onAdd();
            setShow(false);
          }}
          destroyOnHidden
        >
          <p className="text-xs text-slate-500 mt-0">Outbound positions not received yet and not in another container.</p>
          <div className="max-h-[360px] overflow-y-auto">
            {candidates.map((m) => (
              <div key={m.id} className="py-1 border-b border-slate-100 last:border-b-0">
                <Checkbox checked={picked.includes(m.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))} className="!text-xs">
                  <span className="font-mono font-semibold">{m.positionRef || m.gateRef}</span> · {m.customer || "—"} · {nf(m.colli)} pcs · {nf(m.weightKg)} kg
                </Checkbox>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Card>
  );
}
