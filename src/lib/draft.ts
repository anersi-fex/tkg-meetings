import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { activeDraftCount, claimDraft, getItem, listItems, updateItem, type ItemPatch } from "./data";
import { anthropicKey } from "./secrets";
import { scorecardNames } from "./scorecard";
import { cleanSection } from "./deck";
import { ContentSlideSchema, cleanSlide, fallbackSection, fallbackSlide, isContentLayout, switchLayout, type ContentSlide } from "./slides";
import { DEFAULT_CARRIERS, namesToCheck, numbersNotInCard, openItemOnRed, quotedLines } from "./checks";
import type { CardSnapshot, Item } from "./types";

/**
 * Drafting: one Claude call per Team meeting thought turns the card into one or two slides in
 * the approved slide brand (brand/SLIDES.md). The owner reviews every draft on his phone before
 * the meeting. Without a key, or when a call fails, the thought gets a plain Key line made of
 * its own title (fallbackSlide), so the app always works.
 *
 * Model: Claude Opus 5.5 by default (MEETINGS_MODEL overrides), structured outputs, adaptive
 * thinking at medium effort, the server-side refusal fallback, the system prompt cached.
 * Logs carry item ids and error classes only, never the owner's words.
 *
 * Time: drafts run in `after()`, inside the page's 300 s (maxDuration). One call has
 * CALL_DEADLINE_MS in all, retries included, and a run claims a thought only while a whole call
 * and its save still fit, so a draft never outlives its run and is never claimed twice (a claim
 * goes stale only after DRAFT_STALE_MS, six minutes, in data.ts).
 */

export const MODEL = process.env.MEETINGS_MODEL?.trim() || "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** A draft is a slide or two of JSON; this leaves adaptive thinking room and keeps a call short. */
const MAX_TOKENS = 8000;
/** One call, every retry included. */
const CALL_DEADLINE_MS = 200_000;
/** What one run may use of the function's 300 s (the page's render comes first). */
const RUN_BUDGET_MS = 280_000;
const SAVE_MARGIN_MS = 10_000;
/** Thoughts drafted at the same time, across every run of the meeting. */
const MAX_AT_ONCE = 3;
/** The Settings check of a pasted key. */
const TEST_TIMEOUT_MS = 60_000;

const DraftOutput = z.object({
  section: z.string().describe("The agenda section this belongs to: 1 to 3 words, a topic as on an agenda ('Your raise', 'Bonuses', 'Housekeeping', 'The Social ask')."),
  slides: z.array(ContentSlideSchema).describe("One slide. Two only for a Big news followed by the Big number its news is built on, or a Step chain / Script too long for one slide."),
  quote_candidates: z
    .array(z.string())
    .describe("Lines the card shows inside quote marks as his own words that could close a team meeting (motivating, about the team), copied exactly without the quote marks. [] when none."),
});

/**
 * The schema sent to the API, kept whole: every layout's `const` and every `enum` (icons,
 * people, script rows, tiers) stays in it, so the grammar holds Claude to them. (The SDK's own
 * helpers move const and enum into the description text.) Only keywords structured outputs
 * support are kept; every object is closed.
 */
const SCHEMA_KEYS = new Set(["type", "description", "title", "properties", "required", "items", "anyOf", "allOf", "enum", "const", "$ref", "$defs", "additionalProperties"]);
function strictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const key = k === "oneOf" ? "anyOf" : k;
    if (!SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" || key === "$defs") out[key] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, strictSchema(s)]));
    else if (key === "items" || key === "anyOf" || key === "allOf") out[key] = strictSchema(v);
    else out[key] = v;
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}
const OUTPUT_SCHEMA = strictSchema(z.toJSONSchema(DraftOutput)) as Record<string, unknown>;

