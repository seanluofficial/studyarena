'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { createClient } from '@/lib/supabase/client';
import BattleRoom from '@/components/BattleRoom';
import NavBar from '@/components/NavBar';
import RankBadge from '@/components/RankBadge';

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
  | 'complete';

interface Question {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
}

interface BattleState {
  phase: 'question' | 'reveal' | 'waiting';
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
  const [winner, setWinner] = useState<string | null>(null);
  const [forfeit, setForfeit] = useState<{ forfeitedBy: string | null } | null>(null);
  const [finalScores, setFinalScores] = useState<Record<string, number>>({});
  const [myElo, setMyElo] = useState<number | null>(null);
  const [eloDelta, setEloDelta] = useState<number | null>(null);
  const [opponentElo, setOpponentElo] = useState<number | null>(null);
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
    setForfeit(null);
    setFinalScores({});
    setEloDelta(null);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.on('connect', () => console.log('[socket] connected:', socket.id));
    socket.on('connect_error', (err) => console.error('[socket] error:', err.message));

    socket.on('queue_joined', () => setAppPhase('queuing'));
    socket.on('queue_left', () => setAppPhase('idle'));
    socket.on('queue_timeout', () => setAppPhase('idle'));

    socket.on('match_found', ({ roomId: rid, opponent: opp, myElo: serverMyElo }) => {
      setRoomId(rid);
      setOpponent(opp);
      setOpponentElo(opp?.elo ?? 1000);
      if (typeof serverMyElo === 'number') setMyElo(serverMyElo);
      setAppPhase('countdown');
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

    socket.on('opponent_progress', ({ score, questionIndex }: { score: number; questionIndex: number }) => {
      setBattle(prev => ({ ...prev, oppScore: score, oppQIndex: questionIndex }));
    });

    socket.on('waiting_for_opponent', ({ myScore, opponentScore }: { myScore: number; opponentScore: number }) => {
      setBattle(prev => ({ ...prev, phase: 'waiting', myScore, oppScore: opponentScore }));
    });

    socket.on('you_finished', ({ score, opponent_score }: { score: number; opponent_score: number }) => {
      setBattle(prev => ({ ...prev, myScore: score, oppScore: opponent_score }));
      setAppPhase('finished');
    });

    socket.on('battle_complete', ({ scores, winner: w, eloDeltas, forfeit: didForfeit, forfeitedBy }) => {
      setFinalScores(scores);
      setWinner(w);
      setForfeit(didForfeit ? { forfeitedBy: forfeitedBy ?? null } : null);
      const myId = getSocket().id;
      if (myId && eloDeltas?.[myId]) {
        setMyElo(eloDeltas[myId].after);
        setEloDelta(eloDeltas[myId].delta);
      }
      setAppPhase('complete');
    });

    socket.on('opponent_disconnected', () => {
      // Informational only — server sends battle_complete immediately.
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

  function playAgain() {
    resetBattleState();
    setAppPhase('queuing');
    const socket = getSocket();
    socket.emit('join_queue', { userId: userId ?? socket.id, displayName, elo: myElo ?? 1000, subject });
  }

  function returnToLobby() {
    resetBattleState();
    setAppPhase('idle');
  }

  // ── Complete ───────────────────────────────────────────────────────────────
  if (appPhase === 'complete') {
    const socket = getSocket();
    const myScore = finalScores[socket.id ?? ''] ?? battle.myScore;
    const oppScore = Object.entries(finalScores).find(([id]) => id !== socket.id)?.[1] ?? battle.oppScore;
    const iWon = winner === socket.id;
    const tied = winner === null;
    const wasForfeit = forfeit !== null;

    return (
      <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-md flex flex-col items-center">
          <div className="glow-focus animate-glow-pulse" />

          <div className="panel-raised panel-accent-top relative z-10 w-full px-8 py-10 flex flex-col items-center gap-7 animate-gold-burst">
            {/* Result heading */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-[10px] text-[#F5F0E8]/30 uppercase tracking-[0.4em]">Match Result</p>
              <h2 className={`font-display font-black uppercase leading-none animate-vs-clash ${
                tied
                  ? 'text-6xl text-[#F5F0E8]/40 tracking-[0.15em]'
                  : iWon
                  ? 'text-7xl text-foil tracking-[0.12em]'
                  : 'text-7xl text-[#F5F0E8]/25 tracking-[0.15em]'
              }`}>
                {tied ? 'DRAW' : iWon ? 'VICTORY' : 'DEFEAT'}
              </h2>
            </div>

            {wasForfeit && (
              <p className={`text-[11px] uppercase tracking-[0.2em] font-medium text-center ${iWon ? 'text-[#22C55E]' : 'text-[#EF4444]/60'}`}>
                {iWon ? 'Opponent disconnected — you win' : 'You disconnected — counted as a loss'}
              </p>
            )}

            <div className="rule-gold w-full" />

            {/* Scores */}
            <div className="flex items-center justify-center gap-8 w-full">
              <div className="flex flex-col items-center gap-2 flex-1">
                <p className="text-[11px] text-[#F5F0E8]/40 uppercase tracking-[0.18em] truncate max-w-[8rem]">{displayName || 'You'}</p>
                <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{myScore}</p>
                <RankBadge elo={myElo} size="sm" />
              </div>
              <span className="font-display font-black text-2xl uppercase tracking-[0.1em] text-[#2A2A2A] select-none">vs</span>
              <div className="flex flex-col items-center gap-2 flex-1">
                <p className="text-[11px] text-[#F5F0E8]/40 uppercase tracking-[0.18em] truncate max-w-[8rem]">{opponent?.displayName ?? 'Opponent'}</p>
                <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{oppScore}</p>
                <RankBadge elo={opponentElo} size="sm" />
              </div>
            </div>

            {/* ELO delta */}
            {eloDelta !== null && (
              <div className="flex flex-col items-center gap-2 w-full animate-elo-pop">
                <div className="rule-gold w-2/3" />
                <p className={`font-display font-black text-4xl tabular-nums ${eloDelta >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                  {eloDelta >= 0 ? '+' : ''}{eloDelta}
                </p>
                <p className="text-[#F5F0E8]/30 text-[11px] uppercase tracking-[0.2em] flex items-center gap-2">
                  New Rank <RankBadge elo={myElo} size="sm" />
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-1 w-full">
              <button
                onClick={playAgain}
                className="btn-gold flex-1 font-display font-black text-sm uppercase tracking-[0.18em] px-6 py-3"
              >
                Play Again
              </button>
              <button
                onClick={returnToLobby}
                className="btn-ghost flex-1 font-display font-bold text-sm uppercase tracking-[0.18em] px-6 py-3"
              >
                Lobby
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Battle ─────────────────────────────────────────────────────────────────
  if (appPhase === 'battle' && battle.question) {
    const socket = getSocket();
    return (
      <BattleRoom
        battle={battle}
        opponent={opponent!}
        mySocketId={socket.id!}
        onSubmit={submitAnswer}
        myElo={myElo}
        opponentElo={opponentElo}
        displayName={displayName}
      />
    );
  }

  // ── Lobby / Queue / Countdown / Finished ───────────────────────────────────
  return (
    <>
      {(appPhase === 'idle' || appPhase === 'queuing') && (
        <NavBar displayName={displayName} elo={myElo} subject={appPhase === 'idle' ? subject : undefined} />
      )}

      <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center px-4 pt-12">

        {/* ── Idle ── */}
        {appPhase === 'idle' && (
          <div className="relative flex flex-col items-center gap-8 w-full max-w-sm">
            <div className="glow-focus" />

            {/* Lockup */}
            <div className="relative z-10 flex flex-col items-center gap-3 animate-rise-in">
              <h1 className="font-display font-black text-5xl uppercase tracking-[0.2em] text-foil">
                STUDIEM
              </h1>
              <div className="rule-gold w-24" />
              {displayName && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[#F5F0E8]/35 text-[11px] uppercase tracking-[0.25em]">
                    Welcome back, {displayName}
                  </p>
                  <RankBadge elo={myElo} size="md" />
                </div>
              )}
            </div>

            {/* Subject selector */}
            <div className="panel relative z-10 w-full px-5 py-5 animate-rise-in" style={{ animationDelay: '0.08s' }}>
              <p className="text-[11px] text-[#F5F0E8]/30 uppercase tracking-[0.25em] mb-4">Select Subject</p>
              <div className="flex flex-col gap-1.5">
                {MVP_SUBJECTS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSubject(s)}
                    className={`w-full flex items-center text-left px-4 py-3 text-sm transition-all border ${
                      subject === s
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] font-semibold'
                        : 'border-[#2A2A2A] bg-[#1C1C1C] text-[#F5F0E8]/45 hover:border-[#C9A84C]/30 hover:text-[#F5F0E8]/80'
                    }`}
                  >
                    <span
                      className={`inline-block w-1.5 h-1.5 mr-3 flex-shrink-0 transition-colors ${
                        subject === s ? 'bg-[#C9A84C]' : 'bg-[#2A2A2A]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{s}</span>
                    {s !== 'AP Chemistry' && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-[#F5F0E8]/20">Coming soon</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="relative z-10 w-full flex flex-col items-center gap-2 animate-rise-in"
              style={{ animationDelay: '0.16s' }}
            >
              <button
                onClick={joinQueue}
                disabled={!displayName || subject !== 'AP Chemistry'}
                className="btn-gold w-full font-display font-black text-xl uppercase tracking-[0.2em] py-4"
              >
                Find Match
              </button>
              {subject !== 'AP Chemistry' && (
                <p className="text-[#F5F0E8]/30 text-[10px] uppercase tracking-[0.2em]">
                  Available in AP Chemistry only
                </p>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="relative z-10 text-[#F5F0E8]/20 hover:text-[#F5F0E8]/50 text-xs uppercase tracking-widest transition-colors"
            >
              Sign out
            </button>
          </div>
        )}

        {/* ── Queuing ── */}
        {appPhase === 'queuing' && (
          <div className="relative flex flex-col items-center">
            <div className="glow-focus animate-glow-pulse" />
            <div className="panel-raised relative z-10 px-12 py-10 flex flex-col items-center gap-5 animate-rise-in">
              <p className="text-[10px] text-[#F5F0E8]/30 uppercase tracking-[0.4em]">Searching</p>
              <p className="font-display font-bold text-3xl uppercase tracking-[0.15em] text-[#F5F0E8]/60">
                Finding Opponent
              </p>
              <div className="rule-gold w-32" />
              <p className="text-[#C9A84C] text-xs uppercase tracking-[0.25em] font-bold">{subject}</p>
              <div className="flex gap-2 mt-1">
                <span className="w-2 h-2 bg-[#C9A84C] dot-1" />
                <span className="w-2 h-2 bg-[#C9A84C] dot-2" />
                <span className="w-2 h-2 bg-[#C9A84C] dot-3" />
              </div>
              <button
                onClick={leaveQueue}
                className="mt-2 text-[#F5F0E8]/20 hover:text-[#F5F0E8]/50 text-xs uppercase tracking-widest transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Countdown ── */}
        {appPhase === 'countdown' && (
          <div className="relative flex flex-col items-center gap-10 w-full max-w-lg">
            <div className="glow-focus animate-glow-pulse" />

            {/* VS matchup */}
            <div className="relative z-10 flex items-center justify-center gap-6 w-full animate-rise-in">
              <div className="flex flex-col items-center gap-2 flex-1 text-right">
                <p className="font-display font-black text-xl uppercase tracking-[0.12em] text-[#F5F0E8] truncate max-w-full">
                  {displayName || 'You'}
                </p>
                <RankBadge elo={myElo} size="sm" />
              </div>
              <span className="font-display font-black text-3xl uppercase text-[#C9A84C] animate-vs-clash select-none">
                VS
              </span>
              <div className="flex flex-col items-center gap-2 flex-1 text-left">
                <p className="font-display font-black text-xl uppercase tracking-[0.12em] text-[#F5F0E8] truncate max-w-full">
                  {opponent?.displayName}
                </p>
                <RankBadge elo={opponentElo} size="sm" />
              </div>
            </div>

            <div className="rule-gold relative z-10 w-2/3" />

            <p
              key={countdown}
              className="relative z-10 font-display font-black text-[10rem] leading-none text-foil tabular-nums animate-count-in select-none"
            >
              {countdown}
            </p>
          </div>
        )}

        {/* ── Finished (you answered all, waiting for opponent) ── */}
        {appPhase === 'finished' && (
          <div className="relative w-full max-w-md flex flex-col items-center">
            <div className="glow-focus animate-glow-pulse" />
            <div className="panel-raised panel-accent-top relative z-10 w-full px-8 py-9 flex flex-col items-center gap-6 animate-rise-in">
              <div className="flex flex-col items-center gap-1">
                <p className="font-display font-bold text-2xl uppercase tracking-[0.15em] text-[#F5F0E8]/55">
                  All Done
                </p>
                <p className="text-[#F5F0E8]/25 text-[11px] uppercase tracking-[0.2em]">Waiting for opponent to finish</p>
              </div>

              <div className="rule-gold w-full" />

              <div className="flex items-center justify-center gap-8 w-full">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <p className="text-[11px] text-[#F5F0E8]/40 uppercase tracking-[0.18em] truncate max-w-[8rem]">{displayName || 'You'}</p>
                  <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{battle.myScore}</p>
                  <RankBadge elo={myElo} size="sm" />
                </div>
                <span className="font-display font-black text-2xl uppercase tracking-[0.1em] text-[#2A2A2A] select-none">vs</span>
                <div className="flex flex-col items-center gap-2 flex-1">
                  <p className="text-[11px] text-[#F5F0E8]/40 uppercase tracking-[0.18em] truncate max-w-[8rem]">{opponent?.displayName}</p>
                  <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{battle.oppScore}</p>
                  <RankBadge elo={opponentElo} size="sm" />
                </div>
              </div>

              <div className="flex gap-2">
                <span className="w-2 h-2 bg-[#C9A84C] dot-1" />
                <span className="w-2 h-2 bg-[#C9A84C] dot-2" />
                <span className="w-2 h-2 bg-[#C9A84C] dot-3" />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
