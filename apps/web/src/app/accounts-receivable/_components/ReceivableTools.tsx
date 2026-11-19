"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "antd";
import { BankOutlined, CalendarOutlined, DownOutlined, ExportOutlined, MailOutlined, ToolOutlined } from "@ant-design/icons";
import { BTN } from "@/styles/ui";
import { receivableTools } from "../_lib/receivables";

// The Tools menu on Accounts Receivable's bar (step 7): the pages beside the list - bank statements, month-end, the
// export to Pohoda and the reminder settings. Bank statements and the export are for managers (mock test council X6:
// a statement shows every payment in and out of the account), so others don't see them; the rest everyone opens.

const ICONS: Record<string, ReactNode> = {
  "/accounts-receivable/bank": <BankOutlined />,
  "/accounts-receivable/month-end": <CalendarOutlined />,
  "/accounts-receivable/export": <ExportOutlined />,
  "/accounts-receivable/settings": <MailOutlined />,
};

export function ReceivableTools({ canAct }: { canAct: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = receivableTools(canAct).map((t) => ({ key: t.key, label: t.label, icon: ICONS[t.key] }));
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      menu={{ items, onClick: ({ key }) => router.push(key) }}
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} className={BTN}>
        <ToolOutlined />
        Tools
        <DownOutlined className="text-[10px]" />
      </button>
    </Dropdown>
  );
}
