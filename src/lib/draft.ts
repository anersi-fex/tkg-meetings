import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claimDraft, listItems, updateItem } from "./data";
import { anthropicKey } from "./secrets";
import { scorecardNames } from "./scorecard";
import { cleanSection } from "./deck";
import { CONTENT_LAYOUTS, ContentSlideSchema, cleanSlide, fallbackSlide, type ContentSlide } from "./slides";
import { numbersNotInCard, quotedLines } from "./checks";
import type { CardSnapshot, Item } from "./types";

/**
 * Drafting: one Claude call per Team meeting thought turns the card into one or two slides in
 * the approved slide brand (brand/SLIDES.md). The owner reviews every draft on his phone before
 * the meeting; nothing reaches the TV unless he switches it on. Without a key, or when a call
 * fails, the thought gets a plain Key line made of its own title (fallbackSlide), so the app
 * always works.
 *
 * Model: Claude Opus 5.5 by default (MEETINGS_MODEL overrides), structured outputs, adaptive
 * thinking at medium effort, the server-side refusal fallback, the system prompt cached.
 * Logs carry item ids and error classes only, never the owner's words.
 */

export const MODEL = process.env.MEETINGS_MODEL?.trim() || "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const DraftOutput = z.object({
  section: z.string().describe("The agenda section this belongs to: 1 to 3 words, a topic as on an agenda ('Your raise', 'Bonuses', 'Housekeeping', 'The Social ask')."),
  slides: z.array(ContentSlideSchema).describe("One slide. Two only for a Big news followed by the Big number its news is built on, or a Step chain / Script too long for one slide."),
  quote_candidates: z
    .array(z.string())
    .describe("Lines the card shows inside quote marks as his own words that could close a team meeting (motivating, about the team), copied exactly without the quote marks. [] when none."),
});
type DraftOutputT = z.infer<typeof DraftOutput>;

