/** Text made safe to put into HTML (print windows build their page as a string). */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
