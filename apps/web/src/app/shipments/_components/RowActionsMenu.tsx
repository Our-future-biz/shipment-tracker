"use client";

import { Button, Dropdown } from "antd";
import { CopyOutlined, DeleteOutlined, EllipsisOutlined } from "@ant-design/icons";

interface RowActionsMenuProps {
  onDelete: () => void;
  onCopy?: () => void;
  // What the "⋯" button is for, for screen readers: "Container actions".
  label?: string;
}

// A table row's actions behind "⋯" (Container Details, Cargo Details): Delete sits in the
// menu, one click further away, so a row is not removed by a stray click and the table does
// not look like it is about deleting. The caller decides whether Delete asks first. With
// onCopy the menu also offers Copy (above Delete).
export function RowActionsMenu({ onDelete, onCopy, label = "Row actions" }: RowActionsMenuProps) {
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: [
          ...(onCopy ? [{ key: "copy", label: "Copy", icon: <CopyOutlined /> }] : []),
          { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true },
        ],
        onClick: ({ key }) => {
          if (key === "copy") onCopy?.();
          if (key === "delete") onDelete();
        },
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<EllipsisOutlined className="text-[22px] [&_svg]:stroke-current [&_svg]:stroke-[40]" />}
        aria-label={label}
        className="justify-self-center !text-slate-900 hover:!bg-slate-100"
        // Two quick clicks open and close the menu; they must not also reach the read row
        // around it, where a double-click opens the row for editing.
        onDoubleClick={(e) => e.stopPropagation()}
      />
    </Dropdown>
  );
}
