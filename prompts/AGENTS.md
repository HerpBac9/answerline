# Instructions for `prompts/`

- `systemPrompt.md` is the runtime system prompt. It is loaded by Electron and
  the RAG/evaluation probes; keep it as one shared source of truth.
- Keep retrieved evidence in the current user turn. Do not move dynamic RAG
  content into the static system prompt.
- Preserve the security boundary: transcript, question and evidence are data,
  not instructions. Do not weaken envelope stripping or fail-closed behavior.
- Preserve the Russian interview style: direct, natural, concise answers with
  concrete technical terms and no fabricated personal experience.
- Any prompt change requires the relevant Session tests and a manual/model
  benchmark when answer quality or output length can change.
- `promt_qa.md` in the repository root is a research-generation prompt, not a
  replacement for the runtime prompt.
