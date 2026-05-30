import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NavBar from '@/components/NavBar';

const MVP_SUBJECTS = [
  'AP Biology',
  'AP Chemistry',
  'AP US History',
  'AP Psychology',
  'AP Calculus AB',
];

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  rating: number;
  user_id: string;
}

interface PageProps {
  searchParams: Promise<{ subject?: string }>;
}

const RANK_STYLES: Record<number, { text: string; bg: string }> = {
  1: { text: 'text-[#C9A84C]',   bg: 'bg-[#C9A84C]/10 border-[#C9A84C]/30' },
  2: { text: 'text-[#9CA3AF]',   bg: 'bg-[#9CA3AF]/10 border-[#9CA3AF]/20' },
  3: { text: 'text-[#CD7F32]',   bg: 'bg-[#CD7F32]/10 border-[#CD7F32]/20' },
};

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { subject: subjectParam } = await searchParams;
  const subject = MVP_SUBJECTS.includes(subjectParam ?? '')
    ? (subjectParam ?? MVP_SUBJECTS[0])
    : MVP_SUBJECTS[0];

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('leaderboard')
    .select('rank, display_name, rating, user_id')
    .eq('subject', subject)
    .order('rank', { ascending: true })
    .limit(50);

  const entries: LeaderboardEntry[] = (rows ?? []).map(r => ({
    rank:         r.rank as number,
    display_name: r.display_name as string,
    rating:       r.rating as number,
    user_id:      r.user_id as string,
  }));

  return (
    <>
      <NavBar />
      <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] px-5 pt-20 pb-12 flex flex-col items-center gap-6">
        <div className="w-full max-w-xl">
          <Link href="/" className="text-[#F5F0E8]/25 hover:text-[#F5F0E8]/60 text-xs uppercase tracking-widest transition-colors">
            ← Back
          </Link>
        </div>

        <div className="w-full max-w-xl">
          <h1 className="font-display font-black text-4xl uppercase tracking-wider text-[#F5F0E8] mb-6">
            Leaderboard
          </h1>

          {/* Subject tabs */}
          <div className="flex flex-wrap gap-1 mb-6">
            {MVP_SUBJECTS.map(s => (
              <Link
                key={s}
                href={`/leaderboard?subject=${encodeURIComponent(s)}`}
                className={`px-3 py-1.5 text-xs uppercase tracking-widest transition-colors ${
                  s === subject
                    ? 'bg-[#C9A84C] text-[#0A0A0A] font-bold'
                    : 'bg-[#141414] border border-[#2A2A2A] text-[#F5F0E8]/40 hover:border-[#C9A84C]/30 hover:text-[#F5F0E8]/70'
                }`}
              >
                {s.replace('AP ', '')}
              </Link>
            ))}
          </div>

          {/* Table */}
          {entries.length === 0 ? (
            <p className="text-[#F5F0E8]/20 text-sm text-center py-12">
              No ratings yet for {subject}.
            </p>
          ) : (
            <div className="flex flex-col gap-px">
              {/* Header */}
              <div className="flex text-xs text-[#F5F0E8]/20 uppercase tracking-widest px-4 py-2">
                <span className="w-10">#</span>
                <span className="flex-1">Player</span>
                <span className="w-20 text-right">ELO</span>
              </div>

              {entries.map((entry) => {
                const rankStyle = RANK_STYLES[entry.rank];
                return (
                  <div
                    key={entry.user_id}
                    className={`flex items-center px-4 py-3 border ${
                      rankStyle
                        ? `${rankStyle.bg}`
                        : 'bg-[#141414] border-[#2A2A2A]'
                    }`}
                  >
                    <span className={`w-10 font-display font-black text-lg tabular-nums ${
                      rankStyle ? rankStyle.text : 'text-[#F5F0E8]/20'
                    }`}>
                      {entry.rank}
                    </span>
                    <span className="flex-1 text-[#F5F0E8]/80 text-sm">{entry.display_name}</span>
                    <span className={`w-20 text-right font-display font-bold text-lg tabular-nums ${
                      rankStyle ? rankStyle.text : 'text-[#F5F0E8]/50'
                    }`}>
                      {entry.rating}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
