import { currentRequest } from "encore.dev";

/**
 * True when the Pub/Sub message being handled was delivered before: an earlier attempt failed or
 * ran past its deadline, so it may have saved its writes and then failed to tell others.
 */
export function isRedelivery(): boolean {
  const meta = currentRequest();
  return meta?.type === "pubsub-message" && meta.deliveryAttempt > 1;
}
