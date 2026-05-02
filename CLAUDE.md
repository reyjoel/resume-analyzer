# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server
npm run build      # production build
npm run start      # serve production build
npm run typecheck  # generate route types + tsc check
```

No test suite is configured. Run `typecheck` to verify correctness before finishing any task.

## Architecture

**Framework:** React Router 7 (full-stack, SSR-enabled) with Vite. The app uses file-based routing via `app/routes.ts`. Routes are defined there and implemented in `app/routes/`.

**State management:** Zustand store in `app/lib/store.ts`. Holds auth token, current user, and resume list. Persists token to localStorage on login.

**AI integration:** The Anthropic SDK is called client-side from `app/lib/claude.ts`. The API key is `VITE_ANTHROPIC_API_KEY` (in `.env`). The prompt and expected JSON response schema live in `constants/index.ts` — `prepareInstructions()` builds the prompt, `AIResponseFormat` defines the shape Claude must return.

**Backend stubs:** `app/lib/api.ts` is the single integration point with the backend. All calls to login, save, and retrieve resumes go through this file. It returns mock data during the frontend-only phase. When the real backend is ready, only this file changes.

**PDF handling:** PDFs are parsed client-side using `pdfjs-dist` to extract raw text. No PDF or image files are uploaded or stored. Extracted text is sent directly to Claude.

**Rate limiting:** `app/lib/rateLimit.ts` enforces 5 analyses per user per day using localStorage. Key: `rateLimit:{userId}`, shape: `{ count: number, date: string }`. Resets automatically when the stored date differs from today.

**Auth:** Login form in `app/routes/login.tsx` calls `api.login()` and stores the returned token. All protected routes check `store.token` and redirect to `/login` if null.

## Key Data Shape

Claude returns a `Feedback` object — the canonical shape is in `types/index.d.ts`. The five scored categories are: `ATS`, `toneAndStyle`, `content`, `structure`, `skills`. Each has a `score: number` and `tips: { type: "good" | "improve", tip: string, explanation?: string }[]`.

## Migration Context

This project was migrated from Puter.js (which handled auth, file storage, KV store, and AI) to a direct Claude API integration. If you see any remaining references to `puter`, `window.puter`, or `puter.d.ts` — they are leftovers and should be removed. The design spec is at `docs/superpowers/specs/2026-05-02-claude-resume-analyzer-design.md`.

## Path Aliases

`~/*` maps to `app/*` (configured in `tsconfig.json` and `vite.config.ts`).
