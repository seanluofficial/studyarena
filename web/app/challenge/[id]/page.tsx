'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

interface Question {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
}

interface ChallengeData {
  id: string;
  subject: string;
  questions_json: Question[];
  status: string;
  expires_at: string;
  challenger_id: string;
  challenger_score: number | null;
  opponent_score: number | null;
  winner_id: string | null;
}

type Phase = 'loading' | 'ready' | 'playing' | 'done' | 'error';

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(window.location.href);
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);
    });
  }, [router]);

  useEffect(() => {
    if (!id) return;
    fetch(`${SOCKET_URL}/challenge/${id}`)
      .then(r => r.json())
      .then((data: ChallengeData) => {
        setChallenge(data);
        if (data.status !== 'pending') setPhase('done');
        else setPhase('ready');
      })
      .catch(() => { setError('Challenge not found.'); setPhase('error'); });
  }, [id]);

  const startPlaying = useCallback(() => {
    setPhase('playing');
    setStartTime(Date.now());
    setCurrentQ(0);
    setAnswers({});
    setSelectedIndex(null);
  }, []);

  async function submitAnswer(idx: number) {
    if (selectedIndex !== null) return;
    setSelectedIndex(idx);

    const newAnswers = { ...answers, [currentQ]: idx };
    setAnswers(newAnswers);

    await new Promise(r => setTimeout(r, 1000)); // brief reveal

    if (currentQ + 1 < (challenge?.questions_json.length ?? 0)) {
      setCurrentQ(prev => prev + 1);
      setSelectedIndex(null);
    } else {
      // Submit
      const timeMs = Date.now() - startTime;
      try {
        const answersArr = (challenge?.questions_json ?? []).map((_, i) => newAnswers[i] ?? -1);
        const res = await fetch(`${SOCKET_URL}/challenge/${id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, answers: answersArr, timeMs }),
        });
        const data = await res.json() as { score: number; total: number };
        setResult(data);
      } catch {
        setResult({ score: 0, total: challenge?.questions_json.length ?? 10 });
      }
      setPhase('done');
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
  }

  if (phase === 'loading') {
    return (
      <main className="min-h-screen text-[#F5F0E8] flex items-center justify-center px-4">
        <p className="relative z-10 font-display uppercase tracking-[0.3em] text-sm text-[#6B7280] animate-pulse">
          Loading Challenge<span className="dot-1">.</span><span className="dot-2">.</span><span className="dot-3">.</span>
        </p>
      </main>
    );
  }

  if (phase === 'error' || !challenge) {
    return (
      <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center gap-5 px-4">
        <div className="relative z-10 flex flex-col items-center gap-5 panel p-8 animate-rise-in">
          <p className="text-[#EF4444] font-display uppercase tracking-[0.15em] text-sm">
            {error ?? 'Challenge not found.'}
          </p>
          <a
            href="/"
            className="btn-ghost font-display font-bold uppercase tracking-[0.18em] px-8 py-3 text-sm"
          >
            Go Home
          </a>
        </div>
      </main>
    );
  }

  if (phase === 'ready') {
    const isChallenger = userId === challenge.challenger_id;
    const expiresAt = new Date(challenge.expires_at).toLocaleString();
    return (
      <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center px-4 py-16">
        <div className="relative z-10 w-full max-w-md">
          <div className="glow-focus animate-glow-pulse" />
          <div className="panel-raised panel-accent-top animate-rise-in p-8 flex flex-col items-center gap-6 text-center">
            <span className="font-display text-[11px] uppercase tracking-[0.3em] text-[#6B7280]">
              {isChallenger ? 'Set Your Score' : 'You Have Been Challenged'}
            </span>
            <h1 className="font-display font-black uppercase tracking-[0.1em] text-5xl leading-none text-foil">
              Challenge
            </h1>
            <span className="font-display uppercase tracking-[0.18em] text-sm text-[#C9A84C]">
              {challenge.subject}
            </span>
            <div className="rule-gold w-full" />
            <p className="text-[#6B7280] text-sm leading-relaxed max-w-xs">
              {isChallenger
                ? 'Play these 10 questions to set your score, then share the link with a friend.'
                : `Answer 10 questions and see if you can beat their score. Expires ${expiresAt}.`}
            </p>
            <button
              onClick={startPlaying}
              className="btn-gold font-display font-black uppercase tracking-[0.2em] px-12 py-4 text-sm w-full"
            >
              Start
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (phase === 'done') {
    const isChallenger = userId === challenge.challenger_id;
    const isWin = challenge.status === 'completed' && challenge.winner_id === userId;
    const isLoss = challenge.status === 'completed' && challenge.winner_id !== null && challenge.winner_id !== userId;
    const heading = isWin ? 'Victory'
      : isLoss ? 'Defeat'
      : result ? 'Complete' : 'Challenge Complete';
    return (
      <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center px-4 py-16">
        <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-6">
          {isWin && <div className="glow-focus animate-glow-pulse" />}
          <div className="panel-raised panel-accent-top animate-rise-in p-8 flex flex-col items-center gap-6 text-center w-full">
            <span className="font-display text-[11px] uppercase tracking-[0.3em] text-[#6B7280]">
              {challenge.subject}
            </span>
            <h2
              className={`font-display font-black uppercase tracking-[0.08em] text-6xl leading-none animate-vs-clash ${
                isWin ? 'text-foil' : isLoss ? 'text-[#EF4444]/80' : 'text-[#F5F0E8]/85'
              }`}
            >
              {heading}
            </h2>
            {result && (
              <>
                <div className="rule-gold w-full" />
                <div className="flex flex-col items-center gap-1">
                  <span className="font-display text-[10px] uppercase tracking-[0.3em] text-[#6B7280]">Your Score</span>
                  <p className="font-display font-black tabular-nums text-[#F5F0E8] leading-none flex items-baseline gap-2">
                    <span className="text-6xl">{result.score}</span>
                    <span className="text-[#6B7280] text-3xl">/ {result.total}</span>
                  </p>
                </div>
              </>
            )}

            {isChallenger && challenge.status === 'pending' && (
              <div className="flex flex-col items-center gap-3 w-full pt-2">
                <div className="rule-gold w-full" />
                <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[#6B7280]">
                  Share With Your Opponent
                </p>
                <div className="flex gap-2 items-center w-full">
                  <input
                    readOnly
                    value={shareUrl}
                    className="bg-[#0A0A0A] border border-[#2A2A2A] px-3 py-2.5 text-xs font-mono text-[#F5F0E8]/70 flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]"
                  />
                  <button
                    onClick={copyLink}
                    className="btn-ghost font-display font-bold uppercase tracking-[0.15em] px-4 py-2.5 text-xs shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          <a
            href="/"
            className="text-[#6B7280] hover:text-[#C9A84C] text-sm tracking-wide transition-colors"
          >
            ← Lobby
          </a>
        </div>
      </main>
    );
  }

  // Playing
  const questions = challenge.questions_json;
  const q = questions[currentQ];
  if (!q) return null;

  return (
    <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center px-4 py-12">
      <div className="relative z-10 w-full max-w-xl flex flex-col gap-5">
        <div className="flex justify-between items-center font-display uppercase tracking-[0.2em] text-xs">
          <span className="text-[#F5F0E8] tabular-nums">
            Q <span className="text-[#C9A84C]">{currentQ + 1}</span>
            <span className="text-[#6B7280]"> / {questions.length}</span>
          </span>
          <span className="text-[#6B7280]">{challenge.subject}</span>
        </div>

        <div className="w-full h-1 bg-[#1C1C1C] border-y border-[#2A2A2A]">
          <div
            className="h-full bg-[#C9A84C] transition-all duration-300 ease-out"
            style={{ width: `${((currentQ + (selectedIndex !== null ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>

        <div className="panel p-6 flex flex-col gap-5 animate-rise-in" key={currentQ}>
          <p className="text-lg font-medium leading-relaxed text-[#F5F0E8]">{q.stem}</p>
          <div className="flex flex-col gap-2">
            {q.options.map((opt, i) => {
              let cls = 'bg-[#1C1C1C] border-[#2A2A2A] text-[#F5F0E8]/90 hover:border-[#C9A84C]/60';
              let letterCls = 'text-[#6B7280]';
              if (selectedIndex !== null) {
                if (i === q.correct_index) {
                  cls = 'bg-[#1C1C1C] border-[#22C55E] text-[#F5F0E8]';
                  letterCls = 'text-[#22C55E]';
                } else if (i === selectedIndex) {
                  cls = 'bg-[#1C1C1C] border-[#EF4444] text-[#F5F0E8] animate-shake';
                  letterCls = 'text-[#EF4444]';
                } else {
                  cls = 'bg-[#141414] border-[#2A2A2A] text-[#6B7280]';
                  letterCls = 'text-[#374151]';
                }
              }
              return (
                <button
                  key={i}
                  onClick={() => submitAnswer(i)}
                  disabled={selectedIndex !== null}
                  className={`w-full text-left px-4 py-3 border transition-colors flex items-baseline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C] disabled:cursor-default ${cls}`}
                >
                  <span className={`font-display font-bold mr-3 tabular-nums ${letterCls}`}>
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
