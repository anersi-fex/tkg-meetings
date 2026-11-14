import type { ContentSlide } from "./slides";
import type { CardSnapshot } from "./types";

/**
 * Pure checks shared by the server code and the tests (no server-only imports): the numbers a
 * draft shows that the owner never said, names on a slide that are on neither of his lists, an
 * open item on a red slide, the lines he said in quote marks, and reading the Command Center
 * connector address he pastes in Settings.
 */

export const DEFAULT_CC_URL = "https://tkg-command-center.vercel.app/api/mcp";

/** Scorecard's carrier list when Settings > Carriers can't be read (owner, 2026-10-27). */
export const DEFAULT_CARRIERS = ["AHL", "AmAm", "Americo", "Foresters", "Newbridge", "Royal", "UHL"] as const;

export function cardText(card: CardSnapshot): string {
  return [card.title, card.summary, ...card.points].join("\n");
}

/** Only the words the room sees: every string of a slide but its notes and its layout key. */
function visibleStrings(slide: ContentSlide): string[] {
  const strings = (v: unknown): string[] =>
    typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
  return strings({ ...slide, notes: "", layout: "" }).filter(Boolean);
}

// --- Numbers ---------------------------------------------------------------------------------------

/** A number as written: "1,500", "60", "1.5", with an optional k or a scale word after it. */
const DIGITS = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(k)(?![\p{L}])|\s+(thousand|grand|million)\b)?/giu;
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, grand: 1e3, million: 1e6 };
const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNIT = "one|two|three|four|five|six|seven|eight|nine";
/** "ninety", "twenty-five", "a hundred", "five thousand": a number he said in words. */
const WORDS = new RegExp(
  `\\b(?:(${Object.keys(TENS).join("|")})(?:[-\\s](${UNIT}))?|(${Object.keys(SMALL).join("|")})|(a))(?:\\s+(hundred))?(?:\\s+(thousand|grand|million))?\\b`,
  "gi",
);

/** Values compare to the cent, so 1.5 x 1000 and 1,500 are the same number. */
const valueKey = (n: number) => Math.round(n * 100) / 100;

function digitValues(text: string): { written: string; value: number }[] {
  const out: { written: string; value: number }[] = [];
  for (const m of text.matchAll(DIGITS)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    const scale = SCALE[(m[2] ?? m[3] ?? "").toLowerCase()] ?? 1;
    out.push({ written: m[1], value: valueKey(base * scale) });
  }
  return out;
}

function wordValues(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(WORDS)) {
    const [, tens, unit, small, a, hundred, scale] = m;
    // "a" alone is not a number; "a hundred" and "a thousand" are.
    if (a && !hundred && !scale) continue;
    let n = tens ? TENS[tens.toLowerCase()] + (unit ? SMALL[unit.toLowerCase()] : 0) : small ? SMALL[small.toLowerCase()] : 1;
    if (hundred) n *= 100;
    if (scale) n *= SCALE[scale.toLowerCase()];
    out.push(valueKey(n));
  }
  return out;
}

/**
 * Numbers on the slides that the card never says (rule 3), compared by value: "$1.5k" is the
 * card's "$1,500", but "$500" is not its "$5,000" and "15" is not its "150". The editor shows
 * them as a warning. Returned as written on the slide, without the k.
 */
export function numbersNotInCard(slides: ContentSlide[], card: CardSnapshot): string[] {
  const source = cardText(card);
  const said = new Set<number>([...digitValues(source).map((d) => d.value), ...wordValues(source)]);
  const found = new Set<string>();
  for (const s of slides) {
    for (const field of visibleStrings(s)) {
      for (const d of digitValues(field)) if (!said.has(d.value)) found.add(d.written);
    }
  }
  return [...found].slice(0, 6);
}

// --- Names ---------------------------------------------------------------------------------------------

