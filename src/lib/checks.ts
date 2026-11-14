import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, AuthenticationError, InternalServerError, NotFoundError, PermissionDeniedError, RateLimitError } from "@anthropic-ai/sdk";
import type { ContentSlide } from "./slides";
import type { CardSnapshot } from "./types";

/**
 * Pure checks shared by the server code and the tests (no server-only imports): the numbers a
 * draft shows that the owner never said, names on a slide that he never said and that are on
 * neither of his lists, an open item on a red slide, the lines he said in quote marks, what went
 * wrong with a Claude call, a draft's note within its column, a draft run's clock, and reading
 * the Command Center connector address he pastes in Settings.
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

/**
 * A number as written: "1,500", "60", "1.5", with an optional k or M or a scale word after it
 * ("$60k", "$2.5M", "2.5 million"). A small "m" is a million only after a dollar sign: "30m" on
 * its own is minutes.
 */
const DIGITS = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?([km])(?![\p{L}])|\s+(thousand|grand|million|mil|billion)\b)?/giu;
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, thousand: 1e3, grand: 1e3, million: 1e6, mil: 1e6, billion: 1e9 };
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
/** "the first of December", "the fifteenth", "the thirty-first": a date he said in words. */
const ORDINAL: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
};
const ORDINAL_UNITS = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth";
const ORDINALS = new RegExp(`\\b(?:(twenty|thirty)[-\\s](${ORDINAL_UNITS})|(${Object.keys(ORDINAL).join("|")}))\\b`, "gi");

/** Values compare to the cent, so 1.5 x 1000 and 1,500 are the same number. */
const valueKey = (n: number) => Math.round(n * 100) / 100;

