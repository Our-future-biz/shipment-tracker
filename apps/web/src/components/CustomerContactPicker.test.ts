import { describe, expect, it } from "vitest";
import { splitTypedName } from "./CustomerContactPicker";

describe("splitTypedName", () => {
  it("takes the last word as the last name", () => {
    expect(splitTypedName(" alena  vybralova ")).toEqual({ firstName: "alena", lastName: "vybralova" });
    expect(splitTypedName("Jan Karel Novák")).toEqual({ firstName: "Jan Karel", lastName: "Novák" });
  });

  it("puts a single word in the first name", () => {
    expect(splitTypedName("Petr")).toEqual({ firstName: "Petr", lastName: "" });
    expect(splitTypedName("")).toEqual({ firstName: "", lastName: "" });
  });
});
