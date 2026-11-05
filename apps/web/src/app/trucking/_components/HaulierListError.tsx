"use client";

import { Alert, Button } from "antd";

interface HaulierListErrorProps {
  onRetry: () => void;
}

// Trucking's haulier list could not be read, so no haulier's rating is known: a dialog that sets a haulier
// saves nothing until it is, or a 0-star one would go without "Use this haulier anyway" (m24).
export function HaulierListError({ onRetry }: HaulierListErrorProps) {
  return (
    <Alert
      className="mt-3"
      type="error"
      showIcon
      message="The haulier list could not be read, so the hauliers' ratings are not known. Nothing is saved until it is."
      action={
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
