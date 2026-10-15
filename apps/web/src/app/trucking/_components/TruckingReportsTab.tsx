"use client";

import { useMemo, useState } from "react";
import { Alert, Spin } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { KpiCard, KpiPeriodBar } from "@/app/warehouse/_components/kpi/KpiCards";
import { btnDefault } from "@/app/warehouse/gate-log/_components/job/fields";
import { useKpiPeriod } from "@/hooks/useKpis";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { fetchTruckingReportExport, useTruckingReport } from "@/hooks/useTruckingReports";
import { apiErrorMessage } from "@/lib/api";
import { downloadDataUrl } from "@/lib/files";
import { useToast } from "@/lib/toast";
import { reportFileName, sortKpis, truckingKpiTone } from "../_lib/reports";
import { fileDataUrl } from "../_lib/tariffUpload";
import { ReportCard } from "./ReportCard";
import { ReportCoverageGaps } from "./ReportCoverageGaps";
import { ReportDepartmentCard } from "./ReportDepartmentCard";
import { ReportHaulierScorecard } from "./ReportHaulierScorecard";
import { ReportMarginSection } from "./ReportMarginSection";

// Reports: the period's KPIs (each says how it is measured; a figure that cannot be measured says
// why), margin, haulier scorecard, coverage gaps and the department result, all worked out on the
// server. The period sits in the URL like the Warehouse reports (?period=, ?from=, ?to=).
export const TruckingReportsTab = () => {
  const toast = useToast();
  const period = useKpiPeriod();
  const { report, isLoading, isFetching, error } = useTruckingReport(period.range);
  const { settings } = useTruckingSettings();
  const [exporting, setExporting] = useState(false);

  const levelLabel = useMemo(() => {
    const labels = new Map(settings?.serviceLevels.map((l) => [l.code as string, l.label]) ?? []);
    return (code: string) => labels.get(code) ?? code;
  }, [settings]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const file = await fetchTruckingReportExport(period.range);
      downloadDataUrl(fileDataUrl(file), file.fileName || reportFileName(period.range));
    } catch (e) {
      toast.error(`Could not export the report: ${apiErrorMessage(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <KpiPeriodBar preset={period.preset} range={period.range} onPreset={period.setPreset} onCustom={period.setCustom} busy={isFetching && !isLoading} />
        <button type="button" className={`${btnDefault} ml-auto`} onClick={handleExport} disabled={exporting || !report}>
          <FileExcelOutlined /> {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>

      {error && <Alert type="error" showIcon message="The reports could not be worked out" description={apiErrorMessage(error)} />}
      {!error && (isLoading || !report) && <Spin className="self-center my-10" />}

      {report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {sortKpis(report.kpis).map((k) => (
              <KpiCard key={k.key} kpi={k} tone={truckingKpiTone(k)} />
            ))}
          </div>
          <ReportMarginSection report={report} />
          <ReportCard title="Haulier scorecard">
            <ReportHaulierScorecard hauliers={report.hauliers} />
          </ReportCard>
          <ReportCard title="Coverage gaps">
            <ReportCoverageGaps gaps={report.coverageGaps} levelLabel={levelLabel} />
          </ReportCard>
          <ReportCard title="Department result">
            <ReportDepartmentCard department={report.department} />
          </ReportCard>
        </>
      )}
    </div>
  );
};
