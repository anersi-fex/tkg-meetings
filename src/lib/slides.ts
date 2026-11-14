import { z } from "zod";

/**
 * The slide data the whole app shares: the AI drafts it, the phone edits it, the TV draws it.
 * One shape per layout of the approved slide brand (brand/SLIDES.md, approved 2026-11-04).
 * Browser-safe and pure.
 *
 * Content layouts come from a Team meeting thought (one card, one or two slides). The cover,
 * the scoreboard, the agenda and the closing quote are made by the deck builder (deck.ts).
 * Text fields are plain text; a talking line may mark its key words with **double stars**
 * (drawn bold and white, as in the Big number template).
 */

export const CONTENT_LAYOUTS = ["big_news", "big_number", "chart", "key_line", "diagram", "price_cards", "step_chain", "script"] as const;
export type ContentLayout = (typeof CONTENT_LAYOUTS)[number];
export const DECK_LAYOUTS = ["cover", "scoreboard", "agenda", "quote"] as const;
export type DeckLayout = (typeof DECK_LAYOUTS)[number];
export type Layout = ContentLayout | DeckLayout;

export const LAYOUT_LABEL: Record<Layout, string> = {
  cover: "Cover",
  scoreboard: "Scoreboard",
  agenda: "Agenda",
  big_news: "Big news",
  big_number: "Big number",
  chart: "Chart",
  key_line: "Key line",
  diagram: "Diagram",
  price_cards: "Price cards",
  step_chain: "Step chain",
  script: "Script",
  quote: "Quote",
};

/** What each content layout is for, in the guide's words (the editor's layout picker). */
export const LAYOUT_USE: Record<ContentLayout, string> = {
  big_news: "A decided announcement: pay, a bonus, a rule. Red.",
  big_number: "A rule or fact built on one number.",
  chart: "A split or a formula.",
  key_line: "A line to remember: a habit, a reminder, a question.",
  diagram: "Who sits where.",
  price_cards: "Two to four numbers side by side.",
  step_chain: "An order of operations.",
  script: "Words to say on a call.",
};

export function isContentLayout(v: unknown): v is ContentLayout {
  return typeof v === "string" && (CONTENT_LAYOUTS as readonly string[]).includes(v);
}

export const ICONS = ["headphones", "mini_pc", "keyboard", "mouse", "monitor", "none"] as const;
export type IconKey = (typeof ICONS)[number];
export const PEOPLE = ["owner", "mark", "teammate", "none"] as const;
export type PersonKey = (typeof PEOPLE)[number];
export const TIER_KINDS = ["owner", "team", "open"] as const;

// --- Content slide schemas ------------------------------------------------------------------
// No optional or nullable fields (an empty string means "none"): the same shapes are the AI's
// structured output, and every branch is one object with fixed keys.

const notes = z.string().describe("Speaker notes: what he says over this slide, in his words, one paragraph. Starts with 'You say:'.");

export const BigNewsSchema = z.object({
  layout: z.literal("big_news"),
  statement: z.string().describe("One decided announcement, one sentence ending with a period, 30 characters at most."),
  line: z.string().describe("One line under it, about 58 characters at most."),
  notes,
});

export const BigNumberSchema = z.object({
  layout: z.literal("big_number"),
  title: z.string().describe("Topic phrase, no period, 34 characters at most."),
  number: z.string().describe("The one number, 5 characters at most: $500, 100%, $60k, 90, Dec 1. Use [X] when the value is not decided."),
  label: z.string().describe("A short label under the number, e.g. 'working days'."),
  pill: z.string().describe("An open item in his words ending with ' · TBD' (e.g. '[X]% raise on commission · TBD'), or ''."),
  lines: z.array(z.string()).describe("Up to 3 talking lines of about 30 characters; mark the key words with **double stars**."),
  notes,
});

