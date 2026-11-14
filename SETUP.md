# Meetings setup (Anersi's clicks)

One step at a time. Each step says what you should see when it worked. Meetings shares Scorecard's Supabase project (no new project, nothing new to pay for there). The only new cost is Claude drafting the slides: about 5 cents a thought, well under $1 a meeting, on the Claude account you already have.

## Step 1. Add the Meetings tables to Scorecard's database
Meetings keeps its own tables (they all start with `mtg_`) next to Scorecard's. It only reads Scorecard's numbers, never changes them.
1. Open https://github.com/anersi-fex/tkg-meetings/blob/main/supabase/migrations/0001_meetings.sql (before the merge: the same file on the pull request's branch), tap **Raw**, select all, copy.
2. In Supabase, open the **scorecard** project > **SQL Editor** > **New query**, paste, tap **Run**.
3. You should see **Success. No rows returned**. Safe to run twice.

## Step 2. The app goes on `main` (Claude does this)
After step 1, Claude merges the pull request. Vercel builds from `main`.

## Step 3. Put the app on Vercel
1. vercel.com > **Add New** > **Project** > import `anersi-fex/tkg-meetings`.
2. Before **Deploy**, open **Environment Variables** and add (names exactly as written):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Scorecard's Project URL (Supabase > scorecard > **Project Settings** > **Data API**; nothing after `.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Scorecard's secret key (**Project Settings** > **API Keys**, starts with `sb_secret_`) |
| `OWNER_PASSWORD` | a new strong password just for you (save it in your password manager) |
| `TEAM_PASSWORD` | a password for the TV (it only opens the TV screen) |

3. Tap **Deploy**. You get an address like `tkg-meetings-xxxx.vercel.app`.
4. Optional, for nicer link previews: add `APP_URL` = `https://` + that address (no slash at the end), then **Deployments** > top one > **…** > **Redeploy**.

## Step 4. Sign in on your phone
1. Open the address in Safari, sign in with the **owner** password.
2. **Share** > **Add to Home Screen** > **Add**. The icon is a white speech bubble on red.

## Step 5. Connect Command Center
1. In Command Center: your initials > **Settings** > find **claude.ai connector URL** and copy it (it ends in `token=…`).
2. In Meetings: your initials > **Settings** > **Command Center** > paste > **Save and test**.
3. You should see "Connected. N thoughts are in the Team meeting folder."

## Step 6. Connect Claude
1. platform.claude.com > **API keys** > **Create key**, name it `Meetings`, copy it (starts with `sk-ant-`).
2. In Meetings: **Settings** > **Claude** > paste > **Save and test**. You should see "Claude is connected."
3. Without this step the app still works: each thought shows as a plain Key line of your own words.

## Step 7. The TV
1. On the Mac mini, open a **new tab** next to the Scorecard board and go to the address + `/tv`.
2. Sign in with the Meetings **team** password. It shows "Team meeting · Waiting to start" and stays signed in for 180 days.
3. At meeting time: click that tab, press **Control+Command+F** for full screen. After the meeting, click back to the Scorecard tab.

## Every meeting
1. On the way in, tell Pocket "for the team meeting …". The thought lands in Command Center's Team meeting folder, then in Meetings as a slide.
2. Open Meetings on your phone: check each slide (tap one to change words or layout), switch off what you don't want, set the date.
3. Tap **Play on the TV**. Your phone is the clicker: **Next**, **Back**, and your notes under the slide (only your phone sees the notes). **Pause** puts the TV back to waiting; **Resume on the TV** picks up on the same slide.
4. Tap **End meeting** (on the clicker, or at the bottom of Next meeting). The thoughts the TV showed are marked done in Command Center; the ones it never reached stay open for next time. The meeting moves to **Past**.

## Environment variables (all of them)
| Name | Needed | What it is |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Scorecard's Supabase project (Meetings' `mtg_` tables live there) |
| `OWNER_PASSWORD` | yes | full control |
| `TEAM_PASSWORD` | yes | the TV only |
| `APP_URL` | no | the app's own address, for link previews |
| `SESSION_SECRET` | no | signs the sign-in cookie; made from the Supabase key when not set |
| `COMMAND_CENTER_TOKEN`, `COMMAND_CENTER_URL` | no | instead of pasting the connector in Settings |
| `ANTHROPIC_API_KEY`, `MEETINGS_MODEL` | no | instead of pasting the Claude key in Settings; the model (default Claude Opus 5.5) |
| `SCORECARD_SUPABASE_URL`, `SCORECARD_SUPABASE_SERVICE_ROLE_KEY` | no | only if Meetings ever gets its own Supabase project and must read Scorecard's from another one |
