import { describe, expect, it } from "vitest";
import { mentionMatchesOf, mentionUse, rankByUse } from "./mentionOptions";

const people = [
  { id: "a", name: "Austromar" },
  { id: "k", name: "Kim" },
  { id: "kb", name: "Kimberly" },
  { id: "i", name: "Igor" },
  { id: "p", name: "Petra" },
];
const msg = (authorId: string, message = "ok") => ({ authorId, message });
// What the @ list offers in a chat for what is typed after the @, as ChatPanel asks it.
const mentionOptions = (chat: { authorId: string; message: string }[], query: string) => mentionMatchesOf(rankByUse(people, chat), query);

describe("the chat's @ list", () => {
  it("counts a colleague's messages and the times they were tagged, a longer name not read as a shorter one", () => {
    const use = mentionUse(people, [msg("i"), msg("me", "@Kimberly look"), msg("me", "@Igor and @Kim"), msg("stranger")]);
    expect(Object.fromEntries(use)).toEqual({ i: 2, kb: 1, k: 1 });
  });

  it("offers the three colleagues used most in this chat for a bare @", () => {
    const chat = [msg("p"), msg("p"), msg("p"), msg("me", "@Igor bla"), msg("i"), msg("k")];
    expect(mentionOptions(chat, "").map((c) => c.name)).toEqual(["Petra", "Igor", "Kim"]);
  });

  it("fills the three with colleagues not used here yet, in their own order", () => {
    expect(mentionOptions([msg("me", "@Igor bla")], "").map((c) => c.name)).toEqual(["Igor", "Austromar", "Kim"]);
    expect(mentionOptions([], "").map((c) => c.name)).toEqual(["Austromar", "Kim", "Kimberly"]);
  });

  it("searches every colleague once something is typed, those used in this chat first", () => {
    const chat = [msg("kb"), msg("p"), msg("p")];
    expect(mentionOptions(chat, "kim").map((c) => c.name)).toEqual(["Kimberly", "Kim"]);
    expect(mentionOptions(chat, "AUS").map((c) => c.name)).toEqual(["Austromar"]);
    expect(mentionOptions(chat, "zz")).toEqual([]);
  });
});