export const ChartSchema = z.object({
  layout: z.literal("chart"),
  title: z.string(),
  subtitle: z.string().describe("A question he puts to the room, with its question mark, or ''."),
  slices: z
    .array(z.object({ share: z.number().describe("Percent of the ring, all slices add up to 100."), label: z.string().describe("A 1-2 word label inside the ring, or ''."), highlight: z.boolean() }))
    .describe("2 to 6 slices; exactly one highlighted."),
  center: z.string().describe("The word in the middle of the ring: 'You' when it names the reader, else a short label or ''."),
  math: z.array(z.string()).describe("Up to 3 math lines of about 36 characters that explain the highlighted slice. Lines after the first start with an operator: '÷ ', '= ', '× ', '+ ', '− ' or 'or '."),
  note: z.string().describe("One line under the math (a fact about a gray slice, who it is for), or ''."),
  pill: z.string().describe("An open item ending with ' · TBD', or ''."),
  drawn: z.boolean().describe("true when the slices are a drawing of the idea, not real data."),
  notes,
});

export const KeyLineSchema = z.object({
  layout: z.literal("key_line"),
  statement: z.string().describe("Up to two short sentences, about 19 characters a line, two lines; put a line break (\\n) where the line should break. A question keeps its '?'."),
  coral: z.string().describe("The one word in the statement that carries the idea (drawn in coral), copied exactly, or ''."),
  line: z.string().describe("One line under it, about 58 characters, or ''."),
  notes,
});

export const DiagramSchema = z.object({
  layout: z.literal("diagram"),
  title: z.string(),
  tiers: z
    .array(z.object({ kind: z.enum(TIER_KINDS).describe("owner = the owner, team = people here now, open = people not here yet"), label: z.string().describe("The tier's name, 1-4 words."), count: z.number().describe("How many circles: 1 for the owner, 1-3 for the team, 1-6 for open seats.") }))
    .describe("2 or 3 tiers, left to right."),
  rule: z.string().describe("One rule line under the diagram, or ''."),
  takeaway: z.string().describe("One takeaway line under it, about 58 characters."),
  notes,
});

export const PriceCardsSchema = z.object({
  layout: z.literal("price_cards"),
  title: z.string(),
  subtitle: z.string().describe("One line under the title, or ''."),
  cards: z
    .array(z.object({ icon: z.enum(ICONS), number: z.string().describe("6 characters with four cards, 8 with three or fewer."), label: z.string().describe("18 characters at most."), highlight: z.boolean().describe("true on the one number to look at, at most one card.") }))
    .describe("2 to 4 cards, old before new, lowest tier first."),
  strip: z.string().describe("One full-width line under the cards, or ''."),
  strip_icon: z.enum(ICONS),
  notes,
});

export const StepChainSchema = z.object({
  layout: z.literal("step_chain"),
  title: z.string(),
  subtitle: z.string().describe("One line under the title, or ''."),
  steps: z
    .array(z.object({ name: z.string().describe("20 characters at most."), note: z.string().describe("A side note, 40 characters at most, or ''."), person: z.enum(PEOPLE).describe("owner = Anersi, mark = Mark, teammate = someone else, none = a carrier or a thing."), last_resort: z.boolean() }))
    .describe("2 to 6 steps in order; last_resort only on the true last resort."),
  notes,
});

export const ScriptSchema = z.object({
  layout: z.literal("script"),
  title: z.string(),
  subtitle: z.string().describe("One line under the title, or ''."),
  rows: z
    .array(z.object({ who: z.enum(["rep", "client"]), text: z.string().describe("Rep: his words cut down, no quote marks (they are added). Client: what the client does, a few words, third person, e.g. 'They tell you.'"), aside: z.string().describe("A short instruction to the rep in parentheses' place, e.g. 'then just ask', or ''.") }))
    .describe("1 to 6 rows, 85 characters each."),
  notes,
});

