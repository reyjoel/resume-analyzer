import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '~/lib/supabase';

export const meta = () => [
  { title: 'HireLens AI | Login' },
  { name: 'description', content: 'Sign in to your account' },
];

function VerifyEmail({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    setStatus('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      setStatus('error');
    } else {
      setStatus('sent');
      setCooldown(60);
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="w-16 h-16 bg-[rgba(124,107,255,0.15)] rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-[#9b8cff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-text-primary">Check your email</h2>
        <p className="text-text-secondary text-sm mt-1">
          We sent a verification link to <span className="font-medium text-text-primary">{email}</span>
        </p>
      </div>
      {status === 'sent' && (
        <p className="text-green-400 text-sm font-medium">Email resent!</p>
      )}
      {status === 'error' && (
        <p className="text-red-400 text-sm">Failed to resend. Please try again.</p>
      )}
      <button
        onClick={handleResend}
        disabled={status === 'sending' || cooldown > 0}
        className="text-[#9b8cff] text-sm font-medium hover:underline disabled:opacity-50 disabled:no-underline"
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : status === 'sending' ? 'Sending...' : 'Resend verification email'}
      </button>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setError('Please verify your email before signing in.');
        } else {
          setError('Invalid email or password.');
        }
        return;
      }

      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setVerifyEmail(email);
  };

  if (verifyEmail) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="bg-surface rounded-2xl border border-border p-10 w-full max-w-md">
          <VerifyEmail email={verifyEmail} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="bg-surface rounded-2xl border border-border p-10 w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary">
            {tab === 'signin' ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="text-text-secondary text-sm">
            {tab === 'signin' ? 'Sign in to analyze your resume' : 'Start analyzing your resume for free'}
          </p>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => { setTab('signin'); setError(''); }}
            className={`pb-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'signin' ? 'border-[#9b8cff] text-[#9b8cff]' : 'border-transparent text-text-secondary'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab('signup'); setError(''); }}
            className={`pb-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'signup' ? 'border-[#9b8cff] text-[#9b8cff]' : 'border-transparent text-text-secondary'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form
          onSubmit={tab === 'signin' ? handleSignIn : handleSignUp}
          className="flex flex-col gap-4"
        >
          <div className="form-div">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              name="email"
              id="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-div">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              name="password"
              id="password"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading
              ? tab === 'signin' ? 'Signing in...' : 'Creating account...'
              : tab === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}
