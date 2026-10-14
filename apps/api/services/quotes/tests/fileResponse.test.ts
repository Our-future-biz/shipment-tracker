import { describe, expect, it } from "vitest";
import { fileHeaders } from "../lib/fileResponse";

describe("fileHeaders", () => {
  it("shows safe types inline and downloads everything else", () => {
    expect(fileHeaders({ fileName: "a.pdf", fileType: "application/pdf", size: 3 }, false)).toMatchObject({
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename*=UTF-8''a.pdf",
    });
    expect(fileHeaders({ fileName: "x.html", fileType: "text/html", size: 3 }, false)).toMatchObject({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename*=UTF-8''x.html",
    });
    expect(fileHeaders({ fileName: "a.pdf", fileType: "application/pdf", size: 3 }, true)["Content-Disposition"]).toMatch(/^attachment/);
  });
});
