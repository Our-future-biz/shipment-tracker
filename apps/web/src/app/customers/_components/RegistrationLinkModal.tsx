"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Input, Popconfirm } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { AppModal } from "@/components/AppModal";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useCanManageCustomers, useCanSeeConcepts, useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/date";
import { useRegistrationLinks } from "@/hooks/useCompanyRegistration";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { CUSTOMER_ROLE_LABELS, customerRoleOptions } from "../_lib/constants";

interface RegistrationLinkModalProps {
  open: boolean;
  onClose: () => void;
}

const CUSTOMER_ONLY: interfaces.CustomerRole[] = ["customer"];

// A link a company registers itself through: one use, 14 days, sent by the user. The roles are decided
// here and the company never sees them; a manager answers the registration on Company approval.
export function RegistrationLinkModal({ open, onClose }: RegistrationLinkModalProps) {
  const canSeeConcepts = useCanSeeConcepts();
  const isManager = useCanManageCustomers();
  const { user } = useAuth();
  const toast = useToast();
  const { links, create, revoke } = useRegistrationLinks({ enabled: open });
  const [roles, setRoles] = useState<interfaces.CustomerRole[]>(CUSTOMER_ONLY);
  const [label, setLabel] = useState("");
  // The address is known only now: it can't be read back later.
  const [url, setUrl] = useState("");

  const handleCreate = () =>
    create.mutate(
      { roles, label: label.trim() || undefined },
      {
        onSuccess: (answer) => {
          setUrl(answer.url);
          setLabel("");
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );

  const copy = () => {
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Could not copy the link: select it and copy it by hand"),
    );
  };

  const close = () => {
    setUrl("");
    setLabel("");
    setRoles(CUSTOMER_ONLY);
    onClose();
  };

  return (
    <AppModal open={open} onClose={close} title="Registration link" subtitle="The company fills in its own details and accepts the terms. A manager then approves it." footer={<Button onClick={close}>Close</Button>}>
      {url ? (
        <div className="flex flex-col gap-2">
          <Alert type="success" showIcon message="The link is ready. Copy it now and send it to the company: it can't be shown again." />
          <div className="flex gap-2">
            <Input readOnly aria-label="Registration link" value={url} onFocus={(e) => e.target.select()} />
            <Button type="primary" icon={<CopyOutlined />} onClick={copy}>
              Copy
            </Button>
          </div>
          <span className={HINT}>It can be used once, for 14 days.</span>
          <div>
            <Button size="small" onClick={() => setUrl("")}>
              Create another
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className={`${LABEL_TEXT} mb-1.5`}>Roles</div>
            <Checkbox.Group options={customerRoleOptions(canSeeConcepts)} value={roles} onChange={setRoles} />
            {roles.length === 0 && <div className="text-[12px] text-red-600 mt-1">Choose at least one role</div>}
          </div>
          <label className="block">
            <span className={`block ${LABEL_TEXT} mb-1.5`}>Who it is for (optional)</span>
            <Input maxLength={200} placeholder="A reminder for you, the company does not see it" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div>
            <Button type="primary" loading={create.isPending} disabled={roles.length === 0} onClick={handleCreate}>
              Create link
            </Button>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="border-t border-slate-200 mt-4 pt-3">
          <div className={`${LABEL_TEXT} mb-1.5`}>Links not used yet</div>
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-[13px] text-slate-700">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{l.label || l.roles.map((r) => CUSTOMER_ROLE_LABELS[r] ?? r).join(", ")}</span>
                  <span className={`block ${HINT}`}>
                    {l.createdBy} · valid until {formatDate(l.expiresAt)}
                  </span>
                </span>
                {(isManager || l.createdByUserId === user?.id) && (
                  <Popconfirm
                    title="Cancel this link?"
                    description="The company will no longer be able to register with it."
                    okText="Cancel link"
                    cancelText="Keep it"
                    onConfirm={() => revoke.mutate(l.id, { onError: (e) => toast.error(apiErrorMessage(e)) })}
                  >
                    <Button size="small">Cancel</Button>
                  </Popconfirm>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppModal>
  );
}
