import Link from 'next/link';

interface NavBarProps {
  displayName?: string | null;
  elo?: number | null;
  subject?: string | null;
}

export default function NavBar({ displayName, elo, subject }: NavBarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 h-12 bg-[#0A0A0A] border-b border-[#C9A84C]/20 flex items-center justify-between px-5 z-50">
      <Link
        href="/"
        className="font-display font-black tracking-[0.18em] text-base text-[#C9A84C] uppercase hover:text-[#D4B565] transition-colors"
      >
        STUDIEM
      </Link>

      <div className="flex items-center gap-5">
        {displayName && (
          <span className="text-[#F5F0E8]/50 text-xs hidden sm:block">{displayName}</span>
        )}
        {elo != null && (
          <span className="text-[#C9A84C] font-bold text-xs tabular-nums">{elo} ELO</span>
        )}
        {subject && (
          <span className="text-[#F5F0E8]/25 text-xs uppercase tracking-widest hidden md:block">
            {subject.replace('AP ', '')}
          </span>
        )}
        <Link
          href="/profile"
          className="text-[#F5F0E8]/35 hover:text-[#F5F0E8]/70 text-xs uppercase tracking-wider transition-colors"
        >
          Profile
        </Link>
        <Link
          href="/leaderboard"
          className="text-[#F5F0E8]/35 hover:text-[#F5F0E8]/70 text-xs uppercase tracking-wider transition-colors"
        >
          Board
        </Link>
      </div>
    </nav>
  );
}
