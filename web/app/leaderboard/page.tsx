import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NavBar from '@/components/NavBar';
import RankBadge from '@/components/RankBadge';

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

// Podium tints align to the brand tier palette (--tier-gold / --tier-silver /
// --tier-bronze) so the top three echo Gold / Silver / Bronze rank identity.
const RANK_STYLES: Record<number, { text: string; bg: string }> = {
  1: { text: 'text-[#C9A84C]',   bg: 'bg-[#C9A84C]/[0.08] border-[#C9A84C]/40' },
  2: { text: 'text-[#B8BCC4]',   bg: 'bg-[#B8BCC4]/[0.06] border-[#B8BCC4]/25' },
  3: { text: 'text-[#A06A3C]',   bg: 'bg-[#A06A3C]/[0.07] border-[#A06A3C]/30' },
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
      <main className="min-h-screen bg-transparent text-[#F5F0E8] px-5 pt-20 pb-16 flex flex-col items-center gap-6">
        <div className="relative z-10 w-full max-w-xl flex flex-col gap-6">
          <div>
            <Link href="/" className="text-[#F5F0E8]/25 hover:text-[#F5F0E8]/60 text-xs uppercase tracking-[0.2em] transition-colors outline-none focus-visible:text-[#C9A84C]">
              ← Back
            </Link>
          </div>

          {/* Title */}
          <header className="animate-rise-in">
            <p className="font-display font-bold text-xs uppercase tracking-[0.35em] text-[#C9A84C]/70 mb-2">
              Ranked Ladder
            </p>
            <h1 className="font-display font-black text-5xl uppercase tracking-[0.06em] text-foil leading-none">
              Leaderboard
            </h1>
            <div className="rule-gold mt-5" />
          </header>

          {/* Subject tabs — segmented control */}
          <nav className="flex flex-wrap gap-px panel p-1 animate-rise-in" style={{ animationDelay: '0.06s' }}>
            {MVP_SUBJECTS.map(s => (
              <Link
                key={s}
                href={`/leaderboard?subject=${encodeURIComponent(s)}`}
                aria-current={s === subject ? 'page' : undefined}
                className={`px-3.5 py-2 text-xs font-display font-bold uppercase tracking-[0.16em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#C9A84C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414] ${
                  s === subject
                    ? 'bg-[#C9A84C] text-[#0A0A0A]'
                    : 'text-[#F5F0E8]/40 hover:bg-[#1C1C1C] hover:text-[#F5F0E8]/80'
                }`}
              >
                {s.replace('AP ', '')}
              </Link>
            ))}
          </nav>

          {/* Table */}
          {entries.length === 0 ? (
            <div className="panel px-4 py-16 text-center animate-rise-in" style={{ animationDelay: '0.12s' }}>
              <p className="text-[#F5F0E8]/30 text-sm uppercase tracking-[0.2em] font-display">
                No ratings yet for {subject.replace('AP ', '')}.
              </p>
            </div>
          ) : (
            <div className="animate-rise-in" style={{ animationDelay: '0.12s' }}>
              {/* Header row */}
              <div className="flex items-center gap-3 text-[10px] text-[#F5F0E8]/25 uppercase tracking-[0.2em] font-display font-bold px-4 pb-2">
                <span className="w-10">Rank</span>
                <span className="flex-1">Player</span>
                <span className="text-right">Tier · ELO</span>
              </div>

              <div className="flex flex-col gap-px">
                {entries.map((entry) => {
                  const rankStyle = RANK_STYLES[entry.rank];
                  const podium = entry.rank <= 3;
                  return (
                    <div
                      key={entry.user_id}
                      className={`group flex items-center gap-3 px-4 transition-colors ${
                        podium ? 'py-4' : 'py-3'
                      } border ${
                        rankStyle
                          ? `${rankStyle.bg}`
                          : 'bg-[#141414] border-[#2A2A2A] hover:border-[#C9A84C]/30 hover:bg-[#1C1C1C]'
                      }`}
                    >
                      <span className={`w-10 font-display font-black tabular-nums ${
                        podium ? 'text-2xl' : 'text-lg'
                      } ${rankStyle ? rankStyle.text : 'text-[#F5F0E8]/25'}`}>
                        {entry.rank}
                      </span>
                      <span className={`flex-1 min-w-0 truncate ${
                        podium
                          ? 'font-display font-bold uppercase tracking-[0.04em] text-base text-[#F5F0E8]'
                          : 'text-sm text-[#F5F0E8]/80'
                      }`}>
                        {entry.display_name}
                      </span>
                      <RankBadge
                        elo={entry.rating}
                        size={podium ? 'md' : 'sm'}
                        className="flex-shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
