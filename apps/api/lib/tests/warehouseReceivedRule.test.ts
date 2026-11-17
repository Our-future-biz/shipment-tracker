import { describe, expect, it } from "vitest";
import { receivedDateRefusal } from "../warehouseReceivedRule";

const TODAY = "2026-11-17";

describe("who may change the received-in-warehouse date", () => {
  it("lets a user set it the first time or move it earlier, up to today", () => {
    expect(receivedDateRefusal("", "2026-11-10", false, "user", TODAY)).toBeNull();
    expect(receivedDateRefusal("", TODAY, false, "user", TODAY)).toBeNull();
    expect(receivedDateRefusal("2026-11-10", "2026-11-08", false, "user", TODAY)).toBeNull();
  });

  it("refuses a user a day still to come, moving it later, clearing it and any change once released", () => {
    expect(receivedDateRefusal("", "2026-11-18", false, "user", TODAY)).toBe("Received in warehouse can't be a day still to come: the cargo was received today at the latest");
    expect(receivedDateRefusal("2026-11-10", "2026-11-12", false, "user", TODAY)).toBe("Only a manager moves Received in warehouse later or clears it: the days in between are storage given away");
    expect(receivedDateRefusal("2026-11-10", "", false, "user", TODAY)).toMatch(/^Only a manager moves/);
    expect(receivedDateRefusal("2026-11-10", "2026-11-08", true, "user", TODAY)).toBe("The cargo was released: only a manager changes Received in warehouse now");
  });

  it("lets a manager, an admin and a superadmin do all of it", () => {
    for (const role of ["manager", "admin", "superadmin"]) {
      expect(receivedDateRefusal("2026-11-10", "2026-11-30", true, role, TODAY)).toBeNull();
      expect(receivedDateRefusal("2026-11-10", null, false, role, TODAY)).toBeNull();
    }
  });

  it("names the date as the screen asking does", () => {
    expect(receivedDateRefusal("", "2026-12-01", false, "user", TODAY, "Warehouse Received")).toBe("Warehouse Received can't be a day still to come: the cargo was received today at the latest");
  });
});
