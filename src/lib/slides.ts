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
  statement: z.string().describe("Up to two short sentences, about 19 characters a line (fewer with capitals and wide letters such as M and W), two lines; put a line break (\\n) where the line should break. A question keeps its '?'."),
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
    .array(
      z.object({
        who: z.enum(["rep", "client"]),
        text: z
          .string()
          .describe(
            "Rep: his words cut down, no quote marks (they are added). Client: what the client does, a few words, third person, e.g. 'They tell you.'; on an objection slide the first client row is the objection in the client's words inside curly quotes, e.g. '“I need to think about it.”'",
          ),
        aside: z.string().describe("A short instruction to the rep in parentheses' place, e.g. 'then just ask', or ''."),
      }),
    )
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
  /** The thought (mtg_items.id) a content slide came from; none on the cover, scoreboard, agenda and quote. */
  itemId?: string;
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

/**
 * A 176px statement (Big news, Key line) by its width on the TV, not its characters: "Mortgage
 * protection" is 19 characters and still too wide for one line. Two lines fit; a Key line's lines
 * are the ones he typed, each one line on the TV.
 */
function statementNotes(statement: string, handLines: boolean): LimitNote[] {
  const lines = handLines ? statement.split("\n") : [statement.replace(/\s*\n\s*/g, " ")];
  if (lines.length > 2) return [{ field: "statement", message: "Two lines at most." }];
  const fit = lines.map((l) => statementFit(l));
  const out: LimitNote[] = [];
  for (const f of fit) if (f.tooWide) out.push({ field: "statement", message: `“${f.tooWide}” is too wide for one line on the TV. Use a shorter word.` });
  const total = fit.reduce((a, f) => a + f.lines, 0);
  if (total <= 2) return out;
  if (lines.length === 1) return [...out, { field: "statement", message: "It wraps onto more than 2 lines on the TV. Say it shorter." }];
  fit.forEach((f, i) => {
    if (f.lines > 1) out.push({ field: "statement", message: `Line ${i + 1} is too wide for the TV, so it wraps onto another line. Shorten it or move the line break.` });
  });
  return out;
}

