import { describe, expect, it } from "vitest";
import { COMBINING_MARKS, FINAL_SIGMA, FOLD_FROM, FOLD_TO, SIGMA, escapeLike, foldDiacritics, searchTokens } from "../../utils/quoteSearch.utils";

describe("the fold constants", () => {
  it("pair every letter with a stroke with one plain ASCII letter", () => {
    const from = Array.from(FOLD_FROM);
    const to = Array.from(FOLD_TO);
    // SQL translate() DELETES a letter that has no counterpart: the two must be equally long.
    expect(to).toHaveLength(from.length);
    expect(new Set(from).size).toBe(from.length);
    for (const letter of to) expect(letter).toMatch(/^[a-z]$/);
  });

  it("list only letters that decomposition leaves whole - the others lose their marks already", () => {
    for (const letter of FOLD_FROM) expect(letter.normalize("NFD"), letter).toBe(letter);
  });

  it("name the accents as one class of characters, with nothing a regular expression reads differently in Postgres", () => {
    expect(COMBINING_MARKS).toBe("[\u0300-\u036f]");
    expect(Array.from(COMBINING_MARKS)).toHaveLength(5);
  });

  it("name the two ways the lower-case sigma is written, one character each", () => {
    // SQL replace() swaps text for text: one letter each keeps it the letter-for-letter step it is here.
    expect(Array.from(FINAL_SIGMA)).toHaveLength(1);
    expect(Array.from(SIGMA)).toHaveLength(1);
    expect(FINAL_SIGMA).not.toBe(SIGMA);
    expect(FINAL_SIGMA.toUpperCase()).toBe("Σ");
    expect(SIGMA.toUpperCase()).toBe("Σ");
  });
});

describe("foldDiacritics", () => {
  it("reads 'Šanghaj' as 'sanghaj'", () => {
    expect(foldDiacritics("Šanghaj")).toBe("sanghaj");
    expect(foldDiacritics("sanghaj")).toBe("sanghaj");
  });

  it("folds Czech text whatever its case", () => {
    expect(foldDiacritics("Příliš žluťoučký kůň úpěl ďábelské ódy")).toBe("prilis zlutoucky kun upel dabelske ody");
    expect(foldDiacritics("PLZEŇSKÝ PRAZDROJ")).toBe("plzensky prazdroj");
  });

  it("folds the neighbours' letters too", () => {
    expect(foldDiacritics("Köln München Łódź Gdańsk Constanța Århus Đà Nẵng")).toBe("koln munchen lodz gdansk constanta arhus da nang");
    expect(foldDiacritics("ØST Ħal Ŧ ı")).toBe("ost hal t i");
  });

  it("reads a letter typed as letter + accent like the one in a single character", () => {
    expect(foldDiacritics("S\u030canghaj")).toBe("sanghaj");
  });

  it("reads a Greek word the same in capitals and in lower case, although its last letter is then written differently", () => {
    // JavaScript lower-cases the Σ that ends a word to ς, Postgres lower() to σ.
    expect("ΟΔΟΣ".toLowerCase()).toBe("οδος");
    expect(foldDiacritics("ΟΔΟΣ")).toBe("οδοσ");
    expect(foldDiacritics("Οδός")).toBe("οδοσ");
    expect(foldDiacritics("οδος")).toBe("οδοσ");
    expect(foldDiacritics("ΟΔΟΣ ΑΘΗΝΑΣ")).toBe("οδοσ αθηνασ");
    expect(foldDiacritics("Σίσυφος ΣΙΣΥΦΟΣ")).toBe("σισυφοσ σισυφοσ");
  });

  it("leaves everything else as it is, in lower case", () => {
    expect(foldDiacritics("ITTEC, s.r.o. 100% A_B")).toBe("ittec, s.r.o. 100% a_b");
    expect(foldDiacritics("Straße")).toBe("straße");
    expect(foldDiacritics("")).toBe("");
  });
});

describe("escapeLike", () => {
  it("makes % and _ match themselves, and the escape character too", () => {
    expect(escapeLike("ITTEC%")).toBe("ITTEC\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("QCZ20261010001")).toBe("QCZ20261010001");
  });
});

describe("searchTokens", () => {
  it("splits a search text into words, folded", () => {
    expect(searchTokens("air import dap")).toEqual(["air", "import", "dap"]);
    expect(searchTokens("  Praha   ITTEC ")).toEqual(["praha", "ittec"]);
    expect(searchTokens("Šanghaj")).toEqual(searchTokens("sanghaj"));
    expect(searchTokens("ΟΔΟΣ")).toEqual(searchTokens("Οδός"));
  });

  it("is nothing for a text without a word", () => {
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens(" \t\n ")).toEqual([]);
  });

  it("takes 'ITTEC%' literally", () => {
    expect(searchTokens("ITTEC%")).toEqual(["ittec\\%"]);
    expect(searchTokens("ready_to_send")).toEqual(["ready\\_to\\_send"]);
    expect(searchTokens("a\\")).toEqual(["a\\\\"]);
  });

  it("looks for at most five words", () => {
    expect(searchTokens("one two three four five six seven")).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("cuts a word to 50 characters - by character, and before it is escaped", () => {
    expect(searchTokens("x".repeat(80))).toEqual(["x".repeat(50)]);
    // The cut must not leave half an escape at the end: Postgres refuses such a pattern.
    expect(searchTokens(`${"x".repeat(49)}%%`)).toEqual([`${"x".repeat(49)}\\%`]);
    expect(searchTokens(`${"x".repeat(49)}😀😀`)).toEqual([`${"x".repeat(49)}😀`]);
  });
});
