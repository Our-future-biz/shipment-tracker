import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev", () => ({ currentRequest: vi.fn() }));

import { currentRequest } from "encore.dev";
import { isRedelivery } from "../lib/delivery";

const meta = vi.mocked(currentRequest);
const message = (deliveryAttempt: number) => ({ type: "pubsub-message", service: "shipments", topic: "customer-changed", subscription: "s", messageId: "m-1", deliveryAttempt }) as never;

describe("isRedelivery", () => {
  it("is true from the second delivery of a Pub/Sub message on", () => {
    meta.mockReturnValue(message(1));
    expect(isRedelivery()).toBe(false);
    meta.mockReturnValue(message(2));
    expect(isRedelivery()).toBe(true);
  });

  it("is false outside a Pub/Sub message", () => {
    meta.mockReturnValue(undefined);
    expect(isRedelivery()).toBe(false);
    meta.mockReturnValue({ type: "api-call" } as never);
    expect(isRedelivery()).toBe(false);
  });
});
