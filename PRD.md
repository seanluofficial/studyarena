# StudyArena — Product Requirements Document

**Version:** 0.3  
**Date:** 2026-05-22  
**Status:** Draft

---

## 1. Overview

StudyArena is a dark-themed, competitive multiplayer study app where students battle head-to-head on shared AP exam question decks. Two players face the same 10 AI-generated questions simultaneously; the faster, more accurate player wins. ELO ranking, streaks, and a public deck library turn solo studying into a competitive social sport.

---

## 2. Problem

Studying alone is low-retention and boring. Existing alternatives fall short:

| Tool | Gap |
|---|---|
| Quizlet | Multiplayer is asynchronous and weak — no real competition |
| Kahoot | Requires a teacher to host; not self-serve between peers |
| ChatGPT | Generates questions but has no matchmaking, ranking, or social loop |

No product offers self-serve 1v1 real-time battles with AI question variation, ELO ranking, and a shared public deck library.

---

## 3. Target Users

**Primary:** High school students (15–18) taking AP courses in the US.  
**Secondary (future):** SAT/ACT preppers, IB students, general course students.

Both sides of a battle are equal — the challenger and the challenged are the same user type. Neither role is privileged.

---

## 4. Goals

### Launch Goals (Month 1–2)
- Ship a working real-time 1v1 battle experience on AP deck library
- Reach 200 registered users
- Reach 20 paying subscribers ($2.99/mo)

### 3-Month Goals
- $200/mo MRR
- DAU/MAU ratio > 30% (daily battle habit forming)
- At least 5 AP subjects covered in the public deck library

---

## 5. Success Metrics

| Metric | Target |
|---|---|
| Battles completed per DAU | ≥ 2 |
| Free → paid conversion rate | ≥ 8% |
| D7 retention | ≥ 40% |
| Average battles per session | ≥ 2 |
| MRR at month 3 | $200 |

---

## 6. MVP Feature Set

### 6.1 Public Deck Library
- Curated AP subject decks authored and reviewed by the product owner for launch
- Each deck belongs to an AP course and unit (e.g. "AP Biology — Unit 2: Cell Structure")
- Target: **a few thousand questions per AP subject** at launch across all decks for that subject
- Cards are question + multiple choice (4 options) OR free response
- Numeric questions include a randomization parameter range in source metadata (see §7 Numeric Question Randomization)
- Users cannot create custom decks in MVP — all decks are library decks
- Users can browse and filter decks by subject and unit

