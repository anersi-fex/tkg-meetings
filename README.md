# TKG Meetings

Talking points for The Koka Group team meetings, one meeting per file in `meetings/`, in the Tide look of Sales Coach and Scorecard.

## What is here

| Path | What it is |
| --- | --- |
| `meetings/<month>-<topic>.md` | The talking points as plain text: the record, easy to edit. |
| `meetings/<month>-<topic>.html` | The same points as a branded page (Meetings by TKG, Crimson colorway, light and dark). |
| `meetings/<month>-<topic>.pdf` | The page printed to letter pages, for the phone or paper. |
| `brand/tide.css` | The Tide tokens and pieces for documents: the same values as the apps' `globals.css`. |
| `brand/fonts.css`, `brand/fonts/` | Plus Jakarta Sans and Space Grotesk, the apps' own font files. |
| `scripts/build.mjs` | Builds one page: inlines the brand and fonts into a single file, writes the PDF and phone screenshots. |

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
