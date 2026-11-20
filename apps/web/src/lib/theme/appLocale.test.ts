import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import localeData from "dayjs/plugin/localeData";
import { appLocale } from "./appLocale";

dayjs.extend(localeData);

describe("appLocale", () => {
  // antd's pickers ask dayjs, in the picker's locale ("en_GB" → dayjs "en-gb"), for the first weekday.
  it("starts the pickers' week on Monday", () => {
    expect(appLocale.DatePicker!.lang.locale).toBe("en_GB");
    expect(dayjs().locale(appLocale.locale).localeData().firstDayOfWeek()).toBe(1);
  });

  it("leaves dayjs's global locale alone", () => {
    expect(dayjs.locale()).toBe("en");
  });

  it("keeps the words English", () => {
    expect(appLocale.DatePicker!.lang.today).toBe("Today");
    expect(appLocale.Modal?.cancelText).toBe("Cancel");
  });
});
