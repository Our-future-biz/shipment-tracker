"use client";

import { Tooltip } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { ICON_BTN_GHOST } from "@/styles/ui";

interface PreviewButtonProps {
  /** What is shown, for screen readers: "Preview MBL.pdf". */
  fileName: string;
  onClick: () => void;
  disabled?: boolean;
  /** The tooltip, "Preview" unless the place says better (e.g. "Preview PDF" of a quote). */
  title?: string;
}

/**
 * The app's one "eye": shows a document, a file or a quote in the app's preview. The same look,
 * tooltip and label everywhere. A click on it never reaches the row or card it sits in.
 */
export function PreviewButton({ fileName, onClick, disabled, title = "Preview" }: PreviewButtonProps) {
  return (
    <Tooltip title={title}>
      <button
        type="button"
        aria-label={`${title} ${fileName}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        // One size of eye everywhere, whatever the text size of the row it sits in.
        className={`${ICON_BTN_GHOST} text-[14px] !text-slate-500 hover:!text-slate-900`}
      >
        <EyeOutlined aria-hidden />
      </button>
    </Tooltip>
  );
}
