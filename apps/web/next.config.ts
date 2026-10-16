import type { NextConfig } from "next";

// Security headers on every page. The Content-Security-Policy fits what the app does: Next's own
// inline bootstrap scripts and antd's CSS-in-JS need 'unsafe-inline' (no nonces on a static app);
// the dev server also needs 'unsafe-eval' and its HMR websocket. Files are previewed from blob:
// URLs (iframes, images) or opened from the API (signed links). Nobody may frame the app
// (clickjacking). The haulier pages carry a token in the URL (the order link, the set-password
// link): they send no Referer at all, so the token never leaks to another site.

const dev = process.env.NODE_ENV !== "production";
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001").origin;
  } catch {
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
  `frame-src 'self' blob: ${apiOrigin}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((d) => d.trim())
  .join("; ");

const nextConfig: NextConfig = {
  trailingSlash: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Listed after the general rule: for the haulier pages this value wins.
        source: "/haulier/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
