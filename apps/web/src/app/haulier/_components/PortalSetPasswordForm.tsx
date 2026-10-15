"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiErrorMessage } from "@/lib/api";
import { portalSetPassword } from "../_lib/portalClient";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordProblem } from "../_lib/portal";
import { PORTAL_LOGIN_PATH } from "../_lib/portalSession";
import { PORTAL_INPUT, PORTAL_LABEL, PORTAL_PRIMARY } from "../_lib/portalStyles";
import { Bi } from "./Bi";

interface PortalSetPasswordFormProps {
  token: string;
}

// The page of an invitation or reset link: the new password twice, with its rules shown. The link
// works once; afterwards the user signs in.
export const PortalSetPasswordForm = ({ token }: PortalSetPasswordFormProps) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const problem = passwordProblem(password, confirm);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await portalSetPassword(token, password);
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5">
          <p className="m-0 text-[16px] font-semibold text-emerald-800">
            <Bi text={{ cs: "Heslo je nastaveno.", en: "Your password is set." }} />
          </p>
          <Link href={PORTAL_LOGIN_PATH} className={`${PORTAL_PRIMARY} mt-4 block text-center no-underline`}>
            <Bi text={{ cs: "Přihlásit se", en: "Sign in" }} />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="m-0 text-[20px] font-bold text-slate-900">
          <Bi text={{ cs: "Nastavte si heslo", en: "Set your password" }} />
        </h1>
        <ul className="mb-4 mt-2 pl-5 text-[13px] text-slate-600">
          {PASSWORD_RULES.map((rule, i) => (
            <li key={rule.en} className={i === 0 && password.length >= MIN_PASSWORD_LENGTH ? "text-emerald-700" : ""}>
              <Bi text={rule} />
            </li>
          ))}
        </ul>
        <label className="block">
          <span className={PORTAL_LABEL}>
            <Bi text={{ cs: "Nové heslo", en: "New password" }} />
          </span>
          <input type="password" autoComplete="new-password" className={PORTAL_INPUT} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className={PORTAL_LABEL}>
            <Bi text={{ cs: "Heslo znovu", en: "Confirm password" }} />
          </span>
          <input type="password" autoComplete="new-password" className={PORTAL_INPUT} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {problem && password && confirm && (
          <p className="mb-0 mt-2 text-[13px] text-red-600">
            <Bi text={problem} />
          </p>
        )}
        {error && (
          <p role="alert" className="mb-0 mt-2 text-[13px] text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !!problem} className={`${PORTAL_PRIMARY} mt-4`}>
          <Bi text={{ cs: "Uložit heslo", en: "Save password" }} />
        </button>
      </form>
    </main>
  );
};
