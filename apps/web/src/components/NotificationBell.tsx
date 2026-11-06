"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Dropdown, Input } from "antd";
import { BellOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useNoticeboard } from "@/hooks/useNoticeboard";
import { useFxAlerts, useInvalidateFx } from "@/hooks/useFx";
import { NoticeSeverityTag } from "@/app/dashboard/_components/NoticeSeverityTag";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { quoteChatHref } from "@/app/sales/_lib/quoteHref";
import { salesManagersHref } from "@/app/sales/_lib/tabs";
import { useWarehouseInquiryAnswers, type WarehouseInquiryItem } from "@/hooks/useWarehouseInquiries";
import { useMarginInquiryBell, type MarginInquiryItem, type MarginInquiryRow } from "@/hooks/useMarginInquiries";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useSupplierApprovals, type SupplierApprovalItem } from "@/hooks/useSupplierApprovals";
import { useCustomsOfficeAnswers, type CustomsOfficeRequestItem } from "@/hooks/useCustomsOfficeRequests";
import { useCustomsVerdictNotices, type CustomsVerdictNotice } from "@/hooks/useShipmentAlerts";
import { useDocumentChangeAnswers, type DocumentChangeRequestItem } from "@/hooks/useDocumentChangeRequests";
import { HINT, ICON_BTN_GHOST, LABEL_TEXT } from "@/styles/ui";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A mention in a shipment's or a quote's chat, as the bell lists it.
interface BellMention {
  key: string;
  unread: boolean;
  authorName: string;
  message: string;
  createdAt: string;
  /** Job no. or Sales Reference. */
  ref: string;
  href: string;
  place: string;
}

// Where a notification about a Sales Reference leads: the Quotes list with that quote's chat
// open (quoteChatHref). One about an Internal Reference opens the Shipments list with the shipment's chat.
const shipmentChatHref = (shipmentId: string) => `/shipments?chat=${encodeURIComponent(shipmentId)}`;

// Customs' verdict on a document of one of the user's shipments, as the bell says it.
const verdictTitle = (v: CustomsVerdictNotice) => `Customs ${v.status} · ${v.jobNumber}`;
const verdictText = (v: CustomsVerdictNotice) => `${v.fileName}${v.note ? ` — ${v.note}` : ""}`;

// A manager's answer to a request to replace an approved document, as the bell says it.
const documentAnswerTitle = (a: DocumentChangeRequestItem) => `Document change ${a.status === "approved" ? "approved" : "rejected"} · ${a.jobNumber}`;
const documentAnswerText = (a: DocumentChangeRequestItem) => `${a.newFileName}${a.comment ? ` — ${a.comment}` : ""}`;

// A manager's answer to a request to change a Customs Office, as the bell says it.
const officeAnswerTitle = (a: CustomsOfficeRequestItem) => `Customs Office ${a.status === "approved" ? "approved" : "rejected"} · ${a.jobNumber}`;
const officeAnswerText = (a: CustomsOfficeRequestItem) => `${a.toOffice}${a.comment ? ` — ${a.comment}` : ""}`;

// A warehouse answer as the bell says it.
const answerTitle = (a: WarehouseInquiryItem) => `Warehouse ${a.inquiry.status === "approved" ? "approved" : "rejected"} ${a.quoteNumber}`;
const answerText = (a: WarehouseInquiryItem) => {
  const what = `${a.inquiry.pieces} piece${a.inquiry.pieces === 1 ? "" : "s"} of 12.5 t or more${a.customerName ? ` · ${a.customerName}` : ""}`;
  return a.inquiry.status === "approved"
    ? `${what}: EUR ${a.inquiry.priceEurPerPiece ?? 0} per piece${a.inquiry.comment ? ` — ${a.inquiry.comment}` : ""}`
    : `${what}: ${a.inquiry.comment}`;
};

// A margin question waiting for this manager, and a manager's answer to a rep, as the bell says them.
const czkText = (n: number | null) => (n === null ? "unknown" : formatAmount(Math.round(n), "CZK"));
const waitingTitle = (r: MarginInquiryRow) => `Discount waiting · ${r.inquiry.quoteNumber}`;
const waitingText = (r: MarginInquiryRow) =>
  `${r.inquiry.requestedByName || "A rep"} asks for ${czkText(r.inquiry.snapshot.marginCzk)}${r.customer ? ` · ${r.customer}` : ""} — ${r.inquiry.reason}${r.inquiry.escalated ? " · waiting long" : ""}`;
