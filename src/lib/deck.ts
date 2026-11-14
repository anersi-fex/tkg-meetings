import { formatDollars, percentNotHit, percentOf } from "./money";
import { monthName } from "./month";
import { fallbackSection, isRed, shownNotes, slideHeadline, type ContentSlide, type DrawnSlide, type KeyLineSlide, MAX_ROWS } from "./slides";

/**
 * The deck builder: the meeting and the thoughts switched on become the slides the TV shows, in
 * the order brand/SLIDES.md sets ("A meeting deck, in order"):
 *   cover, scoreboard (when on and Scorecard answered), agenda (two sections or more), each
 *   section in agenda order, Housekeeping last, the closing quote.
 * A section keeps his order of thoughts, each thought's slides together; the first thought that
 * holds a Big news opens it, news first, and a second Big news in the same section shows as a Key
 * line (the guide: one Big news a section). And the guide's rules: five sections at most (the rest
 * fold into Housekeeping), red slides a third of the deck at most and never two in a row (a Big
 * news that breaks it becomes a Key line with the same words), every content slide's eyebrow
 * "N · Section" ("Section" alone when there is no Agenda to number). The deck's copy of a drawn
 * chart's notes opens with "The slices are a drawing, not real numbers." (the stored notes never
 * hold it). Pure and browser-safe.
 */

export const OWNER_FULL_NAME = "Anersi Koka";
export const HOUSEKEEPING = "Housekeeping";

export interface DeckMeeting {
  title: string;
  /** "YYYY-MM-DD" or null when not set. */
  meetsOn: string | null;
  /** The cover's line; empty means made from the section names. */
  coverLine: string;
  scoreboard: boolean;
  /** The closing quote (his own words), or null for none. */
  quote: { text: string; name: string } | null;
}

export interface DeckItem {
  id: string;
  section: string;
  slides: ContentSlide[];
  /** His title for the thought (the card's), which names a thought with no section; else its first slide does. */
  title?: string;
}

export interface ScoreSnapshot {
  /** "2026-10" */
  monthKey: string;
  totalCents: number;
  goalCents: number;
  policies: number;
  /** The month is over (the meeting looks back at it). */
  final: boolean;
  /** Scorecard's own words for the days left ("3 business days left"). */
  daysLeft: string;
  /** "YYYY-MM-DD" the numbers were read. */
  readOn: string;
}

export interface BuiltDeck {
  slides: DrawnSlide[];
  /** The agenda's sections, in order. */
  sections: string[];
  /** For each slide, the thought it came from (null for the cover, scoreboard, agenda, quote). */
  itemOfSlide: (string | null)[];
  /** Plain-words notes for the phone ("6 topics: the last 2 folded into Housekeeping"). */
  warnings: string[];
}

const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five"];

