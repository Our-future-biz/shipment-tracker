import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { noticeAudience } from "./NoticePostModal";

const source = readFileSync(join(__dirname, "NoticePostModal.tsx"), "utf8");

describe("a notice to everyone (user council M11)", () => {
  it("is for all when no country, branch or department is chosen ('All' in each)", () => {
    expect(noticeAudience({ countryCode: "all", branchId: "all", departmentId: "all" })).toEqual({
      countryCode: undefined,
      branchId: undefined,
      departmentId: undefined,
      forAll: true,
    });
    expect(noticeAudience({ countryCode: "CZ", branchId: "all", departmentId: "all" })).toMatchObject({ countryCode: "CZ", forAll: false });
  });

  it("asks 'Send to all?' at Post, not the moment the last 'All' is picked", () => {
    // The question is opened by the save, and picking an audience no longer opens it.
    expect(source).toMatch(/noticeAudience\(v\)\.forAll\) \{\s*submitting\.current = false;\s*setConfirmAll\(true\)/);
    const onValuesChange = source.slice(source.indexOf("const handleValuesChange"), source.indexOf("return (", source.indexOf("const handleValuesChange")));
    expect(onValuesChange).not.toMatch(/setConfirmAll/);
    // Its yes posts the notice; the Post button doesn't pass its click event as that yes.
    expect(source).toMatch(/void handleSubmit\(true\)/);
    expect(source).toMatch(/onClick=\{\(\) => void handleSubmit\(\)\}/);
  });
});
