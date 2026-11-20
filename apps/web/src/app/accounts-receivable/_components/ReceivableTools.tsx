"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown } from "antd";
import { BankOutlined, CalendarOutlined, DownOutlined, ExportOutlined, MailOutlined, ToolOutlined } from "@ant-design/icons";
import { BTN } from "@/styles/ui";
import { receivableBarTools } from "../_lib/receivables";

// The pages beside Accounts Receivable's list on its bar (step 7): bank statements and month-end as buttons of their
// own (user council A16: month-end was hunted for under Tools), the export to Pohoda and the reminder settings in the
// Tools menu. Bank statements and the export are for managers (mock test council X6: a statement shows every payment
// in and out of the account), so others don't see them; the rest everyone opens.

const ICONS: Record<string, ReactNode> = {
  "/accounts-receivable/bank": <BankOutlined />,
  "/accounts-receivable/month-end": <CalendarOutlined />,
  "/accounts-receivable/export": <ExportOutlined />,
  "/accounts-receivable/settings": <MailOutlined />,
};

export function ReceivableTools({ canAct }: { canAct: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { buttons, menu } = receivableBarTools(canAct);
  const items = menu.map((t) => ({ key: t.key, label: t.label, icon: ICONS[t.key] }));
  return (
    <>
      {buttons.map((t) => (
        <Link key={t.key} href={t.key} className={`${BTN} no-underline`}>
          {ICONS[t.key]}
          {t.label}
        </Link>
      ))}
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
    </>
  );
}
