# Instructions for `scripts/`

Scripts are local operational tools, not a second application runtime.

## General rules

- Keep all network calls local by default: LM Studio on loopback and Qdrant on
  loopback. Do not add cloud APIs or telemetry.
- Make scripts deterministic, restart-safe and explicit about output paths.
- Never commit `.env`, `out/`, logs, models or native binaries.
- Prefer Node built-ins and existing dependencies. Avoid adding an SDK when the
  local HTTP contract is sufficient.
- If a script changes its CLI, update `command.md` and add a focused fixture or
  test where practical.

## RAG and document pipeline

- `data/*.md` is the indexed source of truth; `data/_pipeline/` is intermediate
  material and is not indexed by the current top-level scanner.
- `index-rag.mjs` must keep point IDs deterministic and use the same embedding
  model/prefix contract as runtime `src/main/rag/`.
- After changing parsing, embedding input, payload fields, or context behavior,
  update RAG tests and `docs/rag-index.md`.
- Document extraction/ingestion must preserve headings, code, tables where
  possible, provenance and checkpoints. Do not let an LLM silently invent
  missing source text.
- Translation and QA-generation scripts must preserve code fences, numbers,
  versions, dates, percentages and technical identifiers.

## Verification

Use the project commands from `command.md`. For script changes run the relevant
Vitest tests, `--dry-run` modes and a small fixture before a full local run.
