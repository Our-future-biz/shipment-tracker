import { describe, expect, it } from "vitest";
import type { ServerResponse } from "node:http";
import { writeFileResponse } from "../../../lib/fileContent";

function capture() {
  const out: { status?: number; headers?: Record<string, unknown>; body?: unknown } = {};
  const resp = {
    writeHead: (status: number, headers: Record<string, unknown>) => Object.assign(out, { status, headers }),
    end: (body: unknown) => Object.assign(out, { body }),
  } as unknown as ServerResponse;
  return { resp, out };
}

describe("writeFileResponse", () => {
  const pdf = { fileName: "a b.pdf", fileType: "application/pdf", buffer: Buffer.from("x") };

  it("shows safe types inline", () => {
    const { resp, out } = capture();
    writeFileResponse(resp, pdf, false);
    expect(out.headers).toMatchObject({ "Content-Type": "application/pdf", "Content-Disposition": "inline; filename*=UTF-8''a%20b.pdf" });
  });

  it("downloads unsafe types and anything asked for as a download", () => {
    const html = capture();
    writeFileResponse(html.resp, { ...pdf, fileType: "text/html" }, false);
    expect(html.out.headers).toMatchObject({ "Content-Type": "application/octet-stream" });
    const asked = capture();
    writeFileResponse(asked.resp, pdf, true);
    expect(String(asked.out.headers?.["Content-Disposition"])).toMatch(/^attachment;/);
  });
});
