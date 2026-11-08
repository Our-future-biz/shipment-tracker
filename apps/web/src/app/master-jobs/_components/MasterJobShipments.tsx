"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, App, Button, Checkbox, Dropdown, Input, Modal, Spin, Tooltip } from "antd";
import { DisconnectOutlined, EllipsisOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useDebounced } from "@/hooks/useDebounced";
import { useMasterJobTracking, type MasterJobTrackingHouse } from "@/hooks/useShipmentTracking";
import { useAuth } from "@/lib/auth/AuthContext";
import { canChangeShipmentDetails } from "@/lib/shipmentEditRule";
import { LINK_REFUSED_HINT } from "@/app/shipments/_components/MasterJobDialog";
import type { MasterJobItem, MasterJobShipmentItem } from "@/hooks/useMasterJobs";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { PillTabs } from "@/components/SectionCard";
import { formatDate } from "@/lib/date";
import { EMPTY_STATE, HINT, LABEL_TEXT, LINK, REF } from "@/styles/ui";

// The Container Details table look: column titles over a slate-200 rule, rows split by thin
// slate-100 lines (none under the last row).
const TH = `px-2 pb-2 text-left align-bottom whitespace-nowrap ${LABEL_TEXT} border-b border-slate-200`;
const TD = "px-2 py-2 align-middle text-[13px] text-slate-700";

/** Why a shipment the user may not change offers no Remove (the server refuses it: lib/shipmentEditRule). */
const UNLINK_REFUSED_HINT = "Only its Person in Charge, Holiday Cover or a manager can remove it from the master job";

