'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSocket } from '@/lib/socket';
import { createClient } from '@/lib/supabase/client';
import BattleRoom from '@/components/BattleRoom';

const MVP_SUBJECTS = [
  'AP Biology',
  'AP Chemistry',
  'AP US History',
  'AP Psychology',
  'AP Calculus AB',
];

type AppPhase =
  | 'idle'
  | 'queuing'
  | 'countdown'
  | 'battle'
  | 'finished'
  | 'disconnected'
  | 'complete'
  | 'paywall';

interface Question {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
}

interface BattleState {
  phase: 'question' | 'reveal';
  question: Question | null;
  qIndex: number;
  qTotal: number;
  selectedIndex: number | null;
  correctIndex: number | null;
  lastCorrect: boolean | null;
  opponentAnswer: number | null;
  myScore: number;
  oppScore: number;
  oppQIndex: number;
}

export default function Home() {
  const router = useRouter();
  const [appPhase, setAppPhase] = useState<AppPhase>('idle');
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [subject, setSubject] = useState('AP Chemistry');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ displayName: string } | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [finalScores, setFinalScores] = useState<Record<string, number>>({});
  const [myElo, setMyElo] = useState<number | null>(null);
  const [eloDelta, setEloDelta] = useState<number | null>(null);
  const [opponentElo, setOpponentElo] = useState<number | null>(null);
  const [paywallResetAt, setPaywallResetAt] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleState>({
    phase: 'question',
    question: null,
    qIndex: 0,
    qTotal: 0,
    selectedIndex: null,
    correctIndex: null,
    lastCorrect: null,
    opponentAnswer: null,
    myScore: 0,
    oppScore: 0,
    oppQIndex: 0,
  });

  // Load user profile and ELO
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      if (data) setDisplayName(data.display_name);

      const { data: eloRow } = await supabase
        .from('elo_ratings')
        .select('rating')
        .eq('user_id', user.id)
        .eq('subject', subject)
        .single();
      setMyElo(eloRow?.rating ?? 1000);
    });
  }, [router, subject]);

  // Refresh ELO when subject changes
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    supabase
      .from('elo_ratings')
      .select('rating')
      .eq('user_id', userId)
      .eq('subject', subject)
      .single()
      .then(({ data }) => setMyElo(data?.rating ?? 1000));
  }, [userId, subject]);

  const resetBattleState = useCallback(() => {
    setBattle({
      phase: 'question',
      question: null,
      qIndex: 0,
      qTotal: 0,
      selectedIndex: null,
      correctIndex: null,
      lastCorrect: null,
      opponentAnswer: null,
      myScore: 0,
      oppScore: 0,
      oppQIndex: 0,
    });
    setRoomId(null);
    setOpponent(null);
    setWinner(null);
    setFinalScores({});
    setEloDelta(null);
    setReconnectCountdown(null);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.on('connect', () => console.log('[socket] connected:', socket.id));
    socket.on('connect_error', (err) => console.error('[socket] error:', err.message));

    socket.on('queue_joined', () => setAppPhase('queuing'));
    socket.on('queue_left', () => setAppPhase('idle'));

    socket.on('queue_timeout', () => {
      setAppPhase('idle');
    });

    socket.on('match_found', ({ roomId: rid, opponent: opp }) => {
      setRoomId(rid);
      setOpponent(opp);
      setOpponentElo(null);
      setAppPhase('countdown');

      createClient()
        .from('elo_ratings')
        .select('rating')
        .eq('user_id', opp.userId)
        .eq('subject', subject)
        .single()
        .then(({ data }) => setOpponentElo(data?.rating ?? 1000));

      let n = 3;
      setCountdown(n);
      const t = setInterval(() => {
        n--;
        setCountdown(n);
        if (n <= 0) { clearInterval(t); setAppPhase('battle'); }
      }, 1000);
    });

    socket.on('question', ({ index, total, question }) => {
      setAppPhase('battle');
      setBattle(prev => ({
        ...prev,
        phase: 'question',
        question,
        qIndex: index + 1,
        qTotal: total,
        selectedIndex: null,
        correctIndex: null,
        lastCorrect: null,
        opponentAnswer: null,
      }));
    });

    // Per-player result — immediate feedback, then server sends next question
    socket.on('question_result', ({ correct_index, your_answer, correct, score, opponent_score }: {
      correct_index: number;
      your_answer: number;
      correct: boolean;
      score: number;
      opponent_score: number;
    }) => {
      setBattle(prev => ({
        ...prev,
        phase: 'reveal',
        correctIndex: correct_index,
        selectedIndex: your_answer ?? prev.selectedIndex,
        lastCorrect: correct,
        opponentAnswer: null,
        myScore: score,
        oppScore: opponent_score,
      }));
    });

    // Opponent answered — update their score display
    socket.on('opponent_progress', ({ score, questionIndex }: { score: number; questionIndex: number }) => {
      setBattle(prev => ({ ...prev, oppScore: score, oppQIndex: questionIndex }));
    });

    socket.on('you_finished', ({ score, opponent_score }: { score: number; opponent_score: number }) => {
      setBattle(prev => ({ ...prev, myScore: score, oppScore: opponent_score }));
      setAppPhase('finished');
    });

    socket.on('battle_complete', ({ scores, winner: w, eloDeltas }) => {
      setFinalScores(scores);
      setWinner(w);
      const myId = getSocket().id;
      if (myId && eloDeltas?.[myId]) {
        setMyElo(eloDeltas[myId].after);
        setEloDelta(eloDeltas[myId].delta);
      }
      setAppPhase('complete');
    });

    socket.on('battle_limit_reached', ({ resetAt }) => {
      setPaywallResetAt(resetAt);
      setAppPhase('paywall');
    });

    socket.on('opponent_disconnected', () => {
      setReconnectCountdown(30);
    });

    socket.on('opponent_reconnect_countdown', ({ seconds }) => {
      setReconnectCountdown(seconds);
      if (seconds <= 0) setReconnectCountdown(null);
    });

    socket.on('opponent_reconnected', () => {
      setReconnectCountdown(null);
    });

    return () => { socket.disconnect(); };
  }, [subject]);

  function joinQueue() {
    const socket = getSocket();
    socket.emit('join_queue', { userId: userId ?? socket.id, displayName, elo: myElo ?? 1000, subject });
  }

  function leaveQueue() {
    getSocket().emit('leave_queue');
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push('/login');
  }

  function submitAnswer(index: number) {
    if (battle.selectedIndex !== null || battle.phase === 'reveal') return;
    setBattle(prev => ({ ...prev, selectedIndex: index }));
    getSocket().emit('submit_answer', { roomId, answerIndex: index });
  }

  function playAgain(sameOpponent = false) {
    void sameOpponent; // cosmetic distinction for now — both re-queue
    resetBattleState();
    setAppPhase('queuing');
    const socket = getSocket();
    socket.emit('join_queue', { userId: userId ?? socket.id, displayName, elo: myElo ?? 1000, subject });
  }

  // ── Paywall screen ─────────────────────────────────────────────────────────
  if (appPhase === 'paywall') {
    const resetTime = paywallResetAt
      ? new Date(paywallResetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'midnight UTC';
    return (
      <main className="min-h-screen bg-[#0f0f14] text-white flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-4xl">⚔️</div>
        <h2 className="text-2xl font-bold text-center">Daily limit reached</h2>
        <p className="text-gray-400 text-center max-w-sm">
          You&apos;ve used your 3 free battles today. Resets at {resetTime}.
        </p>
        <p className="text-indigo-400 font-semibold text-lg">Premium — $2.99/mo</p>
        <p className="text-gray-500 text-sm text-center">Unlimited battles, unlimited challenges</p>
        <button
          onClick={() => setAppPhase('idle')}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 text-sm transition"
        >
          Back to lobby
        </button>
      </main>
    );
  }

  // ── Complete screen ────────────────────────────────────────────────────────
  if (appPhase === 'complete') {
    const socket = getSocket();
    const myScore = finalScores[socket.id ?? ''] ?? battle.myScore;
    const oppScore = Object.entries(finalScores).find(([id]) => id !== socket.id)?.[1] ?? battle.oppScore;
    const iWon = winner === socket.id;
    const tied = winner === null;

    return (
      <main className="min-h-screen bg-[#0f0f14] text-white flex flex-col items-center justify-center gap-6 px-4">
        <h2 className="text-3xl font-bold">
          {tied ? "Draw" : iWon ? 'Victory' : 'Defeat'}
        </h2>
        <p className="text-gray-400 text-lg">
          {myScore} – {oppScore}
          <span className="text-gray-600 text-sm ml-2">vs {opponent?.displayName}</span>
        </p>
        {eloDelta !== null && (
          <p className={`text-2xl font-bold tabular-nums ${eloDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {eloDelta >= 0 ? '+' : ''}{eloDelta} ELO
            <span className="text-gray-400 text-base font-normal ml-2">→ {myElo}</span>
          </p>
        )}
        <div className="flex gap-4 mt-2">
          <button
            onClick={() => playAgain(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 transition"
          >
            Rematch
          </button>
          <button
            onClick={() => playAgain(false)}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 transition"
          >
            New Opponent
          </button>
        </div>
        <button onClick={() => { resetBattleState(); setAppPhase('idle'); }} className="text-xs text-gray-600 hover:text-gray-400 transition">
          Back to lobby
        </button>
      </main>
    );
  }

  // ── Disconnected — reconnect countdown ────────────────────────────────────
  if (reconnectCountdown !== null) {
    return (
      <main className="min-h-screen bg-[#0f0f14] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-xl font-bold text-yellow-400">Opponent disconnected</p>
        <p className="text-6xl font-bold text-indigo-400 tabular-nums">{reconnectCountdown}</p>
        <p className="text-gray-500 text-sm">Waiting for them to reconnect…</p>
      </main>
    );
  }

  if (appPhase === 'disconnected') {
    return (
      <main className="min-h-screen bg-[#0f0f14] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-xl font-bold text-yellow-400">Opponent disconnected</p>
        <p className="text-gray-500 text-sm">Waiting for result…</p>
      </main>
    );
  }

  // ── Battle screen ──────────────────────────────────────────────────────────
  if (appPhase === 'battle' && battle.question) {
    const socket = getSocket();
    return (
      <BattleRoom
        battle={battle}
        opponent={opponent!}
        mySocketId={socket.id!}
        onSubmit={submitAnswer}
      />
    );
  }

  // ── Lobby / queue / countdown ──────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f0f14] text-white flex flex-col items-center justify-center gap-8 px-4">
      <h1 className="text-4xl font-bold tracking-tight">StudyArena</h1>

      {appPhase === 'idle' && (
        <div className="flex flex-col items-center gap-5 w-full max-w-sm">
          {displayName && (
            <p className="text-gray-400 text-sm">
              <strong className="text-white">{displayName}</strong>
              {myElo !== null && <span className="ml-2 text-yellow-400 font-semibold">{myElo} ELO</span>}
            </p>
          )}

          {/* Subject picker */}
          <div className="w-full">
            <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wider">Subject</label>
            <div className="flex flex-col gap-1">
              {MVP_SUBJECTS.map(s => (
                <button
                  key={s}
                  onClick={() => setSubject(s)}
                  className={`text-left px-4 py-2 text-sm transition ${
                    subject === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {s}
                  {s !== 'AP Chemistry' && <span className="ml-2 text-xs text-gray-600">Coming soon</span>}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={joinQueue}
            disabled={!displayName || subject !== 'AP Chemistry'}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold px-8 py-3 transition tracking-wide"
          >
            Find Match
          </button>

          <div className="flex gap-4 text-xs text-gray-600">
            <Link href="/profile" className="hover:text-gray-400 transition">Profile</Link>
            <Link href="/leaderboard" className="hover:text-gray-400 transition">Leaderboard</Link>
            <button onClick={handleSignOut} className="hover:text-gray-400 transition">Sign out</button>
          </div>
        </div>
      )}

      {appPhase === 'queuing' && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-400 animate-pulse">Searching for opponent in {subject}…</p>
          <button onClick={leaveQueue} className="text-sm text-gray-500 hover:text-gray-300 transition">Cancel</button>
        </div>
      )}

      {appPhase === 'countdown' && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-400">
            vs <span className="text-white font-semibold">{opponent?.displayName}</span>
            {opponentElo !== null && (
              <span className="ml-2 text-yellow-400 font-semibold">{opponentElo} ELO</span>
            )}
          </p>
          <p className="text-7xl font-bold text-indigo-400 tabular-nums">{countdown}</p>
        </div>
      )}
    </main>
  );
}
