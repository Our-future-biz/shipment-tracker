"use client";

import { CopyOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";
import { ICON_BTN_GHOST } from "@/styles/ui";

interface CopyButtonProps {
  /** What is copied, e.g. a job number or a quote reference. */
  text: string;
  /** What it is, for the button's label ("Copy the reference"). */
  what: string;
}

/** The copy icon beside a record's number at the top of its page: puts the number on the clipboard. */
export const CopyButton = ({ text, what }: CopyButtonProps) => {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={`Copy ${text}`}
      title={`Copy the ${what}`}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast.success("Copied to clipboard"),
          () => toast.error(`Could not copy the ${what}`),
        )
      }
      className={ICON_BTN_GHOST}
    >
      <CopyOutlined />
    </button>
  );
};
