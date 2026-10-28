"use client";

import { useState } from "react";
import { Button, Select, Table, Tooltip, type TableColumnsType } from "antd";
import { GeoSelect } from "@/components/GeoSelect";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { useOceanTariffActions, type OceanPort, type OceanTariffVersionDetail } from "@/hooks/useOceanTariffs";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { PORT_STATUS_TEXT, placeCodeOf, placeText, portText, portsOf, type PortFilter } from "../../_lib/oceanTariffs";

const PAGE_SIZE = 50;

const STATUS_CLASS: Record<OceanPort["status"], string> = {
  matched: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual: "bg-indigo-50 text-indigo-700 border-indigo-200",
  skipped: "bg-slate-100 text-slate-500 border-slate-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
};

const SIDE_TEXT: Record<OceanPort["side"], string> = { pol: "POL", pod: "POD" };

const portKey = (p: Pick<OceanPort, "side" | "name">) => `${p.side}:${p.name}`;

interface OceanVersionPortsProps {
  version: Pick<OceanTariffVersionDetail, "id" | "ports" | "pendingPorts">;
  /** A manager on a draft: what a port name means can be picked or changed. */
  editable: boolean;
}

// Every port name of the file and the UN/LOCODE it was matched to. A name the code could not match
// waits for a manager, who picks one of its candidate places, searches another, or leaves its rates
// out; the draft can be approved only when none is left to pick.
export const OceanVersionPorts = ({ version, editable }: OceanVersionPortsProps) => {
  const toast = useToast();
  const { setPort, isSettingPort } = useOceanTariffActions();
  const [filter, setFilter] = useState<PortFilter>(version.pendingPorts > 0 ? "pending" : "all");
  const [page, setPage] = useState(1);
  const count = (f: PortFilter) => portsOf(version.ports, f).length;
  const shown = portsOf(version.ports, filter);

  const tabs: { key: PortFilter; label: string }[] = [
    { key: "all", label: `All (${version.ports.length})` },
    { key: "pending", label: `To pick (${version.pendingPorts})` },
    { key: "matched", label: `Matched (${count("matched")})` },
    { key: "manual", label: `Picked (${count("manual")})` },
    { key: "skipped", label: `Left out (${count("skipped")})` },
  ];

  const handleSet = async (port: OceanPort, code: string | null) => {
    try {
      await setPort({ id: version.id, side: port.side, name: port.name, code });
      toast.success(code ? `${port.name} is ${code}` : `${port.name} left out: its rates are not used`);
    } catch (e) {
      toast.error(`Could not set ${port.name}: ${apiErrorMessage(e)}`, 8);
    }
  };

  const columns: TableColumnsType<OceanPort> = [
    { key: "side", title: "Side", width: 64, render: (_, p) => <span className="text-xs font-semibold text-slate-500">{SIDE_TEXT[p.side]}</span> },
    {
      key: "name",
      title: "Port as the tariff writes it",
      render: (_, p) => (
        <span className="font-medium text-slate-800">
          {p.name}
          {p.countryHint && <span className="ml-1.5 text-xs font-normal text-slate-400">{p.countryHint}</span>}
        </span>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (_, p) => <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[p.status]}`}>{PORT_STATUS_TEXT[p.status]}</span>,
    },
    {
      key: "place",
      title: "Place",
      render: (_, p) => (p.code ? <span className="tabular-nums">{portText(p.name, p.code)}</span> : <span className="text-slate-400">{p.status === "skipped" ? "its rates are not used" : "—"}</span>),
    },
    ...(editable
      ? ([
          {
            key: "choose",
            title: "Change",
            render: (_, p) => <PortChoice port={p} disabled={isSettingPort} onSet={(code) => void handleSet(p, code)} />,
          },
        ] satisfies TableColumnsType<OceanPort>)
      : []),
  ];

  return (
    <SectionCard
      title="Ports"
      extra={<CountChip count={version.pendingPorts > 0 ? `${version.pendingPorts} to pick` : version.ports.length} />}
      bodyClassName="p-0"
    >
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-slate-100">
        <PillTabs
          tabs={tabs}
          active={filter}
          onChange={(f) => {
            setFilter(f);
            setPage(1);
          }}
        />
        <div className="text-xs text-slate-500">
          {version.pendingPorts > 0
            ? editable
              ? "The code could not tell which place these names mean. Pick one of the places offered, search another, or leave the name's rates out; the draft can be approved when none is left to pick."
              : "Some port names are still to be matched by a manager before the draft can be approved."
            : "Every port name of the file means a place of the UN/LOCODE list, or its rates are left out."}
        </div>
      </div>
      <Table<OceanPort>
        size="small"
        rowKey={portKey}
        columns={columns}
        dataSource={shown}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: filter === "pending" ? "No port is left to pick." : "No port names here." }}
        pagination={
          shown.length > PAGE_SIZE && {
            current: page,
            pageSize: PAGE_SIZE,
            showSizeChanger: false,
            onChange: setPage,
          }
        }
      />
    </SectionCard>
  );
};

interface PortChoiceProps {
  port: OceanPort;
  disabled: boolean;
  onSet: (code: string | null) => void;
}

// What a manager can make of a port name: one of its candidate places, any other place, or none.
const PortChoice = ({ port, disabled, onSet }: PortChoiceProps) => (
  <div className="flex flex-wrap items-center gap-2">
    {port.candidates.length > 0 && (
      <Select
        size="small"
        aria-label={`Place of ${port.name}`}
        placeholder={`One of ${port.candidates.length} places`}
        value={port.candidates.some((c) => c.code === port.code) ? port.code : undefined}
        options={port.candidates.map((c) => ({ value: c.code, label: placeText(c) }))}
        disabled={disabled}
        popupMatchSelectWidth={false}
        onChange={(code: string) => onSet(code)}
        className="w-56"
      />
    )}
    <GeoSelect
      kind="place"
      size="small"
      value={null}
      allowClear={false}
      placeholder={port.candidates.length ? "Or search another place" : "Search the place"}
      onChange={(value) => {
        const code = placeCodeOf(value);
        if (code && code !== port.code) onSet(code);
      }}
      className="w-56"
    />
    {port.status !== "skipped" && (
      <Tooltip title="The rates of this port are not used">
        <Button size="small" disabled={disabled} onClick={() => onSet(null)}>
          Leave out
        </Button>
      </Tooltip>
    )}
  </div>
);
