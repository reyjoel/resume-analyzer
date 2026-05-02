# Supabase Integration Design

**Date:** 2026-05-02
**Status:** Implemented
**Scope:** Create a new Supabase project and integrate it for auth, CRUD, rate limiting, and AI via Edge Function

---

## Overview

Set up a brand-new Supabase project and wire it into the resume analyzer frontend. This replaces the current localStorage stubs in `api.ts`, manual token management in `store.ts`, and `rateLimit.ts` localStorage logic with real Supabase SDK calls. The Claude AI call was moved from client-side (Anthropic SDK + exposed API key) to a Supabase Edge Function, so the Anthropic API key never reaches the browser.

---

## Step 0: Create the Supabase Project (Manual — Done Once)

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Choose your organization, give the project a name (e.g. `resume-analyzer`), set a database password, pick a region
4. Wait for provisioning (~2 minutes)
5. Go to **Project Settings → API**
6. Copy **Project URL** → this is `VITE_SUPABASE_URL`
7. Copy **anon / public key** → this is `VITE_SUPABASE_ANON_KEY`

---

## Step 1: Configure Authentication (Manual — Done Once)

In the Supabase dashboard:

1. Go to **Authentication → Providers → Email**
   - Ensure **Enable Email Provider** is on
   - Ensure **Confirm email** is on (users must verify before signing in)
2. Go to **Authentication → URL Configuration**
   - Set **Site URL** to `http://localhost:5173` for local development
   - Add `http://localhost:5173` to **Redirect URLs**
3. (Optional) Go to **Authentication → Email Templates**
   - Customize the verification email subject and body

---

## Step 2: Create Database Tables (Manual — Done Once)

Run the following SQL in **SQL Editor → New query** in the Supabase dashboard:

```sql
-- Resumes table
create table resumes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  company_name    text,
  job_title       text,
  job_description text,
  feedback        jsonb not null,
  created_at      timestamptz default now()
);

alter table resumes enable row level security;

create policy "Users can manage their own resumes"
  on resumes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Daily usage table (rate limiting)
create table daily_usage (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references auth.users not null,
  date     date not null default current_date,
  count    int not null default 0,
  unique(user_id, date)
);

alter table daily_usage enable row level security;

create policy "Users can manage their own usage"
  on daily_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**What this sets up:**
- `resumes` — stores each resume analysis, scoped to the user who created it
- `daily_usage` — tracks how many analyses a user has run today; the `unique(user_id, date)` constraint enables safe upserts
- Row Level Security (RLS) on both tables — users can only read and write their own rows

---

## Step 3: Add Env Vars (Manual — Done Once)

Add to `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

These are safe to expose in the browser — the anon key has no elevated permissions. RLS on the database enforces data isolation.

`VITE_ANTHROPIC_API_KEY` has been **removed** from `.env` — the API key now lives only in the Supabase Edge Function as a server-side secret.

---

## Step 4: Create Edge Function (Manual — Done Once)

In the Supabase dashboard:

1. Go to **Edge Functions → New Function** → name it `analyze-resume`
2. Paste in the code from `supabase_edge/supabase_edge_code.ts` (kept locally, gitignored)
3. Go to **Project Settings → Edge Functions → Add secret**:
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically provided by the runtime

---

## Architecture (After Integration)

```
Browser
  ├── app/lib/supabase.ts  — singleton Supabase client
  ├── Auth
  │     ├── signUp → supabase.auth.signUp → show VerifyEmail screen
  │     ├── signIn → supabase.auth.signInWithPassword
  │     ├── signOut → supabase.auth.signOut
  │     └── onAuthStateChange in root.tsx → store.setAuth / clearAuth
  ├── CRUD (reads) — api.ts → supabase.from('resumes').*
  ├── Rate limit — rateLimit.ts → supabase.from('daily_usage').*
  └── AI + Save — claude.ts → supabase.functions.invoke('analyze-resume')
                                      ↓
                          Supabase Edge Function (Deno)
                            ├── Auth: supabase.auth.getUser(jwt)
                            ├── Call Anthropic API (ANTHROPIC_API_KEY secret)
                            ├── Save to resumes table (real or emptyFeedback on AI error)
                            └── Return { feedback } or { aiError: true }
```

