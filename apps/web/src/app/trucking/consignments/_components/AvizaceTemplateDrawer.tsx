"use client";

import { Alert, Button, Drawer, Spin } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useAvizaceTemplate } from "@/hooks/useTruckingControl";
import { SectionCard } from "@/components/SectionCard";
import { LABEL_TEXT } from "@/styles/ui";
import { avizaceCopyText } from "../../_lib/avizace";
import { TERMS } from "../../_lib/glossary";

const LANGUAGES = [
  { key: "cs", label: "Czech" },
  { key: "en", label: "English" },
] as const;

interface AvizaceTemplateDrawerProps {
  consignmentId: string;
  open: boolean;
  onClose: () => void;
  onRecord: () => void;
}

// The avizace text the app prepares (Czech and English) to copy into a phone call, SMS or e-mail —
// nothing is sent from here, and the Pick-up PIN is never part of it.
export const AvizaceTemplateDrawer = ({ consignmentId, open, onClose, onRecord }: AvizaceTemplateDrawerProps) => {
  const toast = useToast();
  const { template, isLoading, error } = useAvizaceTemplate(consignmentId, { enabled: open });

  const handleCopy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} text copied`);
    } catch {
      toast.error("Could not copy — select the text and copy it by hand");
    }
  };

  return (
    <Drawer title={`${TERMS.avizace} text`} width={560} open={open} onClose={onClose} destroyOnHidden>
      {isLoading && (
        <div className="flex justify-center p-10">
          <Spin />
        </div>
      )}
      {!isLoading && !template && <Alert type="error" showIcon message={`Could not prepare the text: ${apiErrorMessage(error)}`} />}
      {template && (
        <div className="flex flex-col gap-4 text-[13px]">
          <p className="m-0 text-slate-600">
            E-mail sending is off: copy the text into your phone, SMS or e-mail, then <b>record</b> how the delivery was agreed. The {TERMS.pickupPin} is never part of it.
          </p>
          <div className="flex flex-col gap-0.5">
            <span className={LABEL_TEXT}>To</span>
            <span className="font-semibold text-slate-900">{template.to || "No contact on the delivery stop"}</span>
          </div>
          {LANGUAGES.map(({ key, label }) => {
            const text = avizaceCopyText(template, key);
            return (
              <SectionCard
                key={key}
                title={label}
                dense
                bodyClassName="px-4 py-3"
                extra={
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(text, label)}>
                    Copy {label}
                  </Button>
                }
              >
                <pre className="m-0 whitespace-pre-wrap break-words font-sans text-[13px] text-slate-700">{text}</pre>
              </SectionCard>
            );
          })}
          <div>
            <Button type="primary" onClick={onRecord}>
              Record avizace…
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};
