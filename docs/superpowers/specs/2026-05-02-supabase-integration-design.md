# Supabase Integration Design

**Date:** 2026-05-02
**Status:** Approved
**Scope:** Create a new Supabase project and integrate it for auth, CRUD, and rate limiting

---

## Overview

Set up a brand-new Supabase project and wire it into the resume analyzer frontend. This replaces the current localStorage stubs in `api.ts`, manual token management in `store.ts`, and `rateLimit.ts` localStorage logic with real Supabase SDK calls. Architecture stays client-side — one `@supabase/supabase-js` client, no server restructuring.

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
  ├── CRUD — api.ts → supabase.from('resumes').*
  ├── Rate limit — rateLimit.ts → supabase.from('daily_usage').*
  └── Claude — unchanged (client-side Anthropic SDK)
```

---

## Code Changes

### New File: `app/lib/supabase.ts`

Creates and exports a single Supabase client used by all other modules. Never instantiate the client anywhere else.

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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

Remove `login()`. Replace localStorage with Supabase queries. All functions throw on error.

| Function | Supabase call |
|---|---|
| `saveResume(data)` | `supabase.from('resumes').insert({ ...data, user_id })` |
| `getResumes()` | `supabase.from('resumes').select('*').order('created_at', { ascending: false })` |
| `getResume(id)` | `supabase.from('resumes').select('*').eq('id', id).single()` |

`user_id` comes from `(await supabase.auth.getUser()).data.user.id` inside each function.

---

### Modified: `app/lib/rateLimit.ts`

Replace localStorage entirely with Supabase `daily_usage` queries.

| Function | Supabase operation |
|---|---|
| `canAnalyze(userId)` | Select today's row; return `count < 5` (or `true` if no row) |
| `recordAnalysis(userId)` | Upsert: insert row or `do update set count = daily_usage.count + 1` |
| `getRemainingToday(userId)` | Select today's row; return `5 - count` (or `5` if no row) |

Today's date: `new Date().toISOString().split('T')[0]` (YYYY-MM-DD).

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

### Modified: `app/routes/home.tsx`, `upload.tsx`, `resume.tsx`

Remove all references to `token` and `hydrated`. Auth check becomes:

```typescript
const { user } = useAppStore();
useEffect(() => {
  if (!user) navigate('/login');
}, [user]);
```

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

## Out of Scope

- Server-side Supabase (SSR / React Router loaders)
- Moving Claude call server-side
- OAuth providers (Google, GitHub, etc.)
- Password reset / forgot password flow
- User profile management
- Supabase migrations tooling (schema managed manually via dashboard for now)
