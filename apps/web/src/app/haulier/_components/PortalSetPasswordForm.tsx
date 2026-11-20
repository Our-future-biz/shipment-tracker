"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { apiErrorMessage, isNotFound, publicApi } from "@/lib/api";
import { CARD, HINT, PAGE_TITLE } from "@/styles/ui";
import { portalSetPassword } from "../_lib/portalClient";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordProblem } from "../_lib/portal";
import { LINK_INVALID } from "../_lib/publicOrder";
import { PORTAL_LOGIN_PATH, savePortalLoginHint } from "../_lib/portalSession";
import { PORTAL_INPUT, PORTAL_LABEL, PORTAL_PRIMARY, PORTAL_PRIMARY_LINK } from "../_lib/portalStyles";
import { Bi } from "./Bi";

interface PortalSetPasswordFormProps {
  token: string;
}

const Frame = ({ children }: { children: React.ReactNode }) => <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">{children}</main>;

// The page of an invitation or reset link: whose account it is (the forwarder, the haulier, the
// e-mail - user council E15: the page named neither), then the new password twice, with its rules
// shown. The link works once; afterwards the user signs in, the e-mail filled in.
export const PortalSetPasswordForm = ({ token }: PortalSetPasswordFormProps) => {
  const linkQuery = useQuery({ queryKey: ["haulier-portal-set-password-link", token], queryFn: () => publicApi.trucking.portalSetPasswordLink(token), retry: false, enabled: !!token });
  const link = linkQuery.data?.link ?? null;
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
      if (link) savePortalLoginHint({ ourCompany: link.ourCompany, email: link.email });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (linkQuery.isLoading) {
    return (
      <Frame>
        <Spin className="mt-10" />
      </Frame>
    );
  }
  // A link that can't be used says so before anything is typed.
  if (!done && isNotFound(linkQuery.error)) {
    return (
      <Frame>
        <div className={`${CARD} w-full max-w-sm p-5`}>
          <p className="m-0 text-[14px] text-slate-700">
            <Bi text={LINK_INVALID} />
          </p>
          <p className={`mb-0 mt-2 ${HINT}`}>
            <Bi text={{ cs: "Požádejte dispečera o nový odkaz.", en: "Ask your dispatcher for a new link." }} />
          </p>
        </div>
      </Frame>
    );
  }

  const whose = link && (
    <div className="mb-3">
      <div className={HINT}>
        {link.ourCompany ? `${link.ourCompany} · ` : ""}
        <Bi text={{ cs: "Portál dopravce", en: "Haulier portal" }} />
      </div>
      {link.haulierName && <div className="text-[14px] font-semibold text-slate-900">{link.haulierName}</div>}
      <div className="break-all text-[13px] text-slate-700">
        <Bi text={{ cs: "Účet", en: "Account" }} />: {link.email}
      </div>
    </div>
  );

  if (done) {
    return (
      <Frame>
        <div className={`${CARD} w-full max-w-sm p-5`}>
          {whose}
          <p className="m-0 text-[14px] font-semibold text-emerald-700">
            <Bi text={{ cs: "Heslo je nastaveno.", en: "Your password is set." }} />
          </p>
          <Link href={PORTAL_LOGIN_PATH} className={`${PORTAL_PRIMARY_LINK} mt-4`}>
            <Bi text={{ cs: "Přihlásit se", en: "Sign in" }} />
          </Link>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <form onSubmit={handleSubmit} className={`${CARD} w-full max-w-sm p-5`}>
        {whose}
        <h1 className={PAGE_TITLE}>
          <Bi text={link?.kind === "RESET" ? { cs: "Nastavte si nové heslo", en: "Set a new password" } : { cs: "Nastavte si heslo", en: "Set your password" }} />
        </h1>
        <ul className="mb-4 mt-2 pl-5 text-[13px] text-slate-700">
          {PASSWORD_RULES.map((rule, i) => (
            <li key={rule.en} className={i === 0 && password.length >= MIN_PASSWORD_LENGTH ? "text-emerald-700" : ""}>
              <Bi text={rule} />
            </li>
          ))}
        </ul>
        {/* The account's e-mail beside the new password, so a password manager files them together. */}
        {link && <input type="email" autoComplete="username" value={link.email} readOnly hidden />}
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
    </Frame>
  );
};
