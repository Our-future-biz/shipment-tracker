import Anthropic from "@anthropic-ai/sdk";
import { APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import log from "encore.dev/log";

const anthropicApiKey = secret("ANTHROPIC_API_KEY");
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// One attempt of a request waits for the model to read what it is sent (a minute) and then to
// write as much as its reply may hold at a slow 40 tokens a second (25 ms a token): about 4.5
// minutes for an 8,192-token reading, 2 for a page classification of 2,048. It is tried once more,
// not the SDK's default of 10 minutes tried three times - a pre-alert's classification alone is up
// to 25 requests in a row, and the person who uploaded it is waiting.
const READ_MS = 60_000;
const MS_PER_REPLY_TOKEN = 25;
const MAX_REPLY_TOKENS = 8192;
const MAX_RETRIES = 1;

/** How long one attempt of a request may take whose reply runs to at most `maxTokens`. */
export const replyTimeoutMs = (maxTokens: number): number => READ_MS + maxTokens * MS_PER_REPLY_TOKEN;

export function getClient(): Anthropic {
  // Prefer the Encore secret; fall back to the OS env var for local runs where the cloud secret
  // store isn't reachable. A request that sets no timeout of its own waits as long as the longest
  // reply asked for here.
  const apiKey = anthropicApiKey() || process.env.ANTHROPIC_API_KEY;
  return new Anthropic({ apiKey, timeout: replyTimeoutMs(MAX_REPLY_TOKENS), maxRetries: MAX_RETRIES });
}

/**
 * The AI's reply to a reading. One it does not give - unreachable, timed out, overloaded, or the
 * request refused - is answered as unavailable with a message the screens show, not as an internal
 * error: nothing is wrong with what the user sent, and trying again later may work.
 */
export async function askAi(params: Anthropic.MessageCreateParamsNonStreaming, what: string): Promise<Anthropic.Message> {
  try {
    return await getClient().messages.create(params, { timeout: replyTimeoutMs(params.max_tokens) });
  } catch (err) {
    log.error(err, `extraction: the AI did not answer (${what})`, { model: params.model });
    throw APIError.unavailable("The AI could not read the document just now. Please try again in a moment.");
  }
}

/** The text of a reply, its blocks joined. */
export function replyText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
