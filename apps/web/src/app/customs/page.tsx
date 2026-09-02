import { PageHeader } from "@/components/PageHeader";
import { CustomsView } from "./CustomsView";

export default function CustomsPage() {
  return (
    <div className="bg-slate-50 min-h-full p-6">
      <div className="max-w-[1600px] mx-auto">
        <PageHeader title="Customs" />
        <CustomsView />
      </div>
    </div>
  );
}
