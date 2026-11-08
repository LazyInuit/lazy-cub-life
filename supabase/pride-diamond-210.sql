-- Safe to run again. Lowers the Pride Pairs Diamond badge from 220 to 210 points for Cub Power.
-- Must match BADGE_RULES in src/game/profileArt.ts (and the match row in cub-power.sql).
-- Balances, saves and scores are not touched.

update public.power_games
set diamond = 210
where game = 'match';
