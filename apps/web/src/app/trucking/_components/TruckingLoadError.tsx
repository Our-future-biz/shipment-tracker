"use client";

import { Alert, Button } from "antd";
import { apiErrorMessage } from "@/lib/api";

interface TruckingLoadErrorProps {
  /** What could not be read, as the sentence names it ("the trip"). */
  what: string;
  error: unknown;
  onRetry: () => void;
}

// Something a screen waits for could not be read: the server's reason and Retry, instead of a
// spinner that never ends.
export const TruckingLoadError = ({ what, error, onRetry }: TruckingLoadErrorProps) => (
  <Alert
    type="error"
    showIcon
    message={`Could not load ${what}: ${apiErrorMessage(error)}.`}
    action={
      <Button size="small" onClick={onRetry}>
        Retry
      </Button>
    }
  />
);
