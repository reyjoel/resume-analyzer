# Claude-Ready Resume Analyzer — Frontend Migration Design

**Date:** 2026-05-02
**Status:** Implemented (superseded by Supabase integration)
**Scope:** Frontend-first migration from Puter.js to Claude API

---

## Overview

Migrate the resume analyzer from Puter.js (which handles auth, file storage, KV store, and AI) to a clean architecture where the frontend calls Claude directly via the Anthropic SDK. Two backend stubs (login, resume data) are wired as placeholder `fetch` calls so the real backend can be swapped in later with zero architectural change.

---

## Architecture

```
Browser
  ├── PDF upload → pdfjs extracts text (no file saved)
  ├── Claude API call (Anthropic SDK, client-side, VITE_ANTHROPIC_API_KEY)
  ├── Rate limit check → localStorage (5 analyses/day per user)
  ├── Display feedback (existing components reused)
  ├── Save resume → fetch("/api/resumes") [stubbed → returns mock]
  └── Auth → fetch("/api/login") [stubbed → returns mock token] → token in localStorage
```

**Known trade-off:** `VITE_ANTHROPIC_API_KEY` is visible in the browser bundle during this phase. Accepted. When the real backend is built, the Claude call moves server-side and the key stays hidden.

> **Resolved in Phase 2:** The Anthropic API key was moved to a Supabase Edge Function. `VITE_ANTHROPIC_API_KEY` has been removed from `.env`. See `2026-05-02-supabase-integration-design.md`.

---

## What Gets Removed

| Item | Reason |
|---|---|
| `app/lib/puter.ts` | Entire Puter Zustand store — replaced by `store.ts` + `claude.ts` + `api.ts` |
| `types/puter.d.ts` | Puter type definitions — no longer needed |
| `app/routes/auth.tsx` | Puter-based auth page — replaced by `login.tsx` |
| `app/routes/wipe.tsx` | Puter-specific debug utility — no equivalent needed |
| Puter `<script>` in `app/root.tsx` | CDN script injection for Puter SDK |
| `OPENAI_API_KEY` in `.env` | Legacy unused key |

---

## What Gets Added / Changed

### New Files

**`app/lib/claude.ts`**
Anthropic SDK wrapper. Accepts extracted PDF text + job context (title, description), sends to Claude 3.7 Sonnet, returns typed `Feedback` object. Throws on API error. Reuses the existing prompt from `constants/index.ts`.

**`app/lib/api.ts`**
Backend stub module. Exports `login()`, `saveResume()`, `getResumes()`, `getResume(id)`. Each function calls a backend endpoint (`/api/*`). During this phase, returns mock data so the frontend works end-to-end. When the real backend is ready, only this file changes.

**`app/lib/rateLimit.ts`**
Daily usage tracker stored in localStorage. Key: `rateLimit:{userId}`. Shape: `{ count: number, date: string (YYYY-MM-DD) }`. Resets automatically when the stored date differs from today.
- `canAnalyze(userId): boolean` — returns true if count < 5
- `recordAnalysis(userId): void` — increments count
- `getRemainingToday(userId): number` — returns 5 - count

**`app/lib/store.ts`**
New Zustand store. Replaces the Puter store. Holds:
- `token: string | null` — auth token from localStorage
- `user: { id, email } | null`
- `resumes: Resume[]`
- `setAuth(token, user)`, `clearAuth()`, `setResumes()`, `addResume()`

**`app/routes/login.tsx`**
Email/password login form. On submit: calls `api.login()` stub → stores token + user in Zustand store and localStorage → redirects to `/`. Shows error on failure.

**.env**
```
VITE_ANTHROPIC_API_KEY=your-key-here
```

### Modified Files

**`app/root.tsx`**
Remove Puter `<script>` tag. Add auth initialization on mount (read token from localStorage → hydrate Zustand store).

**`app/routes/upload.tsx`**
1. Check `rateLimit.canAnalyze(userId)` — show error and block if at limit
2. Extract PDF text with pdfjs (no image conversion, no file upload)
3. Call `claude.analyze(text, { jobTitle, jobDescription })`
4. Call `api.saveResume(feedback)` stub
5. Call `rateLimit.recordAnalysis(userId)`
6. Redirect to `/resume/{id}`

**`app/routes/home.tsx`**
- Replace `puter.kv.list` with `api.getResumes()`
- Show remaining analyses today: `rateLimit.getRemainingToday(userId)` displayed as "X/5 analyses remaining today"

**`app/routes/resume.tsx`**
Replace `puter.kv.get` + `puter.fs.read` with `api.getResume(id)`. No image loading (no stored images).

---

## Data Flow

```
1. User logs in → api.login() stub → token stored
2. User fills upload form (company, job title, job description, PDF)
3. Rate limit checked → abort if 5 reached
4. pdfjs extracts text from PDF (client-side, no upload)
5. claude.analyze(text, context) → Claude 3.7 Sonnet → Feedback JSON
6. api.saveResume(feedback) stub → mock ID returned
7. rateLimit.recordAnalysis() → localStorage count incremented
8. Redirect to /resume/{mockId}
9. resume.tsx loads from api.getResume(id) stub → displays feedback
```

---

## Rate Limiting

- **Limit:** 5 analyses per user per calendar day
- **Storage:** localStorage, key `rateLimit:{userId}`
- **Reset:** Automatic — on any check, if stored date ≠ today, count resets to 0
- **UI:** Home page shows "X/5 analyses remaining today"
- **Enforcement:** `upload.tsx` blocks submission and shows message if limit reached
- **Future:** When backend is live, this moves server-side; localStorage logic is removed

---

## Auth Flow (Stubbed)

```
login.tsx → api.login({ email, password })
         → mock response: { token: "mock-token", user: { id: "1", email } }
         → store.setAuth(token, user)
         → localStorage.setItem("token", token)
         → redirect to /
```

Protected routes check `store.token` — redirect to `/login` if null.

---

## Types (unchanged)

Existing `Resume`, `Feedback`, `Job` interfaces in `types/index.d.ts` are reused as-is. The `puter.d.ts` file is removed.

---

## Out of Scope (This Phase)

- Real backend endpoints
- Server-side rate limiting
- Moving Claude call server-side
- PDF file persistence
- User registration
- Multi-user data isolation (backend concern)
