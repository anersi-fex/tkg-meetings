import { switchLayout, type ContentLayout, type ContentSlide } from "./slides";

/**
 * The editor's memory while the owner tries layouts on one slide (browser-safe, pure). Going back
 * to a layout he already tried gives back exactly what it had (his number, TBD pill, bold marks),
 * not a rebuild from another layout's words.
 *
 * The speaker notes belong to the thought: what he types in them comes along to every layout. A
 * layout he goes back to gets its own notes back when he hasn't typed since he left it, and a new
 * layout is built from his own notes, so lines one layout added to them (what didn't fit it) never
 * follow him to another.
 */
export type Kept = {
  /** The last version of each layout he left, and how many times he had typed in the notes by then. */
  by: Partial<Record<ContentLayout, { slide: ContentSlide; rev: number }>>;
  /** The speaker notes as the slide opened, or as he last typed them (never a layout's extras). */
  own: string;
  /** Goes up each time he types in the speaker notes. */
  rev: number;
};

export function keepOf(slide: ContentSlide): Kept {
  return { by: {}, own: slide.notes, rev: 0 };
}

/** He typed in the speaker notes: from now on they are his, on every layout. */
export function typedNotes(kept: Kept, notes: string): Kept {
  return { ...kept, own: notes, rev: kept.rev + 1 };
}

/** The slide he gets when he picks another layout, and the memory for the next pick. */
export function pickLayout(slide: ContentSlide, kept: Kept, to: ContentLayout): { next: ContentSlide; kept: Kept } {
  if (slide.layout === to) return { next: slide, kept };
  const left = kept.by[to];
  const next = left ? (left.rev === kept.rev ? left.slide : { ...left.slide, notes: kept.own }) : switchLayout({ ...slide, notes: kept.own }, to);
  return { next, kept: { ...kept, by: { ...kept.by, [slide.layout]: { slide, rev: kept.rev } } } };
}
