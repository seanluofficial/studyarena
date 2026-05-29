# StudyArena — Autonomous Loop Protocol

## Project Overview

Real-time 1v1 AP exam battle app. Two players face the same 10 questions simultaneously; faster + more accurate player wins. ELO ranking per subject.

- **Web:** Next.js 16 (App Router) — `web/`
- **Server:** Node.js + Express + Socket.io — `server/`
- **Database:** Supabase (Postgres + Auth)
- **Hosting:** Railway (server), Vercel (web)

## Repo Structure

```
web/                  Next.js frontend
  app/page.tsx        Main battle UI (lobby → battle → result)
  components/         BattleRoom.tsx and shared UI
  lib/socket.ts       Socket.io client singleton
  lib/supabase/       Supabase client helpers
server/
  index.js            Socket.io battle server (matchmaking + game loop)
  elo.js              ELO calculation + Supabase upsert
  questions.js        Question loader (reads from Supabase DB, JSON fallback for local dev)
  .env                SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
supabase/
  migrations/         SQL migrations (run in order)
scripts/
  pipeline.js         End-to-end content generation: generate → validate → clean (Groq)
  import.js           Bulk-upsert clean JSON cards into Supabase
  validator_agent.js  Standalone LLM validator for a single unit file
content/
  apchem/             unit1.json–unit9.json (source question JSON for local fallback)
BACKLOG.md            Task list — loop reads this each iteration
PRD.md                Full product spec
CARD_SCHEMA.md        question_variants / source_cards DB schema
```

## Validation Commands

Always run before committing. All must pass.

```powershell
# TypeScript check (web)
cd web; npx tsc --noEmit; cd ..

# Syntax check (server)
node --check server/index.js
node --check server/elo.js
node --check server/questions.js
```

Do NOT run `npm run build` in the loop — it's slow. TypeScript + syntax check is sufficient.

## Current State (as of last commit)

- Email/password auth via Supabase works
- Matchmaking queue works
- Battle sends 10 questions per player drawn from Supabase DB (`question_variants` table)
- Synchronized per-question flow: both players advance in lockstep; reveal shows correct answer + both choices
- ELO updates after battle; subject selection flows through matchmaking, ELO, and battle records
- ~1009 AP Chemistry cards across Units 1–9 imported into `source_cards` / `question_variants`
- Free tier (3 battles/day) and premium flag schema in place; Stripe integration pending

## Autonomous Loop Protocol

Each iteration of `/loop`:

1. **Read `BACKLOG.md`** — find the first unchecked `[ ]` task that is not marked `[BLOCKED]` or `[NEEDS: ...]`
2. **Read all files relevant to that task** before writing any code
3. **Implement the task** — smallest correct change that satisfies the acceptance criteria
4. **Run validation commands** — fix any errors before proceeding
5. **Mark the task complete** in `BACKLOG.md`: change `[ ]` to `[x]`
6. **Commit** with message `feat: <task title>` (or `fix:` / `chore:` as appropriate)
7. **Report**: one sentence on what changed, one sentence on what's next

### Rules

- Complete exactly **one task per iteration** — do not bundle multiple tasks
- **Never break existing working features** — if a change risks breaking auth, ELO, or matchmaking, be conservative and describe the risk
- Tasks marked `[NEEDS: X]` require an environment variable or external credential not present — skip them and pick the next available task
- Tasks marked `[BLOCKED: #N]` cannot start until task #N is checked off — skip and pick next
- If a task requires a DB migration, write it as `supabase/migrations/NNN_description.sql` (increment the number from the last migration file)
- DB migrations are **not auto-applied** — after writing a migration file, note in the commit message that it must be run in the Supabase dashboard
- For UI changes: describe the change in the commit body since you cannot open a browser
- Keep TypeScript strict — no `any` types, no `@ts-ignore`

## Key Constraints from PRD

- Server must be persistent (not serverless) — Railway only
- ELO is per-subject — never mix subjects in elo_ratings queries
- Only `reviewed: true` source cards are served in battles
- Free tier: 3 battles/day (resets midnight UTC)
- Premium: $2.99/mo, unlimited battles
- Matchmaking: ±200 ELO bracket, widen to ±400 after 30s, offer async after 60s