export const SYSTEM_PROMPT = `You make slides for Anersi Koka's team meetings. Anersi owns The Koka Group, a life insurance phone sales team in Troy, Michigan. He records thoughts on a voice recorder while driving; his assistant files the ones meant for the team meeting as cards (a title, a summary and points). You turn one card into one slide (two at most) that he shows on the office TV while he talks. He approved the look and these rules on 2026-11-04; follow them exactly.

THE RULES
1. One idea per slide: a short title and at most three short lines under it. List layouts hold more rows, up to their limits. Everything else he says goes in the speaker notes.
2. His words, shortened. Cut filler, never a person or group, a condition, an amount or a date ("new or remote people" stays whole). Keep the team's shorthand as he says it ("the Social", "MIB", "apps"). Drop swearing. Something he might do ("might", "thinking about", "look at") is never shown as a fact or a promise: it goes in the notes, or on the slide with a pill ending " · TBD".
3. Never invent a number, a percentage, a date, a name, a quote or a promise. A number on a slide must appear in the card. A value he left open is written [X] (e.g. "[X]% raise on commission · TBD"), never on a big_news (rule 6).
4. Privacy: no client names, policy numbers, birthdates, health details or contact details, even when the card has them; write "a client". Teammates by first name only, and only when the card names them, spelled as the team list in the message spells them. A correction aimed at one person names nobody on the slide: it becomes a rule for everyone, and the name stays in the notes. A win names the person.
5. Carriers are words, spelled as the carrier list in the message has them; write one in full when it fits the limit, else its short name.
6. A big_news is red, and a red slide holds only what is decided: no [X], no "TBD", no open item. Say the news without the open part ("Everybody’s getting a raise.") and put the [X] and its " · TBD" pill on the next slide, as in the example.
7. Sales results never go on a slide, even when the card says them: premium written, policies or apps written, a person's or the team's numbers for the month. The deck's Scoreboard slide shows Scorecard's numbers; his go in the notes. A goal, a bonus, a price or the number in a rule is not a sales result.

PICK THE LAYOUT (go down the list, take the first that fits)
1. Words to say on a call: script.
2. An order of operations: step_chain.
3. Who sits where in the team: diagram.
4. A split or a formula: chart.
5. Two to four numbers or prices side by side (before and after, this month and last, bonus tiers lowest first, the same rule at each carrier): price_cards.
6. One number (a date counts): big_number.
7. Something decided that changes for the team from now on (pay, a bonus, a rule, a person, a carrier): big_news. If the news is built on a number, add a big_number slide right after it.
8. Anything else (a habit, a reminder, a mindset, a coaching point, a question to the room, an idea he is floating): key_line.
With no number in the card, never use big_number, price_cards or chart. A question or an idea he is floating is never big_news. When two layouts fit, pick by what the team should remember.

LIMITS (count characters; the TV never shrinks text)
- Titles: one line, 34 characters, a short topic phrase or instruction with no period ("The 90-day rule", "Stop over-explaining the Social ask").
- big_news statement: one sentence of 30 characters ending with a period; its line about 58.
- key_line statement: up to two short sentences, two lines of about 19 characters with a "\\n" where the line breaks; a question keeps its "?"; coral is the one word that carries the idea; its line about 58.
- big_number number: 5 characters ("$500", "100%", "$60k", "90", "Dec 1"), write a long amount with k; 3 lines of about 30 characters with the key words in **double stars**.
- chart: 2 to 6 slices adding up to 100, one highlighted; 3 math lines of about 36 characters explaining the highlighted slice, lines after the first starting with an operator ("÷ ", "= ", "or "); drawn true when the slices are a picture of the idea, not data.
- price_cards: 2 to 4 cards, number 6 characters with four cards (8 with three or fewer), label 18; icons only headphones, mini_pc, keyboard, mouse, monitor, or none (cards in a row all have an icon or none).
- step_chain: 2 to 6 steps, name 20 characters, note 40; person owner for Anersi ("me"), mark for Mark, teammate for anyone else, none for a carrier or a thing; last_resort only on the true last resort.
- script: up to 6 rows of 85 characters. A rep row is his words cut down (words dropped, none added or changed), without quote marks. A client row says what the client does in a few words in the third person ("They tell you."). An instruction to the rep ("then just ask") goes in aside. An objection script starts with the client's row: the objection in the client's own words inside curly quotes (“I need to think about it.”).
- diagram: 2 or 3 tiers (owner, team, open seats), a rule line and a takeaway.

WRITING
- Statements end with a period. Topic titles have no period. Use curly apostrophes and quotes (’ “ ”).
- notes: "You say:" then his points in his own words, not shortened, as one paragraph; then "Open:" and anything not decided, only if there is something.
- section: 1 to 3 words naming the topic, as on an agenda.

EXAMPLE
Card: "Comp increase and the 90-day rule. Everyone gets a raise; newer people wait. 90 working days logged in and in the office, not 90 days from the hire date; the raise starts the next day; promotion is however many percentage points on commission."
Output: {"section":"Your raise","slides":[{"layout":"big_news","statement":"Everybody’s getting a raise.","line":"Newer people get theirs after 90 working days.","notes":"You say: You’re all going to get an increase in comp. Some of you get it now. If you just got here, there’s a 90-day grace period."},{"layout":"big_number","title":"The 90-day rule","number":"90","label":"working days","pill":"[X]% raise on commission · TBD","lines":["**Logged in** and in the office.","**Not** from your hire date.","Your raise starts **the next day.**"],"notes":"You say: 90 means 90 working days, logged in and in the office, not from the day you were hired. It kicks in the next day. Open: the percentage."}],"quote_candidates":[]}`;

