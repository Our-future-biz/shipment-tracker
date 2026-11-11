import { describe, expect, it } from "vitest";
import { APIError, ErrCode } from "@/lib/api/client";
import { missingRecordText } from "./loadFailure";

describe("missingRecordText", () => {
  it("says not found when the server says so, or when nothing failed", () => {
    expect(missingRecordText(new APIError(404, { code: ErrCode.NotFound, message: "movement not found" }), "movement", "Movement not found.")).toBe("Movement not found.");
    expect(missingRecordText(null, "movement", "Movement not found.")).toBe("Movement not found.");
  });

  it("says the read failed, with the server's reason, for any other failure", () => {
    expect(missingRecordText(new APIError(500, { code: ErrCode.Internal, message: "database unavailable" }), "container", "Container not found.")).toBe(
      "Could not load the container: database unavailable — reload the page.",
    );
  });

  it("says the server could not be reached when there was no answer", () => {
    expect(missingRecordText(new TypeError("Failed to fetch"), "shipment", "Shipment not found.")).toBe(
      "Could not load the shipment: the server could not be reached — reload the page.",
    );
  });
});
