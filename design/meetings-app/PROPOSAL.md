# Meetings by TKG, the app (proposal, 2026-11-04)

**The owner's ask (2026-11-04):** "a slideshow of just simple thoughts that I give it: things that I want to mention in the team meeting... I can put it up on the TV, similar to how Scorecard is... from a simple voice recording on my way home from work... it records in a specific place, and it knows things that are worth mentioning for the team meeting."

**Verdict:** most of it already exists. The new app is the show.

## What already exists
- He records thoughts on the Pocket recorder in the car. Command Center (`anersi-fex/tkg-pocket-ai`) receives every recording and its sorter files the team ones into the **Team meeting** folder (group `team`; the filing rule listens for "team meeting", "whiteboard", "tell the team", "everyone", and coaching or incentives meant for the whole team). Saying "for the team meeting" at the start makes it certain.
- Command Center's connector endpoint (`POST /api/mcp`, Bearer token) already answers `tkg_notebook` with `group: "team"` (each card: id, title, summary, points, when it was said) and `tkg_move_card` with `status: "done"`. So Meetings can read the folder and close cards after the meeting **without changing Command Center**.
- Scorecard's board feed (`GET /api/board`, signed in with the team password) gives the month so far for a live Scorecard slide.

## What to build (one app, this repo, Tide in Crimson)
1. **Phone, Next meeting** (`/`): the Team meeting cards as grouped rows with a switch (in the show or not), hold to reorder, tap to fix the words (title, up to four points; the AI's cut is the starting point, nothing is sent to the team unedited), the date chip, the Scorecard row, **Play on the TV**. See `phone.png`; first run `phone-empty.png`.
2. **TV** (`/show`): one thought per slide, sized in em from the viewport like the Scorecard board, dark, seven-segment bar on top, the next slide named in the footer, F for full screen. Polls the show state every second or two so the phone drives it. See `tv.png`, a two-line title with four points `tv-long.png`.
3. **Clicker** (the phone while the show runs): Back, Next, what is on, what comes next, Stop. See `clicker.png`.
4. **After the meeting:** each shown card is marked done in Command Center (`tkg_move_card`), and the show is kept under Past.
5. **Sign-in:** the same two-password pattern as Scorecard (owner, team and the TV). Settings holds the Command Center connector token and the Scorecard team password (server only).

Stack and look: Next.js 16 App Router, Tide tokens from `brand/tide.css`, Supabase for shows and the show state, Vercel. The mockups are `mockups.html` (artboards `#tv`, `#phone`, `#flow`, plus the proof boards), rendered with `render-boards.mjs`.

## Open for the owner
- Yes or no to the plan above.
- Later: a colorway (the mockups wear Crimson, The Koka Group's red; Lagoon or Sky would set it apart from Scorecard on the same TV).
