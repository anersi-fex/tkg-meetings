# Team meeting slides: the brand guide

**Approved by the owner on 2026-11-04:** "I actually love all these slides, and this is an awesome brand guide. I want you to just move forward with this." Every team meeting slide follows this guide, whoever or whatever makes it (a session, the Meetings app, a hand edit).

- **The reference deck:** https://claude.ai/artifact/7ic1ijVaJ97r6U1cScfWhG (12 slides, one per layout).
- **The templates:** `brand/slides/NN-<layout>.html`, one per layout, in the Slides artifact format (one `<section>`, inline styles only). A new slide starts as a copy of its layout's template.
- **The picture:** `brand/slides/contact-sheet.png`. Re-render with `node scripts/render-slides.mjs`.

## The rules of thumb

1. **One idea per slide.** A short title and at most three short lines under it. Everything else goes in the speaker notes, which say what the owner says out loud.
2. **His words, shortened.** Slides use the owner's own phrasing, cut down. Quotes keep his words exactly, in curly quotes. Never invent a number, a percentage, a date, a name, a quote or a promise.
3. **Dark for talking, red for the big moments.** The cover, the big news of a section and the closing quote are red. Everything else is dark, like the Scorecard TV. Red slides make up about a third of a deck at most, never two in a row.
4. **Numbers go huge.** Money, counts and percentages are set in Space Grotesk, big, with a short label under them. A number on a slide comes from a real source (Scorecard, the owner's own words) or wears the amber TBD pill.
5. **Each color means one thing.** Coral and red: TKG and the one thing to look at. Green: a goal hit or good news. Amber: not decided yet. Gray: the rest. A dashed outline: not here yet.
6. **The same frame on every slide.** An eyebrow at the top left (section number and name), the title right under it at the top margin, and the footer pinned at the bottom: the Meetings by TKG lockup on the left, the slide number on the right. The cover has no slide number.
7. **Readable from the back of the room.** Nothing under 26px on the 1920 by 1080 canvas. Talking lines are 56px. Only script lines and secondary lines go down to 36px.
8. **A picture when the idea has a shape.** Math becomes a chart, who sits where becomes a diagram, things with prices become cards, an order becomes a step chain, words to say become a script.

## The canvas

- 1920 by 1080, padding `128px 128px 160px` (the bottom leaves room for the footer), so the content area is 1664 by 792.
- Every section sets `background`, `color`, `font-family`, and `display:flex; flex-direction:column` with a `gap` of 40 or 48px.
- The footer is one pinned row: `position:absolute; left:128px; bottom:64px; width:1664px; height:40px`. Copy it from any template; change only the slide number.

## Colors

| Use | Hex |
| --- | --- |
| Dark slide background | `#0b0d12` |
| Card, panel, client row | `#141823` |
| Raised fill (bar track, gray avatar) | `#1b2030` |
| Hairline, rail, quiet slice | `#262c3b`, `#2e3445`, `#1d2230` |
| Arrow shapes, dashed outlines | `#4a5268` (`#3a4256` for an avatar ring) |
| Main text on dark | `#eef0f5` |
| Second text on dark | `#c3c8d4` |
| Labels, notes, subtitles on dark | `#a3a9b8` |
| Footer text | `#8c93a5` (the word "Meetings" `#c3c8d4`) |
| Eyebrow and accent text on dark | `#ff8a78` |
| Accent color (a coral word, the rep icon) | `#ff6b57` |
| Accent gradient (badges, dots, bars, number text, mark) | `linear-gradient(135deg, #e5484d, #ff8a5c)`; the bar runs at `90deg` |
| Red slide background | `linear-gradient(135deg, #9e2229 0%, #c42b32 55%, #e04a43 100%)` |
| Text on red | `#fff6f4`; second text and eyebrow `#ffe4df` |
| Key line glow (dark statement) | `radial-gradient(circle at 82% 22%, #2c1416 0%, #0b0d12 58%)` |
| Goal hit pill | text `#86efac` on `#143221` |
| TBD pill | text `#fcd34d` on `#3d2a0a` |
| Owner avatar in a list | text `#fca5a5` on `#3a1a1a`; Mark: text `#b4c4ff` on `#1c2543` |
| Digits on a gradient badge | `#0b0d12` |

On a red slide nothing is coral or green: text is `#fff6f4` or `#ffe4df`, and the footer mark turns white with a red bubble.

## Type

Two faces from Google Fonts: **Plus Jakarta Sans** for words, **Space Grotesk** for numbers (big numbers, prices, badges, slide numbers). Five sizes only:

| Size | Used for | Weight | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| 176px | A statement, the cover title, a hero number | 800 (numbers 700) | 1 | -6px |
| 96px | Slide titles, a quote, prices | 800 (prices 700) | 1.05 (quote 1.1, prices 1) | -3px |
| 56px | Talking lines, agenda rows, chain names | 500 to 800 | 1.2 | normal |
| 36px | Labels, subtitles, script lines, card names | 500 to 800 (a client line is 500 italic) | 1.4 | normal |
| 26px | Eyebrows (uppercase, 4px spacing, 800), pills, the footer | 600 to 800 | normal | eyebrow 4px |

- Bold the lead words of a talking line in `#eef0f5` and leave the rest `#c3c8d4`.
- Titles of content slides are short topic phrases with no period: "The 90-day rule". Statements are full sentences with a period: "Everybody's getting a raise."
- Use curly quotes and apostrophes (’ “ ”) in everything people read.

## The pieces

- **Eyebrow:** `<p>` 26px, 800, uppercase, letter-spacing 4px, `#ff8a78` (on red `#ffe4df`). It reads "N · Section name" with the agenda number, or a plain word on the cover, agenda and closing.
- **Title:** `<h2>` 96px, 800, line-height 1.05, letter-spacing -3px. An optional subtitle `<p>` 36px `#a3a9b8` sits under it (eyebrow, title and subtitle share one column with a 16px gap).
- **Number badge:** a `<p>` of 64 by 64, radius 18, the accent gradient, Space Grotesk 36px 700 in `#0b0d12`, `line-height:64px; text-align:center`. A gray badge (`#262c3b`, digits `#c3c8d4`) marks a rare last step.
- **Dot:** 20 by 20, radius 10, the accent gradient, lined up with the first line of a 56px row.
- **Card and panel:** `#141823`, radius 32, padding 40 (a panel of rows: `16px 40px`; a client row in a script: radius 20). Rows inside a panel are split by a `2px solid #262c3b` top border.
- **Pills:** fully round (`border-radius:999px`), padding `8px 20px` at 26px, or `14px 32px` at 36px. Green for a goal hit, amber for TBD.
- **Progress bar:** a 28px track `#1b2030` with a fill in the accent gradient at `90deg`, both radius 14.
- **Avatars:** the owner is a gradient circle with "AK" in `#0b0d12`. Teammates are `#1b2030` circles with a `#3a4256` ring and a person glyph. People who are not here yet are dashed `#4a5268` circles with a "+".
- **Rep and client icons (as in Sales Coach):** the rep is a `#ff6b57` circle with a `#fff6f4` headset, the client a `#eef0f5` circle with a `#0b0d12` person. Both are 56px.
- **Icons:** simple line drawings in `#ff8a78`, 64px, stroke 5, round caps.
- **The marks:** the Meetings mark (a white speech bubble with three cut-out lines on the gradient squircle, radius 11 at 40px) and the real TKG letters. Copy both SVGs from a template; never type "TKG" as text in the lockup.

## The 12 layouts

Pick the layout from what the thought is. Each one has its template.

| # | Layout | Background | Use it for | Limits | Template |
| --- | --- | --- | --- | --- | --- |
| 1 | Cover | Red | The start of every meeting | A title of 12 characters a line at most; one 56px line of what it covers, 10 words at most | `01-cover.html` |
| 2 | Scoreboard | Dark | A live number from Scorecard: the month, the goal, the pace | One hero number, one label, one pill, the bar. Numbers only from Scorecard | `02-scoreboard.html` |
| 3 | Agenda | Dark | What today covers | 5 rows at most, each 32 characters at most | `03-agenda.html` |
| 4 | Big news | Red | The one announcement of a section | One sentence of 30 characters at most, plus one 56px line | `04-big-news.html` |
| 5 | Big number | Dark | A rule or fact built on one number | One number in a card (with a TBD pill if needed), 3 lines at most | `05-big-number.html` |
| 6 | Chart | Dark | Math: shares, splits, a formula | One chart and 3 lines of math. A drawn split that is not real data says so in the notes | `06-chart.html` |
| 7 | Key line | Dark | A line to remember that is not an announcement | One sentence at 176px with one coral word, plus one 56px line | `07-key-line.html` |
| 8 | Diagram | Dark | Who sits where, how people connect | 3 tiers at most, then a 36px rule and a 56px takeaway | `08-diagram.html` |
| 9 | Price cards | Dark | Things with prices or counts | 4 cards at most, plus one full-width strip | `09-price-cards.html` |
| 10 | Step chain | Dark | An order of operations | 6 steps at most; the last-resort step wears a gray badge | `10-step-chain.html` |
| 11 | Script | Dark | Words to say on a call | 6 rows at most; the full script goes in the notes | `11-script.html` |
| 12 | Quote | Red | The owner's own words to close | One quote of about 60 characters at most, his name under it | `12-quote.html` |

Too much for a layout's limits? Split it into two slides of the same layout, or move the rest into the notes. Nothing shrinks below the type sizes above.

## A meeting deck, in order

1. Cover.
2. Scoreboard: the month so far, or how the last month ended.
3. Agenda: the sections, numbered.
4. Each section in agenda order: its big news or key line first if it has one, then its supporting layouts. Every slide's eyebrow carries the section's number and name.
5. Housekeeping (chains, scripts) last before the close.
6. Quote to close.

## Speaker notes

Every slide has notes (the `<aside>`, the section's last child):

- The first line names the layout: "Layout: Big number."
- Then "You say:" and the owner's talking points for that slide, in his words.
- Then "Open:" and anything not decided yet (a percentage, an amount, a date).
- A script slide carries the whole script in its notes.
