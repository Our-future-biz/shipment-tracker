import { describe, expect, it } from "vitest";
import { customsOfficeRequestNotice } from "../lib/customsOfficeNotice";

const request = { fromOffice: "CZ521060 Oddělení CÚ celní Ruzyně, Praha 6", toOffice: "CZ100000 Celní úřad v Brně, Brno", reason: "Truck now clears in Brno" };
const user = (id: string, role: string, displayName = id) => ({ id, email: `${id}@firma.cz`, displayName, role });
const USERS = [user("eva", "manager", "Eva Nová"), user("adam", "admin", ""), user("sam", "superadmin"), user("jan", "user", "Jan Novák")];

describe("customsOfficeRequestNotice", () => {
  it("says what is asked: from, to and why", () => {
    const { message } = customsOfficeRequestNotice(request, USERS, "jan");
    expect(message).toContain("Change of Customs Office requested");
    expect(message).toContain(`From: ${request.fromOffice}`);
    expect(message).toContain(`To: ${request.toOffice}`);
    expect(message).toContain(`Reason: ${request.reason}`);
  });

  it("tags everyone who can answer, as the chat writes a tag, and no regular user", () => {
    const { message, tagged } = customsOfficeRequestNotice(request, USERS, "jan");
    expect(tagged.map((u) => u.id)).toEqual(["eva", "adam", "sam"]);
    expect(message.split("\n").pop()).toBe("@Eva Nová @adam@firma.cz @sam");
    expect(message).not.toContain("@Jan Novák");
  });

  it("does not tag a manager who asks themselves", () => {
    expect(customsOfficeRequestNotice(request, USERS, "eva").tagged.map((u) => u.id)).toEqual(["adam", "sam"]);
  });

  it("still says what is asked with nobody to tag", () => {
    const { message, tagged } = customsOfficeRequestNotice(request, [user("jan", "user")], "jan");
    expect(tagged).toEqual([]);
    expect(message.split("\n").pop()).toBe(`Reason: ${request.reason}`);
  });
});