### 6.2 Real-Time 1v1 Battle (Live Mode)
- Player challenges a friend via invite link OR enters public matchmaking queue
- Both players must accept before battle starts
- Both players receive the **same 10 questions** drawn from the selected deck
- Questions are AI-generated variants (no two battles use identical phrasing)
- Per-question flow:
  - Question appears simultaneously for both players
  - Each player answers independently (no visibility into opponent's answer)
  - No per-question timer — players answer at their own pace
  - Round ends when **both players have answered**
- Scoring:
  - **Accuracy is primary** — correct answers earn points
  - **Speed is the tiebreaker** — if both players score equally, the faster total time wins
  - Final score is displayed after all 10 questions
- Post-battle: result screen shows win/loss, point breakdown, ELO delta, and correct answers

### 6.3 Async Challenge Mode (MVP)
- Player sends a challenge link to a friend
- Friend has **24 hours** to complete their 10 questions
- Same deck + same AI-generated question set as the challenger
- Challenger's answers and time are locked at submission; friend answers against that benchmark
- Result resolves automatically when the window closes or friend submits

### 6.4 ELO Ranking
- Every user starts at ELO 1000
- ELO updates after every completed battle (live and async)
- ELO is **per-subject** (your AP Biology ELO is separate from AP Chemistry)
- Per-subject ELO breakdown is visible to all users, free and paid
- Leaderboard: top 50 per subject, global, visible to all users

### 6.5 Streaks
- A streak increments for each day a user completes at least 1 battle
- Streak is displayed on the user's profile
- Streak resets at midnight local time if no battle is completed

### 6.6 Free vs. Premium Tier

| Feature | Free | Premium ($2.99/mo) |
|---|---|---|
| Battles per day | 3 (resets midnight) | Unlimited |
| Async challenges | 1 active at a time | Unlimited |
| ELO tracking | ✓ | ✓ |
| Per-subject ELO breakdown | ✓ | ✓ |
| Leaderboard access | ✓ | ✓ |

- Daily battle limit resets at midnight UTC
- Users who hit the limit see a clear paywall with the battle count and reset time

### 6.7 User Profile
- Username, avatar (initials-based default, no upload in MVP)
- Global ELO + per-subject ELO table
- Current streak + longest streak
- Win/loss record
- Recent battle history (last 10)

### 6.8 Authentication
- Email + password
- Google OAuth
- No Steam/Discord SSO in MVP

---

## 7. Battle Mechanics — Detailed Spec

### Question Generation
- Questions are **pre-generated** at deck load time (before the battle starts), not during it
- Claude Haiku generates variants from the source card: same concept, rephrased stem, shuffled distractors
- Multiple choice: 4 options, exactly 1 correct
- Free response: short answer (1–3 words or a number); auto-graded by exact match + LLM semantic match fallback (1–2s "checking…" state is acceptable)
- A pool of 20+ variants per card is stored in the database; 10 are drawn randomly per battle

#### Numeric Question Randomization
- For any source card involving numbers (e.g. "What is the molarity of a 2.5M solution diluted by half?"), Claude generates the question with **randomized numeric values** within a plausible range for that concept
- The correct answer is computed from the randomized values, not looked up
- This prevents answer memorization across battles on math-heavy subjects (AP Calculus AB, AP Chemistry, AP Physics 1, AP Statistics)
- Randomized values must be constrained to avoid degenerate cases (e.g. negative concentrations, zero denominators); constraints are defined per card type in the source deck metadata
- Both players in a battle receive the **same randomized values** — the question set is shared, not independently generated per player

### Battle State Machine

```
LOBBY → COUNTDOWN (3s) → QUESTION_1…10 → REVEAL → COMPLETE
```

- **LOBBY:** Both players confirmed, deck selected, waiting for countdown
- **COUNTDOWN:** 3-second animated countdown before Q1 appears
- **QUESTION_N:** Question visible; player submits answer; UI locks that player's answer; waits for opponent
- **REVEAL:** After both answer, brief reveal (correct answer, both players' answers, time delta) — 2 seconds
- **COMPLETE:** Final score, ELO change, rematch / new opponent buttons

### Disconnect Handling
- If a player disconnects mid-battle: 30-second reconnect grace period
- After 30 seconds: disconnected player forfeits; opponent wins and receives full ELO gain
- Rematch button available on the result screen

### Matchmaking
- Public queue matches players on the **same deck** within an ELO bracket (±200 ELO)
- If no opponent is found within the bracket after 30 seconds: widen to ±400 ELO
- If no opponent is found after 60 seconds total: offer async challenge instead
- Friend challenge bypasses matchmaking and ELO bracket — uses direct invite link

---

## 8. Launch Subject Scope

**MVP (launch):**
- AP Biology
- AP Chemistry
- AP US History
- AP Psychology
- AP Calculus AB

**Phase 2 (month 2–3):**
- AP Physics 1
- AP World History
- AP English Language
- AP Statistics
- AP Computer Science A

**Future:**
- SAT Math / Reading
- IB subjects
- General high school courses
- User-created decks (post-MVP)

---

## 9. UI / Design Direction

- **Dark gaming aesthetic** — not a study app that looks like Duolingo; closer to a ranked game client
- Color palette: near-black background (#0f0f14), electric blue accents, gold for ELO/rank
- Typography: sharp, slightly condensed — not rounded/friendly
- Animations: question reveal uses a fast slide-in; health/score bar updates on answer; ELO gain/loss animation after battle
- Result screen borrows from game end-of-match screens (performance graph, rank change display)
- Mobile-responsive from day one even though native app is post-MVP

---

## 10. Technical Stack (Summary)

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Socket.io-client |
| Backend | Node.js + Express + Socket.io (persistent — cannot be serverless) |
| Database | PostgreSQL via Railway |
| Auth | NextAuth.js (email + Google) |
| AI | Claude Haiku — question variant pre-generation |
| Payments | Stripe Checkout + Webhooks |
| Hosting | Railway.app (persistent Node + Postgres) |

**Critical constraint:** Vercel cannot host the battle server. Railway required from day one.

---

## 11. Out of Scope — MVP

- Custom user-created decks
- Team / class / teacher tier
- Native mobile app
- Voice or video during battles
- In-app chat or messaging
- Tournament brackets
- Spectator mode
- Achievements / badges beyond streak
- Social follows or friend lists (invite link is sufficient for MVP)
- Subject-specific leaderboard filtering beyond top 50

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Socket.io battle desync | Server is single source of truth; clients are dumb renderers only |
| LLM latency during battles | Pre-generate all question variants before battle starts; never call LLM in the real-time path |
| Free tier too restrictive (3/day) | Monitor D1 drop-off; if >60% of free users hit the wall on day 1, raise limit to 5 |
| Cold start (need two players online) | Async mode is in MVP; 60s matchmaking timeout falls back to async offer |
| AI question quality on AP subjects | AP curricula are well-represented in Haiku's training data; add a report-question button for users to flag bad questions |

---

## 13. Open Questions

All questions resolved. See below.

### Resolved
- **Who curates decks?** Product owner writes and reviews all source cards for MVP launch.
- **Free response grading latency:** 1–2s "checking…" state is acceptable.
- **Matchmaking algorithm:** ELO skill-based with ±200 bracket, widens to ±400 after 30s, falls back to async after 60s.
- **Minimum question count at launch:** A few thousand questions per AP subject across all decks for that subject.
- **Numeric question handling:** Numbers randomized per battle within defined ranges; both players receive the same values; correct answer computed from randomized values.
- **Per-subject ELO visibility:** Available to all users, free and paid.
- **Leaderboard scope:** Global only — no school or region segmentation.