export const ContentSlideSchema = z.discriminatedUnion("layout", [
  BigNewsSchema,
  BigNumberSchema,
  ChartSchema,
  KeyLineSchema,
  DiagramSchema,
  PriceCardsSchema,
  StepChainSchema,
  ScriptSchema,
]);

export type BigNewsSlide = z.infer<typeof BigNewsSchema>;
export type BigNumberSlide = z.infer<typeof BigNumberSchema>;
export type ChartSlide = z.infer<typeof ChartSchema>;
export type KeyLineSlide = z.infer<typeof KeyLineSchema>;
export type DiagramSlide = z.infer<typeof DiagramSchema>;
export type PriceCardsSlide = z.infer<typeof PriceCardsSchema>;
export type StepChainSlide = z.infer<typeof StepChainSchema>;
export type ScriptSlide = z.infer<typeof ScriptSchema>;
export type ContentSlide = z.infer<typeof ContentSlideSchema>;

// --- Deck slides (made by the deck builder) ---------------------------------------------------

export interface CoverSlide {
  layout: "cover";
  eyebrow: string;
  title: string;
  line: string;
  footer: string;
  notes: string;
}

export interface ScoreboardSlide {
  layout: "scoreboard";
  eyebrow: string;
  title: string;
  number: string;
  line: string;
  pill: string;
  pillTone: "green" | "gray";
  /** Percent of the goal for the bar (0 to 100), or null when there is no goal. */
  pct: number | null;
  notes: string;
}

export interface AgendaSlide {
  layout: "agenda";
  title: string;
  rows: string[];
  notes: string;
}

export interface QuoteSlide {
  layout: "quote";
  quote: string;
  name: string;
  notes: string;
}

/** A slide ready to draw: its eyebrow and its place in the deck are known. */
export type DrawnSlide = (ContentSlide | CoverSlide | ScoreboardSlide | AgendaSlide | QuoteSlide) & {
  /** The eyebrow over the title ("1 · Your raise"); content slides get it from their section. */
  eyebrow?: string;
  /** The 1-based place in the deck and the deck's length (the footer's "05 / 12"). */
  index?: number;
  total?: number;
};

export const RED_LAYOUTS: readonly Layout[] = ["cover", "big_news", "quote"];
export function isRed(slide: { layout: Layout }): boolean {
  return RED_LAYOUTS.includes(slide.layout);
}

/** "Big number" style title of a slide, for lists, the clicker's "Next:" line and the agenda. */
export function slideHeadline(slide: DrawnSlide | ContentSlide): string {
  switch (slide.layout) {
    case "big_news":
    case "key_line":
      return slide.statement.replace(/\s*\n\s*/g, " ");
    case "cover":
    case "scoreboard":
    case "agenda":
      return slide.title;
    case "quote":
      return `“${slide.quote}”`;
    default:
      return slide.title;
  }
}

// --- Limits (brand/SLIDES.md, "The 12 layouts") ------------------------------------------------

/** Most rows a list layout holds; the AI's extra rows and the editor stop here. */
export const MAX_ROWS = { bigNumberLines: 3, chartSlices: 6, chartMath: 3, tiers: 3, cards: 4, steps: 6, scriptRows: 6, agenda: 5 } as const;
/** Longest field we store (a guard, far above any limit the guide sets). */
export const FIELD_MAX = 400;

export interface LimitNote {
  field: string;
  message: string;
}

const over = (field: string, text: string, max: number, what = "characters"): LimitNote[] =>
  text.length > max ? [{ field, message: `${text.length} ${what}; about ${max} fit.` }] : [];

