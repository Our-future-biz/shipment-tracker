import { message, notification } from "antd";

export const toast = {
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
