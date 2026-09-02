import { CustomsView } from "./CustomsView";

export default function CustomsPage() {
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6 w-full min-w-0 overflow-x-hidden">
      {/*
        flex-col + min-w-0: deti (toolbar, grid) se nesmi roztahnout podle
        sirsi tabulky uvnitr gridu. Bez toho by toolbar prevzal sirku
        tabulky (2650px) a filtr by skoncil mimo obrazovku.
      */}
      <div className="max-w-[1600px] mx-auto w-full min-w-0 flex flex-col items-stretch">
        {/* h1.pg from the mockup: 24px bold, same as the Shipments heading */}
        <h1 className="text-2xl font-bold text-slate-900 mb-5">Customs</h1>
        <CustomsView />
      </div>
    </div>
  );
}