/** Words of the default carriers' full names (a carrier is written in full when it fits). */
const CARRIER_WORDS = ["american", "amicable", "home", "life", "americo", "foresters", "financial", "newbridge", "royal", "neighbors", "of", "america", "united", "insurance"];
/** Capitalised words that are never a teammate's name. */
const NOT_NAMES = new Set([
  ...["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun"],
  ...["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  ...["jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"],
  ...["christmas", "thanksgiving", "easter", "halloween", "god"],
  ...["i’m", "i’ll", "i’ve", "i’d", "ok", "okay"],
  // The owner, the agency and its own tools.
  ...["anersi", "koka", "tkg", "goosehead", "scorecard", "pocket", "social", "troy", "medicare", "medicaid"],
  // Products and tools the team talks about.
  ...["final", "expense", "term", "whole", "universal", "indexed", "mortgage", "protection", "annuity", "supplement", "advantage", "graded", "guaranteed", "simplified", "issue"],
  ...["zoom", "google", "gmail", "outlook", "excel", "slack", "spanish", "english"],
  // States (licenses): one word each, and the words of the two-word ones.
  ...["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky"],
  ...["louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "ohio", "oklahoma", "oregon", "pennsylvania"],
  ...["tennessee", "texas", "utah", "vermont", "virginia", "washington", "wisconsin", "wyoming", "new", "york", "jersey", "hampshire", "mexico", "north", "south", "west", "carolina", "dakota", "rhode", "island"],
]);
/** A word after one of these is a thing, not a person ("the Social", "our Monday call"). */
const DETERMINERS = new Set(["the", "a", "an", "our", "your", "my", "his", "her", "their", "its", "every", "each", "any", "no"]);

const nameKey = (w: string) =>
  w
    .toLowerCase()
    .replace(/'/g, "’")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");

/**
 * Capitalised words on the slides that may be a person's name and are on neither of his lists:
 * not the team list (Scorecard), the carrier list or the people the card names (rule 10: such a
 * name waits for his check). A word that starts a sentence, follows "the" or "our", is a day or
 * a month, or that the card also uses in lower case ("rule" for a "Rule" in a title) is not a
 * name. Returned as written on the slide.
 */
export function namesToCheck(slides: ContentSlide[], card: CardSnapshot, names: { people: string[]; carriers: string[] }): string[] {
  // Mark is in the guide itself (his own blue badge on a Step chain).
  const known = new Set<string>([...CARRIER_WORDS, "mark"]);
  for (const n of [...names.people, ...names.carriers, ...DEFAULT_CARRIERS, ...card.people]) {
    for (const w of n.split(/[\s,/&+()-]+/)) if (nameKey(w)) known.add(nameKey(w));
  }
  // Words the card uses in lower case are ordinary words.
  const lower = new Set<string>();
  for (const m of cardText(card).matchAll(/[\p{L}][\p{L}’']*/gu)) if (/^\p{Ll}/u.test(m[0])) lower.add(nameKey(m[0]));

  const found = new Map<string, string>();
  for (const s of slides) {
    for (const field of visibleStrings(s)) {
      const text = field.replace(/\*\*/g, "");
      let prev = "";
      let prevEnd = 0;
      for (const m of text.matchAll(/[\p{L}][\p{L}’'-]*/gu)) {
        const raw = m[0].replace(/[’'-]+$/, "");
        const word = raw.replace(/[’']s$/i, "");
        const key = nameKey(word);
        const gap = text.slice(prevEnd, m.index);
        const before = text.slice(0, m.index).replace(/[\s“”"‘’'(\[]+$/u, "");
        const startsSentence = before === "" || /[.!?:;…·•—–\-/]$/.test(before);
        const afterDeterminer = prev !== "" && /^\s+$/.test(gap) && DETERMINERS.has(prev);
        prev = nameKey(m[0]);
        prevEnd = (m.index ?? 0) + m[0].length;
        // A name is capitalised and has lower-case letters ("MIB", "TBD" and "[X]" are not names).
        if (!/^\p{Lu}/u.test(word) || !/\p{Ll}/u.test(word)) continue;
        if (startsSentence || afterDeterminer || !key) continue;
        const parts = key.split("-").filter(Boolean);
        // "Mondays" is a day too.
        const ok = (k: string) => known.has(k) || NOT_NAMES.has(k) || lower.has(k) || (k.endsWith("s") && NOT_NAMES.has(k.slice(0, -1)));
        if (ok(key) || parts.every(ok)) continue;
        if (!found.has(key)) found.set(key, word);
      }
    }
  }
  return [...found.values()].slice(0, 6);
}

// --- Red slides --------------------------------------------------------------------------------------

/** An open item ([X] or TBD) on a Big news: a red slide holds only what is decided (rule 5). */
export function openItemOnRed(slide: ContentSlide): boolean {
  return slide.layout === "big_news" && /\[\s*x\s*\]|\bTBD\b/i.test(`${slide.statement}\n${slide.line}`);
}

// --- Quotes ------------------------------------------------------------------------------------------

/**
 * Lines the card shows in quote marks, so a "quote" the AI offers is really his. Whole pairs are
 * matched first (on one line, curly or straight), and only then kept by length, so a short
 * quote ("no") never lends its closing mark to the next one.
 */
export function quotedLines(card: CardSnapshot): string[] {
  const out: string[] = [];
  const pairs = /“([^“”\n]*)”|"([^"\n]*)"|“([^“”"\n]*)"|"([^“”"\n]*)”/g;
  for (const m of cardText(card).matchAll(pairs)) {
    const q = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (q.length >= 8 && q.length <= 200) out.push(q);
  }
  return out;
}

// --- Settings ----------------------------------------------------------------------------------------

/**
 * What the owner pasted for Command Center: the connector's full address with "?token=..." (as
 * claude.ai shows it), or just the token. Returns the address (without the token) and the token.
 */
export function parseConnector(input: string): { url: string; token: string } | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      const token = u.searchParams.get("token") ?? "";
      u.searchParams.delete("token");
      u.hash = "";
      if (!token || token.length < 16) return null;
      if (!u.pathname || u.pathname === "/") u.pathname = "/api/mcp";
      return { url: u.toString(), token };
    } catch {
      return null;
    }
  }
  if (/^[A-Za-z0-9._~+/=-]{16,400}$/.test(text)) return { url: DEFAULT_CC_URL, token: text };
  return null;
}
