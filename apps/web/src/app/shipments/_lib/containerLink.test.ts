import { describe, expect, it } from "vitest";
import { containerDetailsHref, containerToShow } from "./containerLink";

const urlOf = (href: string) => new URL(href, "http://app.test");

describe("a container found in the main search", () => {
  it("opens its shipment on Container Details, naming the container", () => {
    const url = urlOf(containerDetailsHref("7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01", "c-1"));
    expect(url.pathname).toBe("/shipments/7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01");
    expect(url.searchParams.get("tab")).toBe("container");
    expect(containerToShow(url.searchParams)).toBe("c-1");
  });

  it("names no container on any other address", () => {
    expect(containerToShow(urlOf("/shipments/s1?tab=container").searchParams)).toBeNull();
    expect(containerToShow(urlOf("/shipments/s1?tab=container&container=").searchParams)).toBeNull();
  });
});
