"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { apiErrorMessage } from "@/lib/api";
import { truckingKeys } from "@/hooks/truckingKeys";
import { CARD, HINT, PAGE_TITLE } from "@/styles/ui";
import { portalSignIn } from "../_lib/portalClient";
import { readPortalLoginHint, type PortalLoginHint } from "../_lib/portalSession";
import { PORTAL_INPUT, PORTAL_LABEL, PORTAL_PRIMARY } from "../_lib/portalStyles";
import { Bi } from "./Bi";

const STORAGE_BLOCKED = "Your browser does not let this site keep the sign-in for the tab. Allow site data for this page and try again.";

// Sign-in of a haulier's portal user: e-mail and password. The server answers the same for a wrong
// e-mail, a wrong password and a locked account, and that sentence is shown as it comes. Right after
// a password was set in this tab the page names the forwarder and fills in the account's e-mail
// (user council E15); before a sign-in nothing else tells whose portal it is.
export const PortalLoginForm = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [hint, setHint] = useState<PortalLoginHint | null>(null);
  // Read after the first paint: the tab's storage is the browser's, the server's page has none.
  useEffect(() => {
    const kept = readPortalLoginHint();
    if (!kept) return;
    setHint(kept);
    setEmail((typed) => typed || kept.email);
  }, []);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const kept = await portalSignIn(email.trim(), password);
      if (!kept) {
        setError(STORAGE_BLOCKED);
        return;
      }
      queryClient.removeQueries({ queryKey: truckingKeys.portal() });
      router.replace("/haulier/portal");
    } catch (err) {
      setPassword("");
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-10">
      <form onSubmit={handleSubmit} className={`${CARD} w-full max-w-sm p-5`}>
        {hint?.ourCompany && <div className={HINT}>{hint.ourCompany}</div>}
        <h1 className={PAGE_TITLE}>
          <Bi text={{ cs: "Portál dopravce", en: "Haulier portal" }} />
        </h1>
        <p className="mb-4 mt-1 text-[13px] text-slate-500">
          <Bi text={{ cs: "Přihlaste se svým e-mailem a heslem.", en: "Sign in with your e-mail and password." }} />
        </p>
        <label className="block">
          <span className={PORTAL_LABEL}>E-mail</span>
          <input type="email" autoComplete="username" inputMode="email" className={PORTAL_INPUT} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className={PORTAL_LABEL}>
            <Bi text={{ cs: "Heslo", en: "Password" }} />
          </span>
          <input type="password" autoComplete="current-password" className={PORTAL_INPUT} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="mb-0 mt-3 text-[13px] text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !email.trim() || !password} className={`${PORTAL_PRIMARY} mt-4`}>
          {busy ? <Bi text={{ cs: "Přihlašuji…", en: "Signing in…" }} /> : <Bi text={{ cs: "Přihlásit", en: "Sign in" }} />}
        </button>
        <p className={`mb-0 mt-4 ${HINT}`}>
          <Bi
            text={{
              cs: "Zapomenuté heslo? Požádejte dispečera o nový odkaz.",
              en: "Forgot your password? Ask your dispatcher for a new link.",
            }}
          />
        </p>
      </form>
    </main>
  );
};
