# Team meeting slides: the brand guide

**Approved by the owner on 2026-11-04:** "I actually love all these slides, and this is an awesome brand guide. I want you to just move forward with this." Every team meeting slide follows this guide, whoever or whatever makes it: a session, the Meetings app, or a hand edit.

- **The reference deck:** https://claude.ai/artifact/7ic1ijVaJ97r6U1cScfWhG. It has 12 slides, one per layout.
- **The templates:** `brand/slides/NN-<layout>.html`, one per layout, in the Slides artifact format (one `<section>`, inline styles only). A new slide starts as a copy of its layout's template.
- **The deck file:** `brand/slides/deck.json`. `order` lists the slides by section `id`, `cover` names the first, `sections` gives each agenda section a one-line description in the owner's words and its first slide, and `faces` loads Plus Jakarta Sans (400 to 800, with italics) and Space Grotesk (400 to 700) from Google Fonts. A new deck copies it and changes `title`, `order` and `sections`.
- **The picture:** `brand/slides/contact-sheet.png`. `node scripts/render-slides.mjs` writes it to `build/slides/`; copy it over when a template changes. For new slides, `node scripts/render-slides.mjs <outDir> <slide.html ...>` writes one PNG per slide; check those.

## The rules of thumb

1. **One idea per slide.** A short title and at most three short lines under it. The list layouts take more rows, up to their limits (Agenda 5, Step chain 6, Script 6, Price cards 4 and a strip). Everything else goes in the speaker notes. A thought with two ideas: the first gets the slide and the second goes in its notes, unless the second has its own shape (a number, an order, words to say); then it gets the next slide in the same section.
2. **His words, shortened.** Slides use the owner's own phrasing, cut down. Cutting drops filler, never a person or group, a condition, an amount or a date ("new or remote people" stays whole). Keep the team's own shorthand as he says it ("the Social", "MIB", "apps"). Drop "like", "you know" and swearing. Something he might do ("might", "look at", "thinking about") is never shown as a fact or a promise: it goes under Open in the notes, or on the slide with the amber TBD pill. Never invent a number, a percentage, a date, a name, a quote or a promise.
3. **Dark for talking, red for the big moments.** The cover, a section's big news and the closing quote are red. Everything else is dark, like the Scorecard TV. Red slides make up a third of a deck at most, and two are never in a row. Big news is a decided announcement: a question or an idea he is floating is dark, never red, and a section does not need a red slide. When a Big news would sit next to another red slide or push red past a third, it becomes a Key line with the same words. The cover and the closing quote always stay red.
4. **Numbers go huge.** The number a slide is about is set in Space Grotesk 700, big (176px for a hero number, 96px for a price), with a short label under it. A number inside a sentence, a label or a pill stays in that line's face and size ("after 90 working days", "Goal hit · 100%"). A sales number (premium, policies, a person's month) always comes from Scorecard, even when he says it out loud; if the two differ, Scorecard's number shows. Any other number comes from his own words, or wears the amber TBD pill.
5. **Each color means one thing.** Coral and red: TKG, the one thing to look at, and the markers that order a slide (eyebrows, number badges, dots, icons). Green: a goal hit or good news. Amber: not decided yet. Blue: Mark's initials only. Gray: the rest. A dashed outline: not here yet. On a red slide nothing is coral, green or amber, so a red slide never holds an open item: say the news without it ("Everybody’s getting a raise.") and put the `[X]` and its TBD pill on the next dark slide.
6. **The same frame on every slide.** Content slides: the eyebrow at the top left, the `<h2>` title right under it, the body below. Statement slides (Big news, Key line, Quote): the eyebrow at the top left, then an empty `<div style="flex:1"></div>`, so the `<h1>` and its line sit at the bottom, above the footer. The cover: the TKG letters at the top left, the eyebrow, title and line together at the bottom. Every slide but the cover has the footer: the Meetings by TKG lockup on the left, the slide number on the right.
7. **Readable from the back of the room.** Nothing under 26px on the 1920 by 1080 canvas. Talking lines are 56px. Labels, subtitles, card and tier names, script lines, badge digits and the quote's name are 36px. Only eyebrows, small pills, list avatars' initials and the footer are 26px.
8. **A picture when the idea has a shape.** Math becomes a chart, who sits where becomes a diagram, things with prices become cards, an order becomes a step chain, words to say become a script. Pictures come only from the pieces below: no photos, carrier logos, screenshots or emoji. Carriers are words.
9. **Privacy.** No client names, policy numbers, birthdates, health details or contact details on a slide or in its notes, even when he says them; write "a client". Teammates by first name only, and only when he names them. A win names the person. A correction names nobody on the slide: it becomes a rule for everyone, and the name stays in the notes.
10. **Names as Scorecard has them.** Teammates and carriers are spelled as in Scorecard (the team list; Settings > Carriers: AHL, AmAm, Americo, Foresters, Newbridge, Royal, UHL). A carrier is written in full when it fits the layout's limit, else by its short name. A name on neither list waits for the owner's check before it shows.

