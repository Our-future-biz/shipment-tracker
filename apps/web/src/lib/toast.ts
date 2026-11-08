"use client";

import { useMemo } from "react";
import { App } from "antd";
import type { ArgsProps, JointContent, MessageInstance } from "antd/es/message/interface";

// An error or a warning stays on screen until the user clicks it, so nobody misses one. The same
// text shown again is the same box, so a failure that repeats doesn't pile up.
function untilClicked(message: MessageInstance, type: "error" | "warning"): MessageInstance["error"] {
  return (content: JointContent) => {
    const args: ArgsProps =
      content !== null && typeof content === "object" && "content" in content ? (content as ArgsProps) : { content };
    const key = args.key ?? `${type}:${String(args.content)}`;
    return message[type]({
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
export function useMessages(): MessageInstance {
  const { message } = App.useApp();
  return useMemo(() => ({ ...message, error: untilClicked(message, "error"), warning: untilClicked(message, "warning") }), [message]);
}

// Hook-based toast that works with antd's App context (no static function warnings)
export function useToast() {
  const { notification } = App.useApp();
  const message = useMessages();

  return {
    success: (content: string) => message.success(content),
    error: (content: string) => message.error(content),
    warning: (content: string) => message.warning(content),
    info: (content: string) => message.info(content),

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
