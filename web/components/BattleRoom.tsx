'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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

interface Props {
  battle: BattleState;
  opponent: { displayName: string };
  mySocketId: string;
  onSubmit: (index: number) => void;
  myElo: number | null;
  opponentElo: number | null;
  displayName: string;
}

const LABELS = ['A', 'B', 'C', 'D'];

export default function BattleRoom({ battle, opponent, onSubmit, myElo, opponentElo, displayName }: Props) {
  const { phase, question, qIndex, qTotal, selectedIndex, correctIndex, lastCorrect, myScore, oppScore } = battle;
  const [reportSent, setReportSent] = useState(false);

  async function sendReport() {
    if (!question || reportSent) return;
    setReportSent(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('question_reports').insert({
      question_variant_id: question.id,
      reporter_id: user.id,
      reason: 'user_flag',
    });
  }

  if (!question) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] flex items-center justify-center">
        <div className="flex gap-2">
          <span className="w-2 h-2 bg-[#C9A84C] dot-1" />
          <span className="w-2 h-2 bg-[#C9A84C] dot-2" />
          <span className="w-2 h-2 bg-[#C9A84C] dot-3" />
        </div>
      </main>
    );
  }

  // ── Waiting phase ──────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] flex flex-col items-center justify-center px-4 gap-8">
        <p className="font-display font-bold text-xl uppercase tracking-[0.2em] text-[#C9A84C]">
          Answer Submitted
        </p>
        <p className="text-[#F5F0E8]/25 text-xs uppercase tracking-widest">Waiting for opponent</p>

        <div className="flex items-center gap-12 my-4">
          <div className="text-center">
            <p className="text-xs text-[#F5F0E8]/30 uppercase tracking-widest mb-2">{displayName || 'You'}</p>
            <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{myScore}</p>
            {myElo !== null && (
              <p className="text-[#C9A84C] text-xs font-bold mt-2 tabular-nums">{myElo} ELO</p>
            )}
          </div>
          <span className="font-display font-black text-3xl text-[#2A2A2A]">vs</span>
          <div className="text-center">
            <p className="text-xs text-[#F5F0E8]/30 uppercase tracking-widest mb-2">{opponent.displayName}</p>
            <p className="font-display font-black text-6xl tabular-nums text-[#F5F0E8]">{oppScore}</p>
            {opponentElo !== null && (
              <p className="text-[#C9A84C] text-xs font-bold mt-2 tabular-nums">{opponentElo} ELO</p>
            )}
          </div>
        </div>

        <p className="text-[#F5F0E8]/20 text-xs uppercase tracking-widest tabular-nums">
          Q {qIndex} / {qTotal}
        </p>

        <div className="flex gap-2">
          <span className="w-2 h-2 bg-[#C9A84C] dot-1" />
          <span className="w-2 h-2 bg-[#C9A84C] dot-2" />
          <span className="w-2 h-2 bg-[#C9A84C] dot-3" />
        </div>
      </main>
    );
  }

  // ── Question / Reveal phase ────────────────────────────────────────────────
  const isReveal = phase === 'reveal';

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] flex flex-col">
      {/* Score header */}
      <div className="bg-[#0A0A0A] border-b border-[#2A2A2A] px-5 pt-4 pb-3">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          {/* Me */}
          <div className="flex flex-col items-start min-w-0">
            <p className="text-[#F5F0E8]/35 text-xs uppercase tracking-widest truncate max-w-[100px]">
              {displayName || 'You'}
            </p>
            <p className="font-display font-black text-3xl tabular-nums text-[#F5F0E8]">{myScore}</p>
            {myElo !== null && (
              <p className="text-[#C9A84C] text-xs tabular-nums">{myElo}</p>
            )}
          </div>

          {/* Progress */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0 px-3">
            <p className="text-[#F5F0E8]/25 text-xs uppercase tracking-widest tabular-nums">
              {qIndex} / {qTotal}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: qTotal }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 ${i < qIndex ? 'bg-[#C9A84C]' : 'bg-[#2A2A2A]'}`}
                />
              ))}
            </div>
          </div>

          {/* Opponent */}
          <div className="flex flex-col items-end min-w-0">
            <p className="text-[#F5F0E8]/35 text-xs uppercase tracking-widest truncate max-w-[100px]">
              {opponent.displayName}
            </p>
            <p className="font-display font-black text-3xl tabular-nums text-[#F5F0E8]">{oppScore}</p>
            {opponentElo !== null && (
              <p className="text-[#C9A84C] text-xs tabular-nums">{opponentElo}</p>
            )}
          </div>
        </div>

        {/* Gold progress bar */}
        <div className="max-w-xl mx-auto mt-3 h-0.5 bg-[#1C1C1C]">
          <div
            className="h-full bg-[#C9A84C] transition-all duration-500 score-bar"
            style={{ width: `${(qIndex / (qTotal || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Question + Options */}
      <div className="flex-1 flex flex-col justify-center px-5 py-6 max-w-xl mx-auto w-full">
        {/* Question */}
        <p
          key={question.id}
          className="text-base font-medium leading-relaxed text-[#F5F0E8] mb-6 animate-slide-in"
        >
          {question.stem}
        </p>

        {/* Answer buttons */}
        <div className="flex flex-col gap-2">
          {question.options.map((opt, i) => {
            const isCorrect   = isReveal && i === correctIndex;
            const isMyWrong   = isReveal && i === selectedIndex && i !== correctIndex;
            const isDimmed    = isReveal && i !== correctIndex && i !== selectedIndex;
            const isSelected  = !isReveal && i === selectedIndex;

            let containerCls = 'border border-[#2A2A2A] bg-[#141414] hover:bg-[#1C1C1C] hover:border-[#C9A84C]/30';
            let badgeCls     = 'border border-[#C9A84C]/30 text-[#C9A84C]/60';
            let textCls      = 'text-[#F5F0E8]/80';

            if (isCorrect) {
              containerCls = 'border border-[#22C55E] bg-[#22C55E]/10 animate-correct';
              badgeCls     = 'border border-[#22C55E] text-[#22C55E] bg-[#22C55E]/20';
              textCls      = 'text-[#22C55E]';
            } else if (isMyWrong) {
              containerCls = 'border border-[#EF4444] bg-[#EF4444]/10 animate-shake';
              badgeCls     = 'border border-[#EF4444] text-[#EF4444] bg-[#EF4444]/20';
              textCls      = 'text-[#EF4444]';
            } else if (isDimmed) {
              containerCls = 'border border-[#1C1C1C] bg-[#0D0D0D] opacity-35';
              badgeCls     = 'border border-[#2A2A2A] text-[#374151]';
              textCls      = 'text-[#374151]';
            } else if (isSelected) {
              containerCls = 'border border-[#C9A84C] bg-[#C9A84C]/10';
              badgeCls     = 'border border-[#C9A84C] text-[#C9A84C] bg-[#C9A84C]/20';
              textCls      = 'text-[#F5F0E8]';
            }

            return (
              <button
                key={i}
                onClick={() => onSubmit(i)}
                disabled={selectedIndex !== null || isReveal}
                className={`w-full flex items-center gap-4 px-4 py-4 transition-all duration-150 ${containerCls}`}
              >
                <span className={`w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-bold ${badgeCls}`}>
                  {LABELS[i]}
                </span>
                <span className={`text-left text-sm font-medium leading-snug ${textCls}`}>
                  {opt}
                </span>
                {isCorrect && (
                  <span className="ml-auto text-[#22C55E] font-bold text-base flex-shrink-0">✓</span>
                )}
                {isMyWrong && (
                  <span className="ml-auto text-[#EF4444] font-bold text-base flex-shrink-0">✗</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Reveal feedback */}
        {isReveal && lastCorrect !== null && (
          <p className={`text-center text-xs uppercase tracking-widest font-bold mt-4 animate-fade-up ${
            lastCorrect ? 'text-[#22C55E]' : 'text-[#EF4444]'
          }`}>
            {lastCorrect ? 'Correct — next up in a moment' : 'Wrong — next up in a moment'}
          </p>
        )}

        {/* Report */}
        <div className="flex justify-end mt-5">
          <button
            onClick={sendReport}
            disabled={reportSent}
            className="text-xs text-[#F5F0E8]/15 hover:text-[#F5F0E8]/40 transition-colors disabled:opacity-30 uppercase tracking-wider"
          >
            {reportSent ? 'Reported' : '⚑ Report'}
          </button>
        </div>
      </div>
    </main>
  );
}
