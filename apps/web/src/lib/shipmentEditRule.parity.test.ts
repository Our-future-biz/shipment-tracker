import { describe, expect, it } from "vitest";
import * as web from "./shipmentEditRule";
// The server's rule (shipments service). It imports only fieldDefaults, which has no imports of its
// own, so it runs here beside the screens' copy: the two must agree, or a screen would offer what
// the server refuses, or lock what it allows.
import * as api from "../../../api/services/shipments/lib/shipmentEditRule";

const ROLES = ["superadmin", "admin", "manager", "user"];
const CHECKS = ["Green", " green ", "Red", "Amber", ""];
const APPROVERS = ["eva@firma.cz — 7. 11. 2026 10:47:35", "", " "];

describe("the screens' rule and the server's", () => {
  it("keep the same department fields open", () => {
    expect([...web.DEPARTMENT_FIELDS].sort()).toEqual([...api.DEPARTMENT_FIELDS].sort());
  });

  it("agree on who may take the credit check back", () => {
    for (const role of ROLES)
      for (const creditCheck of CHECKS) {
        const user = { role, email: "jan@firma.cz" };
        const refused = api.creditCheckLockRefusal({ creditCheck }, { creditCheck: "Red" }, role) !== null;
        expect([role, creditCheck, web.isCreditCheckLocked(user, { creditCheck })]).toEqual([role, creditCheck, refused]);
      }
  });

  it("agree on who may change Approved By", () => {
    for (const role of ROLES)
      for (const creditCheck of CHECKS)
        for (const approvedBy of APPROVERS) {
          const user = { role, email: "jan@firma.cz" };
          const refused = api.approvedByLockRefusal({ creditCheck, approvedBy }, { approvedBy: "jan@firma.cz" }, role) !== null;
          expect([role, creditCheck, approvedBy, web.isApprovedByLocked(user, { creditCheck, approvedBy })]).toEqual([role, creditCheck, approvedBy, refused]);
        }
  });

  it("agree on who may change the details", () => {
    const people = [{}, { personInCharge: "eva@firma.cz" }, { holidayCover: "JAN@firma.cz — Jan" }, { personInCharge: "eva@firma.cz", holidayCover: "petr@firma.cz" }];
    for (const role of ROLES)
      for (const shipment of people) {
        const server = api.isDetailsManager(role) || api.isOpenToPerson(shipment, "jan@firma.cz");
        expect([role, shipment, web.canChangeShipmentDetails({ role, email: "jan@firma.cz" }, shipment)]).toEqual([role, shipment, server]);
      }
  });
});
