"use client";

import { Alert, Button, Input, Modal } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { businessDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";

export interface PortalLink {
  kind: "invite" | "reset";
  userName: string;
  link: string;
  expiresAt: string;
}

interface PortalLinkDialogProps {
  /** The link to show; null closes the dialog, and the link is then gone from the page. */
  value: PortalLink | null;
  onClose: () => void;
}

// The one-time invitation or reset link, shown once to copy: e-mail sending is off, so the
// manager passes it on. The server keeps only its hash, so it cannot be shown again.
export const PortalLinkDialog = ({ value, onClose }: PortalLinkDialogProps) => {
  const toast = useToast();

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy — select the link and copy it by hand");
    }
  };

  return (
    <Modal
      open={!!value}
      onCancel={onClose}
      title={value?.kind === "reset" ? `Password reset link for ${value.userName}` : `Invitation link for ${value?.userName ?? ""}`}
      footer={
        <Button type="primary" onClick={onClose}>
          Done
        </Button>
      }
      width={520}
      destroyOnHidden
      maskClosable={false}
    >
      {value && (
        <div className="flex flex-col gap-3">
          <Alert
            type="warning"
            showIcon
            message="This link is shown only now"
            description="Copy it and send it to the haulier yourself (e-mail sending is off). It will not be shown again — if it gets lost, reset the password for a new one. It works once."
          />
          <div className="flex gap-2">
            <Input readOnly aria-label="One-time link" value={value.link} onFocus={(e) => e.target.select()} className="font-mono" />
            <Button icon={<CopyOutlined />} onClick={handleCopy}>
              Copy
            </Button>
          </div>
          <div className="text-[13px] text-slate-600">Valid until {businessDateTime(value.expiresAt)}</div>
        </div>
      )}
    </Modal>
  );
};
