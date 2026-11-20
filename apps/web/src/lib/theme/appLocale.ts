// The app's one antd locale, set once on the root ConfigProvider so every DatePicker, RangePicker
// and Calendar follows it. British English keeps the words English but starts the week on Monday,
// as in Czechia and Germany and as the Calendar page already does (owner's decision x1, User Council).
// antd's pickers read the first weekday from dayjs's "en-gb" locale, which has to be loaded for that;
// it is only registered here, not made dayjs's global locale, so dayjs's own startOf("week") and
// formatting elsewhere in the app stay as they were.
import "dayjs/locale/en-gb";
import enGB from "antd/locale/en_GB";

export const appLocale = enGB;