let client: { key: string; c: Anthropic } | null = null;
function anthropic(key: string): Anthropic {
  if (!client || client.key !== key) client = { key, c: new Anthropic({ apiKey: key, maxRetries: 2, timeout: CALL_DEADLINE_MS }) };
  return client.c;
}

/** The one request shape: the drafts and the Settings check send the same model, betas and schema. */
function draftRequest(user: string, maxTokens: number): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
}

type Names = { people: string[]; carriers: string[] };

function userMessage(card: CardSnapshot, names: Names): string {
  const team = names.people.length ? names.people.join(", ") : "(not available)";
  const carriers = (names.carriers.length ? names.carriers : DEFAULT_CARRIERS).join(", ");
  const card_ = [`Title: ${card.title}`, card.summary ? `Summary: ${card.summary}` : "", card.points.length ? `Points:\n${card.points.map((p) => `- ${p}`).join("\n")}` : "", card.people.length ? `People it names: ${card.people.join(", ")}` : ""]
    .filter(Boolean)
    .join("\n");
  return `Team list (as Scorecard spells it): ${team}\nCarrier list: ${carriers}\n\nThe card:\n<card>\n${card_}\n</card>\n\nMake the slide(s) for this card.`;
}

function keepRealQuotes(candidates: string[], card: CardSnapshot): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const quoted = quotedLines(card).map(norm);
  return [...new Set(candidates.map((c) => c.trim().replace(/^[“"]|[”"]$/g, "")).filter((c) => c.length >= 8 && c.length <= 120 && quoted.some((q) => q.includes(norm(c)))))].slice(0, 3);
}

// --- When Claude says no ---------------------------------------------------------------------------

type TroubleKind = "credit" | "key" | "model" | "busy" | "slow" | "turned_down" | "other";

/** The API's own words in an error (read, never logged). */
function apiSays(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === "string" ? body.error.message : err.message;
}

/**
 * What went wrong with a Claude call, for the drafts and the Settings check alike, and an error
 * class for the logs. An empty credit balance or a spend limit comes back as a 400 (or 402 or
 * 429) whose message says so: the API has no status of its own for it.
 */