/** Soft character limits per field, from the guide's measured limits. The editor shows them; nothing is cut. */
export function limitNotes(slide: ContentSlide): LimitNote[] {
  const plain = (s: string) => s.replace(/\*\*/g, "");
  switch (slide.layout) {
    case "big_news":
      return [...over("statement", slide.statement, 30), ...over("line", slide.line, 58)];
    case "big_number":
      return [
        ...over("title", slide.title, 34),
        ...over("number", slide.number, 5),
        ...over("label", slide.label, 30),
        ...slide.lines.flatMap((l, i) => over(`lines.${i}`, plain(l), 34)),
      ];
    case "chart":
      return [...over("title", slide.title, 34), ...slide.math.flatMap((l, i) => over(`math.${i}`, l, 36)), ...over("note", slide.note, 58)];
    case "key_line": {
      const lines = slide.statement.split("\n");
      return [
        ...(lines.length > 2 ? [{ field: "statement", message: "Two lines at most." }] : []),
        ...lines.flatMap((l) => over("statement", l, 19, "characters on a line")),
        ...over("line", slide.line, 58),
      ];
    }
    case "diagram":
      return [...over("title", slide.title, 34), ...over("takeaway", slide.takeaway, 58), ...over("rule", slide.rule, 70)];
    case "price_cards": {
      const max = slide.cards.length >= 4 ? 6 : 8;
      return [
        ...over("title", slide.title, 34),
        ...slide.cards.flatMap((c, i) => [...over(`cards.${i}.number`, c.number, max), ...over(`cards.${i}.label`, c.label, 18)]),
        ...over("strip", slide.strip, 70),
      ];
    }
    case "step_chain":
      return [...over("title", slide.title, 34), ...slide.steps.flatMap((s, i) => [...over(`steps.${i}.name`, s.name, 20), ...over(`steps.${i}.note`, s.note, 40)])];
    case "script":
      return [...over("title", slide.title, 34), ...slide.rows.flatMap((r, i) => over(`rows.${i}`, r.text + (r.aside ? ` (${r.aside})` : ""), 85))];
  }
}

// --- Cleaning what comes in (the AI's output, the editor's form) ---------------------------------

const clip = (s: unknown, max = FIELD_MAX) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);
const oneLine = (s: unknown, max = FIELD_MAX) => clip(s, max).replace(/\s*\n\s*/g, " ");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

/**
 * A safe copy of a content slide: known layout, every field a trimmed string of sane length,
 * rows capped at the layout's limits. Throws on an unknown layout.
 */
