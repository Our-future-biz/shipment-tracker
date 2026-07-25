import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const LOGO_DIR = path.join(process.cwd(), "public", "logos");
fs.mkdirSync(LOGO_DIR, { recursive: true });

function fetchUrl(url: string, timeout = 6000): Promise<{ data: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "CRM-Logo-Fetcher/1.0" } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location as string, timeout).then(resolve).catch(reject);
      }
      if (!res.statusCode || res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ data: Buffer.concat(chunks), contentType: res.headers["content-type"] ?? "image/png" }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function normalizeDomain(website: string): string {
  const s = website.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0];
  return s.toLowerCase();
}

function getExtFromContentType(ct: string): string {
  if (ct.includes("svg")) return "svg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("png")) return "png";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

export interface LogoResult {
  localPath: string;   // path relative to public/logos/
  sourceUrl: string;
  updatedAt: string;
}

export async function fetchLogo(website: string, customerId: number): Promise<LogoResult | null> {
  if (!website) return null;
  const domain = normalizeDomain(website);
  if (!domain || !domain.includes(".")) return null;

  // Strategy 1: Logo.dev (free, no auth needed for basic requests)
  const logoDevUrl = `https://img.logo.dev/${domain}?token=pk_none&size=64&format=png`;

  // Strategy 2: Google favicon service (reliable fallback)
  const googleFavUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  // Strategy 3: Direct favicon
  const directFavUrl = `https://${domain}/favicon.ico`;

  const attempts = [
    { url: logoDevUrl, label: "logo.dev" },
    { url: `https://logo.clearbit.com/${domain}`, label: "clearbit" },
    { url: googleFavUrl, label: "google-fav" },
    { url: directFavUrl, label: "direct-fav" },
  ];

  for (const { url, label } of attempts) {
    try {
      const { data, contentType } = await fetchUrl(url);
      if (data.length < 100) continue; // too small, skip

      const ext = getExtFromContentType(contentType);
      const hash = createHash("md5").update(String(customerId)).digest("hex").slice(0, 8);
      const filename = `customer_${customerId}_${hash}.${ext}`;
      const fullPath = path.join(LOGO_DIR, filename);

      fs.writeFileSync(fullPath, data);

      return {
        localPath: `/logos/${filename}`,
        sourceUrl: `${label}:${url}`,
        updatedAt: new Date().toISOString().split("T")[0],
      };
    } catch {
      // try next
    }
  }
  return null;
}

export function deleteLogo(logoPath: string): void {
  if (!logoPath) return;
  const filename = path.basename(logoPath);
  const fullPath = path.join(LOGO_DIR, filename);
  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
}

export function getLogoDir(): string {
  return LOGO_DIR;
}