function claudeTrouble(err: unknown): { kind: TroubleKind; cls: string } {
  if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) return { kind: "slow", cls: "timeout" };
  if (err instanceof Anthropic.APIConnectionError) return { kind: "busy", cls: "connection" };
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    const cls = `api_${status || "error"}${err.type ? `_${err.type}` : ""}`;
    const said = apiSays(err);
    if (status === 402 || err.type === "billing_error" || ([400, 403, 429].includes(status) && /credit balance|spend(ing)? limit|billing/i.test(said))) return { kind: "credit", cls };
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { kind: "key", cls };
    if (err instanceof Anthropic.NotFoundError || (status === 400 && /anthropic-beta/i.test(said))) return { kind: "model", cls };
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return { kind: "busy", cls };
    return { kind: "turned_down", cls };
  }
  return { kind: "other", cls: err instanceof Error ? err.name : "error" };
}

/** A draft's note when the call failed (it then says the slide is a plain Key line). */
const DRAFT_SAYS: Record<TroubleKind, string> = {
  credit: "Claude is out of credit: add credit in the Claude Console (Billing), then tap Redo.",
  key: "Claude turned down the key: paste a new one in Settings.",
  model: "This Claude account can’t use the model the app drafts with.",
  busy: "Claude is busy right now: tap Redo in a minute.",
  slow: "Claude took too long: tap Redo.",
  turned_down: "Claude couldn’t take this one: tap Redo.",
  other: "Claude didn’t answer: tap Redo.",
};

/** Settings, when a pasted key fails its check (the key is not kept). */
const TEST_SAYS: Record<TroubleKind, string> = {
  credit: "The key works, but the Claude account is out of credit. Add credit in the Claude Console (Billing), then paste the key again.",
  key: "That key isn’t right. Copy it again from the Claude Console.",
  model: "The key works, but this Claude account can’t use the model the app drafts with.",
  busy: "Claude is busy right now. Try again in a minute.",
  slow: "Claude took too long to answer. Try again in a minute.",
  turned_down: "Claude turned down the test. Try again in a minute.",
  other: "Claude didn’t answer. Try again in a minute.",
};

// --- Reading the answer ----------------------------------------------------------------------------

const ENUM_KEYS = new Set(["layout", "icon", "strip_icon", "person", "who", "kind"]);
/** "Teammate", "Mini PC" or "key-line" read as the value they meant ("teammate", "mini_pc", "key_line"). */
function plainEnums(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(plainEnums);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, ENUM_KEYS.has(k) && typeof x === "string" ? x.trim().toLowerCase().replace(/[\s-]+/g, "_") : plainEnums(x)]));
}

/**
 * The answer's JSON, read leniently: the section, the slides and the quotes each on their own,
 * so one odd slide never loses the rest. Only the text after a fallback block counts (what came
 * before it is the declining model's). Null when there is no readable JSON object.
 */
function readDraft(response: Anthropic.Beta.Messages.BetaMessage): { section: string; slides: unknown[]; quotes: string[] } | null {
  let from = 0;
  response.content.forEach((b, i) => {
    if (b.type === "fallback") from = i + 1;
  });
  const text = response.content
    .slice(from)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const slides = Array.isArray(o.slides) ? o.slides : o.slides && typeof o.slides === "object" ? [o.slides] : [];
  const quotes = Array.isArray(o.quote_candidates) ? o.quote_candidates.filter((q): q is string => typeof q === "string") : [];
  return { section: typeof o.section === "string" ? o.section : "", slides, quotes };
}

// --- Drafting ------------------------------------------------------------------------------------------

export type DraftResult = { section: string; slides: ContentSlide[]; quotes: string[]; note: string | null; usedAi: boolean };

/**
 * One card to slides. Throws only on a programming error; API trouble falls back to a Key line.
 * `deadline` (epoch ms) ends the call early when the run has less time than a whole call.
 */
