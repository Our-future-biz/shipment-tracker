import { CustomsView } from "./CustomsView";

export default function CustomsPage() {
  return (
    /* .page z mockupu: padding 24px 32px, flex:1 */
    <div className="bg-slate-50 min-h-full px-8 py-6">
      {/*
        .page-inner z mockupu:
          max-width: 1400px; margin: 0 auto;
          display: flex; flex-direction: column; gap: 20px;
        Flex sloupec je zasadni - v nem se polozky roztahuji jen na sirku
        kontejneru, takze siroka tabulka (2720px) uvnitr .table-card
        nemuze roztahnout toolbar. Bez toho toolbar prebiral sirku tabulky
        a filtr koncil mimo obrazovku.
      */}
      <div className="max-w-[1400px] mx-auto flex flex-col gap-5 min-w-0">
        {/* h1.pg: 24px, 700, slate-900 */}
        <h1 className="text-2xl font-bold text-slate-900">Customs</h1>
        <CustomsView />
      </div>
    </div>
  );
}