/** Soft limits per field, from the guide's measured limits. The editor shows them; nothing is cut. */
export function limitNotes(slide: ContentSlide): LimitNote[] {
  const plain = (s: string) => s.replace(/\*\*/g, "");
  switch (slide.layout) {
    case "big_news":
      return [...statementNotes(slide.statement, false), ...over("line", slide.line, 58)];
    case "big_number":
      return [
        ...over("title", slide.title, 34),
        ...over("number", slide.number, 5),
        ...over("label", slide.label, 30),
        ...slide.lines.flatMap((l, i) => over(`lines.${i}`, plain(l), 34)),
      ];
    case "chart": {
      const total = Math.round(slide.slices.reduce((a, x) => a + (Number.isFinite(x.share) && x.share > 0 ? x.share : 0), 0));
      return [
        ...over("title", slide.title, 34),
        ...(total > 0 && total !== 100 ? [{ field: "slices", message: `They add up to ${total}, not 100. The ring is drawn to scale, and Save makes them add up to 100.` }] : []),
        ...slide.math.flatMap((l, i) => over(`math.${i}`, l, 36)),
        ...over("note", slide.note, 58),
      ];
    }
    case "key_line":
      return [...statementNotes(slide.statement, true), ...over("line", slide.line, 58)];
    case "diagram":
      return [...over("title", slide.title, 34), ...over("takeaway", slide.takeaway, 58), ...over("rule", slide.rule, 70)];
    case "price_cards": {
      const max = slide.cards.length >= 4 ? 6 : 8;
      return [
        ...over("title", slide.title, 34),
        ...(cardIconsShow(slide.cards) || slide.cards.every((c) => c.icon === "none")
          ? []
          : [{ field: "icons", message: "Some cards have one and some don’t, so the TV shows none. Your picks are kept: give every card one to show them." }]),
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

/** Over the guard length, a field is cut at the last space before it (never mid-word, unless one word is that long). */
const cutAtWord = (s: string, max: number) => {
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  const at = Math.max(head.lastIndexOf(" "), head.lastIndexOf("\n"));
  return (at > max / 2 ? head.slice(0, at) : s.slice(0, max)).trimEnd();
};
const clip = (s: unknown, max = FIELD_MAX) =>
  cutAtWord(
    String(s ?? "")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .replace(/\r\n?/g, "\n")
      .trim(),
    max,
  );
const oneLine = (s: unknown, max = FIELD_MAX) => clip(s, max).replace(/\s*\n\s*/g, " ");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

/**
 * A ring's slice sizes as whole parts of 100, in order (the guide's ring is a 100-unit circle):
 * sizes that add up to 90 or 110 are scaled, the rounding left over goes to the biggest slice.
 * A slice of 0 or less (or not a number) stays 0 and is not drawn. The TV draws these, and
 * cleanSlide saves them, so the ring never shows a hole or an overlap.
 */
export function ringShares(shares: number[]): number[] {
  const raw = shares.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) return raw;
  const scaled = raw.map((x) => (x > 0 ? Math.max(1, Math.round((x * 100) / sum)) : 0));
  const left = 100 - scaled.reduce((a, b) => a + b, 0);
  if (left !== 0) {
    const big = scaled.indexOf(Math.max(...scaled));
    scaled[big] = Math.max(1, scaled[big] + left);
  }
  return scaled;
}

/** Price cards draw their icons only when every card has one (the guide: all cards in a row match). */
export function cardIconsShow(cards: { icon: IconKey }[]): boolean {
  return cards.length > 0 && cards.every((c) => c.icon !== "none");
}

/**
 * The notes line of a chart whose slices are a picture of the idea, not real data (the guide's Ring
 * chart: "A drawn split that is not real data says so in the notes"). It is never stored: the deck
 * adds it to the notes he reads on the TV day while the chart is drawn (`shownNotes`), so the Drawn
 * switch alone decides it and it never follows the slide into another layout.
 */
export const DRAWN_NOTE = "The slices are a drawing, not real numbers.";
const SAYS_DRAWN = /slices are a drawing/i;

/** Stored notes without the drawn line an earlier version saved into them. */
const withoutDrawnNote = (notes: string) => (notes.includes(DRAWN_NOTE) ? notes.split(DRAWN_NOTE).join(" ").replace(/\s{2,}/g, " ").trim() : notes);

/** The speaker notes as the clicker shows them: a drawn chart's start by saying so (once). */
export function shownNotes(slide: ContentSlide): string {
  if (slide.layout !== "chart" || !slide.drawn || SAYS_DRAWN.test(slide.notes)) return slide.notes;
  return slide.notes ? `${DRAWN_NOTE} ${slide.notes}` : DRAWN_NOTE;
}

/** Straight double quotes to curly ones (the guide: curly quotes in everything people read). */
const curlQuotes = (s: string) => s.replace(/(^|[\s([{—–-])"/g, "$1“").replace(/"/g, "”");

/**
 * A rep row's words without the quote marks around them (the TV adds “ ”). Only a pair around the
 * whole line goes, or a lone mark at one end; quotes inside the line stay.
 */
function unquoteRep(text: string): string {
  const open = /^[“"]/.test(text);
  const close = /[”"]$/.test(text);
  const inner = (s: string) => /[“”"]/.test(s);
  if (open && close && text.length >= 2 && !inner(text.slice(1, -1))) return text.slice(1, -1).trim();
  if (open && !close && !inner(text.slice(1))) return text.slice(1).trim();
  if (close && !open && !inner(text.slice(0, -1))) return text.slice(0, -1).trim();
  return text;
}

/**
 * A safe copy of a content slide: known layout, every field a trimmed string of sane length,
 * rows capped at the layout's limits. Throws on an unknown layout.
 */
export function cleanSlide(input: unknown): ContentSlide {
  const s = (input ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const n = withoutDrawnNote(oneLine(s.notes, 4000));
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
      // Sizes are whole parts of 100: a ring of 90 or 110 is scaled (the editor said so before Save).
      const shares = ringShares(slices.map((x) => x.share));
      slices = slices.map((x, i) => ({ ...x, share: shares[i], highlight: i === (firstHi === -1 ? 0 : firstHi) }));
      // A chart nobody marked as real numbers counts as a drawing (the editor's Drawn switch turns
      // it off); the deck's copy of the notes says so, the stored notes never do (shownNotes).
      const drawn = s.drawn !== false;
      return {
        layout: "chart",
        title: oneLine(s.title, 120),
        subtitle: oneLine(s.subtitle, 160),
        slices,
        center: oneLine(s.center, 24),
        math: arr(s.math).map((l) => oneLine(l, 120)).filter(Boolean).slice(0, MAX_ROWS.chartMath),
        note: oneLine(s.note, 160),
        pill: oneLine(s.pill, 80),
        drawn,
        notes: n,
      };
    }
    case "key_line": {
      // Two lines at most: a third line (a Return pressed to move the break) joins the second.
      const parts = clip(s.statement, 120)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const statement = (parts.length > 2 ? [parts[0], parts.slice(1).join(" ")] : parts).join("\n");
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
          return { icon: pick(o.icon, ICONS, "none"), number: oneLine(o.number, 12), label: oneLine(o.label, 120), highlight };
        })
        .filter((c) => c.number || c.label)
        .slice(0, MAX_ROWS.cards);
      // Each card keeps the icon he picked: the TV draws icons only when every card has one
      // (cardIconsShow), and the editor's limit notes say so, so a half-picked row loses nothing.
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
          return { name: oneLine(o.name, 120), note: oneLine(o.note, 120), person: pick(o.person, PEOPLE, "none"), last_resort: o.last_resort === true };
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
          const who = pick(o.who, ["rep", "client"] as const, "rep");
          const text = oneLine(o.text, 200);
          // A rep line loses its own quote marks (the TV adds them); a client line keeps the
          // client's words in curly quotes, as an objection slide shows them.
          return { who, text: who === "rep" ? unquoteRep(text) : curlQuotes(text), aside: oneLine(o.aside, 60).replace(/^\(|\)$/g, "") };
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

// --- Statements -------------------------------------------------------------------------------------

/*
 * How wide a statement is on the TV. Big news and Key line statements are Plus Jakarta Sans 800 at
 * 176px with -6px letter-spacing (brand/SLIDES.md). ADVANCES_800 is each glyph's advance in that
 * weight, in thousandths of the font size, measured from the bundled font (@fontsource-variable)
 * in Chromium; kerning only narrows a real line a little, so the estimate errs wide (within about
 * 0.5% on words, checked in tests/brand.test.ts). A glyph not in the table counts as a whole em.
 */
const GLYPHS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00a0¡¢£¤¥¦§¨©ª«¬\u00ad®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ’‘“”–—…•−€";
const ADVANCES_800 =
  "180,400,532,956,647,1070,813,333,407,407,560,678,386,634,408,532,700,413,596,612,662,614,604,564,633,604,408,428,678,678,678,611,926,732,690,772,739,589,587,804,732,287,396,687,547,912,742,878,649,878,667,647,552,724,712,1032,682,672,567,449,532,449,678,684,391,583,673,611,673,611,410,648,599,260,260,586,260,929,599,651,673,673,386,515,421,599,582,912,582,602,492,425,426,425,678,180,400,611,670,596,672,426,535,567,952,442,718,678,0,694,460,552,678,404,421,391,599,619,408,381,319,481,718,877,816,943,611,732,732,732,732,732,732,993,772,589,589,589,589,287,287,287,287,739,742,878,878,878,878,878,678,878,724,724,724,724,672,655,654,583,583,583,583,583,583,961,611,611,611,611,611,238,238,238,238,651,599,651,651,651,651,651,678,651,599,599,599,599,602,673,602,386,386,606,606,684,1014,808,698,678,767";
const ADVANCE: ReadonlyMap<string, number> = ((w) => new Map([...GLYPHS].map((c, i) => [c, Number(w[i])])))(ADVANCES_800.split(","));
const STATEMENT_PX = 176;
const STATEMENT_TRACKING = -6;
/** The content box is 1664px wide; a statement line stays under 1630 (a 2% margin for the TV's own rendering). */
export const STATEMENT_MAX_WIDTH = 1630;

/** The width, in canvas pixels, of one line of 176px statement text. */
export function statementWidth(text: string): number {
  let units = 0;
  let n = 0;
  for (const ch of text) {
    units += ADVANCE.get(ch) ?? 1000;
    n++;
  }
  return (units * STATEMENT_PX) / 1000 + STATEMENT_TRACKING * n;
}

/** A line's break points, the browser's: between words, and after a hyphen inside a word ("over-|explaining"). */
interface Piece {
  text: string;
  /** A space comes before it (a word break); false after a hyphen. */
  space: boolean;
}
function piecesOf(line: string): Piece[] {
  const out: Piece[] = [];
  for (const word of line.split(/\s+/).filter(Boolean)) {
    word.split(/(?<=[\p{L}\p{N}]-)(?=\p{L})/u).forEach((text, i) => out.push({ text, space: i === 0 && out.length > 0 }));
  }
  return out;
}
const joinPieces = (ps: Piece[]) => ps.map((p, i) => (i > 0 && p.space ? ` ${p.text}` : p.text)).join("");
const fitsLine = (s: string) => statementWidth(s) <= STATEMENT_MAX_WIDTH;

/**
 * How one line of statement text sits on the TV: the lines it wraps to at the content width (at
 * the browser's break points), and a word too wide for a line on its own ("" when none).
 */
export function statementFit(line: string): { lines: number; tooWide: string } {
  let lines = 0;
  let cur: Piece[] = [];
  let tooWide = "";
  for (const p of piecesOf(line)) {
    if (!tooWide && !fitsLine(p.text)) tooWide = p.text;
    if (cur.length && !fitsLine(joinPieces([...cur, p]))) {
      lines++;
      cur = [p];
    } else cur.push(p);
  }
  return { lines: lines + (cur.length ? 1 : 0), tooWide };
}

const endsSentence = (s: string) => /[.?!…]$/.test(s);
/** A statement ends with a period (the guide: statements end every sentence with a period). */
const asStatement = (s: string) => (!s || endsSentence(s) ? s : `${s.replace(/[\s,;:–—-]+$/, "")}.`);
/** A topic title has no period (a question keeps its mark). */
const asTitle = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/([^.])\.$/, "$1");

/**
 * Text as a statement on the TV: one line when it fits on one, else two lines as even as they can
 * be (by width), broken between words, or after a hyphen when no word break works. `mustFit`: null
 * when no break gives two lines that each fit; otherwise the most even word break, fit or not.
 */
function onTwoLines(text: string, mustFit: boolean): string | null {
  if (fitsLine(text)) return text;
  const ps = piecesOf(text);
  const split = (b: number) => [joinPieces(ps.slice(0, b)), joinPieces(ps.slice(b))];
  for (const atWord of [true, false]) {
    let best = -1;
    let bestGap = Infinity;
    for (let b = 1; b < ps.length; b++) {
      if (ps[b].space !== atWord) continue;
      const [w1, w2] = split(b).map(statementWidth);
      if (mustFit && (w1 > STATEMENT_MAX_WIDTH || w2 > STATEMENT_MAX_WIDTH)) continue;
      if (Math.abs(w1 - w2) < bestGap) {
        bestGap = Math.abs(w1 - w2);
        best = b;
      }
    }
    if (best > 0) return split(best).join("\n");
    if (!mustFit) return text;
  }
  return null;
}

/**
 * A statement on two even lines when it is wider than one. Nothing is cut: a line still too wide
 * shows in the editor's limit notes.
 */
function breakEvenly(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return onTwoLines(flat, true) ?? onTwoLines(flat, false) ?? flat;
}

/** Words a cut statement or a section name never ends on. */
const JOINERS = new Set(["a", "an", "the", "and", "or", "but", "nor", "for", "of", "to", "in", "on", "at", "by", "with", "from", "into", "as", "about", "than", "your", "our", "my", "his", "her", "their", "its", "is", "are", "was", "were", "be", "that", "this", "so", "if", "when", "every", "each", "any", "some", "no", "not", "very", "more", "less", "too", "within", "after", "before", "over", "under", "until", "per", "without", "between", "through", "during", "since", "like"]);
/** Words that want the noun after them: a cut statement never ends on one ("of our new", "your main"). */
const BEFORE_NOUN = new Set(["new", "old", "main", "own", "same", "other", "top", "big", "real", "whole", "full", "single", "these", "those"]);
/** Words that open a clause: a cut never ends on one, or one word after one mid-sentence ("the policy when Mark"). */
const CLAUSE = new Set(["when", "whenever", "if", "because", "unless", "while", "whether", "who", "whoever", "whom", "whose", "which", "where", "wherever", "although", "though"]);
/** A cut never ends on an amount whose unit was left off ("within five" of "within five minutes"). */
const NUMBER_WORD = /^(\$?[\d.,]+[%k]?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million)$/;
const wordKey = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * His title as a Key line inside the guide's limit: at most two lines, each one that fits the TV
 * (measured by width, not characters: "Mortgage protection" is too wide), as even as they can be.
 * A title too long for that keeps as many of its first words as fit (never ending on "the",
 * "and", "for"...), and `cut` says the rest was left off.
 */
function fitKeyLine(title: string): { statement: string; cut: boolean } {
  const words = title.split(/\s+/).filter(Boolean);
  // A cut question still asks: it keeps its question mark; anything else ends with a period.
  const mark = /\?$/.test(title) ? "?" : ".";
  for (let k = words.length; k >= 1; k--) {
    const cut = k < words.length;
    const end = wordKey(words[k - 1]);
    const opensClause = CLAUSE.has(end) || (k > 2 && CLAUSE.has(wordKey(words[k - 2])));
    if (cut && (JOINERS.has(end) || BEFORE_NOUN.has(end) || NUMBER_WORD.test(end) || opensClause)) continue;
    const said = words.slice(0, k).join(" ");
    const two = onTwoLines(cut ? `${said.replace(/[\s.?!…,;:–—-]+$/, "")}${mark}` : asStatement(said), true);
    if (two) return { statement: two, cut };
  }
  // Not even the first word fits on two lines: it stands alone, whole (the limit notes say so).
  return { statement: asStatement(words[0] ?? ""), cut: words.length > 1 };
}

// --- Switching layouts -----------------------------------------------------------------------------

/** What a slide carries into another layout: every field two layouts share, and its lines. */
interface Carry {
  title: string;
  subtitle: string;
  number: string;
  label: string;
  pill: string;
  /** Its talking lines in order (a Big number's keep their **bold** marks). */
  lines: string[];
}

function carryOf(slide: ContentSlide): Carry {
  const none = { subtitle: "", number: "", label: "", pill: "" };
  switch (slide.layout) {
    case "big_news":
      return { ...none, title: slide.statement, lines: [slide.line].filter(Boolean) };
    case "key_line":
      return { ...none, title: slide.statement.replace(/\s*\n\s*/g, " "), lines: [slide.line].filter(Boolean) };
    case "big_number":
      return { ...none, title: slide.title, number: slide.number, label: slide.label, pill: slide.pill, lines: slide.lines };
    case "chart":
      return { ...none, title: slide.title, subtitle: slide.subtitle, pill: slide.pill, lines: [...slide.math, slide.note].filter(Boolean) };
    case "diagram":
      return { ...none, title: slide.title, lines: [slide.rule, slide.takeaway].filter(Boolean) };
    case "price_cards": {
      // The number to look at (else the first card) is the number; the other cards become lines.
      const main = slide.cards.find((c) => c.highlight) ?? slide.cards[0];
      const others = slide.cards.filter((c) => c !== main).map((c) => `${c.number} ${c.label}`.trim());
      return { ...none, title: slide.title, subtitle: slide.subtitle, number: main?.number ?? "", label: main?.label ?? "", lines: [...others, slide.strip].filter(Boolean) };
    }
    case "step_chain":
      return { ...none, title: slide.title, subtitle: slide.subtitle, lines: slide.steps.map((x) => x.name) };
    case "script":
      return { ...none, title: slide.title, subtitle: slide.subtitle, lines: slide.rows.filter((r) => r.who === "rep").map((r) => r.text) };
  }
}

/**
 * The same slide in another layout (the editor's layout picker). Every field both layouts have
 * comes along (title, subtitle, number, label, TBD pill, lines), and words are never cut: what is
 * too long for the new layout shows in the editor's limit notes. The speaker notes stay.
 */
export function switchLayout(slide: ContentSlide, to: ContentLayout): ContentSlide {
  if (slide.layout === to) return slide;
  const c = carryOf(slide);
  const plain = (s: string) => s.replace(/\*\*/g, "");
  const lines = c.lines.map(plain);
  const first = lines[0] ?? "";
  const title = asTitle(c.title);
  const base = { notes: slide.notes };
  switch (to) {
    case "big_news":
      return cleanSlide({ layout: to, statement: asStatement(c.title.replace(/\s*\n\s*/g, " ")), line: first || c.subtitle, ...base });
    case "key_line":
      return cleanSlide({ layout: to, statement: breakEvenly(asStatement(c.title)), coral: "", line: first || c.subtitle, ...base });
    case "big_number":
      return cleanSlide({ layout: to, title, number: c.number || "[X]", label: c.label, pill: c.pill, lines: c.lines.slice(0, MAX_ROWS.bigNumberLines), ...base });
    case "chart":
      return cleanSlide({ layout: to, title, subtitle: c.subtitle, slices: [{ share: 25, label: "", highlight: true }, { share: 75, label: "", highlight: false }], center: "", math: lines.slice(0, MAX_ROWS.chartMath), note: "", pill: c.pill, drawn: true, ...base });
    case "diagram":
      return cleanSlide({ layout: to, title, tiers: [{ kind: "owner", label: "Me", count: 1 }, { kind: "team", label: "You, full time", count: 3 }, { kind: "open", label: "People under you", count: 6 }], rule: lines[0] ?? "", takeaway: lines[1] ?? "", ...base });
    case "price_cards": {
      // A slide with a number keeps it (and its label) on the first card, its first line in the
      // strip; without one, each line is a card waiting for its number.
      const cards = c.number
        ? [{ icon: "none", number: c.number, label: c.label, highlight: false }]
        : (lines.length ? lines : [""]).slice(0, MAX_ROWS.cards).map((l) => ({ icon: "none", number: "[X]", label: l, highlight: false }));
      return cleanSlide({ layout: to, title, subtitle: c.subtitle, cards, strip: c.number ? first : "", strip_icon: "none", ...base });
    }
    case "step_chain":
      return cleanSlide({ layout: to, title, subtitle: c.subtitle, steps: (lines.length ? lines : [title]).slice(0, MAX_ROWS.steps).map((l) => ({ name: l, note: "", person: "none", last_resort: false })), ...base });
    case "script":
      return cleanSlide({ layout: to, title, subtitle: c.subtitle, rows: (lines.length ? lines : [title]).slice(0, MAX_ROWS.scriptRows).map((l) => ({ who: "rep", text: l, aside: "" })), ...base });
  }
}

// --- When Claude is off ---------------------------------------------------------------------------

/**
 * A plain Key line for a thought, used when the AI is off or fails: his own title, nothing added.
 * The statement keeps the guide's limit (two lines that fit the TV, cut at word breaks); when the
 * title is longer, the whole title opens the speaker notes. No line under it: the card's summary
 * is Command Center's words, not his, and nothing checked it for names, so it stays in the notes
 * (only he sees those).
 */
export function fallbackSlide(card: { title: string; summary: string; points: string[] }): ContentSlide {
  const title = card.title.replace(/\s+/g, " ").trim() || "A thought for the team";
  const { statement, cut } = fitKeyLine(title);
  const said = [cut ? asStatement(title) : "", card.summary, ...card.points].filter(Boolean).join(" ");
  return cleanSlide({ layout: "key_line", statement, coral: "", line: "", notes: said ? `You say: ${said}` : "" });
}

/** Words a fallback section name never starts with. */
const LEADING = new Set(["the", "a", "an", "what", "what's", "whats", "how", "how's", "why", "when", "where", "who", "which", "our", "your", "my", "and", "so", "but", "or", "about", "this", "that", "these", "those", "some", "just", "also", "we", "i", "i'm", "you", "let's", "lets", "are", "is", "do", "does", "did", "can", "could", "should", "would", "will", "have", "has", "please", "there's", "theres", "here's", "heres", "it's", "its", "we're", "you're", "okay", "ok", "alright", "quick"]);
/**
 * Openers a fallback section name drops whole, longest first: they ask the team to do something
 * or announce it ("Make sure you log every dial" is "Log every dial", "There's a new bonus" is
 * "New bonus", "Let's talk about the raise" is "Raise").
 */
const LEAD_PHRASES = [
  "make sure that you", "make sure that we", "make sure you", "make sure we", "make sure to", "make sure",
  "don't forget to", "dont forget to", "don't forget", "dont forget", "remember to", "remember that", "remember",
  "let's talk about", "lets talk about", "let me talk about", "let's talk", "talk about", "a word about", "a note on", "a note about", "note on", "an update on", "update on",
  "it's time to", "it's time for", "it is time to", "time to", "time for", "there is", "there are", "here is",
  "i want you to", "i want you", "i need you to", "i want to", "we need to", "you need to", "we have to", "you have to", "we've got to", "you've got to", "we're going to", "we are going to",
]
  .map((p) => p.split(" "))
  .sort((a, b) => b.length - a.length);
/** Trailing words a whole (uncut) phrase still drops: it may end on a particle ("Clock in"), not on "the". */
const DANGLING = new Set(["a", "an", "the", "and", "or", "but", "nor", "your", "our", "my", "his", "her", "their", "its", "this", "that", "every", "each", "some", "no"]);

/**
 * The agenda section of a thought Claude did not name (no key, a failed call, a section he cleared):
 * 1 to 3 topic words from his title, without a leading "the", "what", "make sure you", "let's talk
 * about"... or a trailing "and", "for"... ("What the equipment costs" is "Equipment costs");
 * "Ideas" when nothing is left.
 */
export function fallbackSection(title: string): string {
  // The topic is the title's first phrase: it ends at a comma, a colon, a dash or a full stop.
  const raw = title.split(/\s+/).filter(Boolean);
  const end = raw.findIndex((w) => /[,;:.!?—–]$/.test(w) || w === "-");
  let words = (end >= 0 ? raw.slice(0, end + 1) : raw).map((w) => w.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, "").replace(/'/g, "’")).filter(Boolean);
  for (;;) {
    const keys = words.map(wordKey);
    const phrase = LEAD_PHRASES.find((p) => p.length <= keys.length && p.every((w, i) => keys[i] === w));
    if (phrase) words = words.slice(phrase.length);
    else if (words.length && LEADING.has(keys[0])) words = words.slice(1);
    else break;
  }
  // A phrase cut at three words never ends on "and", "for", "of"...; a whole one only drops "the", "and"...
  const cut = words.length > 3;
  words = words.slice(0, 3);
  while (words.length && (cut ? JOINERS : DANGLING).has(wordKey(words[words.length - 1]))) words = words.slice(0, -1);
  const name = words.join(" ").slice(0, 40).trim();
  return name ? name[0].toUpperCase() + name.slice(1) : "Ideas";
}

// --- The cover ---------------------------------------------------------------------------------------

/**
 * Soft limits for the cover (the guide's Cover: a title of about 12 characters a line on 2 lines,
 * so about 24 characters; one 56px line of 10 words at most), in plain words for the phone.
 * Shown under the cover's fields; nothing is cut.
 */
export function coverNotes(title: string, line: string): string[] {
  const out: string[] = [];
  const words = title.trim().split(/\s+/).filter(Boolean);
  // Lines of about 12 characters, broken at word breaks the way the TV breaks them.
  let rows = 0;
  let cur = "";
  for (const w of words) {
    if (cur && `${cur} ${w}`.length > 12) {
      rows++;
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) rows++;
  const chars = words.join(" ").length;
  if (rows > 2) out.push(`The title takes about ${rows} lines on the TV. Two lines of about 12 characters fit.`);
  else if (chars > 24) out.push(`The title is ${chars} characters. About 24 fit (two lines of 12).`);
  const lineWords = line.trim().split(/\s+/).filter(Boolean).length;
  if (lineWords > 10) out.push(`The line under it is ${lineWords} words. About 10 fit on one line.`);
  return out;
}
