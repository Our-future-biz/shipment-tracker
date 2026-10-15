"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import { SettingOutlined } from "@ant-design/icons";

/** The gear in the Warehouse header: opens Warehouse settings (supplier e-mail, docks). */
export function SettingsLink() {
  return (
    <Tooltip title="Warehouse settings — who gets the supplier e-mails (VGM, Survey, Remeasurement), docks and hours">
      <Link
        href="/warehouse/settings"
        aria-label="Warehouse settings"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
      >
        <SettingOutlined />
      </Link>
    </Tooltip>
  );
}
