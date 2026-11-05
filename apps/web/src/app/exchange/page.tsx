import { PAGE_TITLE } from "@/styles/ui";
import { FxView } from "./FxView";

export default function ExchangePage() {
  return (
    /* same layout as the Customs page */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        <h1 className={PAGE_TITLE}>Exchange rates</h1>
        <FxView />
      </div>
    </div>
  );
}
