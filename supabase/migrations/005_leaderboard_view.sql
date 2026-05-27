-- 005_leaderboard_view.sql
CREATE OR REPLACE VIEW public.leaderboard
  WITH (security_invoker = true)
AS
SELECT
  RANK() OVER (PARTITION BY er.subject ORDER BY er.rating DESC) AS rank,
  p.display_name,
  er.rating,
  er.subject,
  er.user_id
FROM public.elo_ratings er
JOIN public.profiles p ON p.id = er.user_id;
