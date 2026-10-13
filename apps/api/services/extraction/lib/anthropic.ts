import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";

const anthropicApiKey = secret("ANTHROPIC_API_KEY");
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export function getClient(): Anthropic {
  // Prefer the Encore secret; fall back to the OS env var for local runs where
  // the cloud secret store isn't reachable.
  const apiKey = anthropicApiKey() || process.env.ANTHROPIC_API_KEY;
  return new Anthropic({ apiKey });
}

/** The text of a reply, its blocks joined. */
export function replyText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