export function cleanSlide(input: unknown): ContentSlide {
  const s = (input ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const n = oneLine(s.notes, 4000);
  switch (s.layout) {
    case "big_news":
      return { layout: "big_news", statement: oneLine(s.statement, 120), line: oneLine(s.line, 160), notes: n };
    case "big_number":
      return {
        layout: "big_number",
        title: oneLine(s.title, 120),
        number: oneLine(s.number, 12),
        label: oneLine(s.label, 80),
        pill: oneLine(s.pill, 80),
        lines: arr(s.lines).map((l) => oneLine(l, 120)).filter(Boolean).slice(0, MAX_ROWS.bigNumberLines),
        notes: n,
      };
    case "chart": {
      let slices = arr(s.slices)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return { share: num(o.share, 0, 100, 0), label: oneLine(o.label, 24), highlight: o.highlight === true };
        })
        .filter((x) => x.share > 0)
        .slice(0, MAX_ROWS.chartSlices);
      if (slices.length < 2) slices = [{ share: 20, label: "", highlight: true }, { share: 80, label: "", highlight: false }];
      const firstHi = slices.findIndex((x) => x.highlight);
      slices = slices.map((x, i) => ({ ...x, highlight: i === (firstHi === -1 ? 0 : firstHi) }));
      return {
        layout: "chart",
        title: oneLine(s.title, 120),
        subtitle: oneLine(s.subtitle, 160),
        slices,
        center: oneLine(s.center, 24),
        math: arr(s.math).map((l) => oneLine(l, 120)).filter(Boolean).slice(0, MAX_ROWS.chartMath),
        note: oneLine(s.note, 160),
        pill: oneLine(s.pill, 80),
        drawn: s.drawn !== false,
        notes: n,
      };
    }
    case "key_line": {
      const statement = clip(s.statement, 120)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join("\n");
      const coral = oneLine(s.coral, 60);
      return { layout: "key_line", statement, coral: coral && statement.includes(coral) ? coral : "", line: oneLine(s.line, 160), notes: n };
    }
    case "diagram": {
      const tiers = arr(s.tiers)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          const kind = pick(o.kind, TIER_KINDS, "team");
          const max = kind === "owner" ? 1 : kind === "team" ? 3 : 6;
          return { kind, label: oneLine(o.label, 40), count: num(o.count, 1, max, kind === "open" ? 6 : kind === "team" ? 3 : 1) };
        })
        .slice(0, MAX_ROWS.tiers);
      return {
        layout: "diagram",
        title: oneLine(s.title, 120),
        tiers: tiers.length ? tiers : [{ kind: "owner", label: "Me", count: 1 }, { kind: "team", label: "You", count: 3 }],
        rule: oneLine(s.rule, 160),
        takeaway: oneLine(s.takeaway, 160),
        notes: n,
      };
    }
    case "price_cards": {
      let seen = false;
      const cards = arr(s.cards)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          const highlight = o.highlight === true && !seen;
          if (highlight) seen = true;
          return { icon: pick(o.icon, ICONS, "none"), number: oneLine(o.number, 12), label: oneLine(o.label, 40), highlight };
        })
        .filter((c) => c.number || c.label)
        .slice(0, MAX_ROWS.cards);
      return {
        layout: "price_cards",
        title: oneLine(s.title, 120),
        subtitle: oneLine(s.subtitle, 160),
        cards: cards.length ? cards : [{ icon: "none", number: "[X]", label: "", highlight: false }],
        strip: oneLine(s.strip, 160),
        strip_icon: pick(s.strip_icon, ICONS, "none"),
        notes: n,
      };
    }
    case "step_chain": {
      const steps = arr(s.steps)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return { name: oneLine(o.name, 60), note: oneLine(o.note, 80), person: pick(o.person, PEOPLE, "none"), last_resort: o.last_resort === true };
        })
        .filter((x) => x.name)
        .slice(0, MAX_ROWS.steps);
      return {
        layout: "step_chain",
        title: oneLine(s.title, 120),
        subtitle: oneLine(s.subtitle, 160),
        steps: steps.length ? steps.map((x, i) => ({ ...x, last_resort: x.last_resort && i === steps.length - 1 })) : [{ name: "First", note: "", person: "none", last_resort: false }],
        notes: n,
      };
    }
    case "script": {
      const rows = arr(s.rows)
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return { who: pick(o.who, ["rep", "client"] as const, "rep"), text: oneLine(o.text, 200).replace(/^[“"]+|[”"]+$/g, ""), aside: oneLine(o.aside, 60).replace(/^\(|\)$/g, "") };
        })
        .filter((x) => x.text)
        .slice(0, MAX_ROWS.scriptRows);
      return {
        layout: "script",
        title: oneLine(s.title, 120),
        subtitle: oneLine(s.subtitle, 160),
        rows: rows.length ? rows : [{ who: "rep", text: "…", aside: "" }],
        notes: n,
      };
    }
    default:
      throw new Error("Unknown slide layout");
  }
}

/** The words a slide carries, as plain lines: what a layout switch keeps. */
function wordsOf(slide: ContentSlide): { title: string; lines: string[]; number: string } {
  const strip = (s: string) => s.replace(/\*\*/g, "");
  switch (slide.layout) {
    case "big_news":
      return { title: slide.statement, lines: [slide.line].filter(Boolean), number: "" };
    case "big_number":
      return { title: slide.title, lines: slide.lines.map(strip), number: slide.number };
    case "chart":
      return { title: slide.title, lines: slide.math, number: "" };
    case "key_line":
      return { title: slide.statement.replace(/\n/g, " "), lines: [slide.line].filter(Boolean), number: "" };
    case "diagram":
      return { title: slide.title, lines: [slide.rule, slide.takeaway].filter(Boolean), number: "" };
    case "price_cards":
      return { title: slide.title, lines: slide.cards.map((c) => `${c.number} ${c.label}`.trim()), number: slide.cards[0]?.number ?? "" };
    case "step_chain":
      return { title: slide.title, lines: slide.steps.map((x) => x.name), number: "" };
    case "script":
      return { title: slide.title, lines: slide.rows.filter((r) => r.who === "rep").map((r) => r.text), number: "" };
  }
}