// A new supplier waiting for a manager, and the manager's answer to whoever added it from a quote.
const supplierWaitingTitle = (a: SupplierApprovalItem) => `Supplier waiting approval · ${a.companyName}`;
const supplierWaitingText = (a: SupplierApprovalItem) => `${a.requestedBy || "A colleague"} added it from ${a.quoteNumber || "a quote"}`;
const supplierAnswerTitle = (a: SupplierApprovalItem) => `Supplier ${a.decision === "approved" ? "approved" : "declined"} · ${a.companyName}`;
const supplierAnswerText = (a: SupplierApprovalItem) =>
  a.decision === "approved"
    ? `${a.quoteNumber ? `${a.quoteNumber} can be sent` : "It can be used"}${a.comment ? ` — ${a.comment}` : ""}`
    : `${a.comment}${a.quoteNumber ? ` — pick another supplier on ${a.quoteNumber}` : ""}`;
const marginAnswerTitle = (a: MarginInquiryItem) => `Margin ${a.status === "approved" ? "approved" : "rejected"} · ${a.quoteNumber}`;
const marginAnswerText = (a: MarginInquiryItem) =>
  a.status === "approved"
    ? `${a.decision === "counter" ? "Down to " : ""}${czkText(a.approvedMarginCzk)}${a.comment ? ` — ${a.comment}` : ""}`
    : a.comment;

// How long a read notification stays under the bell, in the "Last 7 days" view.
const READ_KEEP_DAYS = 7;
const READ_KEEP_MS = READ_KEEP_DAYS * 86_400_000;
const keptSince = (iso: string | null | undefined, now: number) => !!iso && now - Date.parse(iso) <= READ_KEEP_MS;

// The search box: every word must appear somewhere in the item, case and accents ignored.
const fold = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const matchesAll = (q: string, ...fields: (string | null | undefined)[]) => {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
};

const NOTICE_TOAST_TYPE: Record<string, "info" | "warning" | "error"> = { info: "info", warning: "warning", critical: "error" };

