import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

describe("notice read state wiring", () => {
  it("the board's Read column goes by readState, so a notice not addressed to the reader is not shown as Read", () => {
    const card = source("NoticeBoardCard.tsx");
    expect(card).toMatch(/readState\(/);
    expect(card).toMatch(/READ_STATE_RANK/);
  });

  it("the detail is locked only while unread: a read notice closes with Escape or a click outside too", () => {
    const modal = source("NoticeDetailModal.tsx");
    expect(modal).toMatch(/keyboard=\{!shown\?\.unread\}/);
    expect(modal).toMatch(/maskClosable=\{!shown\?\.unread\}/);
  });

  it("the detail says Read only for a notice the reader has read", () => {
    expect(source("NoticeDetailModal.tsx")).toMatch(/shown\.readAt \?/);
  });
});
