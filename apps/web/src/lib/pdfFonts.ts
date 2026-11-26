// The font files the app's PDFs are set in, read for jsPDF: a face with Czech letters, which the PDF's
// own Helvetica lacks. The Loading Planner's plan and a sailing's load list are made with it.

/** A font file of the app (`/fonts/…`) as base64, the form jsPDF's file system takes; rejects when it cannot be read. */
export async function fontFile(path: string): Promise<string> {
  const reply = await fetch(path);
  if (!reply.ok) throw new Error(`Font ${path}: ${reply.status}`);
  const bytes = new Uint8Array(await reply.arrayBuffer());
  // In slices: a whole font file spread into one call would pass more arguments than a function takes.
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}