// What the signed-in user has not looked at yet: noticeboard posts from colleagues, chat
// messages that tag them with @, and the warehouse's answers to their questions about pieces of
// 12.5 t or more on a quote. A new one pops up as a notification; they stay
// under the bell until the notice or the shipment's chat (mentions) is opened. Read ones stay
// another 7 days in the "Last 7 days" view, and the search box looks through what is shown.
export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const { data: mentionData } = useQuery({
    queryKey: ["shipment-comments", "mentions"],
    queryFn: () => api.shipments.commentMentions(),
    refetchInterval: 15000,
  });
  // Unread mentions and read ones of the last 7 days (the server says which is which).
  // …and in a quote's chat (a thread shared by the quote and its revisions).
  const { data: quoteMentionData } = useQuery({
    queryKey: ["sales-quote-comments", "mentions"],
    queryFn: () => api.quotes.quoteCommentMentions(),
    refetchInterval: 15000,
  });
  // Each kind as the bell lists it: where it was said (job no. or Sales Reference) and where a
  // click leads; undefined while its answer is not here. Both together, newest first.
  const shipmentMentions: BellMention[] | undefined = mentionData?.mentions.map((m) => ({
    ...m,
    key: `s:${m.id}`,
    ref: m.jobNumber,
    href: shipmentChatHref(m.shipmentId),
    place: "a shipment",
  }));
  const quoteMentions: BellMention[] | undefined = quoteMentionData?.mentions.map((m) => ({
    ...m,
    key: `q:${m.id}`,
    ref: m.quoteNumber,
    href: quoteChatHref(m.quoteNumber),
    place: "a quote",
  }));
  const allMentions: BellMention[] = [...(shipmentMentions ?? []), ...(quoteMentions ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // ČNB rates still missing after the 16:00 pull — admins only; they clear themselves once
  // the rates arrive.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const { data: fxAlertData } = useFxAlerts(isAdmin);
  const invalidateFx = useInvalidateFx();
  const fxAlerts = isAdmin ? (fxAlertData?.alerts ?? []) : [];
  const { announcements, viewer, hasLoaded: noticesLoaded } = useNoticeboard();
  // The warehouse answered a quote inquiry this user sent; it leaves the bell once opened.
  const { answers: warehouseAnswers, hasLoaded: answersLoaded, seen: answerSeen } = useWarehouseInquiryAnswers();
  // A manager answered this user's request to change a Customs Office; it leaves the bell once opened.
  const { answers: officeAnswers, hasLoaded: officeAnswersLoaded, seen: officeAnswerSeen } = useCustomsOfficeAnswers();
  // A manager answered this user's request to replace an approved document.
  const { answers: documentAnswers, hasLoaded: documentAnswersLoaded, seen: documentAnswerSeen } = useDocumentChangeAnswers();
  // Customs approved or declined a document of a shipment this user is the Person in Charge or Holiday Cover of.
  const { verdicts, hasLoaded: verdictsLoaded, seen: verdictSeen } = useCustomsVerdictNotices();
  // Margin questions this user is told about (the owner's manager, or an admin once it waits
  // long), and managers' answers to their questions or quotes (Council Outlay 6).
  const { waiting: marginWaiting, answers: marginAnswers, hasLoaded: marginLoaded, seen: marginSeen } = useMarginInquiryBell();
  // New suppliers added from quotes: a manager is told what waits, whoever added one the answer.
  const { canManageSales } = useSalesPermissions();
  const { approvals: supplierApprovals, hasLoaded: suppliersLoaded, seen: supplierSeen } = useSupplierApprovals();
  const supplierWaiting = canManageSales ? supplierApprovals.filter((a) => a.status === "pending") : [];
  const supplierAnswers = supplierApprovals.filter((a) => a.decision !== "" && !!user && a.requestedByUserId === user.id);
  const [open, setOpen] = useState(false);
  // "Unread" is what still needs attention; "All" keeps the recent notices in reach after
  // they have been opened. Mentions exist here only while unread.
  const [view, setView] = useState<"unread" | "all">("unread");
  const [query, setQuery] = useState("");
  const now = Date.now();
  const notices = announcements.filter((a) => a.unread);
  const unreadMentions = allMentions.filter((m) => m.unread);
  const unreadAnswers = warehouseAnswers.filter((a) => !a.inquiry.answerSeenAt);
  const unreadDocumentAnswers = documentAnswers.filter((a) => !a.answerSeenAt);
  const documentAnswersShown = (view === "unread" ? unreadDocumentAnswers : documentAnswers).filter((a) => matchesAll(query, documentAnswerTitle(a), documentAnswerText(a), a.decidedByName));
  const unreadVerdicts = verdicts.filter((v) => v.unread);
  const verdictsShown = (view === "unread" ? unreadVerdicts : verdicts).filter((v) => matchesAll(query, verdictTitle(v), verdictText(v), v.reviewedByName));
  const unreadOfficeAnswers = officeAnswers.filter((a) => !a.answerSeenAt);
  const officeAnswersShown = (view === "unread" ? unreadOfficeAnswers : officeAnswers).filter((a) => matchesAll(query, officeAnswerTitle(a), officeAnswerText(a), a.decidedByName));
  const unreadMarginAnswers = marginAnswers.filter((a) => !a.answerSeenAt);
  // "Last 7 days": everything unread, and what was read in the last 7 days (a mention: written in them).
  const viewNotices = view === "unread" ? notices : announcements.filter((a) => a.unread || keptSince(a.readAt, now));
  const viewMentions = view === "unread" ? unreadMentions : allMentions;
  const viewAnswers = view === "unread" ? unreadAnswers : warehouseAnswers;
  const listed = viewNotices.filter((a) => matchesAll(query, a.title, a.body, a.authorName, a.target));
  const mentions = viewMentions.filter((m) => matchesAll(query, m.authorName, m.message, m.ref));
  const answersShown = viewAnswers.filter((a) => matchesAll(query, answerTitle(a), answerText(a), a.quoteNumber, a.inquiry.decidedByName));
  const fxShown = fxAlerts.filter((a) => matchesAll(query, "ČNB exchange rates missing", a.reason, a.fixingDate));
  // A waiting question stays until someone answers it, whatever the view.
  const marginWaitingShown = marginWaiting.filter((r) => matchesAll(query, waitingTitle(r), waitingText(r)));
  const marginAnswersShown = (view === "unread" ? unreadMarginAnswers : marginAnswers).filter((a) => matchesAll(query, marginAnswerTitle(a), marginAnswerText(a), a.decidedByName));
  const unreadSupplierAnswers = supplierAnswers.filter((a) => !a.answerSeen);
  const supplierWaitingShown = supplierWaiting.filter((a) => matchesAll(query, supplierWaitingTitle(a), supplierWaitingText(a)));
  const supplierAnswersShown = (view === "unread" ? unreadSupplierAnswers : supplierAnswers).filter((a) => matchesAll(query, supplierAnswerTitle(a), supplierAnswerText(a), a.decidedBy));

  // Announce only what arrives while the app is open, not the backlog found on load. Each kind
  // keeps its own memory of what it has seen: the two lists arrive at their own times, and the
  // first answer of either must only be remembered - not announced as news because the other
  // list got there first.
  const seenShipmentMentions = useRef<Set<string> | null>(null);
  const seenQuoteMentions = useRef<Set<string> | null>(null);
  const announceFresh = (list: BellMention[] | undefined, seen: { current: Set<string> | null }) => {
    if (!list) return;
    // Only unread ones are new: a read mention back in the list is not news.
    const fresh = seen.current ? list.filter((m) => m.unread && !seen.current!.has(m.key)) : [];
    seen.current = new Set(list.map((m) => m.key));
    for (const m of fresh) {
      toast.notify({
        title: `${m.authorName || "A colleague"} mentioned you in ${m.ref || m.place}`,
        description: m.message,
      });
    }
  };
  // The lists change only with their answers; the mapped arrays are rebuilt every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => announceFresh(shipmentMentions, seenShipmentMentions), [mentionData, toast]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => announceFresh(quoteMentions, seenQuoteMentions), [quoteMentionData, toast]);

  // Announce only answers that arrive while the app is open, not the ones waiting on load.
  const seenAnswers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!answersLoaded) return;
    const before = seenAnswers.current;
    const fresh = before ? warehouseAnswers.filter((a) => !a.inquiry.answerSeenAt && !before.has(a.inquiry.id)) : [];
    seenAnswers.current = new Set(warehouseAnswers.map((a) => a.inquiry.id));
    for (const a of fresh) toast.notify({ title: answerTitle(a), description: answerText(a), type: a.inquiry.status === "approved" ? "info" : "warning" });
  }, [warehouseAnswers, answersLoaded, toast]);

  // The same for answers about an approved document.
  const seenDocumentAnswers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!documentAnswersLoaded) return;
    const before = seenDocumentAnswers.current;
    const fresh = before ? documentAnswers.filter((a) => !a.answerSeenAt && !before.has(a.id)) : [];
    seenDocumentAnswers.current = new Set(documentAnswers.map((a) => a.id));
    for (const a of fresh) toast.notify({ title: documentAnswerTitle(a), description: documentAnswerText(a), type: a.status === "approved" ? "info" : "warning" });
  }, [documentAnswers, documentAnswersLoaded, toast]);

  // The same for customs' verdicts: a document can be reviewed again, so its time counts too.
  const seenVerdicts = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!verdictsLoaded) return;
    const keyOf = (v: CustomsVerdictNotice) => `${v.id}:${v.reviewedAt}`;
    const before = seenVerdicts.current;
    const fresh = before ? verdicts.filter((v) => v.unread && !before.has(keyOf(v))) : [];
    seenVerdicts.current = new Set(verdicts.map(keyOf));
    for (const v of fresh) toast.notify({ title: verdictTitle(v), description: verdictText(v), type: v.status === "approved" ? "info" : "warning" });
  }, [verdicts, verdictsLoaded, toast]);

  // The same for answers about a Customs Office.
  const seenOfficeAnswers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!officeAnswersLoaded) return;
    const before = seenOfficeAnswers.current;
    const fresh = before ? officeAnswers.filter((a) => !a.answerSeenAt && !before.has(a.id)) : [];
    seenOfficeAnswers.current = new Set(officeAnswers.map((a) => a.id));
    for (const a of fresh) toast.notify({ title: officeAnswerTitle(a), description: officeAnswerText(a), type: a.status === "approved" ? "info" : "warning" });
  }, [officeAnswers, officeAnswersLoaded, toast]);

  // The same for margin questions arriving and answers coming back.
  const seenMargin = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!marginLoaded) return;
    const before = seenMargin.current;
    const keys = [...marginWaiting.map((r) => `w:${r.inquiry.id}`), ...marginAnswers.map((a) => `a:${a.id}`)];
    if (before) {
      for (const r of marginWaiting) if (!before.has(`w:${r.inquiry.id}`)) toast.notify({ title: waitingTitle(r), description: waitingText(r), type: "warning" });
      for (const a of marginAnswers) if (!a.answerSeenAt && !before.has(`a:${a.id}`)) toast.notify({ title: marginAnswerTitle(a), description: marginAnswerText(a), type: a.status === "approved" ? "info" : "warning" });
    }
    seenMargin.current = new Set(keys);
  }, [marginWaiting, marginAnswers, marginLoaded, toast]);

  // And new suppliers waiting, and answers to the ones this user added. Every waiting one is remembered,
  // whoever the user is: the sales permissions may arrive after the list, and a manager is then not told
  // of the whole backlog as news.
  const seenSuppliers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!suppliersLoaded) return;
    const before = seenSuppliers.current;
    const keys = [
      ...supplierApprovals.filter((a) => a.status === "pending").map((a) => `w:${a.customerId}`),
      ...supplierAnswers.map((a) => `a:${a.customerId}`),
    ];
    if (before) {
      for (const a of supplierWaiting) if (!before.has(`w:${a.customerId}`)) toast.notify({ title: supplierWaitingTitle(a), description: supplierWaitingText(a), type: "warning" });
      for (const a of supplierAnswers)
        if (!a.answerSeen && !before.has(`a:${a.customerId}`)) toast.notify({ title: supplierAnswerTitle(a), description: supplierAnswerText(a), type: a.decision === "approved" ? "info" : "warning" });
    }
    seenSuppliers.current = new Set(keys);
    // The lists are filtered from the one answer; it changes only with the server's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierApprovals, suppliersLoaded, canManageSales, toast]);

  const seenFxAlerts = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!fxAlertData) return;
    const before = seenFxAlerts.current;
    const fresh = before ? fxAlertData.alerts.filter((a) => !before.has(a.id)) : [];
    seenFxAlerts.current = new Set(fxAlertData.alerts.map((a) => a.id));
    for (const a of fresh) {
      toast.notify({ title: `ČNB exchange rates missing for ${formatDate(a.fixingDate)}`, description: a.reason, type: "error" });
    }
    // The missing rates arrived: everything priced from rates (previews, queue) is stale.
    if (before && before.size > 0 && fxAlertData.alerts.length === 0) invalidateFx();
  }, [fxAlertData, toast, invalidateFx]);

  // The notices this tab has accounted for; null until the list first arrives. Only ones not
  // seen before are announced — by id, so a notice whose timestamp is older than one already
  // received still counts. A list that failed to load at first does not replay its history as
  // "new", nor does a board the reader has just been added to: a change of their department,
  // branch or country starts from a new baseline.
  const seenNotices = useRef<Set<string> | null>(null);
  const audience = viewer ? `${viewer.departmentId}|${viewer.branchId}|${viewer.country}` : "";
  const lastAudience = useRef<string | null>(null);
  useEffect(() => {
    if (!noticesLoaded) return;
    const seen = seenNotices.current;
    const baseline = seen === null || lastAudience.current !== audience;
    lastAudience.current = audience;
    const fresh = baseline ? [] : announcements.filter((a) => a.unread && !seen.has(a.id));
    seenNotices.current = new Set([...(baseline ? [] : seen), ...announcements.map((a) => a.id)]);
    for (const a of fresh) {
      toast.notify({
        title: `New notice: ${a.title}`,
        description: `${a.authorName} · ${a.target}`,
        type: NOTICE_TOAST_TYPE[a.severity] ?? "info",
      });
    }
  }, [announcements, audience, noticesLoaded, toast]);

  // The panel is not an antd menu, so it does not close itself when a row is chosen.
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  // The badge counts what is unread, whatever the view or the search.
  const total =
    unreadDocumentAnswers.length + unreadVerdicts.length + unreadOfficeAnswers.length + unreadMentions.length + notices.length + fxAlerts.length + unreadAnswers.length + marginWaiting.length + unreadMarginAnswers.length + supplierWaiting.length + unreadSupplierAnswers.length;
  const openSupplierAnswer = (a: SupplierApprovalItem) => {
    if (!a.answerSeen) supplierSeen.mutate([a.customerId]);
    go(a.quoteNumber ? `/sales/quote/${encodeURIComponent(a.quoteNumber)}` : "/customers");
  };
  const openAnswer = (a: WarehouseInquiryItem) => {
    if (!a.inquiry.answerSeenAt) answerSeen.mutate({ quoteNumber: a.quoteNumber, inquiryId: a.inquiry.id });
    go(quoteChatHref(a.quoteNumber));
  };
  const openDocumentAnswer = (a: DocumentChangeRequestItem) => {
    if (!a.answerSeenAt) documentAnswerSeen.mutate(a.id);
    go(`/customs?open=${a.shipmentId}`);
  };
  const openVerdict = (v: CustomsVerdictNotice) => {
    if (v.unread) verdictSeen.mutate(v.shipmentId);
    // A decline is an alert; an approval isn't, so it leads to the document. Seen is per shipment, so
    // an approval opened beside a new decline still leads to the decline it marks as seen.
    const declineWaits = v.status === "declined" || verdicts.some((x) => x.shipmentId === v.shipmentId && x.unread && x.status === "declined");
    go(`/shipments/${v.shipmentId}?tab=${declineWaits ? "alerts" : "documents"}`);
  };
  const openOfficeAnswer = (a: CustomsOfficeRequestItem) => {
    if (!a.answerSeenAt) officeAnswerSeen.mutate(a.id);
    go(`/shipments/${a.shipmentId}?tab=customs`);
  };
  const openMarginAnswer = (a: MarginInquiryItem) => {
    if (!a.answerSeenAt) marginSeen.mutate([a.id]);
    go(`/sales/quote/${encodeURIComponent(a.quoteNumber)}`);
  };
  const rowClass = "block w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 cursor-pointer";
  const headingClass = `px-4 py-2 border-b border-slate-200 bg-slate-50 ${LABEL_TEXT}`;

  const panel = (
    <div className="w-80 max-h-96 overflow-y-auto rounded-xl bg-white shadow-lg border border-slate-200">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <span className="text-[13px] font-semibold text-slate-900">Notifications</span>
        <span className="flex rounded-md bg-slate-100 p-0.5">
          {(["unread", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`px-2.5 py-0.5 rounded-md border-none text-[12px] font-medium cursor-pointer ${
                view === v ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {v === "unread" ? `Unread${total ? ` (${total})` : ""}` : `Last ${READ_KEEP_DAYS} days`}
            </button>
          ))}
        </span>
      </div>
      <div className="sticky top-[41px] z-10 px-3 py-2 border-b border-slate-200 bg-white">
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder={view === "unread" ? "Search unread" : `Search the last ${READ_KEEP_DAYS} days`}
          aria-label="Search notifications"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {fxShown.length > 0 && <div className={headingClass}>Exchange rates</div>}
      {fxShown.map((a) => (
        <button key={a.id} type="button" onClick={() => go("/exchange")} className={rowClass}>
          <span className="flex items-center gap-2">
            <span role="img" aria-label="Unresolved" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900 truncate">
              ČNB rates missing for {formatDate(a.fixingDate)}
            </span>
            <NoticeSeverityTag severity="critical" />
          </span>
          <span className="text-[12px] line-clamp-2 text-slate-700">{a.reason}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">System · {formatTime(a.raisedAt)}</span>
        </button>
      ))}
      {marginWaitingShown.length > 0 && <div className={headingClass}>Discounts waiting for you</div>}
      {marginWaitingShown.map((r) => (
        <button key={`w:${r.inquiry.id}`} type="button" onClick={() => go(salesManagersHref({ tab: "inquiries" }))} className={rowClass}>
          <span className="flex items-center gap-2">
            <span role="img" aria-label="Waiting" className={`shrink-0 w-2 h-2 rounded-full ${r.inquiry.escalated ? "bg-red-500" : "bg-amber-500"}`} />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900 truncate">{waitingTitle(r)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{waitingText(r)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{formatTime(r.inquiry.requestedAt)}</span>
        </button>
      ))}
      {marginAnswersShown.length > 0 && <div className={headingClass}>Discount answers</div>}
      {marginAnswersShown.map((a) => (
        <button key={`a:${a.id}`} type="button" onClick={() => openMarginAnswer(a)} className={rowClass}>
          <span className="flex items-center gap-2">
            {!a.answerSeenAt && <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${a.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.answerSeenAt ? "font-medium text-slate-500" : "font-semibold text-slate-900"}`}>{marginAnswerTitle(a)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{marginAnswerText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.decidedByName || "A manager"} · {a.decidedAt ? formatTime(a.decidedAt) : ""}
          </span>
        </button>
      ))}
      {supplierWaitingShown.length > 0 && <div className={headingClass}>Suppliers waiting for approval</div>}
      {supplierWaitingShown.map((a) => (
        <button key={`sw:${a.customerId}`} type="button" onClick={() => go(salesManagersHref({ tab: "approvals" }))} className={rowClass}>
          <span className="flex items-center gap-2">
            <span role="img" aria-label="Waiting" className="shrink-0 w-2 h-2 rounded-full bg-amber-500" />
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900 truncate">{supplierWaitingTitle(a)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{supplierWaitingText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{a.requestedAt ? formatTime(a.requestedAt) : ""}</span>
        </button>
      ))}
      {supplierAnswersShown.length > 0 && <div className={headingClass}>Supplier answers</div>}
      {supplierAnswersShown.map((a) => (
        <button key={`sa:${a.customerId}`} type="button" onClick={() => openSupplierAnswer(a)} className={rowClass}>
          <span className="flex items-center gap-2">
            {!a.answerSeen && <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${a.decision === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.answerSeen ? "font-medium text-slate-500" : "font-semibold text-slate-900"}`}>{supplierAnswerTitle(a)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{supplierAnswerText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.decidedBy || "A manager"} · {a.decidedAt ? formatTime(a.decidedAt) : ""}
          </span>
        </button>
      ))}
      {answersShown.length > 0 && <div className={headingClass}>Warehouse answers</div>}
      {answersShown.map((a) => (
        <button key={a.inquiry.id} type="button" onClick={() => openAnswer(a)} className={rowClass}>
          <span className="flex items-center gap-2">
            {!a.inquiry.answerSeenAt && (
              <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${a.inquiry.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
            )}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.inquiry.answerSeenAt ? "font-medium text-slate-500" : "font-semibold text-slate-900"}`}>{answerTitle(a)}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{a.quoteNumber}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{answerText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.inquiry.decidedByName || "Warehouse"} · {a.inquiry.decidedAt ? formatTime(a.inquiry.decidedAt) : ""}
          </span>
        </button>
      ))}
      {documentAnswersShown.length > 0 && <div className={headingClass}>Document change answers</div>}
      {documentAnswersShown.map((a) => (
        <button key={a.id} type="button" onClick={() => openDocumentAnswer(a)} className={rowClass}>
          <span className="flex items-center gap-2">
            {!a.answerSeenAt && (
              <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${a.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
            )}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.answerSeenAt ? "font-medium text-slate-500" : "font-semibold text-slate-900"}`}>{documentAnswerTitle(a)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{documentAnswerText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.decidedByName || "Manager"} · {a.decidedAt ? formatTime(a.decidedAt) : ""}
          </span>
        </button>
      ))}
      {verdictsShown.length > 0 && <div className={headingClass}>Customs</div>}
      {verdictsShown.map((v) => (
        <button key={`${v.id}:${v.reviewedAt}`} type="button" onClick={() => openVerdict(v)} className={rowClass}>
          <span className="flex items-center gap-2">
            {v.unread && (
              <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${v.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
            )}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${v.unread ? "font-semibold text-slate-900" : "font-medium text-slate-500"}`}>{verdictTitle(v)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{verdictText(v)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {v.reviewedByName || "Customs"} · {formatTime(v.reviewedAt)}
          </span>
        </button>
      ))}
      {officeAnswersShown.length > 0 && <div className={headingClass}>Customs Office answers</div>}
      {officeAnswersShown.map((a) => (
        <button key={a.id} type="button" onClick={() => openOfficeAnswer(a)} className={rowClass}>
          <span className="flex items-center gap-2">
            {!a.answerSeenAt && (
              <span role="img" aria-label="Unread" className={`shrink-0 w-2 h-2 rounded-full ${a.status === "approved" ? "bg-emerald-500" : "bg-red-500"}`} />
            )}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.answerSeenAt ? "font-medium text-slate-500" : "font-semibold text-slate-900"}`}>{officeAnswerTitle(a)}</span>
          </span>
          <span className="text-[12px] text-slate-700 line-clamp-2">{officeAnswerText(a)}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.decidedByName || "Manager"} · {a.decidedAt ? formatTime(a.decidedAt) : ""}
          </span>
        </button>
      ))}
      {documentAnswersShown.length + verdictsShown.length + officeAnswersShown.length + listed.length + mentions.length + fxShown.length + answersShown.length + marginWaitingShown.length + marginAnswersShown.length + supplierWaitingShown.length + supplierAnswersShown.length === 0 && (
        <p className={`px-4 py-6 text-center ${HINT}`}>
          {query.trim() ? `Nothing matches “${query.trim()}”.` : view === "unread" ? "Nothing new." : `Nothing in the last ${READ_KEEP_DAYS} days.`}
        </p>
      )}
      {listed.length > 0 && <div className={headingClass}>Noticeboard</div>}
      {listed.map((a) => (
        <button key={a.id} type="button" onClick={() => go(`/dashboard?notice=${a.id}`)} className={rowClass}>
          <span className="flex items-center gap-2">
            {a.unread && <span role="img" aria-label="Unread" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${a.unread ? "font-semibold text-slate-900" : "font-medium text-slate-500"}`}>
              {a.title}
            </span>
            <NoticeSeverityTag severity={a.severity} />
          </span>
          {a.body && <span className={`text-[12px] line-clamp-2 ${a.unread ? "text-slate-700" : "text-slate-400"}`}>{a.body}</span>}
          <span className="block text-[11px] text-slate-400 mt-0.5">
            {a.authorName} · {a.target} · {formatTime(a.createdAt)}
          </span>
        </button>
      ))}
      {mentions.length > 0 && <div className={headingClass}>Mentions</div>}
      {mentions.map((m) => (
        <button key={m.key} type="button" onClick={() => go(m.href)} className={rowClass}>
          <span className="flex items-center justify-between gap-2">
            {m.unread && <span role="img" aria-label="Unread" className="shrink-0 w-2 h-2 rounded-full bg-red-500" />}
            <span className={`min-w-0 flex-1 text-[13px] truncate ${m.unread ? "font-semibold text-slate-900" : "font-medium text-slate-500"}`}>{m.authorName || "Unknown"}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{m.ref}</span>
          </span>
          <span className={`text-[12px] line-clamp-2 ${m.unread ? "text-slate-700" : "text-slate-400"}`}>{m.message}</span>
          <span className="block text-[11px] text-slate-400 mt-0.5">{formatTime(m.createdAt)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dropdown open={open} onOpenChange={setOpen} trigger={["click"]} placement="bottomRight" popupRender={() => panel}>
      <button
        type="button"
        aria-label={total ? `Notifications — ${total} unread` : "Notifications"}
        className={`${ICON_BTN_GHOST} !w-9 !h-9`}
      >
        <Badge count={total} size="small" color="red">
          <BellOutlined className="text-[18px]" />
        </Badge>
      </button>
    </Dropdown>
  );
}
