"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Dropdown, Spin, Tabs, Tooltip } from "antd";
import { ArrowLeftOutlined, DownOutlined, UploadOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { businessToday, businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { useConsignment, useConsignmentDocuments, useTrip, type DocumentUpload, type Leg, type StampKind } from "@/hooks/useTruckingConsignments";
import { useConsignmentControl, type DeliveryException } from "@/hooks/useTruckingControl";
import { useInternalCharges } from "@/hooks/useTruckingMoney";
import { Badge } from "@/components/Badge";
import { LifecycleStrip } from "@/app/warehouse/_components/LifecycleStrip";
import { useUrlParam } from "@/hooks/useUrlParam";
import { btnDefault, btnPrimary } from "@/components/buttons";
import { CONSIGNMENT_STATUS_CHIP, STAMP_LABELS, consignmentActions, consignmentLifecycle, stampOf, statusRank, tripHref, type ActionState } from "../../_lib/consignments";
import { isExceptionOpen } from "../../_lib/exceptions";
import { consignmentInternalAmount, monthOf } from "../../_lib/internalBilling";
import { podWait } from "../../_lib/podMissing";
import { waitingFreeOf } from "../../_lib/settings";
import { TERMS } from "../../_lib/glossary";
import { isTruckingManager } from "../../_lib/roles";
import { planningHref } from "../../_lib/planning";
import { recordAsSentLabel } from "../../_lib/transportOrder";
import { LabelsModal } from "../../_components/LabelsModal";
import { MenuLabel } from "../../_components/MenuLabel";
import { TruckingHistory } from "../../_components/TruckingHistory";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";
import { TruckingTextModal } from "../../_components/TruckingTextModal";
import { TripDialogs, type TripDialog } from "../../trips/_components/TripDialogs";
import { TripPanel } from "../../trips/_components/TripPanel";
import { AvizaceRecordModal } from "./AvizaceRecordModal";
import { AvizaceTemplateDrawer } from "./AvizaceTemplateDrawer";
import { ConsignmentAvizaceCard } from "./ConsignmentAvizaceCard";
import { ConsignmentDocumentsTab } from "./ConsignmentDocumentsTab";
import { ConsignmentExceptionsTab, type ExceptionAction } from "./ConsignmentExceptionsTab";
import { ConsignmentEditModal } from "./ConsignmentEditModal";
import { ConsignmentLegsTimeline } from "./ConsignmentLegsTimeline";
import { ConsignmentOverviewTab } from "./ConsignmentOverviewTab";
import { ConsignmentStatusCards } from "./ConsignmentStatusCards";
import { ConsignmentStepBar } from "./ConsignmentStepBar";
import { DocumentUploadModal } from "./DocumentUploadModal";
import { ExceptionCreateModal } from "./ExceptionCreateModal";
import { ExceptionDecideModal } from "./ExceptionDecideModal";
import { ExceptionPhotoModal } from "./ExceptionPhotoModal";
import { PartnerLegModal } from "./PartnerLegModal";
import { PlanTripModal } from "./PlanTripModal";
import { StampModal } from "./StampModal";

const TABS = ["overview", "trip", "exceptions", "documents", "history"] as const;
type Tab = (typeof TABS)[number];
const LIST_HREF = "/trucking";

type Dialog =
  | { kind: "plan" }
  | { kind: "edit" }
  | { kind: "stamp"; stamp: StampKind }
  | { kind: "void"; stamp: StampKind }
  | { kind: "upload" }
  | { kind: "offerPod" }
  | { kind: "cancel" }
  | { kind: "approve" }
  | { kind: "partner"; leg: Leg }
  | { kind: "labels" }
  | { kind: "avizaceRecord" }
  | { kind: "exceptionCreate" }
  | { kind: "exception"; action: ExceptionAction; exception: DeliveryException }
  | null;

// A button that, when it cannot be used now, says why on hover.
const HeaderButton = ({ state, label, primary, onClick }: { state: ActionState; label: string; primary?: boolean; onClick: () => void }) => (
  <Tooltip title={state.allowed ? undefined : state.reason}>
    <span className="inline-flex">
      <button type="button" className={primary ? btnPrimary : btnDefault} disabled={!state.allowed} aria-label={state.allowed ? undefined : `${label} — ${state.reason}`} onClick={onClick}>
        {label}
      </button>
    </span>
  </Tooltip>
);

interface ConsignmentViewProps {
  consignmentId: string;
}

// The page of one consignment (the Warehouse job page's layout): header with the stamps and
// actions, the lifecycle, Route / Load / Money cards, the avizace and the tabs Overview · Trip &
// haulier · Exceptions · Documents · History. Every action is checked by the server too; buttons
// say why they wait.
export const ConsignmentView = ({ consignmentId }: ConsignmentViewProps) => {
  const toast = useToast();
  const { user } = useAuth();
  const { settings } = useTruckingSettings();
  const { consignment: c, isLoading, error, update, cancel, approveMargin, stamp, voidStamp, planTrip, setLegPartner } = useConsignment(consignmentId);
  const { trip } = useTrip(c?.tripId ?? null);
  const { documents, isLoading: docsLoading, upload } = useConsignmentDocuments(consignmentId);
  const [tab, setTab] = useUrlParam<Tab>("tab", TABS, "overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tripDialog, setTripDialog] = useState<TripDialog>(null);
  const [avizaceTextOpen, setAvizaceTextOpen] = useState(false);
  const { recordAvizace, createException, decideException, closeException, addPhoto } = useConsignmentControl(consignmentId);
  // An internal consignment's price is its charge in the month it was delivered (Prague).
  const deliveredMonth = c?.internal ? monthOf(c.stamps.delivered?.at) : "";
  const { charges: internalCharges } = useInternalCharges(deliveredMonth || null);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "Consignment not found." : `Could not load the consignment: ${apiErrorMessage(error)}.`}{" "}
        <Link href={LIST_HREF} className="text-indigo-500">
          Back to Consignments
        </Link>
      </div>
    );
  }

  const hasPod = documents.some((d) => d.kind === "POD");
  const actions = consignmentActions(c, trip, hasPod);
  const liveTrip = trip && trip.status !== "CANCELLED" ? trip : null;
  const levelLabel = settings?.serviceLevels.find((l) => l.code === c.serviceLevel)?.label ?? c.serviceLevel ?? "No service level";
  const close = () => setDialog(null);
  const fail = (what: string) => (e: unknown) => {
    toast.error(`${what}: ${apiErrorMessage(e)}`);
    throw e;
  };

  const handleStep = (kind: StampKind) => {
    if (kind === "confirmed") setTripDialog("confirm");
    else setDialog({ kind: "stamp", stamp: kind });
  };
  const doStamp = (kind: StampKind, at: string | null) =>
    stamp({ kind, at })
      .then(() => toast.success(`${STAMP_LABELS[kind]} stamped`))
      .catch(fail(`Could not stamp ${STAMP_LABELS[kind]}`));
  const doUpload = (req: DocumentUpload) =>
    upload(req)
      .then(() => {
        toast.success(`${req.fileName} uploaded`);
        // A POD uploaded by a user does not stamp POD received by itself; it is offered.
        if (req.kind === "POD" && c.status === "DELIVERED") setDialog({ kind: "offerPod" });
      })
      .catch(fail("Could not upload the file"));

  const ltl = c.scope === "LTL";
  // A partner delivery is set until the goods leave our warehouse.
  const partnerOpen = ltl && c.status !== "CANCELLED" && statusRank(c.status) < statusRank("ON_LINEHAUL");
  const legsTimeline = <ConsignmentLegsTimeline c={c} onPartner={partnerOpen ? (leg) => setDialog({ kind: "partner", leg }) : null} />;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "trip", label: ltl ? `${TERMS.leg}s & ${TERMS.trip.toLowerCase()}s` : `${TERMS.trip} & ${TERMS.haulier.toLowerCase()}` },
    { key: "exceptions", label: "Exceptions", count: c.exceptions.filter(isExceptionOpen).length || undefined },
    { key: "documents", label: "Documents", count: documents.length || undefined },
    { key: "history", label: "History", count: c.events.length || undefined },
  ];
  const moreItems = [
    { key: "edit", label: <MenuLabel label="Edit…" reason={actions.edit.reason} />, disabled: !actions.edit.allowed, onClick: () => setDialog({ kind: "edit" }) },
    { key: "upload", label: "Upload document…", onClick: () => setDialog({ kind: "upload" }) },
    { key: "labels", label: "Labels PDF…", onClick: () => setDialog({ kind: "labels" }) },
    {
      key: "approve",
      label: <MenuLabel label="Approve margin…" reason={actions.approveMargin.reason} />,
      disabled: !actions.approveMargin.allowed,
      onClick: () => setDialog({ kind: "approve" }),
    },
    {
      key: "cancel",
      danger: true,
      label: <MenuLabel label="Cancel consignment…" reason={actions.cancel.reason} />,
      disabled: !actions.cancel.allowed,
      onClick: () => setDialog({ kind: "cancel" }),
    },
  ];
  const cancelledEvent = c.status === "CANCELLED" ? c.events.find((e) => /cancel/i.test(e.kind)) : undefined;
  const podWaiting = c.status === "DELIVERED" ? podWait(stampOf(c.stamps, "delivered")?.at, c.podReceivedAt, businessToday()) : null;
  const internalPrice = c.internal ? consignmentInternalAmount(internalCharges, c.id) : null;
  const internalDepartment = internalCharges.find((x) => x.consignmentId === c.id)?.department || "another department";
  const handleExceptionAction = (exception: DeliveryException, action: ExceptionAction) => setDialog({ kind: "exception", action, exception });

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[240px] flex-1 items-start gap-2">
            <Link href={LIST_HREF} aria-label="Back to Consignments" className="mt-1 p-1 text-slate-400 hover:text-indigo-500">
              <ArrowLeftOutlined />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 font-mono text-[22px] font-bold text-slate-800">{c.ref}</h1>
                <TruckingStatusChip chip={CONSIGNMENT_STATUS_CHIP[c.status]} />
                {c.internal && (
                  <Tooltip title={`Job ${c.jobNumber} belongs to another department: no customer price, one internal line priced from the ${TERMS.internalTariff.toLowerCase()}, billed in the monthly ${TERMS.internalStatement.toLowerCase()}.`}>
                    <span className="inline-flex">
                      <Badge tone="i">Internal — billed to {internalDepartment}</Badge>
                    </span>
                  </Tooltip>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-slate-500">
                <span>
                  Customer <span className="font-semibold text-slate-800">{c.customerName}</span>
                </span>
                <span>
                  Job{" "}
                  <Link href={`/shipments/${c.shipmentId}?tab=trucking`} className="font-mono font-semibold text-indigo-500 hover:underline">
                    {c.jobNumber}
                  </Link>
                </span>
                {liveTrip && (
                  <span>
                    {TERMS.trip}{" "}
                    <Link href={tripHref(liveTrip.id)} className="font-mono font-semibold text-indigo-500 hover:underline">
                      {liveTrip.ref}
                    </Link>{" "}
                    · {liveTrip.haulierName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {ltl ? (
              <Tooltip title={actions.planTrip.reason}>
                <Link href={planningHref(c.pickupDate)} className={c.status === "BOOKED" ? btnPrimary : btnDefault}>
                  Planning
                </Link>
              </Tooltip>
            ) : !c.tripId || !liveTrip ? (
              <HeaderButton state={actions.planTrip} label="Plan trip…" primary={actions.planTrip.allowed} onClick={() => setDialog({ kind: "plan" })} />
            ) : (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    { key: "print", label: <MenuLabel label="Print…" reason={actions.printOrder.reason} />, disabled: !actions.printOrder.allowed, onClick: () => setTripDialog("print") },
                    {
                      key: "send",
                      label: <MenuLabel label={recordAsSentLabel(!!liveTrip.transportOrder?.sentAt)} reason={actions.sendOrder.reason} />,
                      disabled: !actions.sendOrder.allowed,
                      onClick: () => setTripDialog("send"),
                    },
                  ],
                }}
              >
                <Tooltip title={actions.printOrder.allowed ? undefined : actions.printOrder.reason}>
                  <button type="button" className={c.status === "PLANNED" && actions.sendOrder.allowed ? btnPrimary : btnDefault}>
                    {TERMS.transportOrder} <DownOutlined className="text-[10px]" />
                  </button>
                </Tooltip>
              </Dropdown>
            )}
            <ConsignmentStepBar c={c} actions={actions} onStep={handleStep} onVoid={(kind) => setDialog({ kind: "void", stamp: kind })} />
            <button type="button" className={btnDefault} onClick={() => setDialog({ kind: "upload" })}>
              <UploadOutlined /> Upload {TERMS.pod}…
            </button>
            <Dropdown trigger={["click"]} menu={{ items: moreItems }}>
              <button type="button" className={btnDefault}>
                Actions <DownOutlined className="text-[10px]" />
              </button>
            </Dropdown>
          </div>
        </div>

        {c.status === "CANCELLED" && (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={cancelledEvent ? `Cancelled ${businessDateTime(cancelledEvent.at)}${cancelledEvent.by ? ` by ${cancelledEvent.by}` : ""} — ${cancelledEvent.summary}` : "Cancelled"}
            description="Its Trucking cost lines were removed from the job. Nothing can be changed here."
          />
        )}
        {podWaiting && <Alert className="mt-3" type={podWaiting.missing ? "error" : "info"} showIcon message={podWaiting.text} />}
        {c.status !== "CANCELLED" && c.needsAttention.length > 0 && (
          <Alert className="mt-3" type="error" showIcon message="Needs attention" description={c.needsAttention.join(" · ")} />
        )}

        <div className="mt-3">
          <LifecycleStrip l={consignmentLifecycle(c, trip)} />
        </div>

        <ConsignmentStatusCards
          c={c}
          trip={liveTrip}
          levelLabel={levelLabel}
          approveMargin={actions.approveMargin}
          onApproveMargin={() => setDialog({ kind: "approve" })}
          internalPrice={internalPrice}
        />
        <ConsignmentAvizaceCard c={c} onTemplate={() => setAvizaceTextOpen(true)} onRecord={() => setDialog({ kind: "avizaceRecord" })} />

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          className="mt-4 [&_.ant-tabs-nav::before]:!border-b-0"
          tabBarStyle={{ marginBottom: 0 }}
          items={tabs.map((t) => ({
            key: t.key,
            label: (
              <span>
                {t.label}
                {t.count ? (
                  <span className={`ml-1.5 rounded-full px-1.5 text-[11px] font-semibold ${tab === t.key ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>{t.count}</span>
                ) : null}
              </span>
            ),
          }))}
        />
      </div>

      <div className="p-6">
        {tab === "overview" && (
          <div className="flex flex-col gap-4">
            {ltl && legsTimeline}
            <ConsignmentOverviewTab c={c} />
          </div>
        )}
        {tab === "trip" && ltl && legsTimeline}
        {tab === "trip" &&
          !ltl &&
          (trip ? (
            <TripPanel trip={trip} actions={actions} manager={isTruckingManager(user)} linkToTrip onDialog={setTripDialog} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-8 py-10 text-center">
              <p className="m-0 text-[13px] text-slate-500">
                No trip yet. Plan one: the hauliers with a buy tariff for this lane are offered, preferred lane first, then cheapest.
              </p>
              <HeaderButton state={actions.planTrip} label="Plan trip…" primary onClick={() => setDialog({ kind: "plan" })} />
            </div>
          ))}
        {tab === "exceptions" && <ConsignmentExceptionsTab c={c} onCreate={() => setDialog({ kind: "exceptionCreate" })} onAction={handleExceptionAction} />}
        {tab === "documents" && <ConsignmentDocumentsTab c={c} documents={documents} isLoading={docsLoading} onUpload={() => setDialog({ kind: "upload" })} />}
        {tab === "history" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <TruckingHistory events={c.events} />
            {trip && trip.events.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {TERMS.trip} {trip.ref}
                </h3>
                <TruckingHistory events={trip.events} />
              </>
            )}
          </section>
        )}
      </div>

      {dialog?.kind === "plan" && (
        <PlanTripModal
          c={c}
          onClose={close}
          onPlan={(req) =>
            planTrip(req)
              .then((res) => toast.success(`${res.trip.ref} planned with ${res.trip.haulierName} — send the transport order next`))
              .catch(fail("Could not plan the trip"))
          }
        />
      )}
      {dialog?.kind === "edit" && (
        <ConsignmentEditModal c={c} limited={actions.editLimited} onClose={close} onSave={(req) => update(req).then(() => toast.success(`${c.ref} saved`))} />
      )}
      {dialog?.kind === "stamp" && (
        <StampModal
          kind={dialog.stamp}
          note={dialog.stamp === "podReceived" && !hasPod ? "No POD document is uploaded: as a manager you stamp it without one (logged)." : undefined}
          onClose={close}
          onSubmit={(at) => doStamp(dialog.stamp, at)}
        />
      )}
      {dialog?.kind === "void" && (
        <TruckingTextModal
          title={`Void ${STAMP_LABELS[dialog.stamp]}`}
          hint={`Clears the ${STAMP_LABELS[dialog.stamp]} stamp on ${c.ref}; the status follows the stamps that remain. The old stamp, who voided it and the reason stay in the history. The job is not changed back — correct it in Shipments if needed.`}
          placeholder="Reason (required)"
          okText="Void stamp"
          danger
          onClose={close}
          onSubmit={(reason) =>
            voidStamp({ kind: dialog.stamp, reason })
              .then(() => toast.success(`${STAMP_LABELS[dialog.stamp]} voided — logged`))
              .catch(fail("Could not void the stamp"))
          }
        />
      )}
      {dialog?.kind === "upload" && <DocumentUploadModal defaultKind="POD" onClose={close} onUpload={doUpload} />}
      {dialog?.kind === "offerPod" && (
        <ConfirmModal
          open
          onClose={close}
          onConfirm={() => {
            void doStamp("podReceived", null).catch(() => undefined);
            close();
          }}
          title="Stamp POD received?"
          description={`The POD of ${c.ref} is uploaded. Stamp POD received now? When every consignment of job ${c.jobNumber} has its POD, the job moves to Billing.`}
          confirmLabel="Stamp POD received"
        />
      )}
      {dialog?.kind === "cancel" && (
        <TruckingTextModal
          title={`Cancel ${c.ref}`}
          hint={`The consignment is cancelled and its Trucking cost lines are removed from job ${c.jobNumber}. ${liveTrip?.transportOrder?.sentAt ? `Tell ${liveTrip.haulierName} yourself — the transport order went out.` : ""} The reason is logged.`}
          placeholder="Reason (required)"
          okText="Cancel consignment"
          danger
          onClose={close}
          onSubmit={(reason) =>
            cancel(reason)
              .then(() => toast.success(`${c.ref} cancelled`))
              .catch(fail("Could not cancel the consignment"))
          }
        />
      )}
      {dialog?.kind === "approve" && (
        <TruckingTextModal
          title="Approve margin"
          hint={`The margin of ${c.ref} is below the ${TERMS.marginFloor.toLowerCase()}. Approving lets the transport order go out at this margin; your name, the time and the reason are kept.`}
          placeholder="Reason (required)"
          okText="Approve margin"
          onClose={close}
          onSubmit={(reason) =>
            approveMargin(reason)
              .then(() => toast.success("Margin approved"))
              .catch(fail("Could not approve the margin"))
          }
        />
      )}
      {dialog?.kind === "labels" && <LabelsModal consignmentIds={[c.id]} what={c.ref} onClose={close} />}
      {dialog?.kind === "partner" && (
        <PartnerLegModal
          c={c}
          leg={dialog.leg}
          onClose={close}
          onSave={(req) =>
            setLegPartner({ legId: dialog.leg.id, req })
              .then(() => toast.success("Partner delivery saved"))
              .catch(fail("Could not save the partner delivery"))
          }
        />
      )}
      {trip && <TripDialogs trip={trip} dialog={tripDialog} onClose={() => setTripDialog(null)} />}
      <AvizaceTemplateDrawer
        consignmentId={c.id}
        open={avizaceTextOpen}
        onClose={() => setAvizaceTextOpen(false)}
        onRecord={() => {
          setAvizaceTextOpen(false);
          setDialog({ kind: "avizaceRecord" });
        }}
      />
      {dialog?.kind === "avizaceRecord" && (
        <AvizaceRecordModal
          defaultContact={c.delivery.contactPhone || c.delivery.contactName}
          onClose={close}
          onSave={(req) =>
            recordAvizace(req)
              .then(() => toast.success("Avizace recorded"))
              .catch(fail("Could not record the avizace"))
          }
        />
      )}
      {dialog?.kind === "exceptionCreate" && (
        <ExceptionCreateModal
          c={c}
          freeMinutes={waitingFreeOf(settings)[c.scope]}
          onClose={close}
          onCreate={(req) =>
            createException(req)
              .then(() => toast.success("Exception raised"))
              .catch(fail("Could not raise the exception"))
          }
        />
      )}
      {dialog?.kind === "exception" && dialog.action === "decide" && (
        <ExceptionDecideModal
          exception={dialog.exception}
          manager={isTruckingManager(user)}
          internal={c.internal}
          jobNumber={c.jobNumber}
          onClose={close}
          onDecide={(req) =>
            decideException({ id: dialog.exception.id, req })
              .then(() => toast.success("Decision saved"))
              .catch(fail("Could not save the decision"))
          }
        />
      )}
      {dialog?.kind === "exception" && dialog.action === "close" && (
        <TruckingTextModal
          title="Close exception"
          hint="Closes the decided exception. When no other exception is open, the consignment can become Ready to bill."
          placeholder="Note (optional)"
          okText="Close exception"
          minLength={0}
          onClose={close}
          onSubmit={(note) =>
            closeException({ id: dialog.exception.id, note })
              .then(() => toast.success("Exception closed"))
              .catch(fail("Could not close the exception"))
          }
        />
      )}
      {dialog?.kind === "exception" && dialog.action === "photo" && (
        <ExceptionPhotoModal
          onClose={close}
          onUpload={(req) =>
            addPhoto({ id: dialog.exception.id, req })
              .then(() => toast.success(`${req.fileName} added`))
              .catch(fail("Could not add the photo"))
          }
        />
      )}
    </div>
  );
};
