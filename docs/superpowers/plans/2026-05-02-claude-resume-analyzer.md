# Claude-Ready Resume Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Puter.js dependencies with the Anthropic SDK and stubbed backend calls, delivering a fully working frontend-only resume analyzer.

**Architecture:** The browser extracts PDF text via pdfjs, sends it to Claude using the Anthropic SDK client-side, persists feedback to localStorage via API stub functions, and enforces a 5-analyses-per-day rate limit per user — all without any server or file uploads. A login page calls a stubbed auth endpoint and stores the token in Zustand + localStorage. Every backend call is isolated in `app/lib/api.ts` so swapping to real endpoints later requires touching only that one file.

**Tech Stack:** React Router 7, Vite, Zustand, `@anthropic-ai/sdk`, `pdfjs-dist`, TailwindCSS 4, TypeScript

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `.env` | Hold `VITE_ANTHROPIC_API_KEY` |
| Create | `app/lib/store.ts` | Zustand store — auth token, user, resume list |
| Create | `app/lib/rateLimit.ts` | localStorage-based 5/day rate limiter |
| Create | `app/lib/api.ts` | Backend stubs for login, save, get resumes |
| Create | `app/lib/pdfText.ts` | Extract text from PDF pages using pdfjs |
| Create | `app/lib/claude.ts` | Anthropic SDK wrapper — analyze resume text |
| Create | `app/routes/login.tsx` | Email/password login form |
| Delete | `app/lib/puter.ts` | Puter Zustand store — fully replaced |
| Delete | `types/puter.d.ts` | Puter type definitions — no longer needed |
| Delete | `app/routes/auth.tsx` | Puter auth page — replaced by login.tsx |
| Delete | `app/routes/wipe.tsx` | Puter debug utility — no equivalent needed |
| Modify | `app/root.tsx` | Remove Puter script tag; init auth from localStorage |
| Modify | `app/routes.ts` | Replace `/auth` → `/login`, remove `/wipe` |
| Modify | `app/routes/home.tsx` | Replace puter calls with store + api + rateLimit |
| Modify | `app/routes/upload.tsx` | Replace puter calls with pdfText + claude + api + rateLimit |
| Modify | `app/routes/resume.tsx` | Replace puter calls with api stub (no image loading) |

---

## Task 1: Install Anthropic SDK and create .env

**Files:**
- Create: `.env`
- Install: `@anthropic-ai/sdk`

- [x] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

Expected output: `added 1 package` (or similar), no errors.

- [x] **Step 2: Create .env**

Create `.env` at the project root with:

```
VITE_ANTHROPIC_API_KEY=your-key-here
```

Replace `your-key-here` with a real Anthropic API key. This file already exists with `OPENAI_API_KEY` — replace its entire contents.

- [x] **Step 3: Verify typecheck still passes**

```bash
npm run typecheck
```

Expected: no new errors introduced.

---

## Task 2: Create Zustand store

**Files:**
- Create: `app/lib/store.ts`

- [x] **Step 1: Create the store**

Create `app/lib/store.ts`:

```typescript
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
}

interface AppStore {
  token: string | null;
  user: User | null;
  resumes: Resume[];
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  setResumes: (resumes: Resume[]) => void;
  addResume: (resume: Resume) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  token: null,
  user: null,
  resumes: [],
  setAuth: (token, user) => set({ token, user }),
  clearAuth: () => set({ token: null, user: null }),
  setResumes: (resumes) => set({ resumes }),
  addResume: (resume) => set((state) => ({ resumes: [...state.resumes, resume] })),
}));
```

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `app/lib/store.ts`.

---

## Task 3: Create rate limit module

**Files:**
- Create: `app/lib/rateLimit.ts`

- [x] **Step 1: Create the module**

Create `app/lib/rateLimit.ts`:

```typescript
const DAILY_LIMIT = 5;

interface RateLimitData {
  count: number;
  date: string;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getStoredData(userId: string): RateLimitData {
  const key = `rateLimit:${userId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return { count: 0, date: getToday() };
  const data: RateLimitData = JSON.parse(raw);
  if (data.date !== getToday()) return { count: 0, date: getToday() };
  return data;
}

function saveData(userId: string, data: RateLimitData): void {
  localStorage.setItem(`rateLimit:${userId}`, JSON.stringify(data));
}

export function canAnalyze(userId: string): boolean {
  return getStoredData(userId).count < DAILY_LIMIT;
}

export function recordAnalysis(userId: string): void {
  const data = getStoredData(userId);
  saveData(userId, { ...data, count: data.count + 1 });
}

export function getRemainingToday(userId: string): number {
  return Math.max(0, DAILY_LIMIT - getStoredData(userId).count);
}
```

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

## Task 4: Create backend API stubs

**Files:**
- Create: `app/lib/api.ts`

The stubs persist data to localStorage so the app works end-to-end without a real backend. The function signatures match what the real backend will return — only the bodies change when the backend is ready.

- [x] **Step 1: Create the module**

Create `app/lib/api.ts`:

```typescript
const RESUME_KEY_PREFIX = 'resume:';