## The canvas

- 1920 by 1080, padding `128px 128px 160px` (the bottom leaves room for the footer), so the content area is 1664 by 792. The canvas is fixed: on any other screen the whole slide scales by one factor (screen width ÷ 1920), letterboxed in `#0b0d12`, and nothing reflows. Slides have no light mode, whatever the Scorecard TV look says.
- Every section has an `id` (a short lowercase word, unique in the deck, the slide's key in `deck.json` `order`) and sets `background`, `color` (`#eef0f5` dark, `#fff6f4` red), `font-family:'Plus Jakarta Sans', Arial, sans-serif`, the padding above and `display:flex; flex-direction:column`. Copy the template's other `<section>` attributes as they are: the Cover, Big news, Key line and Quote carry `data-transition="fade"`.
- Section gap: 48px on Scoreboard, Agenda, Big number, Chart and Diagram; 40px on Big news, Key line, Price cards, Step chain, Script and Quote. The cover sets no gap and uses `justify-content:space-between`.
- Where the body sits: list layouts (Agenda, Price cards, Step chain, Script) sit right under the header. Picture layouts (Big number, Chart, Diagram) give the body `flex:1` and center it. The Scoreboard and the statements push their main block to the bottom with a `<div style="flex:1"></div>`.
- **The footer** is one pinned row: `position:absolute; left:128px; bottom:64px; width:1664px; height:40px; display:flex; align-items:center; justify-content:space-between`. Copy it from a template with the same background. Dark slides copy 02: the gradient squircle, "Meetings" and the TKG letters in `#c3c8d4`, "by" and the number in `#8c93a5`. Red slides copy 04 or 12: a solid `#fff6f4` squircle with a `#c42b32` bubble, and "Meetings by", the TKG letters and the number all in `#ffe4df`. The slide number is the slide's place over the deck's total, two digits each (`05 / 12`), Space Grotesk 26px 600. The cover's footer is only "Anersi Koka · Troy, MI" (26px, 700, `#ffe4df`).
- **SVG ids:** every gradient id in a deck is unique. End it with the section id: `mk-<id>` for the footer mark, `pie-<id>` for a chart.

## Colors

| Use | Hex |
| --- | --- |
| Dark slide background | `#0b0d12` |
| Card, panel, client row | `#141823` |
| Raised fill (bar track, teammate avatar) | `#1b2030` |
| Hairline, gray badge | `#262c3b` |
| Step chain rail | `#2e3445` |
| Pie slices that are not the highlight | alternate `#262c3b` and `#1d2230` |
| Arrow shapes, dashed outlines | `#4a5268` (`#3a4256` for a teammate's ring) |
| Main text on dark | `#eef0f5` |
| Second text on dark; labels under a big number or price; card names | `#c3c8d4` |
| The Scoreboard line under its number, subtitles, rule lines, a step's side note, the client row | `#a3a9b8` |
| Quiet text: the footer's "by" and number, the "+" in an empty seat, an aside in a script line | `#8c93a5` |
| Eyebrow, icons, operators, accent text on dark | `#ff8a78` |
| Accent color: one coral word, the rep icon | `#ff6b57` |
| Accent gradient: badges, dots, bars, the owner's avatar, the mark | `linear-gradient(135deg, #e5484d, #ff8a5c)`; the bar runs at `90deg` |
| Red slide background | `linear-gradient(135deg, #9e2229 0%, #c42b32 55%, #e04a43 100%)` |
| Text on red | `#fff6f4`; second text, eyebrow and footer `#ffe4df` |
| Key line glow (the dark statement background) | `radial-gradient(circle at 82% 22%, #2c1416 0%, #0b0d12 58%)` |
| Goal hit pill | text `#86efac` on `#143221` |
| Not hit yet pill | text `#c3c8d4` on `#262c3b` |
| TBD pill | text `#fcd34d` on `#3d2a0a` |
| Owner's initials in a list | text `#fca5a5` on `#3a1a1a` |
| Mark's initials in a list | text `#b4c4ff` on `#1c2543` |
| Digits and initials on the gradient | `#0b0d12` |

Big numbers are `#eef0f5` (the Scoreboard number also has `font-variant-numeric:tabular-nums`). Only the Big number layout's number, and the one number to look at in a row of price cards, wear the gradient: `background:linear-gradient(135deg, #e5484d, #ff8a5c); background-clip:text; -webkit-text-fill-color:transparent; color:#ff6b57` (the color is the fallback).

## Type

Two faces from Google Fonts: **Plus Jakarta Sans** for words, **Space Grotesk** for hero numbers, prices, badge digits and slide numbers. Five sizes only:

| Size | Used for | Weight | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| 176px | A statement, the cover title, a hero number | 800 (numbers 700) | 1 | -6px |
| 96px | Slide titles, the closing quote, prices | 800 (prices 700) | 1.05 (quote 1.1, prices 1) | -3px |
| 56px | Talking lines, agenda rows, chain names | A talking line with bold words 500; the line under a statement or the cover title 600; a math line 600, its first line 800; agenda rows 700; chain names and a diagram takeaway 800 | 1.2 | normal |
| 36px | Labels, subtitles, script lines, card and tier names, badge digits, the quote's name | 500 to 800 (a client line 500 italic) | 1.4 on anything that can wrap; normal on one-line labels, names and pills | normal |
| 26px | Eyebrows, small pills, list initials, the footer | 600 to 800 | normal | eyebrow 4px |

- **Titles** of content slides are one line, 34 characters at most: a short topic phrase or a short instruction, with no period ("The 90-day rule", "Stop over-explaining the Social ask"). Cut words only when the title does not fit.
- **Statements** end every sentence with a period and may be short fragments: "Everybody’s getting a raise.", "Paid in cash. Today."
- **A question he puts to the room** keeps its question mark. With a shape (a split, numbers to compare) it takes that layout, and the question is the 36px subtitle in his words ("Would you be interested?"). With no shape it is a Key line ending in "?". Never Big news.
- **Bold words** in a talking line: `<b><span style="color:#eef0f5">…</span></b>` anywhere in the line, the rest `#c3c8d4` at 500. In math lines the bold operators (÷, =, "or" for whichever is greater) are `#ff8a78`.
- **Curly quotes and apostrophes** (’ “ ”) in everything people read.

## The pieces

- **Eyebrow:** a `<p>`, 26px, 800, uppercase, letter-spacing 4px, `#ff8a78` (on red `#ffe4df`). On section slides it reads "N · Short name": the agenda number and 1 to 3 words from that agenda row, the same on every slide of the section ("1 · Your raise", "5 · Housekeeping"). Elsewhere: the cover "The Koka Group · Month Year", the Scoreboard "Month · Live from Scorecard", the Agenda "Today", the Quote "From me".
- **Title:** content slides use an `<h2>`: 96px, 800, line-height 1.05, letter-spacing -3px, `#eef0f5`. An optional subtitle `<p>` sits under it: 36px, 600, line-height 1.4, `#a3a9b8`. Eyebrow, title and subtitle share one column with a 16px gap. The Cover, Big news and Key line use an `<h1>` at 176px (800, line-height 1, -6px). The Quote uses an `<h1>` at 96px (line-height 1.1), `width:1500px`.
- **Number badge:** a `<p>`, 64 by 64, radius 18, the accent gradient, Space Grotesk 36px 700 in `#0b0d12`, `line-height:64px; text-align:center`. A gray badge (`#262c3b`, digits `#c3c8d4`) marks only the true last resort of a chain.
- **Dot:** 20 by 20, radius 10, the accent gradient, inside `<div style="padding:24px 0 0 0">` so it lines up with the first line of a 56px row. The row is `align-items:start; gap:28px`, and rows are 44px apart.
- **Cards:** `#141823`, radius 32. A price card: padding 40, `flex:1`, a column with a 20px gap (icon, price, name), cards 24px apart. The Big number card: padding 48, `width:620px`, a column with `justify-content:center` and a 16px gap, its pill `align-self:flex-start`. The full-width strip: padding `24px 40px`, a row with a 28px gap (64px icon, 36px 700 `#eef0f5` text).
- **Agenda panel:** `#141823`, radius 32, padding `16px 40px`. Rows are `padding:14px 0`, badge to text 32px, `align-items:center`, and each row after the first has a `2px solid #262c3b` top border.
- **Step chain panel:** the same panel with `position:relative` and no row borders. Rows are `padding:6px 0`, gap 24px, names and side notes `white-space:nowrap`. Its first child is the rail: `position:absolute; left:70px; top:56px; width:4px; border-radius:2px; background:#2e3445`, with a height of 79 × (steps − 1) − 1 (394 for 6 steps, 315 for 5, 236 for 4, 157 for 3).
- **Rule:** `<hr style="border-top:2px solid #262c3b;width:880px">`. The deck viewer draws only the top stroke; a plain browser also draws its default border under it, which `scripts/render-slides.mjs` removes. (The slide format refuses `border:0`: a border needs its style word.)
- **Pills:** fully round (`border-radius:999px`), 800, `white-space:nowrap`, `align-self:flex-start` in a column. Padding `8px 20px` at 26px (in a card or under a rule), or `14px 32px` at 36px (beside the Scoreboard number). A TBD pill names the open item in his words, then " · TBD". When the open item is a value inside a phrase, `[X]` stands where the value goes ("[X]% raise on commission · TBD"); when the whole thing is open, name it ("Bonus amounts · TBD"). Never a guessed value.
- **Progress bar:** a 28px track `#1b2030` with `overflow:hidden`, and a fill in the accent gradient at `90deg`, both radius 14. The fill's `width` is the percent of the goal from Scorecard (`width:73%`); leave it out at 100% or more.
- **Avatars:** in a diagram the owner is a 160px gradient circle with "AK" 56px 800 in `#0b0d12` (`line-height:160px`). Teammates are 120px `#1b2030` circles with a `2px solid #3a4256` ring and a 64px person glyph in `#c3c8d4`, 20px apart. People not here yet are 76px circles with a `2px dashed #4a5268` border and a "+" (36px 700 `#8c93a5`, `line-height:72px`), in a 3-column grid with 20px gaps. In a list row a person is a 56px circle with 26px 800 initials (`line-height:56px`): only the owner and Mark get initials. Anyone else wears the gray teammate avatar, never initials in a new tint.
- **Arrow:** `<x-shape kind="arrow-right" style="width:72px;height:36px;background:#4a5268"></x-shape>` between diagram tiers. The deck viewer draws it; never draw arrows in SVG.
- **Ring chart:** a 520px box, rings at `r=200` and `stroke-width:104` (the highlighted slice 116 in the gradient; with only two slices both 104), `pathLength="100"`, each slice `stroke-dasharray="<share − 1> <101 − share>"` with a negative running `stroke-dashoffset` (1-unit gaps), rotated -90° so it starts at 12 o'clock (9 o'clock for two halves). 6 slices at most. The center label is 56px 800 `#ff8a78` only when it names the reader ("You"), otherwise 36px `#a3a9b8`. Labels inside the ring are 36px 800, `#c3c8d4` on gray and `#0b0d12` on the gradient. The pie sits 96px from its math column, whose lines are 28px apart. A drawn split that is not real data says so in the notes.
- **Script rows:** a column with a 10px gap, not inside a panel. Each row is `padding:8px 16px; gap:24px; align-items:start`: the 56px icon, then a 36px line (line-height 1.4, `padding:3px 0 0 0`). A rep line is his words cut down (words dropped, none added or changed), 600 `#eef0f5`, in curly quotes, in script order. A side remark or an instruction to the rep goes after the line as a `#8c93a5` aside in parentheses ("(or your own name)", "(then just ask)"). A client row has the `#141823` fill and radius 20; its line says what the client does, in a few words in the third person, 500 italic `#a3a9b8` ("They tell you.", "They still say no."). Two client rows may follow each other. An objection slide starts with the client's row, the objection in their words and curly quotes, then up to five rep rows: one objection per slide.
- **Rep and client icons** (as in Sales Coach): the rep is a 56px `#ff6b57` circle with a `#fff6f4` headset, the client a 56px `#eef0f5` circle with a `#0b0d12` person.
- **Icons:** line drawings in `#ff8a78` on a 64 by 64 viewBox, stroke 5, round caps and joins, with small solid parts where they help (ear cups, a power dot). Only the drawn ones: headphones, mini PC, keyboard, mouse, monitor, teammate, rep, client, quote mark. Cards with nothing to draw have no icon, and all cards in a row match.
- **Cover parts:** the TKG letters (101 by 48, `#fff6f4`) at the top left; the speech-bubble watermark (600 by 600, `#fff6f4`, `opacity:0.14`) pinned at `left:1152px; top:150px`, listed first; at the bottom one column with a 32px gap: the eyebrow, the 176px `<h1>`, and a 56px 600 `#ffe4df` line at `width:1120px`.
- **Scoreboard parts:** after the header, a `flex:1` spacer, then a column with a 32px gap: a row (`align-items:flex-end; justify-content:space-between; gap:48px`) holding the 176px number with its 36px line under it (12px gap) and the 36px pill, then the bar.
- **Diagram parts:** tiers are columns 340, 500 and 460px wide (a 20px gap, the tier name 36px 800 `#eef0f5` centered under it) in a row with `justify-content:space-between; align-items:center; gap:24px; flex:1`, arrows between. Under it, one column with a 12px gap: the 36px 600 `#a3a9b8` rule line and the 56px 800 `#eef0f5` takeaway.
- **Quote parts:** the eyebrow "From me", a `flex:1` spacer, the SVG quote mark (150 by 110, `#ffe4df`, opacity 0.7), the quote, his full name at 36px 700 `#ffe4df`.
- **The marks:** the Meetings mark (a white speech bubble with three cut-out lines on the gradient squircle, radius 11 at 40px) and the real TKG letters. Copy both SVGs from a template. Never type "TKG" as text in the lockup.

## Picking a layout

Go down this list and take the first that fits:

1. Words to say on a call: **Script**.
2. An order of operations: **Step chain**.
3. Who sits where: **Diagram**.
4. The month from Scorecard: **Scoreboard**.
5. A split or a formula: **Chart**.
6. Two to four numbers or prices side by side (before and after, old first; this month and last; the same rule at each carrier; bonus tiers, lowest first, the reward as the number): **Price cards**.
7. One number (a date counts: "Dec 1"): **Big number**.
8. Something decided that changes for the team from now on (pay, a bonus, a rule, a person, a carrier): **Big news**. Its number, if it has one, goes on a Big number right after.
9. Anything else (a habit, a reminder, a mindset, a question, an idea): **Key line**.

With no number in his words or in Scorecard, never use Scoreboard, Big number, Price cards or Chart. When two fit, pick by what the team should remember: one number is a Big number, how money is split or worked out is a Chart, words to say is a Script. A section with two pieces of news: the bigger one (money first) is its Big news, the other a Key line.

## The 12 layouts

| # | Layout | Background | Use it for | Limits (count characters; never shrink the type) | Template |
| --- | --- | --- | --- | --- | --- |
| 1 | Cover | Red | The start of every meeting | Title 12 characters a line; one 56px line, 10 words at most | `01-cover.html` |
| 2 | Scoreboard | Dark | The month from Scorecard | One number, one 36px line, one pill, the bar. Only from Scorecard; if it doesn't answer, no Scoreboard slide. Goal hit: the green pill "Goal hit · N%". Not hit yet: the gray pill with "N% · " and Scorecard's days-left words (never amber or red), and a title that says the fact ("November so far") | `02-scoreboard.html` |
| 3 | Agenda | Dark | What today covers | 5 rows, 32 characters each | `03-agenda.html` |
| 4 | Big news | Red | The one decided announcement of a section | One sentence of 30 characters (2 lines of about 19), plus one 56px line of about 58 | `04-big-news.html` |
| 5 | Big number | Dark | A rule or fact built on one number | The number 5 characters ("$500", "100%", "$60k", "Dec 1"); a TBD pill if open; 3 lines of about 30 characters | `05-big-number.html` |
| 6 | Chart | Dark | A split or a formula | One ring chart; 3 math lines of 36 characters explaining the highlighted slice; then an optional rule, one 36px line (a fact about a gray slice goes here) and a TBD pill | `06-chart.html` |
| 7 | Key line | Dark, with the glow | A line to remember: a habit, a reminder, a question, an idea | Up to two short sentences at 176px, 2 lines of about 19 characters (break with `<br>`), with one coral word in `#ff6b57`: the word that carries the idea. Plus one 56px line of about 58 | `07-key-line.html` |
| 8 | Diagram | Dark | Who sits where | 3 tiers, then a 36px rule line and a 56px takeaway | `08-diagram.html` |
| 9 | Price cards | Dark | Two to four numbers side by side | 4 cards (number 6 characters; 8 with three cards or fewer; name 18) and one optional strip | `09-price-cards.html` |
| 10 | Step chain | Dark | An order of operations | 6 steps (name 20 characters, side note 40); the gray badge only on the true last resort | `10-step-chain.html` |
| 11 | Script | Dark | Words to say on a call | 6 rows of 85 characters, one line each; the full script in the notes | `11-script.html` |
| 12 | Quote | Red | His own words to close | One line he actually said, about 60 characters; it may end early at a natural break with a period (no ellipsis, no word changed). His own words only | `12-quote.html` |

Too long for a layout's limits? Write a long amount with k ("$1.5k", "$60k") and a long name by its short form. A list layout over its rows splits into two slides of the same layout: the second keeps the title, and a chain keeps counting (the second slide starts at 7). Never split a red slide or a Key line: cut it to its limit and move the rest to the notes.

## A meeting deck, in order

1. Cover.
2. Scoreboard: the month so far, or how the last month ended.
3. Agenda: the sections, numbered. A meeting has 5 sections at most, so every eyebrow number matches an Agenda row. More to cover: fold it into the section it belongs to (small items into Housekeeping) or keep it for the next meeting. Never number a section the Agenda doesn't show, and never make a second Agenda slide.
4. Each section in agenda order. A section about one topic opens with its Big news, if it has one, then its supporting layouts; a Key line goes where it lands hardest, often last (section 2 ends on "Paid in cash. Today." after its chart). A section of separate ideas keeps his order, each idea with its own slides. Every slide's eyebrow carries the section's number and short name.
5. The Housekeeping section, if the meeting has one, comes last before the close. Chains and scripts in other sections stay with their idea.
6. The Quote to close, always the last slide, and only with a line he actually said. With no such line the deck ends on the last section's slide. New slides go in before the Quote, and every slide after them is renumbered.

## Speaker notes

Every slide has notes: the `<aside>`, the section's last child, written as one paragraph.

- It starts with "Layout: " and the layout's name exactly as in the table, then a period ("Layout: Key line."). A short description may follow after a comma ("Layout: Chart, a picture of the math.").
- Slides he talks over add "You say:" and his points in his words. The Cover, Scoreboard and Agenda say what the slide shows and where its numbers came from (Scorecard, with the day read).
- "Open:" lists what is not decided, in his words (an amount, a percentage, a date he mentioned without a value). Leave it out when nothing is open, and never add a question he did not raise.
- "Note to me:" holds a reminder for him (pull the cash the day before).
- A script slide carries the whole script after "The full script:", with what the client does in [square brackets].
- A slide made from a recording or a Notebook card ends with "From:" and the source (the Pocket recording's day and time, or the file), plus who it was aimed at ("for Matt"). Every word in curly quotes, on the slide or in the notes, appears in that source word for word, apart from cuts.
