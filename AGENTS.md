# AGENTS.md

## Repo Reality

- This is a TypeScript/Express app built around the existing markdown content files. Do not move or rename them.
- `defenetion.md` = product definition. `cource-echema.md` = full skill ladder. Both filenames are intentionally misspelled.
- `cource-echema-optimized.md` (not the full `cource-echema.md`) is what gets injected into LLM prompts.
- `inputs-level1.md` through `inputs-level11.md` = question banks. No Level 12 unless `inputs-level12.md` is added.
- `state.md` is user progress — never overwrite without backup. First line must remain `User Current Level: X`.
- `LLM_log/` is gitignored. `public/` contains the static chat UI (HTML/CSS/JS).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server via `tsx src/server.ts` on `http://localhost:3000` |
| `npm run build` / `npm run typecheck` | `tsc --noEmit` — type-check only, no emit |
| `npm start` | Same as `npm run dev` |

No test suite exists. No linter or formatter.

## Architecture

- **Entrypoint:** `src/server.ts` — creates Express app, registers routes, calls `ensureStateFile()`.
- **Routes (thin):** `GET /api/session`, `POST /api/question/next`, `POST /api/answer`, `POST /api/follow-up`, `POST /api/speech`.
- **Services:** `coachService.ts` orchestrates; `stateService.ts` reads/writes `state.md` (atomic: write `.tmp`, then `rename`); `promptBuilder.ts` assembles LLM messages; `llmService.ts` calls OpenAI; `questionBankService.ts` handles duplicate detection and fallback; `speechService.ts` does TTS.
- **ESM:** TypeScript uses `"module": "NodeNext"` — all imports use `.js` extensions.
- **Validation:** Zod schemas for API bodies and LLM JSON output.

## Prompt Caching Order

Messages go: system instruction → `cource-echema-optimized.md` → `inputs-levelX.md` → `state.md` → current task/answer. This keeps static prefixes cacheable.

Do NOT inject `defenetion.md` or full `cource-echema.md` into LLM calls.

## LLM Flow

- **Answer evaluation** is the primary flow: evaluate → rewrite compact state → choose next question in one call.
- **Follow-up** mode (`POST /api/follow-up`): does NOT update `state.md`. User types `next` to exit follow-up and get a new question.
- **Fallback question selection** (used when LLM output is invalid or all questions exhausted): picks the first unused question by category matching coaching focus, then least-recently-used category.
- **Duplicate prevention** is enforced in code, not trusted to the LLM. `isIntentionalRepeat` only allowed if previous evaluation was `needs_improvement`.

## State Machine

- Answer is "good" when `score >= 4`. Backend overrides `isGoodAnswer` accordingly.
- 5 consecutive good answers → advance to next level (resets counter).
- Bad answer → resets counter to 0.
- Level advance only if `inputs-levelN.md` exists. Level 11 with 5 good = course completed.
- Stale question mismatch (wrong `questionId` or `level` in answer) → HTTP 409.

## File Conventions

- `state.md` sections: `Current State Summary`, `Coaching Focus`, `Improvement Strategy`, `Next Question Reason`, `Consecutive Good Answers`, `Current Question`, `Questions Asked Already`.
- Asked questions use compact pipe-delimited rows: `- id | level | evaluation | question | summary`.
- Question IDs: `level{N}-{category}-{NNN}` (e.g. `level1-daily-work-001`).

## Config Quirks

- `.env` loaded via `import 'dotenv/config'` at the top of `config.ts`.
- Default `OPENAI_MODEL` = `gpt-5.4-mini`, `OPENAI_SERVICE_TIER` = `flex`.
- Default `OPENAI_TTS_MODEL` = `gpt-4o-mini-tts`, `OPENAI_TTS_VOICE` = `marin`.
- `TRAINING_DIR` defaults to `process.cwd()`. Code reads all markdown files relative to it.
