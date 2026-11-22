import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allOrSome, noticeAudience, noticeTarget } from "./NoticePostModal";

const source = readFileSync(join(__dirname, "NoticePostModal.tsx"), "utf8");

describe("a notice to everyone (user council M11)", () => {
  it("is for all when no country, branch or department is chosen ('All' in each)", () => {
    expect(noticeAudience({ countryCodes: ["all"], branchIds: ["all"], departmentIds: ["all"] })).toEqual({
      countryCodes: [],
      branchIds: [],
      departmentIds: [],
      forAll: true,
    });
    expect(noticeAudience({ countryCodes: ["CZ"], branchIds: ["all"], departmentIds: ["all"] })).toMatchObject({ countryCodes: ["CZ"], forAll: false });
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

describe("several countries, branches and departments (owner's answer 22 Nov)", () => {
  it("names every one picked", () => {
    expect(noticeAudience({ countryCodes: ["CZ", "DE"], branchIds: ["all"], departmentIds: ["fcl", "lcl"] })).toEqual({
      countryCodes: ["CZ", "DE"],
      branchIds: [],
      departmentIds: ["fcl", "lcl"],
      forAll: false,
    });
  });

  it("keeps 'All' on its own: picking it clears the others, picking one after it replaces it", () => {
    expect(allOrSome(["CZ", "DE", "all"], ["CZ", "DE"])).toEqual(["all"]);
    expect(allOrSome(["all", "CZ"], ["all"])).toEqual(["CZ"]);
    expect(allOrSome(["CZ", "DE"], ["CZ"])).toEqual(["CZ", "DE"]);
    expect(allOrSome([], ["CZ"])).toEqual([]);
  });
});

describe("whom a new notice is sent to (review of system-23)", () => {
  it("is the company when 'All' is chosen everywhere: the server refuses an audience with nothing chosen", () => {
    expect(noticeTarget({ countryCodes: ["all"], branchIds: ["all"], departmentIds: ["all"] })).toEqual({ scope: "company" });
  });

  it("is the audience chosen otherwise, its lists only, never the single fields of the pages from before", () => {
    const target = noticeTarget({ countryCodes: ["all"], branchIds: ["brno"], departmentIds: ["all"] });
    expect(target).toEqual({ scope: "audience", countryCodes: [], branchIds: ["brno"], departmentIds: [] });
    expect(target).not.toHaveProperty("branchId");
  });

  it("is what Post sends", () => {
    expect(source).toMatch(/onCreate\(\{ \.\.\.noticeTarget\(v\), severity/);
  });
});
