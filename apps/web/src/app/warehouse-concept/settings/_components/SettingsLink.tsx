"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { ICON_BTN_GHOST } from "@/styles/ui";

/** The gear in the Warehouse header: opens Warehouse settings (supplier e-mail, docks). */
export function SettingsLink() {
  return (
    <Tooltip title="Warehouse settings — who gets the supplier e-mails (VGM, Survey, Remeasurement), docks and hours">
      <Link
        href="/warehouse-concept/settings"
        aria-label="Warehouse settings"
        className={ICON_BTN_GHOST}
      >
        <SettingOutlined />
      </Link>
    </Tooltip>
  );
}
