import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, isImageOrPdf, uploadProblem } from "./uploads";

describe("uploadProblem", () => {
  it("refuses empty and too large files", () => {
    expect(uploadProblem({ name: "a.pdf", size: 0, type: "application/pdf" })).toBe("The file is empty");
    expect(uploadProblem({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toBe("The file is larger than 10 MB");
    expect(uploadProblem({ name: "a.pdf", size: MAX_UPLOAD_BYTES, type: "application/pdf" })).toBeNull();
  });

  it("takes only photos and PDFs for a POD", () => {
    expect(uploadProblem({ name: "pod.docx", size: 10, type: "application/msword" }, { imagesAndPdfOnly: true })).toBe("Only a photo or a PDF can be uploaded");
    expect(uploadProblem({ name: "pod.docx", size: 10, type: "application/msword" })).toBeNull();
    expect(uploadProblem({ name: "IMG_1.HEIC", size: 10, type: "" }, { imagesAndPdfOnly: true })).toBeNull();
  });

  it("knows a photo or PDF by type or extension", () => {
    expect(isImageOrPdf({ name: "x", type: "image/jpeg" })).toBe(true);
    expect(isImageOrPdf({ name: "scan.PDF", type: "" })).toBe(true);
    expect(isImageOrPdf({ name: "notes.txt", type: "" })).toBe(false);
  });
});
