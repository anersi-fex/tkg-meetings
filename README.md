# TKG Meetings

Team meetings for The Koka Group, in the Tide look of Sales Coach and Scorecard:

- **The Meetings app** (the Next.js app at the root): thoughts Anersi records on Pocket "for the team meeting" land in Command Center's Team meeting folder, become slides in the approved slide brand, and play on the office TV with his phone as the clicker. Setup: [`SETUP.md`](SETUP.md). Plan: [`design/meetings-app/PROPOSAL.md`](design/meetings-app/PROPOSAL.md). State: [`HANDOFF.md`](HANDOFF.md).
- **Talking points**, one meeting per file in `meetings/`.

## What is here

| Path | What it is |
| --- | --- |
| `meetings/<month>-<topic>.md` | The talking points as plain text: the record, easy to edit. |
| `meetings/<month>-<topic>.html` | The same points as a branded page (Meetings by TKG, Crimson colorway, light and dark). |
| `meetings/<month>-<topic>.pdf` | The page printed to letter pages, for the phone or paper. |
| `brand/tide.css` | The Tide tokens and pieces for documents: the same values as the apps' `globals.css`. |
| `brand/fonts.css`, `brand/fonts/` | Plus Jakarta Sans and Space Grotesk, the apps' own font files. |
| `brand/SLIDES.md` | **The slide brand guide** (approved 2026-11-04): the rules, colors, type and the 12 layouts every meeting slide follows. |
| `brand/slides/` | One template per layout (Slides artifact format), the deck index and `contact-sheet.png`. |
| `scripts/render-slides.mjs` | Renders the slide templates to PNGs and the contact sheet. |
| `scripts/build.mjs` | Builds one page: inlines the brand and fonts into a single file, writes the PDF and phone screenshots. |
| `src/` | The Meetings app (Next.js 16): phone screens, the TV at `/tv`, the slide renderer, Command Center, Claude and Scorecard clients. |
| `supabase/migrations/` | Meetings' tables (`mtg_`), pasted into Scorecard's Supabase project. |
| `tests/`, `scripts/smoke.mjs`, `scripts/local-db/`, `scripts/mocks/` | Unit tests, the end-to-end run, the local database and stand-ins for Command Center and Claude. |
| `scripts/gen-icons.mjs` | The app icons, link card and iPhone opening screens in `public/`. |

## Rules

- Written to be read on a phone: short headers, grouped rows, numbered steps, scripts as transcript lines.
- Anything still open (a date, a percentage, an amount) wears an amber chip in the page and square brackets in the text, like `[date: TBD]`.
- Every color in `brand/tide.css` is a variable with light and dark values. The white glyphs on the gradient mark are the one exception, as in the apps.
- File names start with the month the meeting is for, then what it is about.

## Build a page

```
npm install --no-save playwright
node scripts/build.mjs meetings/2026-11-comp-increase-and-housekeeping.html
```

Output lands in `build/` (not committed): the single-file page, a wrapper-free copy for publishing, the PDF, and light and dark phone screenshots. Copy the PDF next to the page when it is final.

## Meetings

| File | Meeting |
| --- | --- |
| `meetings/2026-11-comp-increase-and-housekeeping.*` | Comp increase, cash bonuses, building the business, who writes a policy, the underwriting script |
