"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { bankAccountProblem, formatBankAccount, isPublishedAccount, normaliseBankAccount } from "../../_lib/bankAccounts";

interface HaulierBankAccountsProps {
  accounts: string[];
  onChange: (accounts: string[]) => void;
  /** A manager's only: shown read-only to everyone else */
  readOnly?: boolean;
}

// The haulier's bank accounts published in the VAT register, typed in by hand after checking the
// register. An invoice paid to any other account is blocked (joint VAT liability). Only a manager
// changes the list.
export const HaulierBankAccounts = ({ accounts, onChange, readOnly = false }: HaulierBankAccountsProps) => {
  const [input, setInput] = useState("");
  const problem = input.trim() ? (bankAccountProblem(input) ?? (isPublishedAccount(input, accounts) ? "Already in the list" : null)) : null;

  const handleAdd = () => {
    if (!input.trim() || problem) return;
    onChange([...accounts, normaliseBankAccount(input)]);
    setInput("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Published bank accounts</span>
      {accounts.length === 0 ? (
        <span className="text-[12px] text-amber-700">None yet — every invoice from this haulier is blocked until its account is listed here.</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {accounts.map((a) => (
            <li key={a} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-slate-800">{formatBankAccount(a)}</span>
              {!readOnly && (
                <Button size="small" type="text" aria-label={`Remove ${a}`} icon={<CloseOutlined />} onClick={() => onChange(accounts.filter((x) => x !== a))} />
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            aria-label="Bank account to add"
            placeholder="19-2000145399/0800 or CZ65 0800 …"
            value={input}
            status={problem ? "error" : undefined}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={handleAdd}
          />
          <Button icon={<PlusOutlined />} disabled={!input.trim() || !!problem} onClick={handleAdd}>
            Add
          </Button>
        </div>
      )}
      {!readOnly && problem && <span className="text-[11px] text-red-600">{problem}</span>}
    </div>
  );
};
