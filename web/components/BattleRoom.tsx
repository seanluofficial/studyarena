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

interface Props {
  battle: BattleState;
  opponent: { displayName: string };
  mySocketId: string;
  onSubmit: (index: number) => void;
}

export default function BattleRoom({ battle, opponent, onSubmit }: Props) {
  const { phase, question, qIndex, qTotal, selectedIndex, correctIndex, lastCorrect, opponentAnswer, myScore, oppScore } = battle;
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
      <main className="min-h-screen bg-[#0f0f14] text-white flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Loading question…</p>
      </main>
    );
  }

  const isReveal = phase === 'reveal';

  return (
    <main className="min-h-screen bg-[#0f0f14] text-white flex flex-col items-center justify-center gap-6 px-4">
      {/* Score header */}
      <div className="flex justify-between w-full max-w-xl text-sm text-gray-400">
        <span>You: <strong className="text-white tabular-nums">{myScore}</strong></span>
        <span className="text-gray-600 tabular-nums">Q {qIndex}/{qTotal}</span>
        <span>{opponent.displayName}: <strong className="text-white tabular-nums">{oppScore}</strong></span>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xl h-1 bg-gray-800">
        <div
          className="h-1 bg-indigo-500 transition-all duration-300"
          style={{ width: `${(qIndex / (qTotal || 1)) * 100}%` }}
        />
      </div>

      <div className="w-full max-w-xl flex flex-col gap-4">
        <p className="text-lg font-medium leading-relaxed">{question.stem}</p>

        <div className="flex flex-col gap-2">
          {question.options.map((opt, i) => {
            let cls = 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200';

            if (isReveal) {
              if (i === correctIndex) {
                cls = 'bg-green-900 border border-green-500 text-green-200';
              } else if (i === selectedIndex && i !== correctIndex) {
                cls = 'bg-red-900 border border-red-600 text-red-200';
              } else {
                cls = 'bg-gray-900 border border-gray-800 text-gray-600';
              }
            } else if (i === selectedIndex) {
              cls = 'bg-indigo-800 border border-indigo-500 text-white';
            }

            const isOpponentAnswer = isReveal && opponentAnswer === i;

            return (
              <button
                key={i}
                onClick={() => onSubmit(i)}
                disabled={selectedIndex !== null || isReveal}
                className={`w-full text-left px-4 py-3 transition ${cls} relative`}
              >
                <span className="font-bold mr-2 text-gray-500">{String.fromCharCode(65 + i)}.</span>
                {opt}
                {isOpponentAnswer && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    ← {opponent.displayName}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Reveal feedback */}
        {isReveal && lastCorrect !== null && (
          <p className={`text-center text-sm font-semibold ${lastCorrect ? 'text-green-400' : 'text-red-400'}`}>
            {lastCorrect ? '✓ Correct' : '✗ Wrong'} — next question in a moment
          </p>
        )}

        {/* Report button */}
        <div className="flex justify-end">
          <button
            onClick={sendReport}
            disabled={reportSent}
            className="text-xs text-gray-700 hover:text-gray-500 transition disabled:opacity-40"
          >
            {reportSent ? 'Reported' : '⚑ Report question'}
          </button>
        </div>
      </div>
    </main>
  );
}
