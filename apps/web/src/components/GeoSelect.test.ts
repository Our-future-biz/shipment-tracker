import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {} }));

import { codedOption } from "./GeoSelect";

// User council O1 / S10, owner's answer Q3: the code leads, so a long name cut by the list never hides it.
describe("codedOption", () => {
  it("shows the code before the name, and stores the place as Name (CODE)", () => {
    const option = codedOption("CNPVG", "Shanghai Pudong International Apt", "Shanghai Shi, CN");
    expect(option.value).toBe("Shanghai Pudong International Apt (CNPVG)");
    const text = renderToStaticMarkup(option.label as ReactElement).replace(/<[^>]+>/g, "");
    expect(text.indexOf("CNPVG")).toBeLessThan(text.indexOf("Shanghai Pudong"));
    expect(text).toContain("Shanghai Shi, CN");
  });
});
