"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "antd";
import { BankOutlined, CalendarOutlined, DownOutlined, ExportOutlined, MailOutlined, ToolOutlined } from "@ant-design/icons";
import { BTN } from "@/styles/ui";

// The Tools menu on Accounts Receivable's bar (step 7): the pages beside the list - bank statements, month-end, the
// export to Pohoda and the reminder settings. Everyone opens them; managers act on them.

const TOOLS = [
  { key: "/accounts-receivable/bank", icon: <BankOutlined />, label: "Bank statements" },
  { key: "/accounts-receivable/month-end", icon: <CalendarOutlined />, label: "Month-end" },
  { key: "/accounts-receivable/export", icon: <ExportOutlined />, label: "Export to Pohoda" },
  { key: "/accounts-receivable/settings", icon: <MailOutlined />, label: "Reminder settings" },
];

export function ReceivableTools() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      menu={{ items: TOOLS, onClick: ({ key }) => router.push(key) }}
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} className={BTN}>
        <ToolOutlined />
        Tools
        <DownOutlined className="text-[10px]" />
      </button>
    </Dropdown>
  );
}
