-- Meetings 0002 (2026-11-14): the Pocket screen. Safe to run twice.
-- Meetings reads the owner's Pocket recordings directly (his Pocket API key, pasted in Settings).
-- Each recording he has seen is one row: Pocket's title and summary (kept so the list opens fast
-- without asking Pocket for every one again) and what he decided: make it a meeting, or leave it
-- to Command Center. The transcript is never kept here; "Make a meeting" reads it from Pocket once
-- and the thought it makes keeps what drafting needs.

create table if not exists mtg_pocket (
  recording_id text primary key check (char_length(recording_id) between 1 and 120),
  title text not null default '' check (char_length(title) <= 200),
  summary text not null default '' check (char_length(summary) <= 2000),
  recorded_at timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  -- null: not decided yet; 'meeting': made into a thought of the next meeting; 'command_center':
  -- left to Command Center (which gets every recording on its own).
  decision text check (decision is null or decision in ('meeting', 'command_center')),
  decided_at timestamptz,
  -- The thought "Make a meeting" made (mtg_items.id), when it did.
  item_id uuid references mtg_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mtg_pocket_recorded on mtg_pocket (recorded_at desc);

alter table mtg_pocket enable row level security;
revoke all on mtg_pocket from anon, authenticated;

notify pgrst, 'reload schema';
