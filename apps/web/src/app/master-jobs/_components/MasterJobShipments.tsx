"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Checkbox, Dropdown, Input, Modal, Space, Spin, Tooltip } from "antd";
import { useMessages } from "@/lib/toast";
import { DisconnectOutlined, EllipsisOutlined, LockOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useDebounced } from "@/hooks/useDebounced";
import { useMasterJobTracking, type MasterJobTrackingHouse } from "@/hooks/useShipmentTracking";
import { useAuth } from "@/lib/auth/AuthContext";
import { useColumnWidths } from "@/hooks/useColumnWidths";
import { ResizableTh } from "@/components/ResizableTh";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";
import { LINK_REFUSED_HINT, linkedCount } from "@/app/shipments/_components/MasterJobDialog";
import type { MasterJobItem, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { Badge } from "@/components/Badge";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { PillTabs } from "@/components/SectionCard";
import { formatDate } from "@/lib/date";
import { placeCodeOf } from "@/lib/places";
import { EMPTY_STATE, HINT, LINK, MODAL_TITLE, REF, TD, TH } from "@/styles/ui";

// The picker's head stays put while its rows scroll, as the Master Job dialog's does; z-10 keeps
// it over antd's checkbox inputs, so a row scrolled under it can't be ticked through it.
const PICK_TH = `${TH} sticky top-0 z-10 bg-white`;

/** Why a shipment the user may not change offers no Remove (the server refuses it: lib/shipmentEditRule). */
const UNLINK_REFUSED_HINT = "Only its Person in Charge, Holiday Cover or a manager can remove it from the master job";

// Two views of the same houses: who they are, and where each one stands.
type View = "details" | "status";
const VIEWS: readonly { key: View; label: string; title: string }[] = [
  { key: "details", label: "Details", title: "Customer, shipper, consignee, trade direction and container numbers" },
  { key: "status", label: "Status", title: "ATD, ATA, customs status, warehouse received, delivered and the last event" },
];

// A header cell that clips its title once its column is dragged narrower than it (ResizableTh).
const RTH = `${TH} overflow-hidden text-ellipsis`;

const Day = ({ day }: { day: string | null | undefined }) => (day ? <span className="tabular-nums whitespace-nowrap">{formatDate(day)}</span> : EMPTY_CELL);

// A house's customs: Cleared as a green pill, else its status as a hint.
const Customs = ({ house }: { house: MasterJobTrackingHouse | undefined }) =>
  house?.customsCleared ? <Pill tone="green">Cleared</Pill> : house?.customsStatus ? <span className={HINT}>{house.customsStatus}</span> : EMPTY_CELL;

interface MasterJobShipmentsProps {
  masterJob: MasterJobItem;
  shipments: MasterJobShipmentItem[];
  onLink: (shipmentIds: string[]) => Promise<unknown>;
  onUnlink: (shipmentId: string) => Promise<unknown>;
}

// The house shipments under the master job, with linking and unlinking right here. A switch shows
// either who they are (Details) or where each one stands (Status, what the Tracking tab listed).
export function MasterJobShipments({ masterJob, shipments, onLink, onUnlink }: MasterJobShipmentsProps) {
  const message = useMessages();
  const [picking, setPicking] = useState(false);
  const [view, setView] = useState<View>("details");
  // Where each house stands, read only while Status is shown. The rows stay the linked list's, in its
  // order; a house is matched by its id, and one linked a moment ago shows "—" until it is read.
  const tracking = useMasterJobTracking(masterJob.id, view === "status");
  const standing = new Map((tracking.data ?? []).map((h) => [h.shipmentId, h]));
  const status = view === "status";
  // A shipment the user may not change cannot be taken off by them either (the server refuses it).
  const { user } = useAuth();
  const sizing = useColumnWidths(user?.id, "master-job-shipments");

  const handleUnlink = async (s: MasterJobShipmentItem) => {
    try {
      await onUnlink(s.id);
      message.success(`${s.jobNumber} removed from ${masterJob.mczNumber}`);
    } catch (e) {
      // Refused, e.g., for a shipment the user may not change (lib/shipmentEditRule): the server says why.
      message.error(`Removing the shipment failed: ${apiErrorMessage(e)}`);
    }
  };

  // The row whose Remove waits for a yes (asked in a dialog, as the "⋯" menu closes on the click).
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const toUnlink = shipments.find((s) => s.id === confirmUnlinkId);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <PillTabs tabs={VIEWS} active={view} onChange={setView} />
        {status && tracking.isFetching && <Spin size="small" />}
      </div>
      {status && tracking.isError && (
        <Alert type="error" showIcon className="!mb-3" message={`Could not load where the shipments stand: ${apiErrorMessage(tracking.error)}`} />
      )}
      <div className="relative">
        {/* Link shipments: the small "+" laid over the header row's right end, above the rows' "⋯". */}
        <Tooltip title="Link shipments">
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined className="text-[11px]" />}
            aria-label="Link shipments"
            onClick={() => setPicking(true)}
            className="!absolute top-1 right-[7px] z-10 !w-[22px] !h-[22px] !min-w-0 !p-0"
          />
        </Tooltip>
        <div className="overflow-x-auto">
          {/* Fixed columns, as the shipment's tables have them: Internal Reference and Customer keep their
              width when the view changes, and the "⋯" column is last in both. Each column can be dragged
              to a width of its own (ResizableTh); a table wider than the card scrolls. A long value is cut
              short (a name in full on hover); in Status a long customs status or last event wraps. */}
          <table className={`w-full table-fixed border-separate border-spacing-0 ${status ? "min-w-[1080px]" : "min-w-[900px]"}`}>
            <thead>
              <tr>
                <ResizableTh sizing={sizing} k="jobNumber" className={`${RTH} w-[172px]`}>Internal Reference</ResizableTh>
                <ResizableTh sizing={sizing} k="customer" className={`${RTH} w-[190px]`}>Customer</ResizableTh>
                {status ? (
                  <>
                    <ResizableTh sizing={sizing} k="departed" className={`${RTH} w-[96px]`}>ATD Actual</ResizableTh>
                    <ResizableTh sizing={sizing} k="arrived" className={`${RTH} w-[96px]`}>ATA Actual</ResizableTh>
                    <ResizableTh sizing={sizing} k="customs" className={`${RTH} w-[132px]`}>Customs Status</ResizableTh>
                    <ResizableTh sizing={sizing} k="gateIn" className={`${RTH} w-[156px]`}>Warehouse Received</ResizableTh>
                    <ResizableTh sizing={sizing} k="delivered" className={`${RTH} w-[96px]`}>Delivered</ResizableTh>
                    <ResizableTh sizing={sizing} k="lastEvent" className={RTH}>Last event</ResizableTh>
                  </>
                ) : (
                  <>
                    <ResizableTh sizing={sizing} k="shipper" className={RTH}>Shipper</ResizableTh>
                    <ResizableTh sizing={sizing} k="consignee" className={RTH}>Consignee</ResizableTh>
                    <ResizableTh sizing={sizing} k="tradeDirection" className={`${RTH} w-[136px]`}>Trade Direction</ResizableTh>
                    <ResizableTh sizing={sizing} k="containerNumber" className={`${RTH} w-[160px]`}>Container Number</ResizableTh>
                  </>
                )}
                {/* The actions column: the "+" above lies over it. */}
                <th className={`${TH} w-9`} />
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {shipments.map((s) => {
                const house = standing.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className={`${TD} truncate`}>
                      {/* From Status, the shipment opens on its own Tracking. */}
                      <Link href={status ? `/shipments/${s.id}?tab=tracking` : `/shipments/${s.id}`} className={`${REF} font-semibold ${LINK}`}>
                        {s.jobNumber}
                      </Link>
                    </td>
                    <td className={`${TD} truncate`} title={s.customer || undefined}>{s.customer || EMPTY_CELL}</td>
                    {status ? (
                      <>
                        <td className={`${TD} truncate`}><Day day={house?.departed} /></td>
                        <td className={`${TD} truncate`}><Day day={house?.arrived} /></td>
                        <td className={`${TD} overflow-hidden`}><Customs house={house} /></td>
                        <td className={`${TD} truncate`}><Day day={house?.gateIn} /></td>
                        <td className={`${TD} truncate`}><Day day={house?.delivered} /></td>
                        <td className={`${TD} overflow-hidden break-words`}>{house?.lastEvent || EMPTY_CELL}</td>
                      </>
                    ) : (
                      <>
                        <td className={`${TD} truncate`} title={s.shipper || undefined}>{s.shipper || EMPTY_CELL}</td>
                        <td className={`${TD} truncate`} title={s.consignee || undefined}>{s.consignee || EMPTY_CELL}</td>
                        <td className={`${TD} truncate`}>{s.tradeDirection || EMPTY_CELL}</td>
                        <td className={`${TD} truncate`}>
                          {/* As in the Shipments grid: the numbers open the shipment's Container Details. */}
                          {s.containerNumber ? (
                            <Link href={`/shipments/${s.id}?tab=container`} className={`${REF} ${LINK} font-medium`}>
                              {s.containerNumber}
                            </Link>
                          ) : (
                            EMPTY_CELL
                          )}
                        </td>
                      </>
                    )}
                    <td className={`${TD} text-center`}>
                      <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                          items: [
                            canChangeShipmentDetails(user, s)
                              ? { key: "remove", label: "Remove from master job", icon: <DisconnectOutlined />, danger: true }
                              : {
                                  key: "remove",
                                  disabled: true,
                                  icon: <DisconnectOutlined />,
                                  label: <span title={UNLINK_REFUSED_HINT}>Remove from master job</span>,
                                },
                          ],
                          onClick: () => setConfirmUnlinkId(s.id),
                        }}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<EllipsisOutlined className="text-[22px] [&_svg]:stroke-current [&_svg]:stroke-[40]" />}
                          aria-label={`Actions for ${s.jobNumber}`}
                        />
                      </Dropdown>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shipments.length === 0 && <div className={EMPTY_STATE}>No shipments linked yet.</div>}
        </div>
      </div>
      <ConfirmModal
        open={!!toUnlink}
        title={toUnlink ? `Remove ${toUnlink.jobNumber} from ${masterJob.mczNumber}?` : ""}
        description="The shipment keeps the values it got from the master job."
        confirmLabel="Remove"
        danger
        loading={unlinking}
        onClose={() => setConfirmUnlinkId(null)}
        // Remove waits for the server, as the old confirmation did; the dialog closes once it answered.
        onConfirm={async () => {
          if (!toUnlink) return;
          setUnlinking(true);
          try {
            await handleUnlink(toUnlink);
          } finally {
            setUnlinking(false);
            setConfirmUnlinkId(null);
          }
        }}
      />
      <LinkShipmentsModal
        open={picking}
        masterJob={masterJob}
        linkedIds={new Set(shipments.map((s) => s.id))}
        onClose={() => setPicking(false)}
        onLink={onLink}
      />
    </>
  );
}

