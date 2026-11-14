-- Meetings by TKG, release 1 (2026-11-14).
-- Every table starts with mtg_ so the app can share a Supabase project with Scorecard (the TV's
-- other app, whose sales and goals the scoreboard slide reads) without touching its tables.
-- Safe to run twice. The app reads and writes only with the service role key, on the server;
-- RLS is on with no policies and the anon/authenticated roles have no grants, so the public
-- keys see nothing.

create extension if not exists pgcrypto;

-- One team meeting: a draft while the owner plans it, live while it is on the TV, done after.
create table if not exists mtg_meetings (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'live', 'done')),
  -- The day it happens (Detroit), null until the owner picks one.
  meets_on date,
  title text not null default 'Team meeting' check (char_length(title) between 1 and 40),
  -- The cover's line; empty means "made from the section names".
  cover_line text not null default '' check (char_length(cover_line) <= 120),
  -- The Scorecard slide: on or off, and which month ('auto' = last month in the first 5 days).
  scoreboard boolean not null default true,
  scoreboard_month text not null default 'auto' check (scoreboard_month in ('auto', 'this', 'last')),
  -- The closing quote, his own words: {"text": "...", "name": "Anersi Koka"} or null.
  quote jsonb,
  -- The deck as the TV shows it (built when the show starts and after each change while live).
  deck jsonb,
  deck_version integer not null default 0,
  current_slide integer not null default 0 check (current_slide >= 0),
  -- The thoughts (mtg_items.id) whose slides the TV landed on: End meeting marks exactly these
  -- done in Command Center. Only mtg_move_slide and mtg_put_deck add to it.
  shown_items text[] not null default '{}',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A database made from an earlier copy of this file gets the newer columns too.
alter table mtg_meetings add column if not exists shown_items text[] not null default '{}';

-- At most one meeting being planned or shown at a time.
create unique index if not exists mtg_meetings_one_open on mtg_meetings ((true)) where status in ('draft', 'live');
create index if not exists mtg_meetings_done on mtg_meetings (ended_at desc) where status = 'done';

-- One thought for the meeting: a Command Center Team meeting card and its slides.
create table if not exists mtg_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references mtg_meetings(id) on delete cascade,
  -- The Command Center card's id (one row per card per meeting).
  card_id text not null check (char_length(card_id) between 1 and 80),
  -- What Command Center said when it was last read: title, summary, points, people, said_at, open.
  card jsonb not null,
  included boolean not null default true,
  position integer not null default 0,
  -- The agenda section it belongs to (1 to 3 words).
  section text not null default '' check (char_length(section) <= 40),
  -- One or two content slides (src/lib/slides.ts).
  slides jsonb not null default '[]'::jsonb,
  -- Lines he said word for word that could close the meeting.
  quote_candidates jsonb not null default '[]'::jsonb,
  draft_status text not null default 'pending' check (draft_status in ('pending', 'drafting', 'ready', 'failed', 'edited')),
  draft_note text check (draft_note is null or char_length(draft_note) <= 300),
  -- Set once the card was marked done in Command Center after the meeting.
  done_in_cc boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A plain (not partial) unique index: the app's insert names it in ON CONFLICT.
create unique index if not exists mtg_items_card on mtg_items (meeting_id, card_id);
create index if not exists mtg_items_meeting on mtg_items (meeting_id, position);
-- A card's thought in earlier meetings (it comes back with its slides and its switch).
create index if not exists mtg_items_card_id on mtg_items (card_id, created_at desc);

-- App settings by key: 'secrets' holds what the owner pasted in Settings (the Command Center
-- connector and the Claude key), server only.
create table if not exists mtg_settings (
  key text primary key check (char_length(key) <= 40),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Sign-in throttle (src/lib/auth.ts): one row per wrong password (each try is recorded before the
-- check, by mtg_login_attempt, and deleted again when the password was right).
create table if not exists mtg_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null check (char_length(ip) <= 64),
  at timestamptz not null default now()
);
create index if not exists mtg_login_attempts_at on mtg_login_attempts (at);
create index if not exists mtg_login_attempts_ip on mtg_login_attempts (ip, at);

