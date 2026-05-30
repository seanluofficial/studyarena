import Link from 'next/link';
import RankBadge from '@/components/RankBadge';

interface NavBarProps {
  displayName?: string | null;
  elo?: number | null;
  subject?: string | null;
}

export default function NavBar({ displayName, elo, subject }: NavBarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 h-12 bg-[#0A0A0A]/95 border-b border-[#2A2A2A] flex items-stretch justify-between pl-5 pr-3 z-50 backdrop-blur-[2px]">
      {/* Left: wordmark, home link */}
      <Link
        href="/"
        className="flex items-center font-display font-black tracking-[0.22em] text-base text-foil uppercase hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]/60"
      >
        STUDIEM
      </Link>

      {/* Right: player identity + nav links */}
      <div className="flex items-stretch">
        {(displayName || elo != null || subject) && (
          <>
            <div className="flex items-center gap-3 pr-4">
              {displayName && (
                <span className="text-[#F5F0E8]/70 text-xs font-medium tracking-wide hidden sm:block max-w-[12rem] truncate">
                  {displayName}
                </span>
              )}
              {elo != null && <RankBadge elo={elo} size="sm" />}
              {subject && (
                <span className="text-[#6B7280] text-[10px] font-display font-bold uppercase tracking-[0.18em] border border-[#2A2A2A] bg-[#141414] px-2 py-1 hidden md:block">
                  {subject.replace('AP ', '')}
                </span>
              )}
            </div>

            {/* Hairline gold divider between identity and nav */}
            <div className="w-px self-stretch my-2.5 bg-gradient-to-b from-transparent via-[#C9A84C]/55 to-transparent" />
          </>
        )}

        <div className="flex items-stretch">
          <Link
            href="/profile"
            className="flex items-center px-4 text-[#F5F0E8]/45 hover:text-[#C9A84C] text-[11px] font-display font-bold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]/60"
          >
            Profile
          </Link>
          <Link
            href="/leaderboard"
            className="flex items-center px-4 text-[#F5F0E8]/45 hover:text-[#C9A84C] text-[11px] font-display font-bold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]/60"
          >
            Board
          </Link>
        </div>
      </div>
    </nav>
  );
}