interface LinkShipmentsModalProps {
  open: boolean;
  masterJob: MasterJobItem;
  linkedIds: Set<string>;
  onClose: () => void;
  onLink: (shipmentIds: string[]) => Promise<unknown>;
}

// The shipments to link, in the Master Job dialog's table (Shipments › Link to Master Job).
function LinkShipmentsModal({ open, masterJob, linkedIds, onClose, onLink }: LinkShipmentsModalProps) {
  const message = useMessages();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);
  const search = useDebounced(query, 300);

  // Searched on the server over every shipment, not only the newest loaded ones.
  const results = useQuery({
    queryKey: ["shipments", "master-job-picker", search],
    queryFn: () => api.shipments.shipmentList({ search, limit: 50 }),
    enabled: open,
  });
  const candidates = (results.data?.data ?? []).filter((s) => !linkedIds.has(s.id) && !s.jobNumber.startsWith("CZQ"));
  // The server links all of them or none, and refuses a shipment whose details the user may not
  // change: such a one is shown, not offered.
  const { user } = useAuth();
  const mayLink = (s: (typeof candidates)[number]) => canChangeShipmentDetails(user, s);

  // A tick stays through a new search, so shipments found by different searches link together.
  const toggle = (s: (typeof candidates)[number]) => {
    if (!mayLink(s)) return;
    setSelected((prev) => (prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]));
  };

  const handleClose = () => {
    setQuery("");
    setSelected([]);
    onClose();
  };

  const handleLink = async () => {
    if (selected.length === 0 || linking) return;
    setLinking(true);
    try {
      await onLink(selected);
      message.success(`Linked ${linkedCount(selected.length)} to ${masterJob.mczNumber}`);
      handleClose();
    } catch (e) {
      message.error(`Linking the shipments failed: ${apiErrorMessage(e)}`);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={<span className={MODAL_TITLE}>Link shipments to {masterJob.mczNumber}</span>}
      onCancel={handleClose}
      width={820}
      destroyOnHidden
      footer={
        <div className="flex justify-between items-center gap-3">
          <span className={HINT}>{linkedCount(selected.length)} selected</span>
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="primary" disabled={selected.length === 0} loading={linking} onClick={handleLink}>
              {selected.length ? `Link ${selected.length}` : "Link"}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className={`m-0 ${HINT}`}>Linked shipments take over the master job&apos;s synced MBL details.</p>
        <Input
          autoFocus
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search job number, customer, shipper, consignee, Port of Loading, Port of Discharge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search shipments"
        />
        {/* The Master Job dialog's table: a click anywhere on a row ticks it. scroll-pt-9: a box reached
            from the keyboard stops below the sticky head. */}
        <div className="max-h-[420px] overflow-auto scroll-pt-9 rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${PICK_TH} w-10 !pl-3`}>
                  <span className="sr-only">Selected</span>
                </th>
                <th className={`${PICK_TH} w-[172px]`}>Internal Reference</th>
                <th className={PICK_TH}>Customer</th>
                <th className={`${PICK_TH} w-[150px]`}>Route</th>
                <th className={`${PICK_TH} w-[96px]`}>ETD</th>
                <th className={`${PICK_TH} w-[124px] !pr-3`}>Master Job</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {candidates.map((s) => {
                const locked = !mayLink(s);
                const isChecked = !locked && selected.includes(s.id);
                // The ports by their codes ("CNSGH → DEHAM"), in full on hover.
                const route = [s.pol, s.pod].filter(Boolean).map((p) => placeCodeOf(p) ?? p).join(" → ");
                const routeInFull = [s.pol, s.pod].filter(Boolean).join(" → ");
                // A shipment with no customer yet is named by its shipper, else its consignee, muted; the
                // hover says which it is.
                const party = s.customer || s.shipper || s.consignee;
                const partyTitle = s.customer || (s.shipper ? `Shipper: ${s.shipper}` : s.consignee ? `Consignee: ${s.consignee}` : undefined);
                // On a locked row the hover ends with why it is locked, wherever you point.
                const lockedTitle = (own?: string) => [own, LINK_REFUSED_HINT].filter(Boolean).join("\n");
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggle(s)}
                    title={locked ? LINK_REFUSED_HINT : undefined}
                    aria-disabled={locked || undefined}
                    className={`transition-colors ${locked ? "cursor-not-allowed text-slate-400" : isChecked ? "cursor-pointer bg-indigo-50/70" : "cursor-pointer hover:bg-slate-50"}`}
                  >
                    {/* The box ticks it by itself (and from the keyboard), so its clicks don't also reach the row. */}
                    <td
                      className={`${TD} !pl-3`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!(e.target as Element).closest(".ant-checkbox-wrapper")) toggle(s);
                      }}
                    >
                      {locked ? (
                        <span className="flex h-4 w-4 items-center justify-center text-[13px] text-slate-400">
                          <LockOutlined aria-label="Not yours to link" />
                        </span>
                      ) : (
                        <Checkbox checked={isChecked} onChange={() => toggle(s)} aria-label={`Link ${s.jobNumber}`} />
                      )}
                    </td>
                    <td className={`${TD} truncate`} title={locked ? undefined : s.jobNumber}>
                      <span className={`${REF} font-semibold ${locked ? "text-slate-400" : "text-slate-900"}`}>{s.jobNumber}</span>
                    </td>
                    <td className={`${TD} truncate ${locked || (!s.customer && party) ? "!text-slate-400" : ""}`} title={locked ? lockedTitle(partyTitle) : partyTitle}>
                      {party || EMPTY_CELL}
                    </td>
                    <td className={`${TD} truncate tabular-nums ${locked ? "!text-slate-400" : ""}`} title={locked ? lockedTitle(routeInFull) : routeInFull || undefined}>
                      {route || EMPTY_CELL}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular-nums ${locked ? "!text-slate-400" : ""}`}>{formatDate(s.estimatedDeparture) || EMPTY_CELL}</td>
                    <td className={`${TD} whitespace-nowrap !pr-3`}>
                      {/* On another master job: linking moves it here. */}
                      {s.masterJobMczNumber ? (
                        <Badge
                          tone={locked ? "" : "a"}
                          className={`${REF} ${locked ? "!text-slate-400" : ""}`}
                          title={locked ? undefined : `Linking takes it off ${s.masterJobMczNumber}`}
                        >
                          {s.masterJobMczNumber}
                        </Badge>
                      ) : (
                        EMPTY_CELL
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {results.isLoading ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : (
            candidates.length === 0 && <div className={EMPTY_STATE}>{search ? "No shipments match the search." : "No shipments found."}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