export const SYSTEM_PROMPT = `You make slides for Anersi Koka's team meetings. Anersi owns The Koka Group, a life insurance phone sales team in Troy, Michigan. He records thoughts on a voice recorder while driving; his assistant files the ones meant for the team meeting as cards (a title, a summary and points). You turn one card into one slide (two at most) that he shows on the office TV while he talks. He approved the look and these rules on 2026-11-04; follow them exactly.

THE RULES
1. One idea per slide: a short title and at most three short lines under it. List layouts hold more rows, up to their limits. Everything else he says goes in the speaker notes.
2. His words, shortened. Cut filler, never a person or group, a condition, an amount or a date ("new or remote people" stays whole). Keep the team's shorthand as he says it ("the Social", "MIB", "apps"). Drop swearing. Something he might do ("might", "thinking about", "look at") is never shown as a fact or a promise: it goes in the notes, or on the slide with a pill ending " · TBD".
3. Never invent a number, a percentage, a date, a name, a quote or a promise. A number on a slide must appear in the card. A value he left open is written [X] (e.g. "[X]% raise on commission · TBD").
4. Privacy: no client names, policy numbers, birthdates, health details or contact details, even when the card has them; write "a client". Teammates by first name only, spelled as the team list in the message spells them. A correction aimed at one person names nobody on the slide: it becomes a rule for everyone, and the name stays in the notes. A win names the person.
5. Carriers are words, spelled as the carrier list in the message has them; write one in full when it fits the limit, else its short name.

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
- script: up to 6 rows of 85 characters. A rep row is his words cut down (words dropped, none added or changed), without quote marks. A client row says what the client does in a few words in the third person ("They tell you."). An instruction to the rep ("then just ask") goes in aside. An objection script starts with the client's row.
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
  if (!client || client.key !== key) client = { key, c: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 }) };
  return client.c;
}


function userMessage(card: CardSnapshot, names: { people: string[]; carriers: string[] }): string {
  const team = names.people.length ? names.people.join(", ") : "(not available)";
  const carriers = names.carriers.length ? names.carriers.join(", ") : "AHL, AmAm, Americo, Foresters, Newbridge, Royal, UHL";
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

export type DraftResult = { section: string; slides: ContentSlide[]; quotes: string[]; note: string | null; usedAi: boolean };

/** One card to slides. Throws only on a programming error; API trouble falls back to a Key line. */
export async function draftCard(card: CardSnapshot, names?: { people: string[]; carriers: string[] }): Promise<DraftResult> {
  const fallback = (note: string | null): DraftResult => ({
    section: cleanSection(card.title.split(/\s+/).slice(0, 2).join(" ")),
    slides: [fallbackSlide(card)],
    quotes: [],
    note,
    usedAi: false,
  });
  const key = await anthropicKey();
  if (!key) return fallback("No Claude key yet (Settings): this is a plain Key line of your words.");
  let out: DraftOutputT | null = null;
  try {
    const response = await anthropic(key.key).beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: betaZodOutputFormat(DraftOutput) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage(card, names ?? (await scorecardNames())) }],
    });
    if (response.stop_reason === "refusal") return fallback("Claude declined this one: it shows as a plain Key line.");
    if (response.stop_reason === "max_tokens") return fallback("Claude ran out of room: it shows as a plain Key line.");
    out = (response.parsed_output as DraftOutputT | null) ?? null;
  } catch (err) {
    const cls = err instanceof Anthropic.APIError ? `api_${err.status ?? "error"}` : err instanceof Error ? err.name : "error";
    console.error("draft_failed", cls);
    const msg =
      err instanceof Anthropic.AuthenticationError
        ? "Claude refused the key (Settings)."
        : err instanceof Anthropic.RateLimitError
          ? "Claude is busy or out of credit right now."
          : "Claude didn't answer.";
    return fallback(`${msg} It shows as a plain Key line; tap Redo later.`);
  }
  if (!out) return fallback("Claude's answer was unreadable: it shows as a plain Key line.");

  const slides: ContentSlide[] = [];
  for (const s of out.slides.slice(0, 2)) {
    try {
      if ((CONTENT_LAYOUTS as readonly string[]).includes((s as { layout: string }).layout)) slides.push(cleanSlide(s));
    } catch {
      /* skipped */
    }
  }
  if (!slides.length) return fallback("Claude's slide was empty: it shows as a plain Key line.");
  const invented = numbersNotInCard(slides, card);
  return {
    section: cleanSection(out.section) || cleanSection(card.title.split(/\s+/).slice(0, 2).join(" ")),
    slides,
    quotes: keepRealQuotes(out.quote_candidates, card),
    note: invented.length ? `Check the numbers: ${invented.join(", ")} ${invented.length === 1 ? "isn’t" : "aren’t"} in what you said.` : null,
    usedAi: true,
  };
}

/** Drafts one claimed thought and saves it. */
export async function draftItem(item: Item, names?: { people: string[]; carriers: string[] }): Promise<void> {
  try {
    const r = await draftCard(item.card, names);
    await updateItem(
      item.id,
      { section: r.section, slides: r.slides, quote_candidates: r.quotes, draft_status: r.usedAi ? "ready" : "failed", draft_note: r.note },
      ["drafting"],
    );
  } catch (err) {
    console.error("draft_save_failed", item.id, err instanceof Error ? err.name : "error");
    await updateItem(item.id, { draft_status: "failed", slides: [fallbackSlide(item.card)], draft_note: "Something went wrong: tap Redo." }, ["drafting"]).catch(() => undefined);
  }
}

/**
 * Drafts every pending thought of a meeting, a few at a time (run after the page answered, in
 * `after()`). Each one is claimed first, so two phones open at once never draft it twice.
 */
export async function draftPending(meetingId: string, max = 12): Promise<number> {
  const pending = (await listItems(meetingId)).filter((i) => i.draft_status === "pending" || i.draft_status === "drafting").slice(0, max);
  if (!pending.length) return 0;
  const names = await scorecardNames();
  let done = 0;
  const queue = [...pending];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const claimed = await claimDraft(next.id).catch(() => {
        console.error("draft_claim_failed", next.id);
        return null;
      });
      if (!claimed) continue;
      await draftItem(claimed, names);
      done++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return done;
}

/** A tiny real request for Settings: does the key work (and is there credit)? */
export async function testClaude(key: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const c = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 30_000 });
    await c.messages.create({ model: MODEL, max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with the word ok." }] });
    return { ok: true };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { ok: false, message: "That key isn't right." };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, message: "The key works, but Claude is busy or out of credit." };
    if (err instanceof Anthropic.APIError) return { ok: false, message: `Claude answered ${err.status ?? "an error"}.` };
    return { ok: false, message: "Claude didn't answer." };
  }
}