---

## Code Changes

### New File: `app/lib/supabase.ts`

Creates and exports a single Supabase client used by all other modules. Never instantiate the client anywhere else. Guards against missing env vars at startup.

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

### Modified: `app/lib/store.ts`

- Remove `token`, `hydrated`, `setHydrated` — Supabase manages sessions internally
- Keep `user: { id: string, email: string } | null` as the auth signal
- Routes check `user !== null` to determine if authenticated

```typescript
interface AppStore {
  user: { id: string; email: string } | null;
  resumes: Resume[];
  setAuth: (user: { id: string; email: string }) => void;
  clearAuth: () => void;
  setResumes: (resumes: Resume[]) => void;
  addResume: (resume: Resume) => void;
}
```

---

### Modified: `app/root.tsx`

- Remove localStorage hydration `useEffect`
- Subscribe to `supabase.auth.onAuthStateChange` on mount
- Unsubscribe on unmount (via the returned `subscription.unsubscribe()`)

```
onAuthStateChange:
  SIGNED_IN  → store.setAuth({ id: session.user.id, email: session.user.email })
  SIGNED_OUT → store.clearAuth()
```

---

### Modified: `app/lib/api.ts`

Remove `login()`. Replace localStorage with Supabase queries. `saveResume` is no longer called from the frontend — the Edge Function saves the resume as part of the AI call. Read-only functions remain.

| Function | Supabase call |
|---|---|
| `getResumes()` | `supabase.from('resumes').select('*').order('created_at', { ascending: false })` |
| `getResume(id)` | `supabase.from('resumes').select('*').eq('id', id).maybeSingle()` |

`getResume` returns `null` on PGRST116 (row not found) and throws on all other errors.

---

### Modified: `app/lib/rateLimit.ts`

Replace localStorage entirely with Supabase `daily_usage` queries.

| Function | Supabase operation |
|---|---|
| `canAnalyze(userId)` | Select today's row via `.maybeSingle()`; return `count < 5` (or `true` if no row) |
| `recordAnalysis(userId)` | Select then insert-or-update count |
| `getRemainingToday(userId)` | Select today's row via `.maybeSingle()`; return `5 - count` (or `5` if no row) |

Today's date: `new Date().toISOString().split('T')[0]` (YYYY-MM-DD). All three functions are `async`. Uses `.maybeSingle()` (not `.single()`) to avoid errors on the no-row case.

---

### Modified: `app/routes/login.tsx`

Full rewrite. Two tabs: **Sign In** and **Sign Up**.

**Sign In tab:**
- `supabase.auth.signInWithPassword({ email, password })`
- Error `email_not_confirmed` → "Please verify your email before signing in"
- Other errors → "Invalid email or password"
- Success → `onAuthStateChange` fires → navigate to `/` automatically

**Sign Up tab:**
- `supabase.auth.signUp({ email, password })`
- Success → replace form with `VerifyEmail` component (inline, same page)
- Error → show error message

**VerifyEmail component (defined in same file):**
- Message: "We sent a verification link to `{email}`"
- **Resend** button → `supabase.auth.resend({ type: 'signup', email })`
- Resend button disabled for 60 seconds after each click, shows live countdown
- Resend success → show "Email resent!" for 3 seconds
- Resend error → show error message

---

### Modified: `app/components/Navbar.tsx`

Add **Sign Out** button that calls `supabase.auth.signOut()`. The `onAuthStateChange` listener in `root.tsx` handles clearing the store and the UI reacts to the user becoming `null`.

---

### New File: `app/lib/claude.ts`

Replaces the direct Anthropic SDK call. Now invokes the Supabase Edge Function, passing resume text and job context. Throws `AIBusyError` (a typed subclass of `Error`) when the Edge Function reports an AI failure, so `upload.tsx` can show a specific message.

```typescript
export class AIBusyError extends Error { ... }

export async function analyzeResume(
  resumeText: string,
  context: { id: string; companyName: string; jobTitle: string; jobDescription: string }
): Promise<Feedback> {
  const { data, error } = await supabase.functions.invoke('analyze-resume', { body: { ... } });
  if (error) throw new Error(error.message);
  if (data.aiError) throw new AIBusyError();
  return data.feedback as Feedback;
}
```

