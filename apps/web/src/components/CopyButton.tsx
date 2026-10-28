"use client";

import { CopyOutlined } from "@ant-design/icons";
import { useToast } from "@/lib/toast";

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
      className="text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
    >
      <CopyOutlined />
    </button>
  );
};