interface LoginResponse {
  token: string;
  user: { id: string; email: string };
}

export async function login(email: string, _password: string): Promise<LoginResponse> {
  return {
    token: 'mock-token',
    user: { id: '1', email },
  };
}

export async function saveResume(data: {
  id: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  feedback: Feedback;
}): Promise<{ id: string }> {
  const resume: Resume = {
    id: data.id,
    companyName: data.companyName,
    jobTitle: data.jobTitle,
    imagePath: '',
    resumePath: '',
    feedback: data.feedback,
  };
  localStorage.setItem(`${RESUME_KEY_PREFIX}${data.id}`, JSON.stringify(resume));
  return { id: data.id };
}

export async function getResumes(): Promise<Resume[]> {
  const resumes: Resume[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(RESUME_KEY_PREFIX)) {
      const raw = localStorage.getItem(key);
      if (raw) resumes.push(JSON.parse(raw) as Resume);
    }
  }
  return resumes;
}

export async function getResume(id: string): Promise<Resume | null> {
  const raw = localStorage.getItem(`${RESUME_KEY_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as Resume) : null;
}
```

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

## Task 5: Create PDF text extractor

**Files:**
- Create: `app/lib/pdfText.ts`

Uses the same pdfjs setup pattern as `app/lib/pdf2image.ts` but extracts text instead of rendering to canvas.

- [x] **Step 1: Create the module**

Create `app/lib/pdfText.ts`:

```typescript
let pdfjsLib: any = null;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  // @ts-expect-error - pdfjs-dist/build/pdf.mjs is not a module
  loadPromise = import('pdfjs-dist/build/pdf.mjs').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    pdfjsLib = lib;
    return lib;
  });

  return loadPromise;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText.trim();
}
```

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

## Task 6: Create Claude wrapper

**Files:**
- Create: `app/lib/claude.ts`

- [x] **Step 1: Create the wrapper**

Create `app/lib/claude.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { prepareInstructions } from '../../constants';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

export async function analyzeResume(
  resumeText: string,
  context: { jobTitle: string; jobDescription: string }
): Promise<Feedback> {
  const prompt = prepareInstructions(context);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Resume content:\n${resumeText}\n\n${prompt}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');

  return JSON.parse(block.text) as Feedback;
}
```

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

## Task 7: Remove Puter files

**Files:**
- Delete: `app/lib/puter.ts`
- Delete: `types/puter.d.ts`
- Delete: `app/routes/auth.tsx`
- Delete: `app/routes/wipe.tsx`

- [x] **Step 1: Delete Puter files**

```bash
rm app/lib/puter.ts types/puter.d.ts app/routes/auth.tsx app/routes/wipe.tsx
```

- [x] **Step 2: Expect typecheck errors (normal at this step)**

```bash
npm run typecheck
```

Expected: errors in `app/root.tsx`, `app/routes/home.tsx`, `app/routes/upload.tsx`, `app/routes/resume.tsx` — all referencing `puter`. These are resolved in Tasks 8–12.

---

## Task 8: Update root.tsx

**Files:**
- Modify: `app/root.tsx`

Remove the Puter script tag and `usePuterStore` import. Initialize auth from localStorage on mount using the Zustand store.

- [x] **Step 1: Replace root.tsx**

Replace the entire content of `app/root.tsx` with:

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
  const { setAuth } = useAppStore();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userRaw = localStorage.getItem('user');
    if (token && userRaw) {
      setAuth(token, JSON.parse(userRaw));
    }
  }, [setAuth]);

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

- [x] **Step 2: Verify typecheck (errors should reduce)**

```bash
npm run typecheck
```

Expected: `root.tsx` errors resolved. Remaining errors only in routes files.

---

## Task 9: Update routes.ts and create login.tsx

**Files:**
- Modify: `app/routes.ts`
- Create: `app/routes/login.tsx`

- [x] **Step 1: Update routes.ts**

Replace the entire content of `app/routes.ts` with:

```typescript
import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('/login', 'routes/login.tsx'),
  route('/upload', 'routes/upload.tsx'),
  route('/resume/:id', 'routes/resume.tsx'),
] satisfies RouteConfig;
```

- [x] **Step 2: Create login.tsx**

Create `app/routes/login.tsx`:

