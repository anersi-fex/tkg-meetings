-- Invented test data for the local database only: Scorecard's tables as Meetings reads them
-- (the scoreboard slide and the team's names). Dates are relative to today in Detroit, so the
-- slide always has a this-month and a last-month number. Applied once, on a database whose
-- agents table is empty.
-- Scorecard migration 0003 added the kind of sale (life or pc); the test copy of its tables gets it here.
alter table sales add column if not exists kind text not null default 'life';

do $$
declare
  today date := (now() at time zone 'America/Detroit')::date;
  this_month date := date_trunc('month', today)::date;
  last_month date := (date_trunc('month', today) - interval '1 month')::date;
  a1 uuid := gen_random_uuid();
  a2 uuid := gen_random_uuid();
  a3 uuid := gen_random_uuid();
begin
  if exists (select 1 from agents) then return; end if;
  insert into agents (id, name, sort) values (a1, 'Test Agent A', 1), (a2, 'Test Agent B', 2), (a3, 'Test Agent C', 3);
  insert into goals (month, team_cents) values
    (to_char(this_month, 'YYYY-MM'), 15000000),
    (to_char(last_month, 'YYYY-MM'), 12000000);
  insert into sales (agent_id, premium_cents, policies, carrier, sold_on) values
    (a1, 1820000, 1, 'Newbridge', this_month),
    (a2, 960000, 1, 'AHL', least(this_month + 1, today)),
    (a3, 2400000, 2, 'Americo', today),
    (a1, 3100000, 2, 'Newbridge', last_month + 3),
    (a2, 2750000, 1, 'Royal', last_month + 9),
    (a3, 4480000, 3, 'AHL', last_month + 17);
  -- A deleted sale never counts, and neither does P&C (Scorecard's Scoreboard is life only).
  insert into sales (agent_id, premium_cents, policies, sold_on, kind) values (a2, 7770000, 1, today, 'pc');
  insert into sales (agent_id, premium_cents, policies, sold_on, deleted_at) values (a1, 99900000, 1, today, now());
  insert into settings (key, value) values ('app', jsonb_build_object('carriers', jsonb_build_array('AHL', 'AmAm', 'Americo', 'Foresters', 'Newbridge', 'Royal', 'UHL')))
    on conflict (key) do nothing;
end $$;
