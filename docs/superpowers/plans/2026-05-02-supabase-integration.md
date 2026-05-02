# Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all localStorage stubs and manual token management with a real Supabase project handling auth (email + password with verification), CRUD for resumes, and database-backed rate limiting.

**Architecture:** A single `@supabase/supabase-js` client is created in `app/lib/supabase.ts` and imported everywhere else. Auth state is managed via `supabase.auth.getSession()` + `onAuthStateChange` in `root.tsx`, which updates the Zustand store. All `api.ts` and `rateLimit.ts` functions swap their localStorage bodies for Supabase queries — callers are unchanged.

**Tech Stack:** `@supabase/supabase-js`, Supabase Auth (email/password), Supabase Postgres (resumes + daily_usage tables), React Router 7, Zustand, TypeScript

---

## File Map

| Action | Path | What changes |
|---|---|---|
| Install | `@supabase/supabase-js` | New dependency |
| Modify | `.env` | Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| Create | `app/lib/supabase.ts` | Singleton Supabase client |
| Modify | `app/lib/store.ts` | Remove `token`; change `setAuth` to accept user only; keep `hydrated` |
| Modify | `app/lib/api.ts` | Remove `login()`; replace localStorage with Supabase queries |
| Modify | `app/lib/rateLimit.ts` | Replace localStorage with `daily_usage` Supabase queries; all exports become `async` |
| Modify | `app/root.tsx` | Replace localStorage hydration with `getSession()` + `onAuthStateChange` |
| Modify | `app/routes/login.tsx` | Full rewrite — sign-in/sign-up tabs + inline `VerifyEmail` component |
| Modify | `app/components/Navbar.tsx` | Add Sign Out button |
| Modify | `app/routes/home.tsx` | Use `user` (not `token`/`hydrated`); make `remaining` async |
| Modify | `app/routes/upload.tsx` | Use `user`; await `canAnalyze` and `recordAnalysis` |
| Modify | `app/routes/resume.tsx` | Use `user` (not `token`/`hydrated`) |

---

## Task 1: Install Supabase SDK and update .env

**Files:**
- Install: `@supabase/supabase-js`
- Modify: `.env`

- [ ] **Step 1: Install the SDK**

```bash
npm install @supabase/supabase-js
```

Expected: `added N packages`, no errors.

- [ ] **Step 2: Add env vars to .env**

Append to `.env` (keep the existing `VITE_ANTHROPIC_API_KEY` line):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Replace the placeholder values with the real ones from **Supabase dashboard → Project Settings → API**.

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: zero errors.

---

## Task 2: Create app/lib/supabase.ts

**Files:**
- Create: `app/lib/supabase.ts`

- [ ] **Step 1: Create the file**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

---

## Task 3: Update app/lib/store.ts

**Files:**
- Modify: `app/lib/store.ts`

Remove `token` (Supabase manages JWT internally). Change `setAuth` to accept just the user object. Keep `hydrated` and `setHydrated` — still needed for the initial session check before routes can safely redirect.

- [ ] **Step 1: Replace entire file**

```typescript
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
}

interface AppStore {
  user: User | null;
  resumes: Resume[];
  hydrated: boolean;
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setResumes: (resumes: Resume[]) => void;
  addResume: (resume: Resume) => void;
  setHydrated: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  resumes: [],
  hydrated: false,
  setAuth: (user) => set({ user }),
  clearAuth: () => set({ user: null }),
  setResumes: (resumes) => set({ resumes }),
  addResume: (resume) => set((state) => ({ resumes: [...state.resumes, resume] })),
  setHydrated: () => set({ hydrated: true }),
}));
```

