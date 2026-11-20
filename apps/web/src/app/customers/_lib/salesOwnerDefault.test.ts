import { describe, expect, it } from "vitest";
import { defaultSalesOwner, isSalesDepartment, salesOwnerChoices } from "./salesOwnerDefault";

const SALES = { id: "d1", name: "Air Sales CZ" };
const OPERATIONS = { id: "d2", name: "Sea export" };
const DEPARTMENTS = [SALES, OPERATIONS];
const ME = "u1";
const USERS = [{ id: ME }, { id: "u2" }];

describe("Add customer's Sales owner to start with (mock council R12)", () => {
  it("is the adder when they sit in Sales", () => {
    expect(defaultSalesOwner({ id: ME, role: "user", departmentId: SALES.id }, USERS, DEPARTMENTS)).toBe(ME);
  });

  it("is a manager or an admin who adds it, whatever their department", () => {
    expect(defaultSalesOwner({ id: ME, role: "manager", departmentId: OPERATIONS.id }, USERS, DEPARTMENTS)).toBe(ME);
    expect(defaultSalesOwner({ id: ME, role: "admin", departmentId: null }, USERS, DEPARTMENTS)).toBe(ME);
  });

  it("is nobody for a user outside Sales, or in no department", () => {
    expect(defaultSalesOwner({ id: ME, role: "user", departmentId: OPERATIONS.id }, USERS, DEPARTMENTS)).toBeNull();
    expect(defaultSalesOwner({ id: ME, role: "user", departmentId: null }, USERS, DEPARTMENTS)).toBeNull();
    // Departments not read (yet): nothing says the adder is in Sales.
    expect(defaultSalesOwner({ id: ME, role: "user", departmentId: SALES.id }, USERS, [])).toBeNull();
  });

  it("is nobody for an adder who is none of the company's users (a superadmin working as it)", () => {
    expect(defaultSalesOwner({ id: "sa", role: "superadmin", departmentId: null }, USERS, DEPARTMENTS)).toBeNull();
    expect(defaultSalesOwner(null, USERS, DEPARTMENTS)).toBeNull();
  });

  it("tells a Sales department by its name, as the server does", () => {
    for (const name of ["Sales", " sales CZ ", "Air Sales", "Sales & Marketing"]) expect(isSalesDepartment(name)).toBe(true);
    for (const name of ["Salesforce admin", "Wholesales", "Sea export", "", null, undefined]) expect(isSalesDepartment(name)).toBe(false);
  });
});

describe("whom Add customer's Sales owner offers (system-21 mock council review)", () => {
  it("is every user of the company for a manager", () => {
    expect(salesOwnerChoices(ME, true, USERS)).toEqual(USERS);
  });

  it("is only the adder for anyone else - nobody stays a choice by clearing it", () => {
    expect(salesOwnerChoices(ME, false, USERS)).toEqual([{ id: ME }]);
    // An adder who is none of the company's users (or not known yet) is offered nobody but nobody.
    expect(salesOwnerChoices("sa", false, USERS)).toEqual([]);
    expect(salesOwnerChoices(undefined, false, USERS)).toEqual([]);
  });
});
