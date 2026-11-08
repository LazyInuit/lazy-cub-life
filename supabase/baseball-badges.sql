-- Safe to run again. Run after cub-power.sql, spellitaire-badges.sql and baseball-blitz.sql.
-- Baseball badges: Baseball Blitz joins the badge games for Cub Power. Its badge goes by the best
-- single game, like every other game except Spellitaire.
-- Must match BADGE_RULES in src/game/profileArt.ts.
-- Balances, saves and scores are not touched.

insert into public.power_games (game, title, sort, bronze, silver, gold, platinum, diamond) values
  ('baseball', 'Baseball Blitz', 9, 2500, 5000, 10000, 20000, 30000)
on conflict (game) do update
set title = excluded.title,
    sort = excluded.sort,
    bronze = excluded.bronze,
    silver = excluded.silver,
    gold = excluded.gold,
    platinum = excluded.platinum,
    diamond = excluded.diamond;