/** The same words in another layout (the editor's layout picker): nothing typed is lost to the notes. */
export function switchLayout(slide: ContentSlide, to: ContentLayout): ContentSlide {
  if (slide.layout === to) return slide;
  const w = wordsOf(slide);
  const first = w.lines[0] ?? "";
  const base = { notes: slide.notes };
  switch (to) {
    case "big_news":
      return cleanSlide({ layout: to, statement: w.title, line: first, ...base });
    case "key_line":
      return cleanSlide({ layout: to, statement: w.title, coral: "", line: first, ...base });
    case "big_number":
      return cleanSlide({ layout: to, title: w.title, number: w.number || "[X]", label: "", pill: "", lines: w.lines.slice(0, 3), ...base });
    case "chart":
      return cleanSlide({ layout: to, title: w.title, subtitle: "", slices: [{ share: 25, label: "", highlight: true }, { share: 75, label: "", highlight: false }], center: "", math: w.lines.slice(0, 3), note: "", pill: "", drawn: true, ...base });
    case "diagram":
      return cleanSlide({ layout: to, title: w.title, tiers: [{ kind: "owner", label: "Me", count: 1 }, { kind: "team", label: "You, full time", count: 3 }, { kind: "open", label: "People under you", count: 6 }], rule: w.lines[0] ?? "", takeaway: w.lines[1] ?? "", ...base });
    case "price_cards":
      return cleanSlide({ layout: to, title: w.title, subtitle: "", cards: (w.lines.length ? w.lines : ["[X]"]).slice(0, 4).map((l) => ({ icon: "none", number: w.number || "[X]", label: l.slice(0, 18), highlight: false })), strip: "", strip_icon: "none", ...base });
    case "step_chain":
      return cleanSlide({ layout: to, title: w.title, subtitle: "", steps: (w.lines.length ? w.lines : [w.title]).slice(0, 6).map((l) => ({ name: l, note: "", person: "none", last_resort: false })), ...base });
    case "script":
      return cleanSlide({ layout: to, title: w.title, subtitle: "", rows: (w.lines.length ? w.lines : [w.title]).slice(0, 6).map((l) => ({ who: "rep", text: l, aside: "" })), ...base });
  }
}

/** A plain Key line for a thought, used when the AI is off or fails: the card's own words, nothing added. */
export function fallbackSlide(card: { title: string; summary: string; points: string[] }): ContentSlide {
  const title = card.title.trim() || "A thought for the team";
  const words = title.split(/\s+/);
  // Two lines of about 19 characters: break at the word nearest the middle.
  let statement = title;
  if (title.length > 19 && words.length > 1) {
    let best = 1;
    let bestGap = Infinity;
    for (let i = 1; i < words.length; i++) {
      const gap = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    statement = `${words.slice(0, best).join(" ")}\n${words.slice(best).join(" ")}`;
  }
  if (!/[.?!]$/.test(statement)) statement += ".";
  const firstSentence = (card.summary.match(/^[^.!?]+[.!?]/)?.[0] ?? card.summary).trim();
  const you = [card.summary, ...card.points].filter(Boolean).join(" ");
  return cleanSlide({
    layout: "key_line",
    statement,
    coral: "",
    line: firstSentence.length <= 70 ? firstSentence : "",
    notes: you ? `You say: ${you}` : "",
  });
}