The `id` is generated client-side (UUID) before calling `analyzeResume`, so navigation to `/resume/{id}` works immediately after the call returns.

---

### New File: `supabase_edge/supabase_edge_code.ts` (gitignored)

Deno edge function code kept locally for copy-paste into the Supabase dashboard. Key behaviors:
- Validates JWT via `supabase.auth.getUser(jwt)` (explicit JWT, not global auth headers)
- Calls Anthropic API with `claude-sonnet-4-5`, `max_tokens: 2048`
- If AI call fails, saves resume with `emptyFeedback` (all scores 0) so the submission is never lost
- Returns `{ aiError: true }` (HTTP 200) when AI fails, `{ feedback }` on success
- Top-level try-catch ensures CORS headers are always returned

---

### Modified: `app/routes/home.tsx`, `upload.tsx`, `resume.tsx`

Remove all references to `token` and `hydrated`. Auth check becomes:

```typescript
const { user, hydrated } = useAppStore();
useEffect(() => {
  if (hydrated && !user) navigate('/login');
}, [user, hydrated, navigate]);
```

`upload.tsx` no longer calls `saveResume` — the Edge Function handles saving. It calls `analyzeResume` with the generated `id`, then `recordAnalysis`. An `ErrorModal` component shows user-friendly messages per failure type:
- PDF unreadable → specific message
- `AIBusyError` → "The AI is currently busy. Please try again in a moment."
- Other errors → "An unexpected error occurred. Please try again."

---

## Auth Flows

### Sign Up → Verify → Sign In
```
1. User fills Sign Up tab → supabase.auth.signUp()
2. Supabase sends verification email
3. App shows VerifyEmail screen (resend button with 60s cooldown)
4. User clicks link in email → Supabase marks email confirmed
5. onAuthStateChange fires SIGNED_IN → store.setAuth() → navigate('/')
```

### Sign In
```
1. User fills Sign In tab → supabase.auth.signInWithPassword()
2a. Unverified → "Please verify your email before signing in"
2b. Wrong credentials → "Invalid email or password"
2c. Success → onAuthStateChange SIGNED_IN → store.setAuth() → navigate('/')
```

### Sign Out
```
1. User clicks Sign Out in Navbar → supabase.auth.signOut()
2. onAuthStateChange fires SIGNED_OUT → store.clearAuth()
3. Routes detect user === null → navigate('/login')
```

---

## Rate Limiting

- **Limit:** 5 analyses per user per calendar day
- **Storage:** Supabase `daily_usage` table (cannot be bypassed by clearing browser storage)
- **Reset:** Automatic — date column is `current_date`, each new day produces no row → count treated as 0
- **Upsert pattern:** `insert ... on conflict (user_id, date) do update set count = daily_usage.count + 1`

---

## Additional Changes (Post-Plan)

These were implemented during the integration but were not in the original plan:

| Change | Detail |
|---|---|
| `AIBusyError` typed error class | Allows `upload.tsx` to distinguish AI failures from other errors without leaking backend messages |
| `ErrorModal` component in `upload.tsx` | Full-screen overlay modal instead of inline `setStatusText` error messages |
| `suppressHydrationWarning` on `<body>` | Supabase reads localStorage during `createClient`, causing an SSR/client tree mismatch. Suppresses the React warning on the element where the mismatch occurs |
| Vitest test suite (44 tests) | `vitest.config.ts`, `app/test/setup.ts`, tests for `utils`, `constants`, `rateLimit`, `api`, and `login` route |
| `tsconfig.json` exclude for supabase_edge | Prevents TypeScript from processing the Deno file and reporting `Deno` global errors |
| `login.tsx` try/finally | Ensures `isLoading` is always reset even if an unexpected error is thrown |
| `Navbar.tsx` signOut error logging | `console.error` on sign-out failure instead of silently swallowing it |

---

## Out of Scope

- Server-side Supabase (SSR / React Router loaders)
- OAuth providers (Google, GitHub, etc.)
- Password reset / forgot password flow
- User profile management
- Supabase migrations tooling (schema managed manually via dashboard for now)
