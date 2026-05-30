'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const MVP_SUBJECTS = [
  'AP Biology',
  'AP Chemistry',
  'AP US History',
  'AP Psychology',
  'AP Calculus AB',
];

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

export default function CreateChallengePage() {
  const router = useRouter();
  const [subject, setSubject] = useState('AP Chemistry');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createChallenge() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const res = await fetch(`${SOCKET_URL}/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengerId: user.id, subject }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to create challenge');
      }

      const { challengeId } = await res.json() as { challengeId: string };
      router.push(`/challenge/${challengeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen text-[#F5F0E8] flex flex-col items-center justify-center px-4 py-16">
      <div className="relative z-10 w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-[#6B7280] hover:text-[#C9A84C] text-sm tracking-wide transition-colors"
          >
            ← Lobby
          </Link>
          <span className="font-display text-xs uppercase tracking-[0.2em] text-[#6B7280]">
            Async Challenge
          </span>
        </div>

        <div className="panel panel-accent-top animate-rise-in p-8 flex flex-col gap-7">
          <header className="flex flex-col gap-3">
            <h1 className="font-display font-black uppercase tracking-[0.12em] text-4xl leading-none text-foil">
              Create Challenge
            </h1>
            <div className="rule-gold" />
            <p className="text-[#6B7280] text-sm leading-relaxed">
              Play 10 questions, then share a link. Your friend has{' '}
              <span className="text-[#F5F0E8]/80 font-medium">24 hours</span> to beat your score.
            </p>
          </header>

          <div className="flex flex-col gap-3">
            <label className="font-display text-[11px] text-[#6B7280] uppercase tracking-[0.2em]">
              Subject
            </label>
            <div className="flex flex-col gap-1.5">
              {MVP_SUBJECTS.map(s => {
                const active = subject === s;
                const locked = s !== 'AP Chemistry';
                return (
                  <button
                    key={s}
                    onClick={() => setSubject(s)}
                    aria-pressed={active}
                    className={`group text-left px-4 py-3 border transition-colors flex items-center justify-between focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C] ${
                      active
                        ? 'bg-[#1C1C1C] border-[#C9A84C] text-[#F5F0E8]'
                        : 'bg-[#141414] border-[#2A2A2A] text-[#6B7280] hover:border-[#374151] hover:text-[#F5F0E8]/80'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`inline-block w-1.5 h-1.5 transition-colors ${
                          active ? 'bg-[#C9A84C]' : 'bg-[#374151] group-hover:bg-[#6B7280]'
                        }`}
                      />
                      <span className="font-display uppercase tracking-[0.06em] text-sm">{s}</span>
                    </span>
                    {locked && (
                      <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#6B7280]/70">
                        Coming Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-[#EF4444] text-sm tracking-wide border-l-2 border-[#EF4444] pl-3">
              {error}
            </p>
          )}

          <button
            onClick={createChallenge}
            disabled={loading || subject !== 'AP Chemistry'}
            className="btn-gold font-display font-black uppercase tracking-[0.2em] px-8 py-4 text-sm"
          >
            {loading ? 'Creating…' : 'Start Challenge'}
          </button>
        </div>
      </div>
    </main>
  );
}
