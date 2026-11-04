# CLAUDE.md — TKG Meetings

**Owner:** Anersi Koka (The Koka Group, Troy MI). Licensed MI P&C and life producer at Goosehead; runs a life-insurance phone sales team. Not a developer: short replies, verdict first, one step at a time, a picture when possible, receipts before "done". He reads on his iPhone.

## What this repo is
Team meeting material for The Koka Group: talking points (`meetings/`), the slide brand (`brand/`), and the plan for the Meetings app (`design/meetings-app/PROPOSAL.md`: Pocket voice notes filed by Command Center into the Team meeting folder become a slideshow on the office TV, with the phone as the clicker; not built yet, it waits on the owner's yes).

## Slides: the rule
- **Every team meeting slide follows `brand/SLIDES.md`** (approved by the owner on 2026-11-04: "I actually love all these slides... move forward with this"). Pick one of its 12 layouts, start from that layout's template in `brand/slides/`, keep its colors, type sizes, frame and footer, and stay inside its limits. Do not invent new layouts, colors or sizes without the owner's OK.
- The reference deck is https://claude.ai/artifact/7ic1ijVaJ97r6U1cScfWhG. The picture of all 12 layouts is `brand/slides/contact-sheet.png` (`node scripts/render-slides.mjs` re-renders it).
- Slides carry the owner's words, shortened; speaker notes carry the rest. Never invent a number, percentage, date, name, quote or promise: an open item wears the amber TBD pill and a `[X]` placeholder. Numbers about sales come from Scorecard (Supabase project `tkg-scorecard`, read only).

## Documents
- Talking points: `meetings/<month>-<topic>.md` (the text) and `.html` (the Tide page, `brand/tide.css` and `brand/fonts.css`); `node scripts/build.mjs meetings/<file>.html` writes the single-file page, the PDF and phone screenshots into `build/` (not committed). Open items in square brackets.
- Look: Tide, the same type, cards and tokens as Sales Coach and Scorecard, in the Crimson colorway (The Koka Group's red). Every color in `brand/tide.css` is a variable with light and dark values.

## Privacy
No client names, policy numbers, birthdates or contact details on slides or in notes. Team members by first name only when the owner names them.

## Git
- Work on the branch the session assigns and open a draft PR. Never put model identifiers in commits, PR text or files.
- `build/` and `node_modules/` are ignored. Playwright is the only tool the scripts need.
