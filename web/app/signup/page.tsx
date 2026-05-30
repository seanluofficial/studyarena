'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignup() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, display_name: displayName });
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 relative z-10">
      <div className="relative w-full max-w-sm flex flex-col items-center">
        <div className="glow-focus animate-glow-pulse" />

        {/* Logo lockup */}
        <div className="relative z-10 mb-8 flex flex-col items-center animate-rise-in">
          <Image
            src="/logo.png"
            alt="Studiem"
            width={240}
            height={72}
            priority
            className="mb-4"
          />
          <div className="rule-gold w-32 mb-4" />
          <p className="text-[#F5F0E8]/30 text-[0.65rem] uppercase tracking-[0.4em]">
            Competitive Knowledge Battles
          </p>
        </div>

        {/* Auth panel */}
        <div
          className="panel-raised panel-accent-top relative z-10 w-full p-8 animate-rise-in"
          style={{ animationDelay: '0.08s' }}
        >
          <h1 className="font-display font-black text-2xl uppercase tracking-[0.18em] text-[#F5F0E8] mb-1">
            Create Account
          </h1>
          <p className="text-[#6B7280] text-xs uppercase tracking-[0.2em] mb-6">
            Claim your rank
          </p>

          {/* Google */}
          <button
            onClick={handleGoogleSignup}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold px-6 py-3 transition-colors text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4B565]"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#2A2A2A]" />
            <span className="text-[#374151] text-[0.65rem] uppercase tracking-[0.3em]">or</span>
            <div className="flex-1 h-px bg-[#2A2A2A]" />
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[#6B7280] text-[0.65rem] uppercase tracking-[0.22em]">Display Name</span>
              <input
                type="text"
                placeholder="Your callsign"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                minLength={2}
                maxLength={24}
                className="bg-[#0A0A0A] border border-[#2A2A2A] px-4 py-3 text-[#F5F0E8] placeholder-[#374151] text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[#6B7280] text-[0.65rem] uppercase tracking-[0.22em]">Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="bg-[#0A0A0A] border border-[#2A2A2A] px-4 py-3 text-[#F5F0E8] placeholder-[#374151] text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[#6B7280] text-[0.65rem] uppercase tracking-[0.22em]">Password</span>
              <input
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-[#0A0A0A] border border-[#2A2A2A] px-4 py-3 text-[#F5F0E8] placeholder-[#374151] text-sm focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 transition-colors"
              />
            </label>
            {error && (
              <p className="text-[#EF4444] text-xs border-l-2 border-[#EF4444] pl-2 py-1 bg-[#EF4444]/5">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-gold font-display font-black text-base uppercase tracking-[0.2em] py-3.5 mt-1"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>

        <p
          className="relative z-10 text-[#6B7280] text-xs text-center mt-6 uppercase tracking-[0.15em] animate-rise-in"
          style={{ animationDelay: '0.16s' }}
        >
          Have an account?{' '}
          <Link href="/login" className="text-[#C9A84C] hover:text-[#D4B565] transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
