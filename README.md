# HireLens AI

AI-powered resume analyzer that scores your resume and gives actionable feedback tailored to a specific job.

## What it does

Upload a PDF resume and paste a job description. The app extracts your resume text, sends it to Claude via a Supabase Edge Function, and returns a detailed breakdown across five categories:

- **ATS** — how well it passes Applicant Tracking Systems
- **Tone & Style** — language, professionalism, clarity
- **Content** — relevance, achievements, specifics
- **Structure** — formatting, sections, readability
- **Skills** — alignment with the job description

Each category gets a score out of 100 with specific tips flagged as strengths or areas to improve.

## Tech stack

- **Frontend** — React Router 7 (SSR), Vite, TailwindCSS 4, TypeScript
- **Auth + DB** — Supabase (email/password auth, Postgres, Edge Functions)
- **AI** — Claude via Supabase Edge Function (API key stays server-side)
- **PDF parsing** — pdfjs-dist (client-side text extraction, no file upload)
- **State** — Zustand

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In **SQL Editor**, run the schema from `docs/superpowers/specs/2026-05-02-supabase-integration-design.md` (Step 2)
3. In **Edge Functions**, create a function named `analyze-resume` and paste the code from `supabase_edge/supabase_edge_code.ts`
4. In **Project Settings → Edge Functions → Secrets**, add `ANTHROPIC_API_KEY`

### 3. Configure environment

Create `.env` at the project root:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Get these from **Supabase → Project Settings → API**.

### 4. Run

```bash
npm run dev
```

Open `http://localhost:5173`.

## Commands

```bash
npm run dev          # dev server with HMR
npm run build        # production build
npm run typecheck    # type-check
npm test             # run tests (Vitest)
```

## Rate limiting

Each user gets 5 resume analyses per day, tracked in the `daily_usage` Supabase table. This resets automatically at midnight.

## Architecture notes

- The Anthropic API key never reaches the browser — all AI calls go through a Supabase Edge Function
- The Edge Function saves the resume to the database regardless of whether the AI call succeeds (uses empty feedback scores as fallback)
- PDF text is extracted client-side; no file is uploaded or stored
- Auth is handled entirely by Supabase — no manual token management

## Project structure

```
app/
  routes/         # Page components (home, upload, resume, login)
  components/     # UI components (ResumeCard, ScoreCircle, ATS, Details, etc.)
  lib/            # Supabase client, API helpers, rate limiting, store
supabase_edge/    # Edge function code (gitignored — copy-paste to Supabase dashboard)
types/            # Shared TypeScript types
constants/        # AI prompt builder
```
