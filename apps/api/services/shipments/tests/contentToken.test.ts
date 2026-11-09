import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));

import {
  attachmentContentUrl,
  companyOfContentToken,
  companyOfMasterJobDocumentToken,
  masterJobDocumentContentUrl,
} from "../lib/contentToken";

const tokenOf = (url: string) => new URL(url, "http://localhost").searchParams.get("t");

// A master job document's download link is its own kind: a shipment file's token never opens one,
// and its token never opens a shipment file.
describe("master job document links", () => {
  it("name the master job and the document, and their token opens that document of that company", () => {
    const url = masterJobDocumentContentUrl("mj1", "d1", "c1");
    expect(url).toMatch(/^\/master-jobs\/mj1\/documents\/d1\/content\?t=/);
    expect(companyOfMasterJobDocumentToken(tokenOf(url), "d1")).toBe("c1");
    expect(companyOfMasterJobDocumentToken(tokenOf(url), "d2")).toBeNull();
  });

  it("are not interchangeable with a shipment file's links", () => {
    const shipmentFile = attachmentContentUrl("s1", "d1", "c1");
    const masterJobDocument = masterJobDocumentContentUrl("mj1", "d1", "c1");
    expect(companyOfMasterJobDocumentToken(tokenOf(shipmentFile), "d1")).toBeNull();
    expect(companyOfContentToken(tokenOf(masterJobDocument), "d1")).toBeNull();
  });
});
