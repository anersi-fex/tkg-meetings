# Meetings setup (Anersi's clicks)

One step at a time. Each step says what you should see when it worked. Meetings gets its own Supabase project (about $10 a month on the Pro plan), because Scorecard's database now holds client details (birthdates, phones, policy numbers) and Meetings must never be able to read them. Meetings reads only the month's life total, the goal and the team's names from Scorecard, through two read-only functions. The other new cost is Claude drafting the slides: about 5 cents a thought, well under $1 a meeting.

## Step 1. The databases (done on 2026-11-14)
1. A new Supabase project **tkg-meetings** (East US, Ohio), with `supabase/migrations/0001_meetings.sql` applied: Meetings' own tables and functions.
2. In the **scorecard** project, `supabase/scorecard/meetings_feed.sql`: two read-only functions (the month's life total and goal, the team's names). No table or row of Scorecard changes.
3. You should see both in Supabase. Both files are safe to run twice.

(The other way, if you ever want it: both files in the scorecard project and no new project. Free, but then the Meetings key could read client details.)

## Step 2. The app goes on `main` (Claude does this; done 2026-11-14)
After step 1, Claude merges the pull request. Vercel builds from `main`. The Pocket screen needs `supabase/migrations/0002_pocket.sql` on tkg-meetings first (one table, `mtg_pocket`, for Pocket's summaries and what you decided).

## Step 3. Put the app on Vercel (done 2026-11-14: https://tkg-meetings.vercel.app)
1. vercel.com > **Add New** > **Project** > import `anersi-fex/tkg-meetings`.
2. Before **Deploy**, open **Environment Variables** and add (names exactly as written):

| Name | Value |
|---|---|
| `SUPABASE_URL` | the **tkg-meetings** project's URL (Supabase > tkg-meetings > **Project Settings** > **Data API**; nothing after `.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the **tkg-meetings** project's secret key (**Project Settings** > **API Keys**, starts with `sb_secret_`) |
| `SCORECARD_SUPABASE_URL` | the **scorecard** project's URL (same place) |
| `SCORECARD_SUPABASE_KEY` | the **scorecard** project's **publishable** key (**API Keys**, starts with `sb_publishable_`; it opens no table, only the two read-only functions) |
| `OWNER_PASSWORD` | a new strong password just for you (save it in your password manager) |
| `TEAM_PASSWORD` | optional: a password for a TV that is not your own computer (it only opens the TV screen). Not set today: the slides play on your own computer. |

3. Tap **Deploy**. You get an address like `tkg-meetings-xxxx.vercel.app`.
4. Optional, for nicer link previews: add `APP_URL` = `https://` + that address (no slash at the end), then **Deployments** > top one > **…** > **Redeploy**.

## Step 4. Sign in on your phone
1. Open the address in Safari, sign in with the **owner** password.
2. **Share** > **Add to Home Screen** > **Add**. The icon is a white speech bubble on red.

## Step 5. Connect Pocket
1. In the Pocket app: **Settings** > **Developer** > **API Keys**, copy your key (starts with `pk_`; the one Command Center uses works too).
2. In Meetings: your initials > **Settings** > **Pocket** > paste > **Save and test**.
3. You should see "Pocket is connected. N recordings this week." The **Pocket** tab now lists your recordings with Pocket's summary.

## Step 5b. Connect Command Center
1. In Command Center: your initials > **Settings** > find **claude.ai connector URL** and copy it (it ends in `token=…`).
2. In Meetings: your initials > **Settings** > **Command Center** > paste > **Save and test**.
3. You should see "Connected. N thoughts are in the Team meeting folder."

## Step 6. Connect Claude
1. platform.claude.com > **API keys** > **Create key**, name it `Meetings`, copy it (starts with `sk-ant-`).
2. In Meetings: **Settings** > **Claude** > paste > **Save and test**. You should see "Claude is connected."
3. Without this step the app still works: each thought shows as a plain Key line of your own words.

## Step 7. The TV
1. On your own computer (signed in as the owner), open the address + `/tv`. It shows "Team meeting · Waiting to start".
2. At meeting time: press **F** for full screen (or put the computer on the TV). Your phone is the clicker.
3. A separate TV computer would sign in with `TEAM_PASSWORD` (set it in Vercel first); it then opens only the TV screen.

## Every meeting
1. Record the thought on Pocket. In Meetings, open the **Pocket** tab: each recording shows Pocket's own summary. Tap **Whole meeting** (the recording is the whole meeting: pick Brief, Standard or Full), **Add to meeting** (one or two slides in the next meeting), **Command Center** (leave it there) or **Skip** (it goes nowhere). On any slide, **Ask Claude** changes it: Shorter, More detail, Split in two, or your own words. A thought Command Center files in its Team meeting folder also comes in by itself.
2. Open Meetings on your phone: check each slide (tap one to change words or layout), switch off what you don't want, set the date.
3. Tap **Play on the TV**. Your phone is the clicker: **Next**, **Back**, and your notes under the slide (only your phone sees the notes). **Pause** puts the TV back to waiting; **Resume on the TV** picks up on the same slide.
4. Tap **End meeting** (on the clicker, or at the bottom of Next meeting). The thoughts the TV showed are marked done in Command Center; the ones it never reached stay open for next time. The meeting moves to **Past**.

## Environment variables (all of them)
| Name | Needed | What it is |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Meetings' own Supabase project (its `mtg_` tables) |
| `OWNER_PASSWORD` | yes | full control |
| `TEAM_PASSWORD` | no | a separate TV computer: it opens the TV only |
| `APP_URL` | no | the app's own address, for link previews |
| `SESSION_SECRET` | no | signs the sign-in cookie; made from the Supabase key when not set |
| `COMMAND_CENTER_TOKEN`, `COMMAND_CENTER_URL` | no | instead of pasting the connector in Settings |
| `POCKET_API_KEY` | no | instead of pasting the Pocket key in Settings |
| `ANTHROPIC_API_KEY`, `MEETINGS_MODEL` | no | instead of pasting the Claude key in Settings; the model (default Claude Opus 5.5) |
| `SCORECARD_SUPABASE_URL`, `SCORECARD_SUPABASE_KEY` | yes, with its own project | Scorecard's Project URL and its **publishable** key (it opens no table; Meetings reads only the two functions in `supabase/scorecard/meetings_feed.sql`). Without them Meetings calls those functions on its own project (the shared setup). |
