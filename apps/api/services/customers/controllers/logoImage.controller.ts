import { api } from "encore.dev/api";
import { customerService } from "../services/customer.service";
import { writeNotFound } from "../../../lib/fileContent";

// The customer's logo as an image, for <img src> in lists and on the customer page.
// Path: /customers/:id/logo/image?t=<token>&v=<version>
export const logoImage = api.raw(
  // Public by necessity: an <img> sends no auth header. Instead the link carries a short-lived
  // signed token (CustomerItem.logoUrl) naming the customer and the company; without a valid one
  // nothing is served.
  { expose: true, auth: false, method: "GET", path: "/customers/:id/logo/image" },
  async (req, resp) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // [customers, id, logo, image]
    const image = await customerService.logoImage(parts[1] ?? "", url.searchParams.get("t"));
    if (!image) {
      writeNotFound(resp);
      return;
    }
    resp.writeHead(200, {
      "Content-Type": image.contentType,
      "Content-Length": image.buffer.length,
      // The link changes when the logo does (v=) and at the latest every hour (the token).
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // An SVG logo opened on its own can run no script on this origin.
      "Content-Security-Policy": "sandbox",
    });
    resp.end(image.buffer);
  },
);
