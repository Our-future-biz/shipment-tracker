import { describe, expect, it } from "vitest";
import { chatQueryKeys, informedText } from "./informOperations";

describe("informedText", () => {
  it("names who the notice tagged", () => {
    expect(informedText(["pic@firma.cz", "cover@firma.cz"])).toEqual({ level: "success", text: "Operations informed in the shipment's chat — tagged pic@firma.cz, cover@firma.cz" });
  });

  it("warns when nobody is set to notify - the notice is in the chat all the same", () => {
    expect(informedText([])).toEqual({ level: "warning", text: "Posted in the shipment's chat, but no Person in Charge or Holiday Cover is set to notify" });
  });

  it("says a stand-alone position is only logged", () => {
    expect(informedText(null).level).toBe("success");
    expect(informedText(null).text).toMatch(/no shipment chat/);
  });
});

describe("chatQueryKeys", () => {
  it("refreshes the shipment's chat when there is one, and always the bell and the unread marks", () => {
    expect(chatQueryKeys("s1")).toEqual([["comments", "s1"], ["shipment-comments"]]);
    expect(chatQueryKeys(null)).toEqual([["shipment-comments"]]);
  });
});
