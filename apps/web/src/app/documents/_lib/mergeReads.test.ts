import { describe, expect, it } from "vitest";
import { mergeReads } from "./mergeReads";

describe("mergeReads", () => {
  it("keeps a value once when the files agree, even written differently", () => {
    const merged = mergeReads([
      { source: "bl.pdf", values: { Shipper: "ACME  GmbH", "Port Of Loading": "Hamburg" } },
      { source: "booking.pdf", values: { Shipper: "acme gmbh", Consignee: "Beta Ltd" } },
    ]);
    expect(merged.values).toEqual({ Shipper: "ACME  GmbH", "Port Of Loading": "Hamburg", Consignee: "Beta Ltd" });
    expect(merged.choices).toEqual({});
  });

  it("takes the first file's value and lists every value when the files disagree", () => {
    const merged = mergeReads([
      { source: "bl.pdf", values: { "Total Weight In Tons": "12.5" } },
      { source: "booking.pdf", values: { "Total Weight In Tons": "13" } },
      { source: "copy.pdf", values: { "Total Weight In Tons": "12.5" } },
    ]);
    expect(merged.values["Total Weight In Tons"]).toBe("12.5");
    expect(merged.choices["Total Weight In Tons"]).toEqual([
      { value: "12.5", sources: ["bl.pdf", "copy.pdf"] },
      { value: "13", sources: ["booking.pdf"] },
    ]);
  });

  it("adds up the container numbers of all files", () => {
    const merged = mergeReads([
      { source: "a.pdf", values: { "Container Number": "MSKU1234567, TGHU7654321" } },
      { source: "b.pdf", values: { "Container Number": "TGHU 765432-1 / CAIU1112223" } },
    ]);
    expect(merged.values["Container Number"]).toBe("MSKU1234567, TGHU7654321, CAIU1112223");
    expect(merged.choices).toEqual({});
  });

  it("skips values read empty", () => {
    const merged = mergeReads([
      { source: "a.pdf", values: { Shipper: " " } },
      { source: "b.pdf", values: { Shipper: "ACME" } },
    ]);
    expect(merged.values).toEqual({ Shipper: "ACME" });
  });

  it("keeps each seal with its container when the files name different containers", () => {
    const { values, choices } = mergeReads([
      { source: "a.pdf", values: { "Container Number": "ACLU9821217", "Seal Number": "S1" } },
      { source: "b.pdf", values: { "Container Number": "MSKU1234565", "Seal Number": "S2" } },
    ]);
    expect(values["Container Number"]).toBe("ACLU9821217, MSKU1234565");
    expect(values["Seal Number"]).toBe("S1, S2");
    expect(choices["Seal Number"]).toBeUndefined();
  });

  it("offers a choice when two files give one container different seals", () => {
    const { values, choices } = mergeReads([
      { source: "a.pdf", values: { "Container Number": "ACLU9821217", "Seal Number": "S1" } },
      { source: "b.pdf", values: { "Container Number": "ACLU9821217", "Seal Number": "S9" } },
    ]);
    expect(values["Seal Number"]).toBe("S1");
    expect(choices["Seal Number"]?.map((c) => c.value)).toEqual(["S1", "S9"]);
  });

  it("keeps a comma list of seals for one container as read, unpaired, so the review says it doesn't match", () => {
    const { values } = mergeReads([{ source: "a.pdf", values: { "Container Number": "ACLU9821217", "Seal Number": "S1, S2" } }]);
    expect(values["Seal Number"]).toBe("S1, S2");
  });

  it("keeps the seal of a container one file leaves out", () => {
    const { values } = mergeReads([
      { source: "a.pdf", values: { "Container Number": "ACLU9821217, MSKU1234565", "Seal Number": "S1, S2" } },
      { source: "b.pdf", values: { "Container Number": "MSKU1234565" } },
    ]);
    expect(values["Seal Number"]).toBe("S1, S2");
  });
});
