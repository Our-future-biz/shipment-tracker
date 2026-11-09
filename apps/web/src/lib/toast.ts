"use client";

import { useMemo } from "react";
import { App } from "antd";
import type { ArgsProps, JointContent, MessageInstance } from "antd/es/message/interface";

/** Shows an error or a warning. Nothing is handed back: see untilClicked. */
export type ShowMessage = (content: JointContent) => void;

/** antd's message API with errors and warnings that stay until clicked (useMessages). */
export type Messages = Omit<MessageInstance, "error" | "warning"> & { error: ShowMessage; warning: ShowMessage };

// An error or a warning stays on screen until the user clicks it, so nobody misses one. The same
// text shown again is the same box, so a failure that repeats doesn't pile up. Nothing is returned:
// antd's result is a promise of the box closing, and one that waits for a click would hold whatever
// awaits it - a confirm dialog whose onOk ends in `.catch(() => toast.error(…))` would spin until then.
function untilClicked(message: MessageInstance, type: "error" | "warning"): ShowMessage {
  return (content: JointContent) => {
    const args: ArgsProps =
      content !== null && typeof content === "object" && "content" in content ? (content as ArgsProps) : { content };
    const key = args.key ?? `${type}:${String(args.content)}`;
    void message[type]({
      ...args,
      key,
      duration: 0,
      style: { cursor: "pointer", ...args.style },
      onClick: (event) => {
        args.onClick?.(event);
        message.destroy(key);
      },
    });
  };
}

/** antd's message API from the App context, its errors and warnings staying until clicked. */
export function useMessages(): Messages {
  const { message } = App.useApp();
  return useMemo(() => ({ ...message, error: untilClicked(message, "error"), warning: untilClicked(message, "warning") }), [message]);
}

// Hook-based toast that works with antd's App context (no static function warnings)
export function useToast() {
  const { notification } = App.useApp();
  const message = useMessages();

  // Each returns nothing, so a promise chain ending in a toast settles at once (see untilClicked).
  return {
    success: (content: string): void => {
      void message.success(content);
    },
    error: (content: string): void => message.error(content),
    warning: (content: string): void => message.warning(content),
    info: (content: string): void => {
      void message.info(content);
    },

    notify: ({
      title,
      description,
      type = "info",
    }: {
      title: string;
      description: string;
      type?: "success" | "info" | "warning" | "error";
    }) => {
      const stays = type === "warning" || type === "error";
      const key = `${type}:${title}:${description}`;
      notification[type]({
        key,
        message: title,
        description,
        placement: "topRight",
        duration: stays ? 0 : 8,
        ...(stays ? { style: { cursor: "pointer" }, onClick: () => notification.destroy(key) } : {}),
      });
    },
  };
}
