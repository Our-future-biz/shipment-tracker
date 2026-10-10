import { describe, it, expect } from "vitest";
import { parseAttachmentDataUrl } from "../attachmentDataUrl";

describe("parseAttachmentDataUrl", () => {
  it("reads the type and decoded size of a browser-made data URL", () => {
    // "hello" is 5 bytes.
    expect(parseAttachmentDataUrl("data:application/pdf;base64,aGVsbG8=")).toEqual({ fileType: "application/pdf", fileSize: 5 });
    expect(parseAttachmentDataUrl("data:Image/PNG;base64,aGVsbG8h")).toEqual({ fileType: "image/png", fileSize: 6 });
    expect(parseAttachmentDataUrl("data:text/plain;charset=utf-8;base64,aGk=")).toEqual({ fileType: "text/plain", fileSize: 2 });
  });

  it("accepts a data URL without a type", () => {
    expect(parseAttachmentDataUrl("data:;base64,aGk=")).toEqual({ fileType: "", fileSize: 2 });
  });

  it("reports an empty document as zero bytes", () => {
    expect(parseAttachmentDataUrl("data:application/pdf;base64,")).toEqual({ fileType: "application/pdf", fileSize: 0 });
  });

  it("rejects anything a browser would navigate to or run", () => {
    expect(parseAttachmentDataUrl("javascript:alert(1)")).toBeNull();
    expect(parseAttachmentDataUrl("javascript:alert(1)//;base64,AAAA")).toBeNull();
    expect(parseAttachmentDataUrl("https://example.com/x.pdf")).toBeNull();
    expect(parseAttachmentDataUrl(" data:application/pdf;base64,aGk=")).toBeNull();
    expect(parseAttachmentDataUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(parseAttachmentDataUrl("data:")).toBeNull();
  });

  it("rejects a payload that is not base64", () => {
    expect(parseAttachmentDataUrl("data:application/pdf;base64,not base64!")).toBeNull();
    expect(parseAttachmentDataUrl("data:application/pdf;base64,aGk")).toBeNull();
    expect(parseAttachmentDataUrl("data:application/pdf;base64,aGk=\n<script>")).toBeNull();
  });
});
