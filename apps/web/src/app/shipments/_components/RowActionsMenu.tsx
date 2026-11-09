"use client";

import { Button, Dropdown } from "antd";
import { CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EllipsisOutlined } from "@ant-design/icons";

interface RowActionsMenuProps {
  /** Left out, the menu offers no Delete. */
  onDelete?: () => void;
  /** Opens a locked row for editing (first in the menu). Left out, no Edit. */
  onEdit?: () => void;
  onCopy?: () => void;
  // With a link, the menu also offers Download (above Delete): the file at that address.
  downloadHref?: string;
  /** Download done by the caller (useFilePreview's `download`: no leaving the page, a dead link says so). Wins over downloadHref. */
  onDownload?: () => void;
  // What the "⋯" button is for, for screen readers: "Container actions".
  label?: string;
}

// A table row's actions behind "⋯" (Container Details, Cargo Details): Delete sits in the
// menu, one click further away, so a row is not removed by a stray click and the table does
// not look like it is about deleting. The caller decides whether Delete asks first. With
// onCopy the menu also offers Copy, and with downloadHref Download (both above Delete).
export function RowActionsMenu({ onDelete, onEdit, onCopy, downloadHref, onDownload, label = "Row actions" }: RowActionsMenuProps) {
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: [
          ...(onEdit ? [{ key: "edit", label: "Edit", icon: <EditOutlined /> }] : []),
          ...(onCopy ? [{ key: "copy", label: "Copy", icon: <CopyOutlined /> }] : []),
          ...(onDownload || downloadHref
            ? [{ key: "download", label: "Download", icon: <DownloadOutlined /> }]
            : []),
          ...(onDelete ? [{ key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true }] : []),
        ],
        onClick: ({ key }) => {
          if (key === "edit") onEdit?.();
          if (key === "copy") onCopy?.();
          // Handled for the whole item, not a link in its label, so a click on the icon or the
          // item's edge downloads too. The address answers with the file as a download, so the
          // page stays where it is.
          if (key === "download" && onDownload) onDownload();
          else if (key === "download" && downloadHref) window.location.assign(downloadHref);
          if (key === "delete") onDelete?.();
        },
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<EllipsisOutlined className="text-[22px] [&_svg]:stroke-current [&_svg]:stroke-[40]" />}
        aria-label={label}
        className="justify-self-center"
        // Two quick clicks open and close the menu; they must not also reach the read row
        // around it, where a double-click opens the row for editing.
        onDoubleClick={(e) => e.stopPropagation()}
      />
    </Dropdown>
  );
}
