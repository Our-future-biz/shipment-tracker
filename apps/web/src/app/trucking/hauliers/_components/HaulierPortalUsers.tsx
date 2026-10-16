"use client";

import { useState } from "react";
import { Button, Spin, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { usePortalUsers, type PortalUser, type PortalUserCreate } from "@/hooks/useTrucking";
import { PORTAL_USER_STATUS } from "@/app/haulier/_lib/portal";
import { TERMS } from "../../_lib/glossary";
import { PortalLinkDialog, type PortalLink } from "./PortalLinkDialog";
import { PortalUserAddModal } from "./PortalUserAddModal";
import { PortalUserDisableDialog } from "./PortalUserDisableDialog";

interface HaulierPortalUsersProps {
  customerId: string;
  /** "" = the user is a manager and may add users, reset passwords, disable or enable; otherwise why the buttons are disabled. */
  manageReason: string;
}

// The haulier's portal users: who at the haulier signs in to the haulier portal, and their state.
// Adding one or resetting a password gives a one-time link, shown once in PortalLinkDialog.
export const HaulierPortalUsers = ({ customerId, manageReason }: HaulierPortalUsersProps) => {
  const canManage = !manageReason;
  const toast = useToast();
  const p = usePortalUsers(customerId);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<PortalLink | null>(null);
  const [resetting, setResetting] = useState<PortalUser | null>(null);
  const [disabling, setDisabling] = useState<PortalUser | null>(null);
  const [enabling, setEnabling] = useState<PortalUser | null>(null);

  const handleCreate = async (req: PortalUserCreate) => {
    try {
      const res = await p.create(req);
      setAdding(false);
      setLink({ kind: "invite", userName: res.user.name, link: res.inviteLink, expiresAt: res.expiresAt });
    } catch (e) {
      toast.error(`Could not add the user: ${apiErrorMessage(e)}`);
    }
  };
  const handleReset = async () => {
    if (!resetting) return;
    try {
      const res = await p.reset(resetting.id);
      setLink({ kind: "reset", userName: resetting.name, link: res.resetLink, expiresAt: res.expiresAt });
      setResetting(null);
    } catch (e) {
      toast.error(`Could not reset the password: ${apiErrorMessage(e)}`);
    }
  };
  const handleDisable = async (reason: string) => {
    if (!disabling) return;
    try {
      await p.disable({ id: disabling.id, reason });
      toast.success(`${disabling.name} disabled`);
      setDisabling(null);
    } catch (e) {
      toast.error(`Could not disable the user: ${apiErrorMessage(e)}`);
    }
  };
  const handleEnable = async () => {
    if (!enabling) return;
    try {
      await p.enable(enabling.id);
      toast.success(`${enabling.name} enabled`);
      setEnabling(null);
    } catch (e) {
      toast.error(`Could not enable the user: ${apiErrorMessage(e)}`);
    }
  };

  return (
    <SectionCard
      title={`${TERMS.portalUser}s`}
      extra={
        <>
          <CountChip count={p.users.length} />
          <Tooltip title={manageReason || undefined}>
            <Button size="small" icon={<PlusOutlined />} disabled={!canManage} onClick={() => setAdding(true)}>
              Add user
            </Button>
          </Tooltip>
        </>
      }
    >
      {p.isLoading ? (
        <div className="flex justify-center p-4">
          <Spin />
        </div>
      ) : p.error ? (
        <p className="m-0 text-[13px] text-red-600">Could not load the portal users: {apiErrorMessage(p.error)}.</p>
      ) : p.users.length === 0 ? (
        <p className="m-0 text-[13px] text-slate-500">
          Nobody at this haulier signs in to the {TERMS.haulierPortal.toLowerCase()} yet.{canManage ? " Add user gives a one-time invitation link to send them." : ""}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-slate-100 p-0">
          {p.users.map((u) => {
            const chip = PORTAL_USER_STATUS[u.status];
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{u.name}</span>
                    <Tooltip title={chip.hint} mouseEnterDelay={0.4}>
                      <Pill tone={chip.tone}>{chip.label}</Pill>
                    </Tooltip>
                  </div>
                  <div className="text-xs text-slate-500 [overflow-wrap:anywhere]">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ""} · {u.lastLoginAt ? `last signed in ${businessDateTime(u.lastLoginAt)}` : "never signed in"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {u.status !== "DISABLED" && (
                    <Tooltip title={manageReason || undefined}>
                      <Button size="small" disabled={!canManage} onClick={() => setResetting(u)}>
                        Reset password…
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip title={manageReason || undefined}>
                    {u.status === "DISABLED" ? (
                      <Button size="small" disabled={!canManage} onClick={() => setEnabling(u)}>
                        Enable…
                      </Button>
                    ) : (
                      <Button size="small" danger disabled={!canManage} onClick={() => setDisabling(u)}>
                        Disable…
                      </Button>
                    )}
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PortalUserAddModal open={adding} loading={p.isCreating} onClose={() => setAdding(false)} onCreate={handleCreate} />
      <PortalLinkDialog value={link} onClose={() => setLink(null)} />
      <ConfirmModal
        open={!!resetting}
        onClose={() => setResetting(null)}
        onConfirm={handleReset}
        loading={p.isResetting}
        title={`Reset the password of ${resetting?.name ?? ""}?`}
        description="The user is signed out at once and gets a new one-time link (valid 72 hours) to set a new password."
        confirmLabel="Reset and get the link"
      />
      <ConfirmModal
        open={!!enabling}
        onClose={() => setEnabling(null)}
        onConfirm={handleEnable}
        loading={p.isEnabling}
        title={`Enable ${enabling?.name ?? ""}?`}
        description="The user can sign in to the haulier portal again with the password set before."
        confirmLabel="Enable user"
      />
      <PortalUserDisableDialog userName={disabling?.name ?? null} loading={p.isDisabling} onClose={() => setDisabling(null)} onConfirm={handleDisable} />
    </SectionCard>
  );
};
