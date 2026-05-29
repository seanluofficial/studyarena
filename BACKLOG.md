# StudyArena — Development Backlog

Tasks are ordered by dependency and priority. The loop picks the first unchecked task with no blockers.

Legend:
- `[BLOCKED: #N]` — cannot start until task N is done
- `[NEEDS: X]` — requires env var / external credential not in repo
- `[MIGRATION]` — requires a Supabase migration to be run manually after commit

---

## P0 — Foundational (unblocks everything else)

- [x] **#1 [MIGRATION] Add source_cards and question_variants tables**  
  Write `supabase/migrations/002_questions.sql` with the exact schema from `CARD_SCHEMA.md §5`. Include indexes: `question_variants(source_card_id)`, `source_cards(subject, unit)`. Add RLS policies: public SELECT on `question_variants` joined with reviewed source cards; service role only for INSERT/UPDATE.  
  Accept: migration file exists, SQL is valid, matches CARD_SCHEMA.md spec exactly.  
  Validate: `node --check server/questions.js`

- [x] **#2 [MIGRATION] Seed question_variants from existing JSON content**  
  Write `supabase/migrations/003_seed_apchem.sql` that inserts all cards from `content/apchem/unit1.json` and `content/apchem/unit2.json` into `source_cards` (subject=`AP Chemistry`, reviewed=true) and one `question_variants` record per card (rendered_stem = content.stem, rendered_options = content.options, correct_index = content.correct_index, param_values = null).  
  Accept: migration seeds existing JSON questions so battles work after DB migration.  
  Validate: SQL is syntactically valid.  
  [BLOCKED: #1]

- [x] **#3 Update server/questions.js to draw from question_variants table**  
  Replace the JSON file loader with a Supabase query: `SELECT id, rendered_stem, rendered_options, correct_index FROM question_variants qv JOIN source_cards sc ON sc.id = qv.source_card_id WHERE sc.subject = $subject AND sc.reviewed = true ORDER BY random() LIMIT $n`. Keep the JSON fallback for local dev (when SUPABASE_URL is not set). Also change `pickQuestions(1)` in `server/index.js` back to `pickQuestions(10)`.  
  Accept: server draws questions from DB; falls back to JSON locally; count is 10.  
  Validate: `node --check server/questions.js && node --check server/index.js`  
  [BLOCKED: #1]

- [x] **#4 Synchronized per-question battle flow (PRD §6.2)**  
  Currently: each player advances independently after answering. PRD requires: both players see the same question simultaneously; round ends when BOTH have answered; then both see a 2-second reveal; then next question.  
  Server changes: track `answers[socketId]` per round; when both answered, broadcast `question_result` to both with both answers + correct; after 2s timeout, send next `question` to both.  
  Client changes: after submitting answer, show "Waiting for opponent…" overlay; `question_result` now includes opponent's answer — display it in the reveal.  
  Accept: both players move in lockstep through questions; reveal shows correct answer + both players' choices; neither player can skip ahead.  
  Validate: `cd web; npx tsc --noEmit; cd .. && node --check server/index.js`

- [x] **#5 Subject selection UI**  
  Currently subject is hardcoded to `'apchem'` in `server/index.js`, `server/elo.js`, and `web/app/page.tsx`. Add a subject picker to the lobby screen (dropdown or button group) listing the 5 MVP subjects from PRD §8. Pass the selected subject through `join_queue`, store it on the queue entry, and include it in all ELO and battle records. For now, only `AP Chemistry` has content — others should be selectable but show "Coming soon" if no questions exist.  
  Accept: user can select a subject before joining queue; subject flows through to ELO and battle records.  
  Validate: `cd web; npx tsc --noEmit; cd ..`

- [x] **#6 Rematch and New Opponent buttons on result screen**  
  The result screen (appPhase === 'complete') currently only has "Play Again" which reloads the page. Replace with two buttons: "Rematch" (re-queues with same subject against same opponent via direct invite, fallback to queue) and "New Opponent" (re-queues normally). For MVP, both can just re-queue with the current subject — the distinction is cosmetic. Also reset all battle state (scores, ELO delta display) without a full page reload.  
  Accept: both buttons appear on result screen; clicking either returns to lobby/queue state cleanly.  
  Validate: `cd web; npx tsc --noEmit; cd ..`

---

## P1 — Core Features

- [x] **#7 [MIGRATION] Add streak fields to profiles table**  
  Write `supabase/migrations/004_streaks.sql`: add `current_streak INT DEFAULT 0`, `longest_streak INT DEFAULT 0`, `last_battle_date DATE` to `profiles`. Write a server function `updateStreak(userId)` in `server/streak.js` that: fetches the profile, checks if `last_battle_date` is yesterday (increment streak) or today (no change) or older (reset to 1), updates `current_streak`, `longest_streak`, and `last_battle_date`. Call `updateStreak` for both players at the end of `endBattle`.  
  Accept: streaks increment correctly; reset after a missed day; longest_streak tracks the max.  
  Validate: `node --check server/streak.js && node --check server/index.js`

- [x] **#8 User profile page**  
  Create `web/app/profile/page.tsx`. Show: display name, current ELO per subject (table), current streak + longest streak, win/loss record (query `battles` table), last 10 battles (query `battles` with join to `profiles` for opponent name). Add a "Profile" link from the lobby screen.  
  Accept: page renders without errors; shows all fields; handles missing data gracefully.  
  Validate: `cd web; npx tsc --noEmit; cd ..`  
  [BLOCKED: #7]

- [x] **#9 [MIGRATION] Leaderboard — top 50 per subject**  
  Write `supabase/migrations/005_leaderboard_view.sql`: create a view `leaderboard` that joins `elo_ratings` with `profiles` and returns `rank, display_name, rating, subject` ordered by rating DESC, partitioned by subject.  
  Create `web/app/leaderboard/page.tsx`: subject tabs (one per MVP subject), table showing rank/name/ELO for top 50. Add "Leaderboard" nav link from lobby.  
  Accept: page renders; shows correct top-50 per subject; rank column is correct.  
  Validate: `cd web; npx tsc --noEmit; cd ..`

- [x] **#10 [MIGRATION] Free tier: 3 battles/day limit**  
  Write `supabase/migrations/006_battle_limits.sql`: add `battles_today INT DEFAULT 0`, `battles_reset_date DATE DEFAULT current_date` to `profiles`.  
  In `server/index.js`, before starting a battle, check both players' `battles_today`. If either has reached 3 and is not premium, emit `battle_limit_reached` to that player and cancel matchmaking for them (put the other player back in queue).  
  In `web/app/page.tsx`, handle `battle_limit_reached` event: show a paywall screen with "You've used your 3 free battles today. Upgrade to Premium for unlimited battles." and reset time.  
  At the end of `endBattle`, increment `battles_today` for both players (reset to 0 if `battles_reset_date` < today first).  
  Accept: free users are blocked after 3 battles; paywall screen shows with reset time; premium users (is_premium=true on profiles) are unaffected.  
  Validate: `cd web; npx tsc --noEmit; cd .. && node --check server/index.js`

- [x] **#11 [MIGRATION] Add is_premium to profiles**  
  Write `supabase/migrations/007_premium.sql`: add `is_premium BOOLEAN DEFAULT false`, `premium_expires_at TIMESTAMPTZ` to `profiles`.  
  This is a prerequisite for Stripe integration — no payment logic yet, just the schema.  
  Accept: migration file exists with correct SQL.  
  Validate: SQL is syntactically valid.

- [ ] **#12 Google OAuth**  
  Enable Google OAuth in `web/app/login/page.tsx`. Add a "Continue with Google" button that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. Handle the OAuth callback in `web/app/auth/callback/route.ts` (create if not exists). Ensure profile row is created on first Google login (trigger or upsert in callback).  
  Accept: Google button appears on login page; clicking it initiates OAuth flow.  
  Validate: `cd web; npx tsc --noEmit; cd ..`  
  [NEEDS: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET configured in Supabase dashboard]

---

## P2 — Monetization & Advanced Features

- [ ] **#13 Stripe Premium subscription**  
  Add Stripe Checkout: "Upgrade" button on paywall screen → `POST /api/checkout` → creates Stripe Checkout session → redirect to Stripe. Add `web/app/api/webhook/route.ts` to handle `checkout.session.completed` event: set `is_premium = true` and `premium_expires_at = now() + 30 days` on the profile.  
  Accept: upgrade flow creates Checkout session; webhook sets is_premium.  
  Validate: `cd web; npx tsc --noEmit; cd ..`  
  [NEEDS: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY]  
  [BLOCKED: #11]

- [x] **#14 ELO-based matchmaking brackets**  
  In `server/index.js`, change `tryMatch` to only match players within ±200 ELO. After 30 seconds in queue, widen to ±400. After 60 seconds, emit `queue_timeout` and offer async challenge. Store queue join timestamp on the queue entry. Run `tryMatch` on a 5-second interval in addition to on `join_queue`.  
  Accept: players outside ±200 ELO are not matched immediately; bracket widens after 30s; timeout after 60s.  
  Validate: `node --check server/index.js`

- [x] **#15 Async challenge mode**  
  Create a challenge link flow: `POST /challenge` creates a `challenges` record with `challenger_id`, `subject`, `question_ids` (same 10 questions), `challenger_answers`, `expires_at = now() + 24h`. Returns a shareable link. When the link is opened, the opponent plays the same questions; result compared at submission. ELO updates on completion.  
  Requires: `supabase/migrations/008_challenges.sql` with `challenges` table.  
  Accept: challenge link can be created; opened by a second user; result resolves correctly.  
  Validate: `cd web; npx tsc --noEmit; cd ..`

---

## P3 — Polish & Content

- [x] **#16 Dark gaming aesthetic — typography and animations**  
  Per PRD §9: replace all rounded/friendly elements with sharp variants. Update `web/app/globals.css` or Tailwind config: body font to a condensed sans-serif (Inter or Geist Mono for numbers). Add slide-in animation for question reveal (CSS keyframe, not a library). Add ELO gain/loss animation on result screen (number counts up/down). Score bar should animate on update.  
  Accept: question transitions feel snappy; ELO delta animates; no Duolingo-esque rounded buttons remain.  
  Validate: `cd web; npx tsc --noEmit; cd ..`

- [x] **#17 Disconnect: 30-second reconnect grace period**  
  Per PRD §7: when a player disconnects, start a 30-second grace period instead of immediately forfeiting. If they reconnect within 30s, restore their battle state and continue. After 30s, forfeit and run `endBattle`. Emit `opponent_reconnect_countdown` to the remaining player with the countdown.  
  Accept: reconnecting within 30s resumes battle; after 30s, opponent wins.  
  Validate: `node --check server/index.js`

- [ ] **#18 Haiku variant generation script**  
  Write `scripts/generate-variants.js`: reads all `reviewed: true` source cards from the DB that have fewer than 20 variants, calls Claude Haiku to generate rephrased stems (mc_static/fr_static) or samples param combinations (mc_numeric/fr_numeric), inserts results into `question_variants`.  
  Accept: script runs without errors; inserts variants for at least one card.  
  Validate: `node --check scripts/generate-variants.js`  
  [NEEDS: ANTHROPIC_API_KEY]

- [x] **#19 AP Chemistry Units 3–9 content**  
  Generated source cards for Units 3–9 of AP Chemistry using pipeline.js (Groq LLaMA). Validated with validator_agent.js and imported all clean cards into Supabase via import.js. Total ~1009 cards across 9 units imported.  
  Accept: at least 500 new AP Chem cards seeded and reviewed.

- [x] **#20 Report-question button**  
  Add a small "⚑ Report" button in the battle UI below the question stem. Clicking it inserts a row into a `question_reports` table (`question_variant_id`, `reporter_id`, `reason`, `created_at`). No immediate action — just collects reports for review.  
  Requires: `supabase/migrations/009_reports.sql`.  
  Accept: button appears in battle; clicking it inserts a report row.  
  Validate: `cd web; npx tsc --noEmit; cd ..`
