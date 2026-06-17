# AGENTS.md

## Repo Reality

- This folder now contains a base TypeScript/Express app plus the original specification/content files.
- Treat `defenetion.md` as the product definition, despite spelling mistakes in the filename.
- Treat `cource-echema.md` as the source of truth for the communication ladder and pass criteria, despite spelling mistakes in the filename.
- Use `inputs-level1.md` through `inputs-level11.md` as the available question banks; do not implement Level 12 questions unless `inputs-level12.md` is added.
- `state.md` is user progress data, not disposable sample data. Do not overwrite it without preserving progress or making a backup.
- Keep `state.md` compact. Each evaluated answer should rewrite it as a short current state, focus, strategy, next-question reason, current question, and compact asked-question list.
- Keep `User Current Level: X` as line 1 of `state.md`; code depends on this stable first-line contract to inject only the current `inputs-levelX.md`.
- `LLM_log/` contains per-call prompts, outputs, token usage, and user answers. It is gitignored and should not be committed.
- `implementation-plan.md` is the current implementation blueprint. Keep it aligned with product changes.

## Implementation Guardrails

- Build a backend-heavy TypeScript app around the existing markdown files; do not move or rename the existing content files unless explicitly asked.
- Keep the backend responsible for state updates, answer evaluation, duplicate prevention, and level progression. The frontend should display and submit data, not decide pass/fail.
- Preserve prompt caching order in LLM calls: stable instructions first, `inputs-levelX.md` second last among file-content blocks, `state.md` last among file-content blocks.
- Do not inject full `defenetion.md` or full `cource-echema.md` into every LLM call. Use the concise system prompt plus `cource-echema-optimized.md`, current `inputs-levelX.md`, compact `state.md`, and current task/user input.
- Keep task-specific prompt text after the file-content blocks so cached static context stays stable.
- LLM calls default to `OPENAI_SERVICE_TIER=flex`; preserve that unless there is a concrete reason to change it.
- Coach text-to-speech uses OpenAI TTS by default: `OPENAI_TTS_MODEL=gpt-4o-mini-tts`, `OPENAI_TTS_VOICE=marin`.
- Use answer evaluation as the main LLM flow: it should evaluate feedback, rewrite compact state, and choose the next question in one call. Follow-up questions after feedback must not update `state.md`.
- Initial/no-current-question fallback may choose a question in code, but normal progression should use the next question selected by reasoning during answer evaluation.
- Select next questions by coaching reason from the most useful category in the same level, not by file order. Backend must still validate the selected question exists in `inputs-levelX.md`.
- Enforce duplicate-question prevention in code, even if the LLM selects a duplicate.

## Code Structure

- Prefer small, named functions that make calling code read like intent: `if (isDuplicateQuestion()) { chooseFallbackQuestion(); }`.
- Avoid long orchestration functions. Split by decision or side effect: read state, build prompt, call LLM, validate output, update state.
- Reuse existing services/helpers before adding new ones. Search first, then add the smallest missing piece.
- Keep route handlers thin; put business rules in services.
- Keep state parsing/writing isolated in one state service. Do not update `state.md` from random route or UI code.
- Keep prompt construction isolated in one prompt builder. Do not duplicate prompt ordering across endpoints.
- Use self-describing names over comments. Add comments only for non-obvious behavior such as atomic state writes or prompt-cache ordering.
- Do not add compatibility layers unless persisted state or an explicit requirement needs them.

## Verification

- Install dependencies with `npm install`.
- Run the app with `npm run dev`; it serves the API and static chat UI on `http://localhost:3000` by default.
- Run TypeScript verification with `npm run build` or `npm run typecheck`.
- There is no automated test suite yet.
- Minimum manual verification for this product: ask a question, submit a good answer, confirm `state.md` increments progress, ask a follow-up, confirm state does not change, type `next`, confirm a new non-duplicate question appears.
