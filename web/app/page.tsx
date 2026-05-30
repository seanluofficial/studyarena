'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { createClient } from '@/lib/supabase/client';
import BattleRoom from '@/components/BattleRoom';
import NavBar from '@/components/NavBar';

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
      <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] flex flex-col items-center justify-center px-4 gap-8">
        <div className="flex flex-col items-center gap-6 animate-gold-burst">
          {/* Result heading */}
          <h2 className={`font-display font-black uppercase tracking-[0.15em] ${
            tied
              ? 'text-6xl text-[#F5F0E8]/40'
              : iWon
              ? 'text-7xl text-[#C9A84C]'
              : 'text-7xl text-[#F5F0E8]/25'
          }`}>
            {tied ? 'DRAW' : iWon ? 'VICTORY' : 'DEFEAT'}
          </h2>

          {wasForfeit && (
            <p className={`text-xs uppercase tracking-widest font-medium ${iWon ? 'text-[#22C55E]' : 'text-[#EF4444]/60'}`}>
              {iWon ? 'Opponent disconnected — you win' : 'You disconnected — counted as a loss'}
            </p>
          )}

          {/* Scores */}
          <div className="flex items-center gap-8 my-2">
            <div className="text-center">
              <p className="text-xs text-[#F5F0E8]/30 uppercase tracking-widest mb-2">{displayName || 'You'}</p>
              <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{myScore}</p>
            </div>
            <span className="font-display font-black text-3xl text-[#2A2A2A]">—</span>
            <div className="text-center">
              <p className="text-xs text-[#F5F0E8]/30 uppercase tracking-widest mb-2">{opponent?.displayName ?? 'Opponent'}</p>
              <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{oppScore}</p>
            </div>
          </div>

          {/* ELO delta */}
          {eloDelta !== null && (
            <div className="flex flex-col items-center gap-1 animate-elo-pop">
              <p className={`font-display font-black text-4xl tabular-nums ${eloDelta >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                {eloDelta >= 0 ? '+' : ''}{eloDelta}
              </p>
              <p className="text-[#F5F0E8]/30 text-xs uppercase tracking-widest">
                ELO → <span className="text-[#C9A84C] font-bold">{myElo}</span>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              onClick={playAgain}
              className="bg-[#C9A84C] hover:bg-[#D4B565] text-[#0A0A0A] font-display font-bold text-sm uppercase tracking-[0.18em] px-8 py-3 transition-colors"
            >
              Play Again
            </button>
            <button
              onClick={returnToLobby}
              className="bg-[#141414] hover:bg-[#1C1C1C] border border-[#2A2A2A] text-[#F5F0E8]/50 hover:text-[#F5F0E8] font-display font-bold text-sm uppercase tracking-[0.18em] px-8 py-3 transition-colors"
            >
              Lobby
            </button>
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

      <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] flex flex-col items-center justify-center px-4 pt-12">

        {/* ── Idle ── */}
        {appPhase === 'idle' && (
          <div className="flex flex-col items-center gap-7 w-full max-w-sm animate-fade-up">
            <div className="text-center">
              <h1 className="font-display font-black text-5xl uppercase tracking-[0.2em] text-[#C9A84C]">
                STUDIEM
              </h1>
              {displayName && (
                <p className="text-[#F5F0E8]/30 text-xs uppercase tracking-widest mt-2">
                  Welcome back, {displayName}
                </p>
              )}
            </div>

            {/* Subject */}
            <div className="w-full">
              <p className="text-xs text-[#F5F0E8]/25 uppercase tracking-widest mb-3">Select Subject</p>
              <div className="flex flex-col gap-1">
                {MVP_SUBJECTS.map(s => (
                  <button
                    key={s}
                    onClick={() => setSubject(s)}
                    className={`w-full text-left px-4 py-3 text-sm transition-all border ${
                      subject === s
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] font-semibold'
                        : 'border-[#2A2A2A] bg-[#141414] text-[#F5F0E8]/45 hover:border-[#C9A84C]/30 hover:text-[#F5F0E8]/80'
                    }`}
                  >
                    {s}
                    {s !== 'AP Chemistry' && (
                      <span className="ml-2 text-xs text-[#F5F0E8]/20">Coming soon</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={joinQueue}
              disabled={!displayName || subject !== 'AP Chemistry'}
              className="w-full bg-[#C9A84C] hover:bg-[#D4B565] disabled:opacity-30 text-[#0A0A0A] font-display font-black text-xl uppercase tracking-[0.2em] py-4 transition-colors"
            >
              Find Match
            </button>

            <button
              onClick={handleSignOut}
              className="text-[#F5F0E8]/20 hover:text-[#F5F0E8]/50 text-xs uppercase tracking-widest transition-colors"
            >
              Sign out
            </button>
          </div>
        )}

        {/* ── Queuing ── */}
        {appPhase === 'queuing' && (
          <div className="flex flex-col items-center gap-5 animate-fade-up">
            <p className="font-display font-bold text-3xl uppercase tracking-wider text-[#F5F0E8]/50">
              Finding Opponent
            </p>
            <p className="text-[#C9A84C] text-xs uppercase tracking-widest">{subject}</p>
            <div className="flex gap-2 mt-2">
              <span className="w-2 h-2 bg-[#C9A84C] dot-1" />
              <span className="w-2 h-2 bg-[#C9A84C] dot-2" />
              <span className="w-2 h-2 bg-[#C9A84C] dot-3" />
            </div>
            <button
              onClick={leaveQueue}
              className="mt-4 text-[#F5F0E8]/20 hover:text-[#F5F0E8]/50 text-xs uppercase tracking-widest transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Countdown ── */}
        {appPhase === 'countdown' && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <p className="text-xs text-[#F5F0E8]/25 uppercase tracking-widest mb-3">Now Battling</p>
              <p className="font-display font-black text-2xl uppercase tracking-wider text-[#F5F0E8]">
                {opponent?.displayName}
              </p>
              {opponentElo !== null && (
                <p className="text-[#C9A84C] text-sm font-bold mt-1 tabular-nums">{opponentElo} ELO</p>
              )}
            </div>
            <p
              key={countdown}
              className="font-display font-black text-[10rem] leading-none text-[#C9A84C] tabular-nums animate-countdown select-none"
            >
              {countdown}
            </p>
          </div>
        )}

        {/* ── Finished (you answered all, waiting for opponent) ── */}
        {appPhase === 'finished' && (
          <div className="flex flex-col items-center gap-6 animate-fade-up">
            <p className="font-display font-bold text-2xl uppercase tracking-wider text-[#F5F0E8]/40">
              All Done
            </p>
            <p className="text-[#F5F0E8]/25 text-xs uppercase tracking-widest">Waiting for opponent to finish</p>

            <div className="flex items-center gap-10 my-4">
              <div className="text-center">
                <p className="text-xs text-[#F5F0E8]/30 uppercase tracking-widest mb-2">{displayName || 'You'}</p>
                <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{battle.myScore}</p>
                {myElo !== null && (
                  <p className="text-[#C9A84C] text-xs font-bold mt-1 tabular-nums">{myElo} ELO</p>
                )}
              </div>
              <span className="font-display font-black text-3xl text-[#2A2A2A]">vs</span>
              <div className="text-center">
                <p className="text-xs text-[#F5F0E8]/30 uppercase tracking-widest mb-2">{opponent?.displayName}</p>
                <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{battle.oppScore}</p>
                {opponentElo !== null && (
                  <p className="text-[#C9A84C] text-xs font-bold mt-1 tabular-nums">{opponentElo} ELO</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <span className="w-2 h-2 bg-[#C9A84C] dot-1" />
              <span className="w-2 h-2 bg-[#C9A84C] dot-2" />
              <span className="w-2 h-2 bg-[#C9A84C] dot-3" />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