-- Moves the live show by one slide, or to a slide, clamped to the deck. The row is locked first,
-- so two quick taps never lose one; the thought of the slide it lands on joins shown_items.
-- Returns the new slide index, or null when nothing is live.
create or replace function mtg_move_slide(p_meeting uuid, p_delta integer, p_to integer)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_deck jsonb;
  v_slide integer;
  v_item text;
begin
  select deck, current_slide into v_deck, v_slide
    from mtg_meetings
   where id = p_meeting and status = 'live'
     for update;
  if not found then
    return null;
  end if;
  v_slide := greatest(0, least(greatest(coalesce(jsonb_array_length(v_deck), 1), 1) - 1,
               case when p_to is not null then p_to else v_slide + coalesce(p_delta, 0) end));
  v_item := v_deck -> v_slide ->> 'itemId';
  update mtg_meetings
     set current_slide = v_slide,
         shown_items = case when v_item is null or v_item = any(shown_items) then shown_items else shown_items || v_item end,
         updated_at = now()
   where id = p_meeting;
  return v_slide;
end
$$;

-- Puts a deck on the TV (Play, Start from the cover, and every change while the show is live) in
-- one statement, only if the meeting is still as the app read it: same status, deck version and
-- slide. Then the meeting is live, the version goes up by one (the TV and the clicker fetch the
-- new deck), the slide is p_slide, and the thought of that slide joins shown_items. Returns the
-- new version, or null when something changed in between (a click, another change): the app
-- reads the meeting again and retries.
create or replace function mtg_put_deck(p_meeting uuid, p_deck jsonb, p_status text, p_version integer, p_from_slide integer, p_slide integer)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_slide integer;
  v_item text;
  v_version integer;
begin
  if p_deck is null or jsonb_typeof(p_deck) <> 'array' or jsonb_array_length(p_deck) = 0 or p_status not in ('draft', 'live') then
    return null;
  end if;
  v_slide := greatest(0, least(jsonb_array_length(p_deck) - 1, coalesce(p_slide, 0)));
  v_item := p_deck -> v_slide ->> 'itemId';
  update mtg_meetings
     set status = 'live',
         deck = p_deck,
         deck_version = deck_version + 1,
         current_slide = v_slide,
         started_at = coalesce(started_at, now()),
         shown_items = case when v_item is null or v_item = any(shown_items) then shown_items else shown_items || v_item end,
         updated_at = now()
   where id = p_meeting
     and status = p_status
     and deck_version = p_version
     and current_slide = p_from_slide
  returning deck_version into v_version;
  return v_version;
end
$$;

-- Counts one sign-in try before the password is checked (src/lib/auth.ts). Tries from one address
-- take turns (a lock held until this statement's transaction ends), so a burst sent at once is
-- counted one by one. Returns the try's id, or null when this address already has 10 wrong
-- passwords in 15 minutes, or every address together 500 (then nothing is recorded, so one
-- stranger can never lock out the owner or the TV). The app deletes the row again for a right
-- password. Rows older than a day are cleared on the way.
create or replace function mtg_login_attempt(p_ip text)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_ip text := left(coalesce(nullif(p_ip, ''), 'unknown'), 64);
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('mtg_login_attempt:' || v_ip));
  if (select count(*) from mtg_login_attempts where ip = v_ip and at >= now() - interval '15 minutes') >= 10
     or (select count(*) from mtg_login_attempts where at >= now() - interval '15 minutes') >= 500 then
    return null;
  end if;
  delete from mtg_login_attempts where at < now() - interval '1 day';
  insert into mtg_login_attempts (ip) values (v_ip) returning id into v_id;
  return v_id;
end
$$;

alter table mtg_meetings enable row level security;
alter table mtg_items enable row level security;
alter table mtg_settings enable row level security;
alter table mtg_login_attempts enable row level security;

revoke all on mtg_meetings, mtg_items, mtg_settings, mtg_login_attempts from anon, authenticated;
revoke all on function mtg_move_slide(uuid, integer, integer) from public, anon, authenticated;
grant execute on function mtg_move_slide(uuid, integer, integer) to service_role;
revoke all on function mtg_put_deck(uuid, jsonb, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function mtg_put_deck(uuid, jsonb, text, integer, integer, integer) to service_role;
revoke all on function mtg_login_attempt(text) from public, anon, authenticated;
grant execute on function mtg_login_attempt(text) to service_role;