export async function draftCard(card: CardSnapshot, names?: Names, opts: { deadline?: number } = {}): Promise<DraftResult> {
  const fallback = (note: string | null): DraftResult => ({ section: fallbackSection(card.title), slides: [fallbackSlide(card)], quotes: [], note, usedAi: false });
  const key = await anthropicKey();
  if (!key) return fallback("No Claude key yet (Settings): this is a plain Key line of your words.");
  const lists = names ?? (await scorecardNames());
  const ms = Math.max(1_000, Math.min(CALL_DEADLINE_MS, (opts.deadline ?? Infinity) - Date.now()));

  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    response = await anthropic(key.key).beta.messages.create(draftRequest(userMessage(card, lists), MAX_TOKENS), { signal: AbortSignal.timeout(ms) });
  } catch (err) {
    const t = claudeTrouble(err);
    console.error("draft_failed", t.cls);
    return fallback(`${DRAFT_SAYS[t.kind]} For now it’s a plain Key line of your words.`);
  }
  // The stop reason first: a refused or cut-off answer is not a draft, whatever its text holds.
  if (response.stop_reason === "refusal") {
    console.error("draft_failed", "refusal");
    return fallback("Claude declined this one: it shows as a plain Key line of your words.");
  }
  if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") {
    console.error("draft_failed", "max_tokens");
    return fallback("Claude ran out of room: it shows as a plain Key line for now; tap Redo.");
  }
  const out = readDraft(response);
  if (!out) {
    console.error("draft_failed", "unreadable");
    return fallback("Claude’s answer was unreadable: it shows as a plain Key line for now; tap Redo.");
  }

  const slides: ContentSlide[] = [];
  let demoted = false;
  for (const raw of out.slides) {
    if (slides.length === 2) break;
    const s = plainEnums(raw) as { layout?: unknown };
    if (!isContentLayout(s.layout)) continue;
    try {
      const clean = cleanSlide(s);
      // A red Big news never holds an open item (rule 5): it becomes a Key line with the same words.
      if (openItemOnRed(clean)) {
        slides.push(switchLayout(clean, "key_line"));
        demoted = true;
      } else slides.push(clean);
    } catch {
      /* skipped */
    }
  }
  if (!slides.length) return fallback("Claude’s slide was empty: it shows as a plain Key line for now; tap Redo.");

  const notes: string[] = [];
  const invented = numbersNotInCard(slides, card);
  if (invented.length) notes.push(`Check the numbers: ${invented.join(", ")} ${invented.length === 1 ? "isn’t" : "aren’t"} in what you said.`);
  const unknown = namesToCheck(slides, card, lists);
  if (unknown.length) notes.push(`Check the names: ${unknown.join(", ")} ${unknown.length === 1 ? "isn’t" : "aren’t"} on the team or carrier list.`);
  if (demoted) notes.push("The Big news had an open item, so it’s a Key line: a red slide shows only what’s decided.");
  return {
    section: cleanSection(out.section) || fallbackSection(card.title),
    slides,
    quotes: keepRealQuotes(out.quotes, card),
    note: notes.length ? notes.join(" ") : null,
    usedAi: true,
  };
}

const sameWords = (a: CardSnapshot, b: CardSnapshot) =>
  a.title === b.title && a.summary === b.summary && a.points.join("\n") === b.points.join("\n") && a.people.join("\n") === b.people.join("\n");

/**
 * Saves a draft only onto the row as it was claimed (its draft status and its updated_at). When
 * the row moved since: a switch, the order or a "done" mark only touched its time, and the draft
 * still saves; a new card (the sync put it back in line), his own edit or a Redo wins, and the
 * draft is dropped. True when it saved.
 */
