"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Checkbox, Input, Modal, Popconfirm, Segmented } from "antd";
import { CheckOutlined, CloseOutlined, EditOutlined, MessageOutlined, UndoOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { ApprovalChatDrawer } from "@/components/ApprovalChatDrawer";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { refreshCustomerLists } from "@/hooks/useCustomers";
import { supplierApprovalKeys, useSupplierApprovals, type SupplierApprovalItem } from "@/hooks/useSupplierApprovals";
import { CUSTOMER_ROLE_LABELS, customerRoleOptions } from "@/app/customers/_lib/constants";
import { quoteHref } from "../../_lib/quoteHref";
import { BTN, BTN_DANGER, CARD, CARD_BAR, CARD_TITLE, HINT, LABEL_TEXT, MODAL_TITLE, TD, TEXTAREA, TH } from "@/styles/ui";

// Sales → Managers → Company approval: a user who is no manager adds a supplier that is not in the
// Customer Database from a quote's Pricing. It is in the database at once, waiting here; until a manager
// approves it the quote can't be sent. A manager approves it, edits it first, or declines it with a
// reason: declined it is deleted, and the one who added it is told in their bell, as of an approval. A
// decline given by mistake is taken back from the Answered list (Undo decline): the company comes back
// and waits here again.

const LABEL = `block ${LABEL_TEXT} mb-1`;
// A cell of the list, its first and last a card's padding in from the frame.
const HEAD = `${TH} first:pl-4 last:pr-4`;
const CELL = `${TD} !align-top first:pl-4 last:pr-4`;
const MIN_REASON = 3;

const rolesText = (roles: interfaces.CustomerRole[]) => roles.map((r) => CUSTOMER_ROLE_LABELS[r] ?? r).join(", ");

function AnswerPill({ item }: { item: SupplierApprovalItem }) {
  return item.decision === "declined" ? (
    <Pill tone="red">Declined</Pill>
  ) : (
    <Pill tone="green">Approved</Pill>
  );
}

export function SalesCompanyApprovals() {
  const toast = useToast();
  const { approvals, waiting, isLoading, isError, decide, undoDecline } = useSupplierApprovals();
  const [view, setView] = useState<"waiting" | "answered">("waiting");
  // The supplier being declined (its reason typed below its row), or edited (in the dialog).
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<SupplierApprovalItem | null>(null);
  const [chat, setChat] = useState<string | null>(null);

  const listed = approvals.filter((a) => (view === "waiting" ? a.status === "pending" : a.decision !== ""));
  const who = (a: SupplierApprovalItem) => a.requestedBy || "whoever added it";

  const answer = (a: SupplierApprovalItem, decision: "approve" | "decline") =>
    decide
      .mutateAsync({ id: a.threadId, decision, comment: decision === "decline" ? reason : undefined })
      .then(() => {
        toast.success(`${a.companyName} ${decision === "approve" ? "approved" : "declined"} — ${who(a)} is notified`);
        setDeclining(null);
      })
      .catch((e) => toast.error(apiErrorMessage(e)));

  const takeBack = (a: SupplierApprovalItem) =>
    undoDecline
      .mutateAsync(a.threadId)
      .then(() => {
        toast.success(a.alreadyInDatabase ? `The registration of ${a.companyName} waits for approval again` : `${a.companyName} is back in the Customer Database, waiting for approval again`);
        setView("waiting");
      })
      .catch((e) => toast.error(apiErrorMessage(e)));

  const empty = isError ? "Could not load the new suppliers." : isLoading ? "Loading…" : view === "waiting" ? "No new supplier waiting for a manager." : "No answers in the last 30 days.";

  return (
    <div className="flex flex-col gap-3">
      <section className={`${CARD} overflow-hidden`}>
        <div className={`${CARD_BAR} flex-wrap justify-between`}>
          <div>
            <h3 className={CARD_TITLE}>Company approval · new companies</h3>
            <div className={HINT}>
              Added from a quote&apos;s Pricing, or registered by a company through its link; a quote linked to one can&apos;t be sent until it is approved. Approve it, edit it first, or decline it with a reason (it is then deleted; Undo decline under Answered brings it back). The one who added it is told.
            </div>
          </div>
          <Segmented
            size="small"
            value={view}
            onChange={(v) => setView(v as typeof view)}
            options={[
              { value: "waiting", label: `Waiting (${isError ? "–" : waiting})` },
              { value: "answered", label: "Answered (30 days)" },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={HEAD}>Company</th>
                <th className={HEAD}>Contact</th>
                <th className={HEAD}>Added</th>
                <th className={HEAD}>Answer</th>
              </tr>
            </thead>
            <tbody>
              {listed.length === 0 && (
                <tr>
                  <td colSpan={4} className={`${TD} !py-8 text-center`}>
                    <span className={isError ? "text-red-600" : "text-slate-400"}>{empty}</span>
                  </td>
                </tr>
              )}
              {listed.map((a) => {
                const open = a.status === "pending" && declining === a.threadId;
                return (
                  <Fragment key={a.threadId}>
                    <tr>
                      <td className={CELL}>
                        {a.status === "declined" ? (
                          <span className="font-semibold text-slate-900">{a.companyName}</span>
                        ) : (
                          <Link href={`/customers/${a.customerId}`} target="_blank" className={`font-semibold ${LINK_CLASS}`}>
                            {a.companyName}
                          </Link>
                        )}
                        <div className="text-[12px] text-slate-700">{rolesText(a.roles)}</div>
                        {a.alreadyInDatabase && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <Pill tone="amber">Already in the database</Pill>
                            {/* Its own name there: what the form says may name another company. */}
                            {a.matchedCompanyName && <span className="text-[12px] text-slate-700">as {a.matchedCompanyName}</span>}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500">
                          {[a.ico && `${a.country === "CZ" ? "IČO" : "Reg. no."} ${a.ico}`, a.dic && `VAT ${a.dic}`, a.dataSource === "ARES" ? "from ARES" : "typed in"].filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-[11px] text-slate-400">{[a.registeredAddress, a.country].filter(Boolean).join(", ")}</div>
                      </td>
                      <td className={CELL}>
                        {a.contactName || "—"}
                        <div className="text-[11px] text-slate-400">{[a.contactEmail, a.contactPhone].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className={`${CELL} whitespace-nowrap`}>
                        {a.requestedBy || "—"}
                        <div className="text-[11px] text-slate-400 tabular-nums">{a.requestedAt ? formatDateTime(a.requestedAt) : ""}</div>
                        {a.registered && (
                          <div className="text-[11px] text-slate-500">
                            Registered by link · accepted{" "}
                            <a href={a.termsUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                              the terms
                            </a>
                          </div>
                        )}
                        {a.quoteNumber && (
                          <Link href={quoteHref(a.quoteNumber)} className={`text-[12px] tabular-nums font-semibold ${LINK_CLASS}`}>
                            {a.quoteNumber}
                          </Link>
                        )}
                      </td>
                      <td className={CELL}>
                        {a.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={decide.isPending} onClick={() => void answer(a, "approve")} className={BTN}>
                              <CheckOutlined className="text-[14px]" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeclining(a.threadId);
                                setReason("");
                              }}
                              className={BTN}
                            >
                              <CloseOutlined className="text-[14px]" />
                              Decline
                            </button>
                            {!a.alreadyInDatabase && (
                              <button type="button" onClick={() => setEditing(a)} className={BTN}>
                                <EditOutlined className="text-[14px]" />
                                Edit
                              </button>
                            )}
                            <button type="button" onClick={() => setChat(a.threadId)} className={BTN}>
                              <MessageOutlined className="text-[14px]" />
                              Chat
                            </button>
                          </div>
                        ) : (
                          <div>
                            <AnswerPill item={a} />
                            <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                              {a.decidedBy || "—"}
                              {a.decidedAt ? ` · ${formatDateTime(a.decidedAt)}` : ""}
                              {a.answerSeen ? " · seen" : ""}
                            </div>
                            {a.comment && <div className="text-[12px] text-slate-700 mt-1 max-w-[280px] whitespace-pre-wrap">{a.comment}</div>}
                            {a.status === "declined" && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-slate-400">{a.alreadyInDatabase ? "The company stays in the Customer Database" : "Deleted from the Customer Database"}</span>
                                <Popconfirm
                                  title={`Undo the decline of ${a.companyName}?`}
                                  description={
                                    a.alreadyInDatabase
                                      ? "The registration waits for approval again; the company stays in the Customer Database as it is."
                                      : "It comes back to the Customer Database and waits for approval again; its quote stays held until it is answered."
                                  }
                                  okText="Undo decline"
                                  cancelText="Cancel"
                                  onConfirm={() => takeBack(a)}
                                >
                                  <button type="button" disabled={undoDecline.isPending} className={BTN}>
                                    <UndoOutlined className="text-[13px]" />
                                    Undo decline
                                  </button>
                                </Popconfirm>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td colSpan={4} className="px-4 pb-4 pt-2">
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="block flex-1 min-w-[260px]">
                              <span className={LABEL}>Why it is declined</span>
                              <textarea
                                autoFocus
                                rows={2}
                                value={reason}
                                maxLength={500}
                                onChange={(e) => setReason(e.target.value)}
                                className={`${TEXTAREA} w-full resize-y`}
                              />
                              <span className={`block ${HINT} mt-0.5`}>
                                {a.alreadyInDatabase ? <>Sent to {who(a)}. The company stays as it is in the Customer Database.</> : a.registered ? <>Sent to {who(a)}. The company is deleted. Given by mistake? Undo decline under Answered brings it back.</> : <>Sent to {who(a)}. The company is deleted, and its quote&apos;s line asks for another supplier. Given by mistake, it can be undone under Answered.</>}
                              </span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={decide.isPending || reason.trim().length < MIN_REASON}
                                onClick={() => void answer(a, "decline")}
                                className={BTN_DANGER}
                              >
                                Decline supplier
                              </button>
                              <button type="button" onClick={() => setDeclining(null)} className={BTN}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {editing && <EditSupplierModal item={editing} onClose={() => setEditing(null)} />}
      <ApprovalChatDrawer threadId={chat} onClose={() => setChat(null)} />
    </div>
  );
}

/** A manager corrects a new supplier before answering: its name, VAT ID and supplier roles; the rest on its page. */
function EditSupplierModal({ item, onClose }: { item: SupplierApprovalItem; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const canSeeConcepts = useCanSeeConcepts();
  const [companyName, setCompanyName] = useState(item.companyName);
  const [dic, setDic] = useState(item.dic);
  const [roles, setRoles] = useState<interfaces.CustomerRole[]>(item.roles);
  const [saving, setSaving] = useState(false);
  const options = customerRoleOptions(canSeeConcepts);
  // A company that registered by link may be a customer; one added from a quote's Pricing is a supplier.
  const rolesAreFine = item.registered ? roles.length > 0 : roles.some((r) => r !== "customer");

  const save = async () => {
    setSaving(true);
    try {
      await api.customers.customerUpdate(item.customerId, { companyName: companyName.trim(), dic: dic.trim(), roles });
      toast.success(`${companyName.trim()} saved`);
      await queryClient.invalidateQueries({ queryKey: supplierApprovalKeys.all });
      refreshCustomerLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["customer", item.customerId] });
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onCancel={onClose}
      title={<span className={MODAL_TITLE}>Edit new supplier</span>}
      okText="Save"
      onOk={() => void save()}
      okButtonProps={{ disabled: !companyName.trim() || !rolesAreFine, loading: saving }}
      destroyOnHidden
    >
      <div className="flex flex-col gap-3 pt-2">
        <label className="block">
          <span className={LABEL}>Company name</span>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={300} />
        </label>
        <label className="block">
          <span className={LABEL}>VAT ID</span>
          <Input value={dic} onChange={(e) => setDic(e.target.value)} maxLength={20} placeholder="e.g. CZ12345678" />
        </label>
        <div>
          <span className={LABEL}>Roles</span>
          <Checkbox.Group options={options} value={roles} onChange={setRoles} />
          {!rolesAreFine && <div className="text-[12px] text-red-600 mt-1">{item.registered ? "Keep at least one role" : "Keep at least one supplier role"}</div>}
        </div>
        <div className="text-[12px] text-slate-500">
          Addresses, contacts and terms:{" "}
          <Link href={`/customers/${item.customerId}`} target="_blank" className={`font-semibold ${LINK_CLASS}`}>
            open {item.companyName} in the Customer Database
          </Link>
          . Saving does not approve it: approve or decline it on the list.
        </div>
      </div>
    </Modal>
  );
}
