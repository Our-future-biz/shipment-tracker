"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { downloadDataUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";
import type { FileDownload } from "@/hooks/useTrucking";
import { fileDataUrl } from "../../_lib/tariffUpload";

interface TariffDownloadButtonProps {
  children: ReactNode;
  /** Fetches the file when clicked (a template or a version's uploaded file). */
  load: () => Promise<FileDownload>;
  size?: ButtonProps["size"];
  type?: ButtonProps["type"];
  ariaLabel?: string;
}

// A button that fetches a file from the server and saves it to disk under the server's file name.
export const TariffDownloadButton = ({ children, load, size, type, ariaLabel }: TariffDownloadButtonProps) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const file = await load();
      downloadDataUrl(fileDataUrl(file), file.fileName);
    } catch (e) {
      toast.error(`Could not download the file: ${apiErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size={size} type={type} icon={<DownloadOutlined />} loading={loading} onClick={handleClick} aria-label={ariaLabel}>
      {children}
    </Button>
  );
};
