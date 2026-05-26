"use client";

import { App } from "antd";

// Hook-based toast that works with antd's App context (no static function warnings)
export function useToast() {
  const { message, notification } = App.useApp();

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
      notification[type]({
        message: title,
        description,
        placement: "topRight",
        duration: 8,
      });
    },
  };
}
