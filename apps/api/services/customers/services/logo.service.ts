export interface LogoResult {
  dataUrl: string; // base64 data URL, stored directly in Postgres
  sourceUrl: string;
  updatedAt: string;
}

function normalizeDomain(website: string): string {
  return website
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .toLowerCase();
}

async function tryFetch(url: string, timeoutMs = 6000): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { headers: { "User-Agent": "ShipmentTracker-Logo/1.0" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 100) return null; // too small, probably a placeholder
    const contentType = res.headers.get("content-type") ?? "image/png";
    return { data: buf, contentType };
  } catch {
    return null;
  }
}

class LogoService {
  async fetchLogo(website: string): Promise<LogoResult | null> {
    if (!website) return null;
    const domain = normalizeDomain(website);
    if (!domain || !domain.includes(".")) return null;

    const attempts = [
      { url: `https://img.logo.dev/${domain}?token=pk_none&size=128&format=png`, label: "logo.dev" },
      { url: `https://logo.clearbit.com/${domain}`, label: "clearbit" },
      { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`, label: "google-fav" },
      { url: `https://${domain}/favicon.ico`, label: "direct-fav" },
    ];

    for (const { url, label } of attempts) {
      const result = await tryFetch(url);
      if (!result) continue;
      const base64 = Buffer.from(result.data).toString("base64");
      return {
        dataUrl: `data:${result.contentType};base64,${base64}`,
        sourceUrl: `${label}:${url}`,
        updatedAt: new Date().toISOString().split("T")[0],
      };
    }
    return null;
  }
}

export const logoService = new LogoService();
