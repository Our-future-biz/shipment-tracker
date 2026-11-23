import { describe, expect, it } from "vitest";
import {
  canManageServices,
  checkServiceInput,
  CO_LOADING_FREQUENCIES,
  CO_LOADING_SERVICE_NAMES,
  closedServiceError,
  CO_LOADING_MANAGER_ROLES,
  NAME_MAX,
  servicesSeenBy,
} from "../lib/coLoadingService";

describe("a Co-Loading Concept service", () => {
  it("is saved trimmed, the optional fields empty when left out", () => {
    expect(checkServiceInput({ name: "  Import   from Ningbo ", serviceName: " ISHA ", frequency: "bi_weekly", direction: "import", mode: "sea_lcl", origin: " Ningbo (CNNGB) " })).toEqual({
      values: { name: "Import from Ningbo", serviceName: "ISHA", frequency: "bi_weekly", direction: "import", mode: "sea_lcl", origin: "Ningbo (CNNGB)", destination: "", note: "" },
    });
  });

  it("needs a name, a Service Name, a frequency, a direction and a mode it knows", () => {
    expect(checkServiceInput({ name: "  ", serviceName: "ISHA", frequency: "weekly", direction: "import", mode: "air" })).toEqual({ error: "Give the service a name." });
    expect(checkServiceInput({ name: "x".repeat(NAME_MAX + 1), serviceName: "ISHA", frequency: "weekly", direction: "import", mode: "air" })).toHaveProperty("error");
    expect(checkServiceInput({ name: "A", serviceName: "", frequency: "weekly", direction: "import", mode: "air" })).toEqual({ error: "Pick the Service Name." });
    expect(checkServiceInput({ name: "A", serviceName: "SHA", frequency: "weekly", direction: "import", mode: "air" })).toEqual({ error: "Pick the Service Name." });
    expect(checkServiceInput({ name: "A", serviceName: "ISHA", frequency: "weekly", direction: "both", mode: "air" })).toEqual({ error: "Pick Import or Export." });
    expect(checkServiceInput({ name: "A", serviceName: "ISHA", frequency: "weekly", direction: "export", mode: "ship" })).toEqual({ error: "Pick the mode of transport." });
    expect(checkServiceInput({ name: "A", serviceName: "ISHA", frequency: "", direction: "import", mode: "air" })).toEqual({ error: "Pick the frequency." });
    expect(checkServiceInput({ name: "A", serviceName: "ISHA", frequency: "monthly", direction: "import", mode: "air" })).toEqual({ error: "Pick the frequency." });
    expect(CO_LOADING_FREQUENCIES).toEqual(["weekly", "bi_weekly", "ad_hoc"]);
    // The shipments' Service Name list, the same two.
    expect(CO_LOADING_SERVICE_NAMES).toEqual(["ISHA", "Domestic"]);
    expect(checkServiceInput({ name: "Road", serviceName: "Domestic", frequency: "ad_hoc", direction: "import", mode: "road" })).toHaveProperty("values");
  });

});

describe("closing a Co-Loading Concept service", () => {
  const open = { name: "Import from Shanghai", closedAt: null };
  const closed = { name: "TEST Import from Ningbo", closedAt: new Date("2026-11-23T08:00:00Z") };

  it("is for managers and higher, as making one is", () => {
    for (const role of ["superadmin", "admin", "manager"]) expect(canManageServices(role)).toBe(true);
    for (const role of ["user", "", "Manager"]) expect(canManageServices(role)).toBe(false);
    expect(CO_LOADING_MANAGER_ROLES).toEqual(["superadmin", "admin", "manager"]);
  });

  it("hides its tile from users, while managers still see it to reopen it", () => {
    expect(servicesSeenBy([open, closed], "user")).toEqual([open]);
    for (const role of ["superadmin", "admin", "manager"]) expect(servicesSeenBy([open, closed], role)).toEqual([open, closed]);
  });

  it("lets nothing new into it until it is reopened", () => {
    expect(closedServiceError(open)).toBeNull();
    expect(closedServiceError(closed)).toBe('"TEST Import from Ningbo" is closed. Nothing new can be put in it until a manager reopens it.');
    expect(closedServiceError({ ...closed, closedAt: null })).toBeNull();
  });
});