export function cleanSection(name: string): string {
  const s = name.replace(/\s+/g, " ").trim().slice(0, 40);
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

const sameSection = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** "Your raise, bonuses, and who writes the policy." from the section names. */
export function coverLineFor(sections: string[]): string {
  if (!sections.length) return "";
  const lower = (s: string, i: number) => (i === 0 || /^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
  const parts = sections.map(lower);
  const joined = parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  const words = joined.split(/\s+/).length;
  if (words > 10) return `${NUMBER_WORDS[Math.min(5, sections.length)] || sections.length} things for the team today.`;
  return `${joined}.`;
}

/** "November 2026" for the cover's eyebrow. */
function monthYear(date: string): string {
  return `${monthName(date.slice(0, 7))} ${date.slice(0, 4)}`;
}

export function scoreboardSlide(s: ScoreSnapshot): DrawnSlide {
  const month = monthName(s.monthKey);
  const hit = s.goalCents > 0 && s.totalCents >= s.goalCents;
  // Not hit yet never reads 100% (99.6% is "99%"), so the gray pill and the bar agree with the title;
  // otherwise the percent is rounded as Scorecard's own board rounds it.
  const pct = s.goalCents > 0 ? (hit ? percentOf(s.totalCents, s.goalCents) : percentNotHit(s.totalCents, s.goalCents)) : null;
  const title = hit ? "We hit the goal" : s.final ? `${month} final` : `${month} so far`;
  const policies = `${s.policies} ${s.policies === 1 ? "policy" : "policies"}`;
  return {
    layout: "scoreboard",
    eyebrow: `${month} · Live from Scorecard`,
    title,
    number: formatDollars(s.totalCents),
    line: s.goalCents > 0 ? `of the ${formatDollars(s.goalCents)} goal · ${policies}` : policies,
    pill: hit ? `Goal hit · ${pct}%` : pct == null ? "" : s.final ? `${pct}% of goal` : `${pct}% · ${s.daysLeft}`,
    pillTone: hit ? "green" : "gray",
    pct: pct == null ? null : Math.min(100, pct),
    notes: `${month}${s.final ? " final" : " so far"}, read from Scorecard on ${s.readOn}: ${formatDollars(s.totalCents)}${s.goalCents > 0 ? ` of the ${formatDollars(s.goalCents)} goal` : ""}, ${policies}.`,
  };
}

function asKeyLine(s: Extract<ContentSlide, { layout: "big_news" }>): KeyLineSlide {
  return { layout: "key_line", statement: s.statement, coral: "", line: s.line, notes: s.notes };
}

/** A thought's slides with its first Big news moved to the front (the rest keep their order). */
function newsFirst(slides: ContentSlide[]): ContentSlide[] {
  const at = slides.findIndex((s) => s.layout === "big_news");
  return at > 0 ? [slides[at], ...slides.filter((_, i) => i !== at)] : slides;
}

export function buildDeck(meeting: DeckMeeting, items: DeckItem[], score: ScoreSnapshot | null, today: string): BuiltDeck {
  const warnings: string[] = [];

  // Sections in order of first appearance; a thought with no section (he cleared it) is named the
  // way a fallback draft names it: topic words from his title, or "Ideas".
  const named = items
    .filter((it) => it.slides.length > 0)
    .map((it) => ({ ...it, section: cleanSection(it.section) || fallbackSection(it.title?.trim() || slideHeadline(it.slides[0])) }));
  let sections: string[] = [];
  for (const it of named) if (!sections.some((s) => sameSection(s, it.section))) sections.push(it.section);

  // Five sections at most: the rest fold into Housekeeping (the guide's rule).
  if (sections.length > MAX_ROWS.agenda) {
    const keep = sections.filter((s) => !sameSection(s, HOUSEKEEPING)).slice(0, MAX_ROWS.agenda - 1);
    const folded = sections.filter((s) => !keep.some((k) => sameSection(k, s)) && !sameSection(s, HOUSEKEEPING));
    warnings.push(`${sections.length} topics: the agenda holds 5, so ${folded.length === 1 ? `"${folded[0]}" went` : `${folded.length} of them went`} under ${HOUSEKEEPING}.`);
    for (const it of named) if (!keep.some((k) => sameSection(k, it.section))) it.section = HOUSEKEEPING;
    sections = [...keep, HOUSEKEEPING];
  }
  // Housekeeping comes last before the close.
  const hk = sections.findIndex((s) => sameSection(s, HOUSEKEEPING));
  if (hk >= 0 && hk !== sections.length - 1) sections = [...sections.filter((_, i) => i !== hk), sections[hk]];

  const slides: DrawnSlide[] = [];
  const owners: (string | null)[] = [];
  const push = (s: DrawnSlide, item: string | null) => {
    slides.push(s);
    owners.push(item);
  };

  const date = meeting.meetsOn || today;
  push(
    {
      layout: "cover",
      eyebrow: `The Koka Group · ${monthYear(date)}`,
      title: meeting.title.trim() || "Team meeting",
      line: meeting.coverLine.trim() || coverLineFor(sections),
      footer: `${OWNER_FULL_NAME} · Troy, MI`,
      notes: "The meeting's name, the month, and what it covers.",
    },
    null,
  );
  if (meeting.scoreboard && score) push(scoreboardSlide(score), null);
  if (sections.length >= 2) {
    push(
      {
        layout: "agenda",
        eyebrow: "Today",
        title: `${NUMBER_WORDS[sections.length]} things`,
        rows: sections,
        notes: `The ${sections.length} sections of the meeting, in order.`,
      },
      null,
    );
  }

  sections.forEach((name, si) => {
    // The number points at an Agenda row; with no Agenda (one section) the eyebrow is the name alone.
    const eyebrow = sections.length >= 2 ? `${si + 1} · ${name}` : name;
    const mine = named.filter((it) => sameSection(it.section, name));
    // The first thought that holds a Big news opens the section, its news first. Every thought
    // keeps its slides together (a Big number stays right after its news), in the owner's order.
    const lead = mine.findIndex((it) => it.slides.some((s) => s.layout === "big_news"));
    const ordered = lead > 0 ? [mine[lead], ...mine.filter((_, i) => i !== lead)] : mine;
    let hasNews = false;
    ordered.forEach((it, ti) => {
      for (const s of ti === 0 && lead >= 0 ? newsFirst(it.slides) : it.slides) {
        let slide: ContentSlide = s;
        if (s.layout === "big_news") {
          // One Big news a section (the guide): a second one shows as a Key line with its words.
          if (hasNews) {
            slide = asKeyLine(s);
            warnings.push(`Two Big news slides in “${name}”: the first stays red, the other shows as a Key line.`);
          }
          hasNews = true;
        }
        // The notes he reads on the TV day: a drawn chart's say so first (never stored, see shownNotes).
        push({ ...slide, notes: shownNotes(slide), eyebrow, itemId: it.id }, it.id);
      }
    });
  });

  if (meeting.quote && meeting.quote.text.trim()) {
    push({ layout: "quote", eyebrow: "From me", quote: meeting.quote.text.trim(), name: meeting.quote.name || OWNER_FULL_NAME, notes: "Your own words, to close." }, null);
  }

  // Red slides: never two in a row, a third of the deck at most. A Big news that breaks either
  // rule becomes a Key line with the same words; the cover and the quote always stay red.
  const demote = (i: number) => {
    const s = slides[i];
    if (s.layout !== "big_news") return false;
    slides[i] = { ...asKeyLine(s), eyebrow: s.eyebrow, ...(s.itemId ? { itemId: s.itemId } : {}) };
    return true;
  };
  // Left to right, the later of two red slides gives way: a Big news right after a red slide
  // becomes a Key line. The slide after it counts only when that one can never change (the
  // quote), so an earlier, bigger news keeps its red slide.
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].layout !== "big_news") continue;
    const prevRed = i > 0 && isRed(slides[i - 1]);
    const next = slides[i + 1];
    const nextStaysRed = !!next && isRed(next) && next.layout !== "big_news";
    if (prevRed || nextStaysRed) {
      demote(i);
      warnings.push(`A Big news slide sat next to another red slide, so it shows as a Key line.`);
    }
  }
  const tooRed = () => slides.filter(isRed).length * 3 > slides.length;
  for (let i = slides.length - 1; i >= 0 && tooRed(); i--) {
    if (demote(i)) warnings.push(`Too many red slides for one deck, so a Big news shows as a Key line.`);
  }

  const total = slides.length;
  return {
    slides: slides.map((s, i) => ({ ...s, index: i + 1, total })),
    sections,
    itemOfSlide: owners,
    warnings: [...new Set(warnings)],
  };
}
