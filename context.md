# Studiem — Project Context

## What it is
Real-time 1v1 competitive knowledge battle app. Two players face the same 10 questions simultaneously. Faster + more accurate player wins. ELO ranking per subject. Think Chess.com but for AP exams (and eventually any topic).

## Tech Stack
- **Frontend:** Next.js 14 App Router, Tailwind CSS — `web/`
- **Backend:** Node.js + Express + Socket.io — `server/`
- **Database:** Supabase (Postgres + Auth)
- **Hosting:** Railway (server), Vercel (web)
- **Auth:** Email/password + Google OAuth

## Current Features (all working)
- Email + Google OAuth login/signup
- Subject selection (AP Chemistry live, others "coming soon")
- ELO-based matchmaking (±200 bracket, widens to ±400 after 30s)
- Synchronized 10-question battles — both players advance in lockstep
- Per-question reveal showing both players' answers + correct answer
- ELO updates after every battle
- Streaks, leaderboard, profile page
- Async challenge link mode
- Report-a-question button
- ~794 pre-rendered AP Chemistry question variants in DB

## App Flow
Lobby (subject select + join queue) → Matchmaking → Countdown → Battle (10 questions, synchronized) → Result (ELO delta, scores) → Play Again / Return to Lobby

## Current UI
Dark gray (`gray-950` background), indigo accent buttons, no strong visual identity. Functional but unstyled. Needs a full design pass.

## Design Direction
- Dark gaming aesthetic — sharp, not rounded/friendly, not Duolingo
- Competitive/prestige feel — think Valorant, Chess.com, not Kahoot
- Name TBD — leading candidates: Reckoning, Verdict, Warlore, Caliber
- Color palette TBD — previous explorations: molten amber + charcoal, electric cyan + deep navy, neon lime + near-black
- Typography: condensed sans-serif, numbers in mono
- Animations: snappy question transitions, ELO counter animation on result, score bar pulse

## Key Pages/Components to Design
- `web/app/login/page.tsx` — login (email + Google button)
- `web/app/signup/page.tsx` — signup
- `web/app/page.tsx` — main app (lobby → battle → result, all one page with phase state)
- `web/components/BattleRoom.tsx` — battle UI (question, options, scores, timer, opponent status)
- `web/app/profile/page.tsx` — ELO per subject, streak, win/loss, battle history
- `web/app/leaderboard/page.tsx` — top 50 per subject

## Battle UI States (in `page.tsx`)
- `idle` — lobby, subject picker, join queue button
- `queuing` — waiting for opponent, ELO shown, cancel button
- `countdown` — 3-2-1 before first question
- `question` — stem + 4 options, opponent status indicator
- `waiting` — submitted answer, waiting for opponent (shows both scores + ELO)
- `reveal` — 2s reveal of both answers + correct answer
- `complete` — final scores, ELO delta animation, Play Again / Return to Lobby

## Constraints
- No `any` TypeScript types
- Tailwind only (no external component libraries unless trivial)
- Must work on mobile (players will be on phones)
- Socket events drive all state — don't break the Socket.io integration