- [ ] **Step 2: Verify typecheck (errors expected in callers — that's fine)**

```bash
npm run typecheck
```

Expected: errors in `root.tsx`, `login.tsx`, `home.tsx`, `upload.tsx`, `resume.tsx` that pass `token` to `setAuth` or read `token` from the store. These are resolved in later tasks.

---

## Task 4: Update app/lib/api.ts

**Files:**
- Modify: `app/lib/api.ts`

Remove `login()`. Replace localStorage with Supabase queries. Map snake_case DB columns to the camelCase `Resume` TypeScript type.

- [ ] **Step 1: Replace entire file**

```typescript
import { supabase } from './supabase';

interface DbResume {
  id: string;
  user_id: string;
  company_name: string | null;
  job_title: string | null;
  job_description: string | null;
  feedback: Feedback;
  created_at: string;
}

function toResume(row: DbResume): Resume {
  return {
    id: row.id,
    companyName: row.company_name ?? undefined,
    jobTitle: row.job_title ?? undefined,
    imagePath: '',
    resumePath: '',
    feedback: row.feedback,
  };
}

export async function saveResume(data: {
  id: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  feedback: Feedback;
}): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('resumes').insert({
    id: data.id,
    user_id: user.id,
    company_name: data.companyName,
    job_title: data.jobTitle,
    job_description: data.jobDescription,
    feedback: data.feedback,
  });

  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function getResumes(): Promise<Resume[]> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as DbResume[]).map(toResume);
}

export async function getResume(id: string): Promise<Resume | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return toResume(data as DbResume);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `api.ts`. Errors may remain in `login.tsx` (still imports `login`).

---

## Task 5: Update app/lib/rateLimit.ts

**Files:**
- Modify: `app/lib/rateLimit.ts`

Replace all localStorage logic with Supabase `daily_usage` queries. All three exports become `async`.

- [ ] **Step 1: Replace entire file**

```typescript
import { supabase } from './supabase';

const DAILY_LIMIT = 5;

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export async function canAnalyze(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('date', getToday())
    .single();

  if (!data) return true;
  return (data.count as number) < DAILY_LIMIT;
}

export async function recordAnalysis(userId: string): Promise<void> {
  const today = getToday();

  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (data) {
    await supabase
      .from('daily_usage')
      .update({ count: (data.count as number) + 1 })
      .eq('user_id', userId)
      .eq('date', today);
  } else {
    await supabase
      .from('daily_usage')
      .insert({ user_id: userId, date: today, count: 1 });
  }
}

export async function getRemainingToday(userId: string): Promise<number> {
  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('date', getToday())
    .single();

  if (!data) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - (data.count as number));
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: errors in `upload.tsx` and `home.tsx` where `canAnalyze`, `recordAnalysis`, `getRemainingToday` are called without `await`. These are fixed in Tasks 9 and 10.

---

## Task 6: Update app/root.tsx

**Files:**
- Modify: `app/root.tsx`

Replace the localStorage `useEffect` with `supabase.auth.getSession()` (initial check) and `onAuthStateChange` (subsequent changes). Clean up the subscription on unmount.

- [ ] **Step 1: Replace entire file**

```typescript
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';

import type { Route } from './+types/root';
import './app.css';
import { useAppStore } from './lib/store';
import { supabase } from './lib/supabase';
import { useEffect } from 'react';

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setHydrated } = useAppStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuth({ id: session.user.id, email: session.user.email ?? '' });
      }
      setHydrated();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuth({ id: session.user.id, email: session.user.email ?? '' });
      } else {
        clearAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth, clearAuth, setHydrated]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: `root.tsx` errors resolved. Remaining errors in `login.tsx`, `home.tsx`, `upload.tsx`, `resume.tsx`.

---

## Task 7: Update app/routes/login.tsx

**Files:**
- Modify: `app/routes/login.tsx`

Full rewrite. Two tabs (Sign In / Sign Up). After sign-up, show `VerifyEmail` component inline with a resend button (60s cooldown).

- [ ] **Step 1: Replace entire file**

```typescript
import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '~/lib/supabase';

export const meta = () => [
  { title: 'Resume Analyzer | Login' },
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
      <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
        <p className="text-gray-500 text-sm mt-1">
          We sent a verification link to <span className="font-medium text-gray-800">{email}</span>
        </p>
      </div>
      {status === 'sent' && (
        <p className="text-green-600 text-sm font-medium">Email resent!</p>
      )}
      {status === 'error' && (
        <p className="text-red-500 text-sm">Failed to resend. Please try again.</p>
      )}
      <button
        onClick={handleResend}
        disabled={status === 'sending' || cooldown > 0}
        className="text-indigo-600 text-sm font-medium hover:underline disabled:opacity-50 disabled:no-underline"
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

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setError('Please verify your email before signing in.');
      } else {
        setError('Invalid email or password.');
      }
      setIsLoading(false);
      return;
    }

    navigate('/');
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
      <main className="min-h-screen flex items-center justify-center bg-cover bg-[url('/images/bg-main.svg')]">
        <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
          <VerifyEmail email={verifyEmail} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-cover bg-[url('/images/bg-main.svg')]">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {tab === 'signin' ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="text-gray-500 text-sm">
            {tab === 'signin' ? 'Sign in to analyze your resume' : 'Start analyzing your resume for free'}
          </p>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setTab('signin'); setError(''); }}
            className={`pb-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'signin' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab('signup'); setError(''); }}
            className={`pb-2 px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'signup' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
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
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `login.tsx`.

---

## Task 8: Update app/components/Navbar.tsx

**Files:**
- Modify: `app/components/Navbar.tsx`

Add a Sign Out button. `onAuthStateChange` in `root.tsx` handles clearing the store and redirect.

- [ ] **Step 1: Replace entire file**

```typescript
import { Link } from 'react-router';
import { supabase } from '~/lib/supabase';

const Navbar = () => {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <nav className="navbar">
      <Link to="/">
        <p className="text-2xl font-bold text-gradient">RESUMIND</p>
      </Link>
      <div className="flex items-center gap-4">
        <Link to="/upload" className="primary-button w-fit">
          Upload Resume
        </Link>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `Navbar.tsx`.

---

## Task 9: Update app/routes/home.tsx

**Files:**
- Modify: `app/routes/home.tsx`

Replace `token`/`hydrated` with `user`/`hydrated`. `getRemainingToday` is now async — fetch it in a `useEffect` and store in state.

- [ ] **Step 1: Replace entire file**

```typescript
import type { Route } from './+types/home';
import Navbar from '~/components/Navbar';
import ResumeCard from '~/components/ResumeCard';
import { useAppStore } from '~/lib/store';
import { getResumes } from '~/lib/api';
import { getRemainingToday } from '~/lib/rateLimit';
import { Link, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Resume Analyzer' },
    { name: 'description', content: 'Smart feedback for dream job!' },
  ];
}

