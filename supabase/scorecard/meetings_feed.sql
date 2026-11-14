-- Meetings' read-only window into Scorecard. Paste into the SCORECARD Supabase project's SQL editor
-- (or, with the owner's yes, the session applies it). Safe to run twice; changes no table or row.
--
-- Meetings shows the month's life total on its Scoreboard slide and spells the team's names the
-- way Scorecard does. These two functions give it exactly that and nothing else: no client, no
-- policy detail, no phone number. They run with the owner's rights (security definer) so Meetings
-- can call them with Scorecard's publishable key, which opens no table.

-- The month's life sales as Scorecard's Scoreboard counts them: not deleted, life only (P&C is
-- never on it), and a running month only through p_through (today in Detroit); a sale's status
-- never changes a total. Plus the month's team goal.
create or replace function meetings_scorecard_month(p_month text, p_through date)
returns table (total_cents bigint, policies bigint, goal_cents bigint)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select to_date(p_month || '-01', 'YYYY-MM-DD') as first_day
    where p_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  )
  select coalesce(sum(s.premium_cents), 0)::bigint,
         coalesce(sum(s.policies), 0)::bigint,
         coalesce((select g.team_cents from goals g where g.month = p_month), 0)::bigint
    from m
    left join sales s
      on s.deleted_at is null
     and s.kind <> 'pc'
     and s.sold_on >= m.first_day
     and s.sold_on <= least(p_through, (m.first_day + interval '1 month' - interval '1 day')::date)
   group by m.first_day;
$$;

-- The active team's names and the life carriers, as Scorecard spells them.
create or replace function meetings_scorecard_names()
returns table (people text[], carriers text[])
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select array_agg(a.name order by a.sort, a.name) from agents a where a.active), '{}'::text[]),
         coalesce((select array(select jsonb_array_elements_text(s.value -> 'carriers'))
                     from settings s
                    where s.key = 'app' and jsonb_typeof(s.value -> 'carriers') = 'array'), '{}'::text[]);
$$;

revoke all on function meetings_scorecard_month(text, date) from public, authenticated;
revoke all on function meetings_scorecard_names() from public, authenticated;
grant execute on function meetings_scorecard_month(text, date) to anon, service_role;
grant execute on function meetings_scorecard_names() to anon, service_role;

notify pgrst, 'reload schema';
