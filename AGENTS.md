# AGENTS.md

## Repo Reality

- This folder now contains a base TypeScript/Express app plus the original specification/content files.
- Treat `defenetion.md` as the product definition, despite spelling mistakes in the filename.
- Treat `cource-echema.md` as the source of truth for the communication ladder and pass criteria, despite spelling mistakes in the filename.
- Use `inputs-level1.md` through `inputs-level11.md` as the available question banks; do not implement Level 12 questions unless `inputs-level12.md` is added.
- `state.md` is user progress data, not disposable sample data. Do not overwrite it without preserving progress or making a backup.
- `implementation-plan.md` is the current implementation blueprint. Keep it aligned with product changes.

## Implementation Guardrails

- Build a backend-heavy TypeScript app around the existing markdown files; do not move or rename the existing content files unless explicitly asked.
- Keep the backend responsible for state updates, answer evaluation, duplicate prevention, and level progression. The frontend should display and submit data, not decide pass/fail.
- Preserve prompt caching order in LLM calls: stable instructions first, `inputs-levelX.md` second last among file-content blocks, `state.md` last among file-content blocks.
- Keep task-specific prompt text after the file-content blocks so cached static context stays stable.
- LLM calls default to `OPENAI_SERVICE_TIER=flex`; preserve that unless there is a concrete reason to change it.
- Use two separate LLM flows: one to choose the next question and one to evaluate feedback. Follow-up questions after feedback must not update `state.md`.
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
