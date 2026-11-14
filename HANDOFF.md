# HANDOFF — Meetings

## State (2026-11-14)
- The Meetings app is built on branch `claude/team-meeting-talking-points-1mzzhh` (draft PR #1, which also holds the talking points, the Tide document look and the approved slide brand). Not live yet.
- Checks: `npm run lint`, `npx tsc --noEmit`, `npm test` (unit: deck order and red-slide rules, slide cleaning and limits, layout switches, the numbers check, quotes, the connector address, Detroit month math) and `npm run build` pass. The end-to-end run (`scripts/smoke.mjs`, 17 checks against the local database, Scorecard's tables with invented numbers, and stand-ins for Command Center and Claude) passes: sign-in for both passwords, the Team meeting folder coming in, drafting before and after a Claude key, the editor, the closing quote, Play with the TV following the clicker slide by slide, the team TV unable to move the show, the Scorecard numbers, End meeting marking the shown thoughts done, Past, a fresh empty meeting, the 12 layouts.
- An independent review (five lenses, each finding checked by three skeptics) ran before the first push to the owner; its confirmed findings are fixed (see the PR).

## Owner steps, in order (SETUP.md)
1. Paste `supabase/migrations/0001_meetings.sql` into the **scorecard** Supabase project's SQL editor (adds only `mtg_` tables and one `mtg_move_slide` function).
2. Claude merges PR #1 (after step 1).
3. New Vercel project from `anersi-fex/tkg-meetings` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Scorecard's), `OWNER_PASSWORD`, `TEAM_PASSWORD`.
4. Phone: sign in, Add to Home Screen. Settings: paste Command Center's "claude.ai connector URL", then a new Claude key named Meetings.
5. Mac mini: a tab with `/tv` next to the Scorecard board, signed in with the team password.

## Gotchas found while building (do not re-debug)
- Next memoizes identical GET fetches within one server render: the sync read the thoughts, saved new ones, read again and got the first (empty) answer. Every database call goes through `freshFetch` (a fresh AbortController signal, `cache: "no-store"`) in `src/lib/supabase.ts`.
- PostgREST v13 refuses `or=` on a PATCH ("column ... does not exist"); the draft claim is two plain updates.
- The `mtg_items (meeting_id, card_id)` unique index must be plain (not partial), because the insert names it in ON CONFLICT.
- `tkg_notebook` returns every open card when the group it is given is not one of the owner's folders: Meetings keeps only cards whose `group_ids` holds `team`.
- In a cloud shell, `pkill -f <pattern>` kills your own shell when the pattern is in the command line; kill by PID.
- Opus 5.5 rejects a forced `tool_choice`; drafting uses structured outputs (`output_config.format`).

## Backlog (not built; each waits on the owner's yes)
- The Scorecard board could switch to the meeting by itself while a meeting is live (today the TV needs its own tab).
- Typing a thought in Meetings directly (today every thought comes from Command Center).
- Photos or screenshots on a slide.
