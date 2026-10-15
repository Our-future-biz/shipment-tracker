"use client";

import { Alert, Button } from "antd";

interface QuotesLoadErrorProps {
  onRetry: () => void;
}

// Shown wherever quotes are asked of the server and the request failed. A list that could not be
// read is not an empty one: without this notice the screen would say "no quotes" or add up zeros.
export function QuotesLoadError({ onRetry }: QuotesLoadErrorProps) {
  return (
    <Alert
      type="error"
      showIcon
      message="Quotes could not be loaded"
      description="What this screen shows of them may be missing or out of date - try again."
      action={
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