export default function Home() {
  const { user, hydrated } = useAppStore();
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    if (hydrated && !user) navigate('/login');
  }, [user, hydrated]);

  useEffect(() => {
    if (!user) return;
    getRemainingToday(user.id).then(setRemaining);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadResumes = async () => {
      setLoadingResumes(true);
      const data = await getResumes();
      setResumes(data);
      setLoadingResumes(false);
    };
    loadResumes();
  }, [user]);

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
      <Navbar />

      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Track Your Applications & Resume Ratings</h1>
          {!loadingResumes && resumes.length === 0 ? (
            <h2>No resumes found. Upload your first resume to get feedback.</h2>
          ) : (
            <h2>Review your submissions and check AI-powered feedback.</h2>
          )}
          {user && (
            <p className="text-sm text-gray-500 mt-2">
              {remaining}/5 analyses remaining today
            </p>
          )}
        </div>

        {loadingResumes && (
          <div className="flex flex-col items-center justify-center">
            <img src="/images/resume-scan-2.gif" className="w-[200px]" />
          </div>
        )}

        {!loadingResumes && resumes.length > 0 && (
          <div className="resumes-section">
            {resumes.map((resume) => (
              <ResumeCard key={resume.id} resume={resume} />
            ))}
          </div>
        )}

        {!loadingResumes && resumes.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-10 gap-4">
            <Link to="/upload" className="primary-button w-fit text-xl font-semibold">
              Upload Resume
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `home.tsx`.

---

## Task 10: Update app/routes/upload.tsx

**Files:**
- Modify: `app/routes/upload.tsx`

Replace `token`/`hydrated` with `user`/`hydrated`. Await `canAnalyze` and `recordAnalysis` (now async).

- [ ] **Step 1: Replace entire file**

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import FileUploader from '~/components/FileUploader';
import Navbar from '~/components/Navbar';
import { analyzeResume } from '~/lib/claude';
import { extractTextFromPdf } from '~/lib/pdfText';
import { saveResume } from '~/lib/api';
import { canAnalyze, recordAnalysis } from '~/lib/rateLimit';
import { useAppStore } from '~/lib/store';
import { generateUUID } from '~/lib/utils';

const Upload = () => {
  const { user, hydrated } = useAppStore();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [limitError, setLimitError] = useState('');

  const handleAnalyze = async ({
    companyName,
    jobTitle,
    jobDescription,
    file,
  }: {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    file: File;
  }) => {
    if (!user) return navigate('/login');

    if (!(await canAnalyze(user.id))) {
      setLimitError('You have reached your 5 analyses for today. Come back tomorrow.');
      return;
    }

    setIsProcessing(true);
    setLimitError('');

    try {
      setStatusText('Extracting resume text...');
      const resumeText = await extractTextFromPdf(file);
      if (!resumeText) {
        setStatusText('Error: Could not extract text from PDF.');
        setIsProcessing(false);
        return;
      }

      setStatusText('Analyzing with AI...');
      const feedback = await analyzeResume(resumeText, { jobTitle, jobDescription });

      await recordAnalysis(user.id);

      setStatusText('Saving results...');
      const id = generateUUID();
      await saveResume({ id, companyName, jobTitle, jobDescription, feedback });

      setStatusText('Done! Redirecting...');
      navigate(`/resume/${id}`);
    } catch (err) {
      setStatusText(`Error: ${err instanceof Error ? err.message : 'Something went wrong.'}`);
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!file) return;

    const formData = new FormData(form);
    const companyName = formData.get('company-name') as string;
    const jobTitle = formData.get('job-title') as string;
    const jobDescription = formData.get('job-description') as string;

    handleAnalyze({ companyName, jobTitle, jobDescription, file });
  };

  if (hydrated && !user) {
    navigate('/login');
    return null;
  }

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
      <Navbar />

      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Smart feedback for your dream job</h1>
          {isProcessing ? (
            <>
              <h2>{statusText}</h2>
              <img src="/images/resume-scan.gif" className="w-full" />
            </>
          ) : (
            <h2>Drop your resume for an ATS score and improvement tips</h2>
          )}

          {limitError && (
            <p className="text-red-500 font-medium mt-4">{limitError}</p>
          )}

          {!isProcessing && !limitError && (
            <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
              <div className="form-div">
                <label htmlFor="company-name">Company Name</label>
                <input
                  type="text"
                  name="company-name"
                  placeholder="Company Name"
                  id="company-name"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-title">Job Title</label>
                <input
                  type="text"
                  name="job-title"
                  placeholder="Job Title"
                  id="job-title"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-description">Job Description</label>
                <textarea
                  rows={5}
                  name="job-description"
                  placeholder="Paste the job description here"
                  id="job-description"
                />
              </div>
              <div className="form-div">
                <label htmlFor="uploader">Upload Resume</label>
                <FileUploader onFileSelect={setFile} />
              </div>
              <button className="primary-button" type="submit">
                Analyze Resume
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};

export default Upload;
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `upload.tsx`.

---

## Task 11: Update app/routes/resume.tsx

**Files:**
- Modify: `app/routes/resume.tsx`

Replace `token`/`hydrated` with `user`/`hydrated`.

- [ ] **Step 1: Replace entire file**

```typescript
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ATS from '~/components/ATS';
import Details from '~/components/Details';
import Summary from '~/components/Summary';
import { getResume } from '~/lib/api';
import { useAppStore } from '~/lib/store';

export const meta = () => [
  { title: 'Resume Analyzer | Review' },
  { name: 'description', content: 'Detailed overview of your resume' },
];

const Resume = () => {
  const { user, hydrated } = useAppStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);

  useEffect(() => {
    if (hydrated && !user) navigate('/login');
  }, [user, hydrated]);

  useEffect(() => {
    const loadResume = async () => {
      if (!id) return;
      const data = await getResume(id);
      if (!data) return;
      setResume(data);
      setFeedback(data.feedback);
    };

    loadResume();
  }, [id]);

  return (
    <main className="!pt-0">
      <nav className="resume-nav">
        <Link to="/" className="back-button">
          <img src="/icons/back.svg" alt="back" className="w-2.5 h-2.5" />
          <span className="text-gray-800 text-sm font-semibold">Back to Homepage</span>
        </Link>
      </nav>

      <div className="flex flex-row w-full max-lg:flex-col-reverse">
        <section className="feedback-section bg-[url('/images/bg-small.svg')] bg-cover h-[100vh] sticky top-0 items-center justify-center">
          {resume && (
            <div className="animate-in fade-in duration-1000 p-8 text-center">
              <h2 className="text-xl font-bold text-gray-800">{resume.companyName}</h2>
              <p className="text-gray-500">{resume.jobTitle}</p>
            </div>
          )}
        </section>

        <section className="feedback-section">
          <h2 className="text-4xl !text-black font-bold">Resume Review</h2>
          {feedback ? (
            <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
              <Summary feedback={feedback} />
              <ATS score={feedback.ATS.score || 0} suggestions={feedback.ATS.tips || []} />
              <Details feedback={feedback} />
            </div>
          ) : (
            <img src="/images/resume-scan-2.gif" className="w-full" />
          )}
        </section>
      </div>
    </main>
  );
};

export default Resume;
```

- [ ] **Step 2: Final typecheck — must be zero errors**

```bash
npm run typecheck
```

Expected: **zero errors**. If any remain, fix before proceeding.

- [ ] **Step 3: Start dev server and verify end-to-end**

```bash
npm run dev
```

Test in browser at `http://localhost:5173`:

1. Home page redirects to `/login` ✓
2. Sign Up tab — create a new account → "Check your email" screen appears ✓
3. Resend button works (disabled 60s after click) ✓
4. Click verification link in email → redirects to home, user is logged in ✓
5. Home shows "5/5 analyses remaining today" ✓
6. Upload a PDF → analysis runs → redirected to `/resume/{id}` ✓
7. Resume page loads feedback ✓
8. Home page now shows the resume card ✓
9. "4/5 analyses remaining today" after one analysis ✓
10. Sign Out button in Navbar → redirected to `/login` ✓
11. Sign In tab — log back in → home page ✓

---

## Self-Review: Spec Coverage

| Spec requirement | Task |
|---|---|
| Install `@supabase/supabase-js` | Task 1 |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env` | Task 1 |
| `app/lib/supabase.ts` singleton client | Task 2 |
| `store.ts` — remove `token`, keep `hydrated`, `setAuth` takes user only | Task 3 |
| `api.ts` — remove `login()`, Supabase CRUD, snake_case mapping | Task 4 |
| `rateLimit.ts` — Supabase `daily_usage` queries, all async | Task 5 |
| `root.tsx` — `getSession()` + `onAuthStateChange`, unsubscribe on unmount | Task 6 |
| `login.tsx` — Sign In tab with error handling | Task 7 |
| `login.tsx` — Sign Up tab | Task 7 |
| `login.tsx` — VerifyEmail component with resend + 60s cooldown | Task 7 |
| `Navbar.tsx` — Sign Out button | Task 8 |
| `home.tsx` — user-based auth, async `getRemainingToday` | Task 9 |
| `upload.tsx` — user-based auth, await `canAnalyze`/`recordAnalysis` | Task 10 |
| `resume.tsx` — user-based auth | Task 11 |
| Supabase dashboard setup (manual) | Documented in spec |