// Two views of the same houses: who they are, and where each one stands.
type View = "details" | "status";
const VIEWS: readonly { key: View; label: string; title: string }[] = [
  { key: "details", label: "Details", title: "Customer, shipper, consignee, direction and containers" },
  { key: "status", label: "Status", title: "Departed, arrived, customs, gate in, delivered and the last event" },
];

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
  const { message } = App.useApp();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<View>("details");
  // Where each house stands, read only while Status is shown. The rows stay the linked list's, in its
  // order; a house is matched by its id, and one linked a moment ago shows "—" until it is read.
  const tracking = useMasterJobTracking(masterJob.id, view === "status");
  const standing = new Map((tracking.data ?? []).map((h) => [h.shipmentId, h]));
  const status = view === "status";

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
  // A shipment the user may not change cannot be taken off by them either (the server refuses it).
  const { user } = useAuth();

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
        {/* Add shipments: the small "+" laid over the header row's right end, above the rows' "⋯". */}
        <Tooltip title="Add shipments">
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined className="text-[11px]" />}
            aria-label="Add shipments"
            onClick={() => setAdding(true)}
            className="!absolute -top-1 right-[7px] z-10 !w-[22px] !h-[22px] !min-w-0 !p-0"
          />
        </Tooltip>
        <div className="overflow-x-auto">
          {/* Job Number and Customer stay put when the view changes; the "⋯" column is last in both. In
              Status a long customs status or last event wraps rather than widening the table. */}
          <table className={`w-full border-collapse ${status ? "min-w-[860px]" : "min-w-[760px]"}`}>
            <thead>
              <tr>
                <th className={TH}>Job Number</th>
                <th className={TH}>Customer</th>
                {status ? (
                  <>
                    <th className={TH}>Departed</th>
                    <th className={TH}>Arrived</th>
                    <th className={TH}>Customs</th>
                    <th className={TH}>Gate in</th>
                    <th className={TH}>Delivered</th>
                    <th className={TH}>Last event</th>
                  </>
                ) : (
                  <>
                    <th className={TH}>Shipper</th>
                    <th className={TH}>Consignee</th>
                    <th className={`${TH} !text-center`}>Direction</th>
                    <th className={TH}>Containers</th>
                  </>
                )}
                {/* The actions column: the "+" above lies over it. */}
                <th className={`${TH} w-9`} />
              </tr>
            </thead>
            <tbody>
              {shipments.map((s, i) => {
                const house = standing.get(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-50 transition-colors ${i < shipments.length - 1 ? "border-b border-slate-100" : ""}`}
                  >
                    <td className={`${TD} whitespace-nowrap`}>
                      {/* From Status, the shipment opens on its own Tracking. */}
                      <Link href={status ? `/shipments/${s.id}?tab=tracking` : `/shipments/${s.id}`} className={`${REF} font-semibold ${LINK}`}>
                        {s.jobNumber}
                      </Link>
                    </td>
                    <td className={TD}>{s.customer || EMPTY_CELL}</td>
                    {status ? (
                      <>
                        <td className={TD}><Day day={house?.departed} /></td>
                        <td className={TD}><Day day={house?.arrived} /></td>
                        <td className={TD}><Customs house={house} /></td>
                        <td className={TD}><Day day={house?.gateIn} /></td>
                        <td className={TD}><Day day={house?.delivered} /></td>
                        <td className={TD}>{house?.lastEvent || EMPTY_CELL}</td>
                      </>
                    ) : (
                      <>
                        <td className={TD}>{s.shipper || EMPTY_CELL}</td>
                        <td className={TD}>{s.consignee || EMPTY_CELL}</td>
                        <td className={`${TD} text-center`}>{s.tradeDirection || EMPTY_CELL}</td>
                        <td className={`${TD} ${REF}`}>{s.containerNumber || EMPTY_CELL}</td>
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
      <AddShipmentsModal
        open={adding}
        masterJob={masterJob}
        linkedIds={new Set(shipments.map((s) => s.id))}
        onClose={() => setAdding(false)}
        onLink={onLink}
      />
    </>
  );
}

interface AddShipmentsModalProps {
  open: boolean;
  masterJob: MasterJobItem;
  linkedIds: Set<string>;
  onClose: () => void;
  onLink: (shipmentIds: string[]) => Promise<unknown>;
}

function AddShipmentsModal({ open, masterJob, linkedIds, onClose, onLink }: AddShipmentsModalProps) {
  const { message } = App.useApp();
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

  const handleClose = () => {
    setQuery("");
    setSelected([]);
    onClose();
  };

  const handleLink = async () => {
    setLinking(true);
    try {
      await onLink(selected);
      message.success(`Linked ${selected.length} shipment${selected.length === 1 ? "" : "s"} to ${masterJob.mczNumber}`);
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
      title={`Add shipments to ${masterJob.mczNumber}`}
      onCancel={handleClose}
      okText={selected.length ? `Link ${selected.length}` : "Link"}
      okButtonProps={{ disabled: selected.length === 0, loading: linking }}
      onOk={handleLink}
      width={720}
    >
      <p className={`${HINT} mb-3`}>
        Linked shipments take over the master job&apos;s synced MBL details.
      </p>
      <Input
        autoFocus
        allowClear
        prefix={<SearchOutlined className="text-slate-400" />}
        placeholder="Search job number, customer, shipper, consignee, POL, POD…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-3 max-h-[420px] overflow-y-auto border border-slate-200 rounded-lg">
        {results.isLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : candidates.length === 0 ? (
          <div className={`py-8 text-center ${HINT}`}>No shipments found.</div>
        ) : (
          <Checkbox.Group className="w-full flex-col" value={selected} onChange={(v) => setSelected(v as string[])}>
            {candidates.map((s) => (
              <label
                key={s.id}
                title={mayLink(s) ? undefined : LINK_REFUSED_HINT}
                className={`flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-b-0 text-[12px] ${
                  mayLink(s) ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-50"
                }`}
              >
                <Checkbox value={s.id} disabled={!mayLink(s)} />
                <span className={`${REF} font-semibold w-[110px] shrink-0`}>{s.jobNumber}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">{s.customer || s.shipper || EMPTY_CELL}</span>
                <span className="w-[120px] shrink-0 text-slate-500 truncate">
                  {[s.pol, s.pod].filter(Boolean).join(" → ")}
                </span>
                {s.masterJobMczNumber && (
                  <span className="shrink-0 text-amber-600" title="Linking moves it to this master job">
                    on {s.masterJobMczNumber}
                  </span>
                )}
              </label>
            ))}
          </Checkbox.Group>
        )}
      </div>
    </Modal>
  );
}
