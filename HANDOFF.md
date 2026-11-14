# HANDOFF — Meetings

## State (2026-11-14)
- The Meetings app is built on branch `claude/team-meeting-talking-points-1mzzhh` (draft PR #1, which also holds the talking points, the Tide document look and the approved slide brand). Not live yet.
- Checks: `npm run lint`, `npx tsc --noEmit`, `npm test` (70 unit tests: deck order and red-slide rules, slide cleaning, limits and width fit, layout switches and the editor's layout memory, the numbers and names checks, quotes, the connector address, the Claude error mapping and run clock, carry-over and switch rules, sign-in address keys, safeAction) and `npm run build` pass. The end-to-end run (`scripts/smoke.mjs`, 20 checks on a fresh local database with Scorecard's tables, invented numbers and stand-ins for Command Center and Claude) passes.
- Reviews: a first independent review (five lenses, 152 agents) confirmed 44 defects; all were fixed. A second pass found 11 of them only partly fixed and 16 new ones; those were fixed in a second round, which a third pass checked (see the PR).

## Owner steps, in order (SETUP.md)
0. DONE 2026-11-14: the owner said yes to Meetings' own Supabase project (about $10/month; Scorecard's database now holds client birthdates, phones and policy numbers). The connector's cost form never reached his phone (it timed out twice), so he created **tkg-meetings** (`ukpqonskyakwvnstjejn`, East US Ohio) himself in the dashboard.
1. DONE 2026-11-14: the session applied `0001_meetings` on tkg-meetings and `meetings_feed` on tkg-scorecard, and checked both. Scorecard has no life goal for November (only a P&C goal), so the Scoreboard slide shows the total and policies without a goal bar, as Scorecard's own board does.
2. The session merges PR #1.
3. New Vercel project from `anersi-fex/tkg-meetings` with the six values in SETUP.md Step 3 (tkg-meetings' URL and secret key, tkg-scorecard's URL and publishable key, the two passwords).
4. Phone: sign in, Add to Home Screen. Settings: paste Command Center's "claude.ai connector URL", then a new Claude key named Meetings.
5. Mac mini: a tab with `/tv` next to the Scorecard board, signed in with the team password.

## Gotchas found while building (do not re-debug)
- Next memoizes identical GET fetches within one server render: the sync read the thoughts, saved new ones, read again and got the first (empty) answer. Every database call goes through `freshFetch` (a fresh AbortController signal, `cache: "no-store"`) in `src/lib/supabase.ts`.
- PostgREST v13 refuses `or=` on a PATCH ("column ... does not exist"); the draft claim is an rpc (`mtg_claim_draft`).
- The TV's deck is keyed by meeting and version (`?k=`): versions start over in every meeting, so a version alone made a TV left open show last week's slides.
- Next 16.3.4 answers an action id from before a deploy with an unrecognized-action error; `safeAction` reloads the page instead of saying No connection forever.
- The `mtg_items (meeting_id, card_id)` unique index must be plain (not partial), because the insert names it in ON CONFLICT.
- `tkg_notebook` returns every open card when the group it is given is not one of the owner's folders: Meetings keeps only cards whose `group_ids` holds `team`.
- In a cloud shell, `pkill -f <pattern>` kills your own shell when the pattern is in the command line; kill by PID.
- Opus 5.5 rejects a forced `tool_choice`; drafting uses structured outputs (`output_config.format`).
- Scorecard grew (2026-11-12, its CRM build): `sales` now has `kind` (life or pc), `status` and client columns. Its Scoreboard counts life only; a status never changes a total. The feed functions follow that; never read Scorecard's tables directly.
- The API answers at most 1,000 rows a request; totals come from the SQL function, not from rows.

## Backlog (not built; each waits on the owner's yes)
- The Scorecard board could switch to the meeting by itself while a meeting is live (today the TV needs its own tab).
- Typing a thought in Meetings directly (today every thought comes from Command Center).
- Photos or screenshots on a slide.
