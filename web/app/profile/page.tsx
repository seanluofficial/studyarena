import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NavBar from '@/components/NavBar';
import RankBadge from '@/components/RankBadge';
import Panel from '@/components/ui/Panel';
import { eloToTier } from '@/lib/rank';

const MVP_SUBJECTS = [
  'AP Biology',
  'AP Chemistry',
  'AP US History',
  'AP Psychology',
  'AP Calculus AB',
];

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, eloRes, battlesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, current_streak, longest_streak')
      .eq('id', user.id)
      .single(),
    supabase
      .from('elo_ratings')
      .select('subject, rating')
      .eq('user_id', user.id),
    supabase
      .from('battles')
      .select('id, subject, scores, winner_id, created_at, player1_id, player2_id')
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const profile = profileRes.data;
  const eloRows = eloRes.data ?? [];
  const recentBattles = battlesRes.data ?? [];

  const opponentIds = [
    ...new Set(
      recentBattles
        .map(b => (b.player1_id === user.id ? b.player2_id : b.player1_id))
        .filter(Boolean)
    ),
  ] as string[];

  const { data: opponentProfiles } = opponentIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', opponentIds)
    : { data: [] };

  const opponentNameMap = Object.fromEntries(
    (opponentProfiles ?? []).map(p => [p.id, p.display_name])
  );

  const eloMap = Object.fromEntries(eloRows.map(r => [r.subject, r.rating]));

  let wins = 0, losses = 0;
  for (const b of recentBattles) {
    if (b.winner_id === user.id) wins++;
    else if (b.winner_id !== null) losses++;
  }

  const initials = profile?.display_name?.slice(0, 2).toUpperCase() ?? '??';
  const topElo = eloRows.length > 0 ? Math.max(...eloRows.map(r => r.rating)) : null;
  const topTier = eloToTier(topElo ?? 1000);

  return (
    <>
      <NavBar displayName={profile?.display_name} elo={topElo} />
      <main className="min-h-screen bg-transparent text-[#F5F0E8] px-5 pt-20 pb-16 flex flex-col items-center gap-8">
        <div className="w-full max-w-2xl relative z-10">
          <Link
            href="/"
            className="text-[#F5F0E8]/25 hover:text-[#F5F0E8]/60 text-xs uppercase tracking-widest transition-colors"
          >
            ← Back
          </Link>
        </div>

        {/* ── Career header ─────────────────────────────────────────── */}
        <Panel
          variant="raised"
          accent
          className="w-full max-w-2xl relative z-10 animate-rise-in overflow-hidden"
        >
          <div className="glow-focus" aria-hidden="true" />
          <div className="relative p-7 sm:p-8">
            <div className="flex items-center gap-5">
              {/* Avatar */}
              <div
                className="w-20 h-20 flex-shrink-0 bg-[#0A0A0A] flex items-center justify-center"
                style={{ border: `1px solid ${topTier.color}` }}
              >
                <span
                  className="font-display font-black text-3xl tracking-wide"
                  style={{ color: topTier.color }}
                >
                  {initials}
                </span>
              </div>

              {/* Name + rank */}
              <div className="min-w-0 flex flex-col gap-2.5">
                <p className="text-[#F5F0E8]/30 text-[10px] uppercase tracking-[0.3em]">
                  Player Profile
                </p>
                <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-wider text-[#F5F0E8] truncate leading-none">
                  {profile?.display_name ?? '—'}
                </h1>
                <RankBadge elo={topElo} size="lg" className="self-start mt-0.5" />
              </div>
            </div>

            <div className="rule-gold my-7" />

            {/* Stat blocks */}
            <div className="grid grid-cols-4 gap-px bg-[#2A2A2A] border border-[#2A2A2A]">
              {[
                { label: 'Wins',   value: wins,                        color: '#22C55E' },
                { label: 'Losses', value: losses,                      color: '#EF4444' },
                { label: 'Streak', value: profile?.current_streak ?? 0, color: '#C9A84C' },
                { label: 'Best',   value: profile?.longest_streak ?? 0, color: 'rgba(245,240,232,0.5)' },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="bg-[#141414] px-3 py-4 flex flex-col items-center gap-1"
                >
                  <p
                    className="font-display font-black text-3xl tabular-nums leading-none"
                    style={{ color: stat.color }}
                  >
                    {stat.value}
                  </p>
                  <p className="text-[#F5F0E8]/30 text-[10px] uppercase tracking-[0.2em]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* ── Per-subject ELO ───────────────────────────────────────── */}
        <section className="w-full max-w-2xl relative z-10 animate-rise-in" style={{ animationDelay: '0.06s' }}>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs text-[#F5F0E8]/40 uppercase tracking-[0.2em]">Subject Ratings</p>
            <div className="flex-1 rule-gold" />
          </div>
          <Panel className="flex flex-col">
            {MVP_SUBJECTS.map((s, i) => {
              const rating = eloMap[s] ?? 1000;
              const tier = eloToTier(rating);
              return (
                <div
                  key={s}
                  className={`flex justify-between items-center px-4 py-3.5 gap-4 ${
                    i > 0 ? 'border-t border-[#2A2A2A]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="inline-block w-1 h-7 flex-shrink-0"
                      style={{ backgroundColor: tier.color }}
                      aria-hidden="true"
                    />
                    <span className="text-[#F5F0E8]/75 text-sm font-display font-bold uppercase tracking-wide truncate">
                      {s}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span
                      className="font-display font-bold text-[11px] uppercase tracking-[0.18em] hidden sm:inline"
                      style={{ color: tier.color }}
                    >
                      {tier.name}
                    </span>
                    <span className="font-display font-black text-xl text-[#F5F0E8] tabular-nums w-14 text-right">
                      {rating}
                    </span>
                  </div>
                </div>
              );
            })}
          </Panel>
        </section>

        {/* ── Match history ─────────────────────────────────────────── */}
        <section className="w-full max-w-2xl relative z-10 animate-rise-in" style={{ animationDelay: '0.12s' }}>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs text-[#F5F0E8]/40 uppercase tracking-[0.2em]">Match History</p>
            <div className="flex-1 rule-gold" />
          </div>
          {recentBattles.length === 0 ? (
            <Panel className="px-4 py-8 text-center">
              <p className="text-[#F5F0E8]/25 text-sm uppercase tracking-widest font-display">
                No battles yet
              </p>
            </Panel>
          ) : (
            <Panel className="flex flex-col">
              {recentBattles.map((b, i) => {
                const oppId = b.player1_id === user.id ? b.player2_id : b.player1_id;
                const opponentName = oppId ? (opponentNameMap[oppId] ?? 'Unknown') : 'Unknown';
                const scoresObj = b.scores as Record<string, number> | null;
                const myScore = scoresObj?.[user.id] ?? 0;
                const oppScore = oppId ? (scoresObj?.[oppId] ?? 0) : 0;

                const isWin  = b.winner_id === user.id;
                const isLoss = b.winner_id !== null && b.winner_id !== user.id;

                const edge = isWin ? '#22C55E' : isLoss ? '#EF4444' : '#374151';
                const resultColor = isWin ? '#22C55E' : isLoss ? '#EF4444' : 'rgba(245,240,232,0.3)';

                return (
                  <div
                    key={b.id}
                    className={`flex items-center px-4 py-3.5 gap-4 ${
                      i > 0 ? 'border-t border-[#2A2A2A]' : ''
                    }`}
                    style={{ borderLeft: `3px solid ${edge}` }}
                  >
                    <span
                      className="font-display font-black text-sm uppercase tracking-[0.15em] w-12 flex-shrink-0"
                      style={{ color: resultColor }}
                    >
                      {isWin ? 'WIN' : isLoss ? 'LOSS' : 'DRAW'}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[#F5F0E8]/70 text-sm truncate">
                        <span className="text-[#F5F0E8]/30">vs</span> {opponentName}
                      </span>
                      <span className="text-[#F5F0E8]/30 text-[11px] uppercase tracking-wide truncate">
                        {b.subject}
                      </span>
                    </div>
                    <span className="font-display font-black text-lg text-[#F5F0E8] tabular-nums flex-shrink-0">
                      {myScore}<span className="text-[#F5F0E8]/25 px-0.5">–</span>{oppScore}
                    </span>
                    <span className="text-[#F5F0E8]/20 text-xs tabular-nums w-20 text-right flex-shrink-0">
                      {new Date(b.created_at).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </Panel>
          )}
        </section>
      </main>
    </>
  );
}
