-- Meetings 0003 (2026-11-15): Skip on the Pocket screen. Safe to run twice.
-- A recording he skips goes nowhere (not a meeting, not Command Center): mtg_pocket.decision may
-- now also be 'skipped'. Undo sets it back to null.

alter table mtg_pocket drop constraint if exists mtg_pocket_decision_check;
alter table mtg_pocket add constraint mtg_pocket_decision_check
  check (decision is null or decision in ('meeting', 'command_center', 'skipped'));

notify pgrst, 'reload schema';
