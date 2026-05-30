import { redirect } from 'next/navigation';
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

  return (
    <>
      <NavBar displayName={profile?.display_name} elo={topElo} />
      <main className="min-h-screen bg-[#0A0A0A] text-[#F5F0E8] px-5 pt-20 pb-12 flex flex-col items-center gap-8">
        <div className="w-full max-w-xl">
          <Link href="/" className="text-[#F5F0E8]/25 hover:text-[#F5F0E8]/60 text-xs uppercase tracking-widest transition-colors">
            ← Back
          </Link>
        </div>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-[#141414] border border-[#C9A84C]/40 flex items-center justify-center">
            <span className="font-display font-black text-2xl text-[#C9A84C]">{initials}</span>
          </div>
          <h1 className="font-display font-black text-3xl uppercase tracking-wider text-[#F5F0E8]">
            {profile?.display_name ?? '—'}
          </h1>

          {/* Stats row */}
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <p className="font-display font-black text-2xl text-[#22C55E]">{wins}</p>
              <p className="text-[#F5F0E8]/30 text-xs uppercase tracking-widest">Wins</p>
            </div>
            <div className="w-px h-8 bg-[#2A2A2A]" />
            <div className="text-center">
              <p className="font-display font-black text-2xl text-[#EF4444]">{losses}</p>
              <p className="text-[#F5F0E8]/30 text-xs uppercase tracking-widest">Losses</p>
            </div>
            <div className="w-px h-8 bg-[#2A2A2A]" />
            <div className="text-center">
              <p className="font-display font-black text-2xl text-[#C9A84C]">{profile?.current_streak ?? 0}</p>
              <p className="text-[#F5F0E8]/30 text-xs uppercase tracking-widest">Streak</p>
            </div>
            <div className="w-px h-8 bg-[#2A2A2A]" />
            <div className="text-center">
              <p className="font-display font-black text-2xl text-[#F5F0E8]/50">{profile?.longest_streak ?? 0}</p>
              <p className="text-[#F5F0E8]/30 text-xs uppercase tracking-widest">Best</p>
            </div>
          </div>
        </div>

        {/* ELO ratings */}
        <div className="w-full max-w-xl">
          <p className="text-xs text-[#F5F0E8]/25 uppercase tracking-widest mb-3">ELO Ratings</p>
          <div className="flex flex-col gap-px">
            {MVP_SUBJECTS.map(s => (
              <div
                key={s}
                className="flex justify-between items-center bg-[#141414] border border-[#2A2A2A] px-4 py-3"
              >
                <span className="text-[#F5F0E8]/60 text-sm">{s}</span>
                <span className="font-display font-bold text-lg text-[#C9A84C] tabular-nums">
                  {eloMap[s] ?? 1000}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent battles */}
        <div className="w-full max-w-xl">
          <p className="text-xs text-[#F5F0E8]/25 uppercase tracking-widest mb-3">Recent Battles</p>
          {recentBattles.length === 0 ? (
            <p className="text-[#F5F0E8]/20 text-sm">No battles yet.</p>
          ) : (
            <div className="flex flex-col gap-px">
              {recentBattles.map(b => {
                const oppId = b.player1_id === user.id ? b.player2_id : b.player1_id;
                const opponentName = oppId ? (opponentNameMap[oppId] ?? 'Unknown') : 'Unknown';
                const scoresObj = b.scores as Record<string, number> | null;
                const myScore = scoresObj?.[user.id] ?? 0;
                const oppScore = oppId ? (scoresObj?.[oppId] ?? 0) : 0;

                const isWin  = b.winner_id === user.id;
                const isLoss = b.winner_id !== null && b.winner_id !== user.id;

                return (
                  <div
                    key={b.id}
                    className={`flex items-center bg-[#141414] border px-4 py-3 gap-4 ${
                      isWin ? 'border-l-[#22C55E] border-l-2 border-[#1C1C1C]'
                      : isLoss ? 'border-l-[#EF4444] border-l-2 border-[#1C1C1C]'
                      : 'border-[#2A2A2A]'
                    }`}
                  >
                    <span className={`font-display font-bold text-sm w-10 ${
                      isWin ? 'text-[#22C55E]' : isLoss ? 'text-[#EF4444]' : 'text-[#F5F0E8]/30'
                    }`}>
                      {isWin ? 'WIN' : isLoss ? 'LOSS' : 'DRAW'}
                    </span>
                    <span className="text-[#F5F0E8]/50 text-sm flex-1 truncate">vs {opponentName}</span>
                    <span className="text-[#F5F0E8]/60 text-sm tabular-nums font-medium">{myScore}–{oppScore}</span>
                    <span className="text-[#F5F0E8]/20 text-xs tabular-nums">
                      {new Date(b.created_at).toLocaleDateString()}
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