async function saveClaimed(claimed: Item, patch: ItemPatch): Promise<boolean> {
  let at = claimed.updated_at;
  for (let tries = 0; tries < 3; tries++) {
    if (await updateItem(claimed.id, patch, ["drafting"], at)) return true;
    const now = await getItem(claimed.id);
    // Gone, edited, back in line, or drafting a newer card (the sync re-queues a changed card and
    // another run claimed it): this draft of the old card is not wanted.
    if (!now || now.draft_status !== "drafting" || !sameWords(now.card, claimed.card)) return false;
    if (now.updated_at === at) {
      // The time guard missed a row that has not moved: save on the draft status alone.
      console.error("draft_guard_mismatch", claimed.id);
      return (await updateItem(claimed.id, patch, ["drafting"])) !== null;
    }
    at = now.updated_at;
  }
  return false;
}

/** Drafts one claimed thought and saves it (only if the row is still the one it claimed). */
export async function draftItem(item: Item, names?: Names, opts: { deadline?: number } = {}): Promise<void> {
  let patch: ItemPatch;
  try {
    const r = await draftCard(item.card, names, opts);
    patch = { section: r.section, slides: r.slides, quote_candidates: r.quotes, draft_status: r.usedAi ? "ready" : "failed", draft_note: r.note };
  } catch (err) {
    console.error("draft_failed", item.id, err instanceof Error ? err.name : "error");
    patch = { draft_status: "failed", slides: [fallbackSlide(item.card)], draft_note: "Something went wrong: tap Redo." };
  }
  try {
    if (!(await saveClaimed(item, patch))) console.info("draft_superseded", item.id);
  } catch (err) {
    console.error("draft_save_failed", item.id, err instanceof Error ? err.name : "error");
  }
}

/**
 * Drafts the pending thoughts of a meeting (run after the page answered, in `after()`). At most
 * MAX_AT_ONCE drafts run at a time across every run (the page's poll starts a run every few
 * seconds while something is waiting); each thought is claimed first, so two runs never draft it
 * twice, and a run stops claiming once a whole call would no longer fit its time.
 */
export async function draftPending(meetingId: string, max = 12): Promise<number> {
  const started = Date.now();
  const lastClaim = started + RUN_BUDGET_MS - CALL_DEADLINE_MS - SAVE_MARGIN_MS;
  const waiting = (await listItems(meetingId)).filter((i) => i.draft_status === "pending" || i.draft_status === "drafting").slice(0, max);
  if (!waiting.length) return 0;
  const busy = () =>
    activeDraftCount(meetingId).catch(() => {
      console.error("draft_count_failed", meetingId);
      return MAX_AT_ONCE;
    });
  if ((await busy()) >= MAX_AT_ONCE) return 0;
  const names = await scorecardNames();
  let done = 0;
  const queue = [...waiting];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      // Out of time for a whole call, or three drafts already running: the next run takes it.
      if (Date.now() > lastClaim || (await busy()) >= MAX_AT_ONCE) return;
      const claimed = await claimDraft(next.id).catch(() => {
        console.error("draft_claim_failed", next.id);
        return null;
      });
      if (!claimed) continue;
      await draftItem(claimed, names, { deadline: Date.now() + CALL_DEADLINE_MS });
      done++;
    }
  };
  await Promise.all(Array.from({ length: MAX_AT_ONCE }, worker));
  return done;
}

const TEST_MESSAGE = "This is a connection test from Settings, with no card. Answer with the section \"Test\", no slides and no quote candidates.";

/**
 * A real request for Settings, in the drafts' own shape (model, betas, fallbacks, thinking,
 * schema, cached prompt), so a key without credit, or an account that can't use the model or a
 * beta, fails here, when he connects it, and not on every draft after.
 */
export async function testClaude(key: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const c = new Anthropic({ apiKey: key, maxRetries: 0, timeout: TEST_TIMEOUT_MS });
    await c.beta.messages.create(draftRequest(TEST_MESSAGE, 1024), { signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
    return { ok: true };
  } catch (err) {
    const t = claudeTrouble(err);
    console.error("claude_test_failed", t.cls);
    return { ok: false, message: TEST_SAYS[t.kind] };
  }
}