```typescript
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { login } from '~/lib/api';
import { useAppStore } from '~/lib/store';

export const meta = () => [
  { title: 'Resume Analyzer | Login' },
  { name: 'description', content: 'Sign in to your account' },
];

export default function Login() {
  const { setAuth } = useAppStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const { token, user } = await login(email, password);
      setAuth(token, user);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/');
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-cover bg-[url('/images/bg-main.svg')]">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-500 text-sm">Sign in to analyze your resume</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [x] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `routes.ts` or `login.tsx`.

---

## Task 10: Update home.tsx

**Files:**
- Modify: `app/routes/home.tsx`

Replace `usePuterStore` with `useAppStore` + `api.getResumes()` + `rateLimit.getRemainingToday()`.

- [x] **Step 1: Replace home.tsx**

Replace the entire content of `app/routes/home.tsx` with:

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
  const { token, user } = useAppStore();
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const remaining = user ? getRemainingToday(user.id) : 0;

  useEffect(() => {
    if (!token) navigate('/login');
  }, [token]);

  useEffect(() => {
    const loadResumes = async () => {
      setLoadingResumes(true);
      const data = await getResumes();
      setResumes(data);
      setLoadingResumes(false);
    };

    loadResumes();
  }, []);

  return (
    <main className="bgf-[url('/images/bg-main.svg')] bg-cover">
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

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `home.tsx`.

---

## Task 11: Update upload.tsx

**Files:**
- Modify: `app/routes/upload.tsx`

Replace all Puter calls with: rate limit check → PDF text extraction → Claude analysis → API save → rate limit record → redirect.

- [x] **Step 1: Replace upload.tsx**

Replace the entire content of `app/routes/upload.tsx` with:

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
  const { token, user } = useAppStore();
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

    if (!canAnalyze(user.id)) {
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

      setStatusText('Saving results...');
      const id = generateUUID();
      await saveResume({ id, companyName, jobTitle, jobDescription, feedback });

      recordAnalysis(user.id);
      setStatusText('Done! Redirecting...');
      navigate(`/resume/${id}`);
    } catch (err) {
      setStatusText(`Error: ${err instanceof Error ? err.message : 'Something went wrong.'}`);
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget.closest('form');
    if (!form || !file) return;

    const formData = new FormData(form);
    const companyName = formData.get('company-name') as string;
    const jobTitle = formData.get('job-title') as string;
    const jobDescription = formData.get('job-description') as string;

    handleAnalyze({ companyName, jobTitle, jobDescription, file });
  };

  if (!token) {
    navigate('/login');
    return null;
  }

  return (
    <main className="bgf-[url('/images/bg-main.svg')] bg-cover">
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

- [x] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors on `upload.tsx`.

---

## Task 12: Update resume.tsx

**Files:**
- Modify: `app/routes/resume.tsx`

Replace Puter KV + file system calls with `api.getResume(id)`. Remove image loading — no images are stored in this phase.

- [x] **Step 1: Replace resume.tsx**

Replace the entire content of `app/routes/resume.tsx` with:

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
  const { token } = useAppStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);

  useEffect(() => {
    if (!token) navigate('/login');
  }, [token]);

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

- [x] **Step 2: Final typecheck — must pass clean**

```bash
npm run typecheck
```

Expected: **zero errors**. If any errors remain, fix them before proceeding.

- [x] **Step 3: Start dev server and verify the app works end-to-end**

```bash
npm run dev
```

Test the full flow in the browser:
1. Navigate to `http://localhost:5173` — should redirect to `/login`
2. Log in with any email/password — should redirect to `/`
3. Home page shows "0/5 analyses remaining today" → wait, should show "5/5 analyses remaining today"
4. Click "Upload Resume" — navigate to `/upload`
5. Fill out the form, drop a PDF, click "Analyze Resume"
6. Status messages update: "Extracting resume text..." → "Analyzing with Claude..." → "Saving results..." → redirect
7. Resume detail page loads with feedback sections (Summary, ATS, Details)
8. Return to home — resume card appears in the list
9. Attempt 6 analyses — 6th should show the rate limit error message

---

## Self-Review: Spec Coverage Check

| Spec requirement | Covered in |
|---|---|
| Remove `app/lib/puter.ts` | Task 7 |
| Remove `types/puter.d.ts` | Task 7 |
| Remove `app/routes/auth.tsx` | Task 7 |
| Remove `app/routes/wipe.tsx` | Task 7 |
| Remove Puter `<script>` from `root.tsx` | Task 8 |
| Remove `OPENAI_API_KEY` from `.env` | Task 1 |
| Create `app/lib/store.ts` with token, user, resumes | Task 2 |
| Create `app/lib/rateLimit.ts` with canAnalyze, recordAnalysis, getRemainingToday | Task 3 |
| Create `app/lib/api.ts` with login, saveResume, getResumes, getResume | Task 4 |
| Create `app/lib/claude.ts` — Anthropic SDK wrapper | Task 6 |
| Create `app/routes/login.tsx` — email/password form | Task 9 |
| `root.tsx` hydrates auth from localStorage on mount | Task 8 |
| `routes.ts` → `/login` replaces `/auth`, `/wipe` removed | Task 9 |
| `upload.tsx` — rate limit check before analysis | Task 11 |
| `upload.tsx` — PDF text extraction via pdfjs | Tasks 5, 11 |
| `upload.tsx` — Claude API call | Tasks 6, 11 |
| `upload.tsx` — save via api stub | Tasks 4, 11 |
| `upload.tsx` — recordAnalysis after save | Task 11 |
| `home.tsx` — loads resumes via api stub | Task 10 |
| `home.tsx` — shows "X/5 analyses remaining today" | Task 10 |
| `resume.tsx` — loads via api stub, no image loading | Task 12 |
| Protected routes redirect to `/login` if no token | Tasks 10, 11, 12 |
| `VITE_ANTHROPIC_API_KEY` in `.env` | Task 1 |