function digitValues(text: string): { written: string; value: number }[] {
  const out: { written: string; value: number }[] = [];
  for (const m of text.matchAll(DIGITS)) {
    const base = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    // "30m" is thirty minutes; "$2.5m" and "2.5M" are millions.
    const minutes = m[2] === "m" && text[(m.index ?? 0) - 1] !== "$";
    const scale = minutes ? 1 : (SCALE[(m[2] ?? m[3] ?? "").toLowerCase()] ?? 1);
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
  for (const m of text.matchAll(ORDINALS)) {
    const [, tens, unit, single] = m;
    out.push(tens ? TENS[tens.toLowerCase()] + ORDINAL[unit.toLowerCase()] : ORDINAL[single.toLowerCase()]);
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

/**
 * Capitalised words that are never a person: the agency and its tools, the programs and products
 * the team talks about, days, months, holidays and the states (one word each, and the words of
 * the two-word ones).
 */
const NOT_NAMES = new Set([
  ...["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun"],
  ...["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  ...["jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"],
  ...["christmas", "thanksgiving", "easter", "halloween", "god"],
  ...["i", "i’m", "i’ll", "i’ve", "i’d", "ok", "okay"],
  // The owner, the agency (The Koka Group, TKG) and its own tools.
  ...["anersi", "koka", "group", "tkg", "goosehead", "scorecard", "sales", "coach", "command", "center", "centre", "pocket", "meetings", "insuracentral", "imo", "mib"],
  ...["social", "security", "medicare", "medicaid", "troy", "detroit", "usa", "america", "american", "americans"],
  // Products and tools the team talks about.
  ...["final", "expense", "term", "whole", "universal", "indexed", "mortgage", "protection", "annuity", "supplement", "advantage", "graded", "guaranteed", "simplified", "issue"],
  ...["zoom", "google", "gmail", "outlook", "excel", "slack", "teams", "microsoft", "iphone", "apple", "android", "facebook", "instagram", "linkedin", "youtube", "spanish", "english"],
  ...["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky"],
  ...["louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "ohio", "oklahoma", "oregon", "pennsylvania"],
  ...["tennessee", "texas", "utah", "vermont", "virginia", "washington", "wisconsin", "wyoming", "new", "york", "jersey", "hampshire", "mexico", "north", "south", "west", "carolina", "dakota", "rhode", "island", "district", "columbia"],
]);

/**
 * Everyday words that start a slide's sentence or title ("Stop", "Great week", "Your raise",
 * "Callbacks"), or that a title capitalises: never a person. Words that are also common first
 * names (Will, Bill, Grace, Hope, Chase, Frank...) are left out on purpose.
 */
const EVERYDAY = new Set(
  `a an the and or but nor so yet if then than when while where what who whom whose why how which that this these those there here now
just only also too very still even ever never always often sometimes again already soon today tonight tomorrow yesterday
before after during until since from to for of in on at by with without about above below under over into onto out off up down back
through across around between per via vs not no yes all any each every both either neither some none more most less least many much
few fewer several other others another same such own once twice hi hello hey thanks thank please sorry
me my mine we us our ours you your yours he him his she her hers it its they them their theirs myself yourself ourselves yourselves themselves
everybody everyone everything everywhere nobody nothing somebody someone something anybody anyone anything
don’t can’t won’t isn’t aren’t wasn’t weren’t doesn’t didn’t haven’t hasn’t hadn’t shouldn’t wouldn’t couldn’t you’re you’ll you’ve you’d
we’re we’ll we’ve we’d they’re they’ll they’ve he’ll she’ll it’ll let let’s
be is are was were been being am do does did done doing have has had get gets got getting go goes going gone went make makes made
take takes took give gives gave put set keep keeps kept stop stops start starts started stay ask asks tell tells say says said
call calls called calling dial dials dialing sell sells selling sold close closes closed closing write writes wrote read send sends sent show shows
bring come comes came see look looks find follow help hold leave listen log move need needs open pay pays paid plan plans push run runs
save sign slow speak talk talks think try turn use uses wait want wants watch win wins won work works learn practice remember check checks
focus finish lead leads earn hit hits beat book build fix handle pick quit repeat skip track update upload verify welcome celebrate
congrats congratulations shoutout shout can could should would must might shall
big bigger biggest small great good better best bad worse worst old next last first second third top high low long short full half real right
wrong easy hard fast quick clear simple different important ready true free extra huge proud happy nice cool sure early late daily weekly
monthly team rule rules goal goals bonus bonuses raise comp commission commissions premium policy policies app apps application applications
client clients callback callbacks script scripts objection objections referral referrals carrier carriers agent agents rep reps manager
owner office phone phones day days hour hours minute minutes time times step steps number numbers price prices offer quote quotes deal
deals sale win money cash draft date dates bank banks account accounts health coverage benefit benefits family families people person
meeting agenda housekeeping scoreboard reminder reminders heads question questions answer answers idea ideas note notes mindset habit habits
effort energy attitude consistency momentum discipline accountability training schedule shift shifts seat seats desk desks headset headsets
computer computers keyboard mouse monitor monitors chair room floor parking lunch break breaks holiday holidays vacation weekend weekends
morning afternoon evening night home job jobs role roles newer rookie rookies veteran veterans closer closers producer producers leader
leaders leadership downline downlines upline recruit recruits hire hires hiring license licenses licensed state states contract contracts
contracting appointment appointments underwriting approval approved decline declined pending issued chargeback chargebacks lapse lapses
persistency retention replacement beneficiary beneficiaries payment payments rate rates face amount amounts value cost costs budget total
average percent percentage share split pool tier tiers level levels promotion promotions contest contests prize prizes reward rewards award
awards trip trips dinner party gift gifts card cards cover slide slides decided open tbd one two three four five six seven eight nine ten
zero hundred thousand million dollar dollars x plus minus treat business businesses agency tax taxes house base cap ahead behind pace
setup screen tool tools gear equipment laptop headphone headphones mini bronze silver gold platinum diamond
intro rapport pitch submit recap voicemail text texts email emails transfer warm cold hot live list lists queue pipeline dialer signature
routing placed review reviews saves rewrite replace cancel cancels refund age smoker tobacco meds doctor doctors hospital
hustle grind breathe relax smile believe commit together respect trust honesty integrity loyalty`.split(/\s+/),
);

/** A word after one of these is a thing, not a person ("the Social", "our Monday call"). */
const DETERMINERS = new Set(["the", "a", "an", "our", "your", "my", "his", "her", "their", "its", "every", "each", "any", "no"]);
/** Endings a first name never has ("Dialing", "Protection", "Fairness", "Leadership"). */
const NOT_A_NAME_ENDING = /(?:tion|tions|sion|sions|ment|ments|ness|ship|ships|ful|less|able|ible|ing|ings)$/;

const nameKey = (w: string) =>
  w
    .toLowerCase()
    .replace(/'/g, "’")
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");

/** The word with a plural or verb ending taken off, for a word he said another way ("Callbacks", "Dialing"). */
function stems(k: string): string[] {
  const out: string[] = [];
  if (k.length < 4) return out;
  if (k.endsWith("ies")) out.push(`${k.slice(0, -3)}y`);
  if (k.endsWith("es")) out.push(k.slice(0, -2));
  if (k.endsWith("s")) out.push(k.slice(0, -1));
  if (k.endsWith("ing")) out.push(k.slice(0, -3), `${k.slice(0, -3)}e`);
  if (k.endsWith("ed")) out.push(k.slice(0, -2), k.slice(0, -1));
  // "Logged", "Running": the doubled letter goes too.
  const doubled = /(\p{L})\1(?:ed|ing)$/u.exec(k);
  if (doubled) out.push(k.slice(0, doubled.index + 1));
  return out;
}

/**
 * Capitalised words on the slides that look like a person's name he never said: not in the card
 * (any word the card has, in any case, is his own: a name he says is his to show or not), not on
 * the team list (Scorecard), the carrier list or the people the card names, and not an everyday
 * word or a name that is never a person (The Koka Group, Social Security, Sales Coach, Medicare,
 * InsuraCentral, a day, a month, a state). A word at the start of a sentence or a field counts
 * too ("Joe closed five apps.", "Joe’s big week"), unless it is an everyday word. Returned as
 * written on the slide, at most six.
 */
export function namesToCheck(slides: ContentSlide[], card: CardSnapshot, names: { people: string[]; carriers: string[] }): string[] {
  // Mark is in the guide itself (his own blue badge on a Step chain).
  const known = new Set<string>([...CARRIER_WORDS, "mark"]);
  for (const n of [...names.people, ...names.carriers, ...DEFAULT_CARRIERS, ...card.people]) {
    for (const w of n.split(/[\s,/&+()-]+/)) if (nameKey(w)) known.add(nameKey(w));
  }
  // Every word he said, in any case, and the parts of a hyphenated one.
  const said = new Set<string>();
  for (const m of cardText(card).matchAll(/[\p{L}][\p{L}’'-]*/gu)) {
    const k = nameKey(m[0].replace(/[’']s$/i, ""));
    if (!k) continue;
    said.add(k);
    for (const part of k.split("-")) if (part) said.add(part);
  }
  const plain = (k: string) => known.has(k) || NOT_NAMES.has(k) || EVERYDAY.has(k) || said.has(k);
  const ok = (k: string) => plain(k) || NOT_A_NAME_ENDING.test(k) || stems(k).some(plain);

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
        const afterDeterminer = prev !== "" && /^\s+$/.test(gap) && DETERMINERS.has(prev);
        prev = nameKey(m[0]);
        prevEnd = (m.index ?? 0) + m[0].length;
        // A name is capitalised and has lower-case letters ("MIB", "TBD" and "[X]" are not names).
        if (!/^\p{Lu}/u.test(word) || !/\p{Ll}/u.test(word)) continue;
        if (afterDeterminer || !key) continue;
        const parts = key.split("-").filter(Boolean);
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

// --- When Claude says no ---------------------------------------------------------------------------

export type TroubleKind = "credit" | "key" | "model" | "busy" | "slow" | "turned_down" | "other";

/**
 * An account out of credit or at its spend limit. The API has no status of its own for it: it
 * answers 402 (billing_error), or a 400, 403 or 429 whose message says so ("Your credit balance
 * is too low...", "You have reached your specified API usage limits. You will regain access
 * on...", "...specified workspace API usage limits...").
 */
const OUT_OF_CREDIT = /credit balance|purchase credits?|out of credits?|insufficient (?:credits?|funds|balance)|billing|usage limits?|spend(?:ing)? limits?|regain access|\bbudget\b|limit_reached/i;

/** The API's own words in an error (read here, never logged). */
function apiSays(err: APIError): string {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === "string" ? body.error.message : err.message;
}

/**
 * What went wrong with a Claude call, for the drafts and the Settings check alike, and an error
 * class for the logs (a status and a type, never the API's words).
 */
export function claudeTrouble(err: unknown): { kind: TroubleKind; cls: string } {
  if (err instanceof APIUserAbortError || err instanceof APIConnectionTimeoutError) return { kind: "slow", cls: "timeout" };
  if (err instanceof APIConnectionError) return { kind: "busy", cls: "connection" };
  if (err instanceof APIError) {
    const status = err.status ?? 0;
    const cls = `api_${status || "error"}${err.type ? `_${err.type}` : ""}`;
    const said = apiSays(err);
    if (status === 402 || err.type === "billing_error" || ([400, 403, 429].includes(status) && OUT_OF_CREDIT.test(said))) return { kind: "credit", cls: `${cls}_credit` };
    if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) return { kind: "key", cls };
    if (err instanceof NotFoundError || (status === 400 && /anthropic-beta/i.test(said))) return { kind: "model", cls };
    if (err instanceof RateLimitError || err instanceof InternalServerError) return { kind: "busy", cls };
    return { kind: "turned_down", cls };
  }
  return { kind: "other", cls: err instanceof Error ? err.name : "error" };
}

/** A draft's note when the call failed (draft.ts adds that the slide is a plain Key line). */
export const DRAFT_SAYS: Record<TroubleKind, string> = {
  credit: "Claude is out of credit or hit its spend limit: in the Claude Console, add credit (Billing) or raise the limit (Limits), then tap Redo.",
  key: "Claude turned down the key: paste a new one in Settings.",
  model: "This Claude account can’t use the model the app drafts with.",
  busy: "Claude is busy right now: tap Redo in a minute.",
  slow: "Claude took too long: tap Redo.",
  turned_down: "Claude couldn’t take this one: tap Redo.",
  other: "Claude didn’t answer: tap Redo.",
};

/** Settings, when a pasted key fails its check (the key is not kept). */
export const TEST_SAYS: Record<TroubleKind, string> = {
  credit: "The key works, but the Claude account is out of credit or hit its spend limit. In the Claude Console, add credit (Billing) or raise the limit (Limits), then paste the key again.",
  key: "That key isn’t right. Copy it again from the Claude Console.",
  model: "The key works, but this Claude account can’t use the model the app drafts with.",
  busy: "Claude is busy right now. Try again in a minute.",
  slow: "Claude took too long to answer. Try again in a minute.",
  turned_down: "Claude turned down the test. Try again in a minute.",
  other: "Claude didn’t answer. Try again in a minute.",
};

// --- A draft's note ----------------------------------------------------------------------------------

/** mtg_items.draft_note holds at most this many characters (the column's check). */
export const NOTE_MAX = 300;

/** "1,250,000, 45, 60 and 3 more": a few values, each kept short, for a note. */
export function listValues(values: string[], show = 4): string {
  const shown = values.slice(0, show).map((v) => (v.length > 20 ? `${v.slice(0, 19).trimEnd()}…` : v));
  const more = values.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

/** A draft's notes as one, never longer than the column takes: cut at a word, with "…". */
export function joinNotes(parts: (string | null | undefined)[], max = NOTE_MAX): string | null {
  const note = parts
    .map((p) => (p ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  if (!note) return null;
  if ([...note].length <= max) return note;
  const cut = [...note].slice(0, max - 1).join("");
  const atWord = cut.replace(/\s+\S*$/, "");
  return `${(atWord.length >= max / 2 ? atWord : cut).replace(/[\s,;:]+$/, "")}…`;
}

// --- A draft run's clock ----------------------------------------------------------------------------

/**
 * A draft run lives inside one function call: its page or action (maxDuration 300 s) started at
 * `startedAt`, and the run itself began after the page answered (after()). A call is claimed only
 * while a whole call of at least MIN_CALL_MS and its save still fit before the function ends, so
 * no claimed draft ever outlives its function (it would stay "drafting" until its claim went stale).
 */
export const RUN_CLOCK = {
  /** The page's or action's maxDuration. */
  functionMs: 300_000,
  /** Kept free at the end of the function. */
  endMarginMs: 15_000,
  /** The draft's save, after its call. */
  saveMs: 10_000,
  /** One call, every retry included. */
  callMs: 200_000,
  /** A call is not started with less time than this (a draft takes about half a minute). */
  minCallMs: 120_000,
  /** When the caller does not say when it started: what its page or action may have used already. */
  defaultLeadMs: 30_000,
} as const;

/** When the call claimed now must end (epoch ms), or null when a call no longer fits. */
export function callDeadline(startedAt: number, now: number): number | null {
  const lastEnd = startedAt + RUN_CLOCK.functionMs - RUN_CLOCK.endMarginMs - RUN_CLOCK.saveMs;
  const left = lastEnd - now;
  if (left < RUN_CLOCK.minCallMs) return null;
  return now + Math.min(RUN_CLOCK.callMs, left);
}

/** The last moment a run started at `startedAt` may claim a thought. */
export function lastClaimAt(startedAt: number): number {
  return startedAt + RUN_CLOCK.functionMs - RUN_CLOCK.endMarginMs - RUN_CLOCK.saveMs - RUN_CLOCK.minCallMs;
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
