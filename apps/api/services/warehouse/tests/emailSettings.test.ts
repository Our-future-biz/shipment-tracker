import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { settingsService } from "../services/settings.service";
import { DEFAULT_DOCKS } from "../services/settingsRules";

// Warehouse settings (supplier e-mail recipients, docks). Needs migration 0018.
vi.mock("~encore/clients", () => ({
  shipments: {},
  auth: { usersList: vi.fn(async () => ({ users: [] })) },
}));

const user = randomUUID();

describe("warehouse settings", () => {
  it("shows the defaults before anything is saved; everyone may read, only a manager may change", async () => {
    const c = randomUUID();
    const s = await settingsService.get(c, "user");
    expect(s).toMatchObject({ version: 0, canEdit: false, docks: DEFAULT_DOCKS, supplierEmail: { vgm: { enabled: false, to: [], cc: [] } } });
    await expect(settingsService.update(c, user, "user", 0, { docks: DEFAULT_DOCKS })).rejects.toThrow(/Only a manager/);
    expect((await settingsService.get(c, "manager")).canEdit).toBe(true);
  });

  it("checks the addresses, logs each change and refuses a stale save", async () => {
    const c = randomUUID();
    await expect(settingsService.update(c, user, "manager", 0, { supplierEmail: { vgm: { enabled: true, to: ["nope"], cc: [] } } })).rejects.toThrow(/"nope" is not a valid e-mail address/);
    await expect(settingsService.update(c, user, "manager", 0, { supplierEmail: { invoice: { enabled: true, to: [], cc: [] } } as never })).rejects.toThrow(/Unknown message type/);
    const a = await settingsService.update(c, user, "manager", 0, { supplierEmail: { vgm: { enabled: true, to: [" Ops@Supplier.cz "], cc: [] } } });
    expect(a).toMatchObject({ version: 1, supplierEmail: { vgm: { enabled: true, to: ["ops@supplier.cz"], cc: [] }, survey: { enabled: false } } });
    expect(a.events.map((e) => e.label)).toEqual(["Supplier e-mail VGM: e-mail on", "Supplier e-mail VGM: To none → ops@supplier.cz"]);
    const b = await settingsService.update(c, user, "admin", 1, { supplierEmail: { vgm: { enabled: true, to: ["ops@supplier.cz", "b@y.cz"], cc: [] } }, docks: { ...DEFAULT_DOCKS, closesAt: "18:00" } });
    expect(b.version).toBe(2);
    expect(b.events.map((e) => e.label)).toEqual([
      "Supplier e-mail VGM: To ops@supplier.cz → ops@supplier.cz, b@y.cz",
      "Dock hours: 06:00–19:00 → 06:00–18:00",
      "Supplier e-mail VGM: e-mail on",
      "Supplier e-mail VGM: To none → ops@supplier.cz",
    ]);
    await expect(settingsService.update(c, user, "manager", 1, { docks: DEFAULT_DOCKS })).rejects.toThrow(/changed the warehouse settings meanwhile/);
    // Two first saves at once: one wins, the other is refused.
    const d = randomUUID();
    const r = await Promise.allSettled([
      settingsService.update(d, user, "manager", 0, { docks: { ...DEFAULT_DOCKS, opensAt: "07:00" } }),
      settingsService.update(d, user, "manager", 0, { docks: { ...DEFAULT_DOCKS, opensAt: "08:00" } }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    // Nothing changed: nothing saved.
    expect((await settingsService.update(c, user, "manager", 2, { docks: { ...DEFAULT_DOCKS, closesAt: "18:00" } })).version).toBe(2);
  });
});
