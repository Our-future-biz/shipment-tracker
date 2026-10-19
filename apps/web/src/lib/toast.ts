"use client";

import { App } from "antd";

// Hook-based toast that works with antd's App context (no static function warnings)
export function useToast() {
  const { message, notification } = App.useApp();

  return {
    success: (content: string) => message.success(content),
    // duration in seconds, for an error long enough to need more reading time than the default
    error: (content: string, duration?: number) => message.error(content, duration),
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
      notification[type]({
        message: title,
        description,
        placement: "topRight",
        duration: 8,
      });
    },
  };
}
