# Instructions for `src/`

## Boundaries

- Keep the renderer UI-only. It must not import Node APIs, read files directly,
  call LM Studio/Qdrant, or access raw `ipcRenderer`.
- Every renderer capability crosses the named preload bridge and an allow-listed
  `ipcMain` handler. Update `src/preload/index.ts`, renderer types and tests
  together with a new channel.
- Main-process modules own audio capture, Whisper lifecycle, Session state,
  configuration, RAG, LLM requests and hotkeys.
- Speaker attribution is physical: system audio is `interviewer`, microphone is
  `me`. Do not add diarisation without changing the source contract.

## Audio and macOS

- Windows uses the external WASAPI native module; macOS uses the packaged
  CoreAudio Process Tap helper for system audio and renderer microphone capture.
- Do not introduce `getDisplayMedia` or a screen-video capture path.
- Keep `setContentProtection` documented as best effort, never as a capture
  guarantee. Hardware/TCC behavior belongs in probes and manual verification.
- Stop the single long-lived Whisper process on capture stop and application
  shutdown.

## Session, RAG and LLM

- Keep the system prompt stable during a Session.
- Add bounded `<retrieved_context>` only to the current user turn. Never copy
  retrieved evidence into history.
- Preserve strict `user`/`assistant` alternation and fail closed when RAG is
  unavailable.
- Keep transcript display raw; normalize terminology only in model-facing text.
- For RAG changes, update `src/main/rag/`, focused tests, `docs/rag-index.md`
  and the project status/roadmap when behavior or scope changes.

## Verification

Run focused tests first, then:

```bash
npm run typecheck
npm test
npm run build
```

Use `npm run doctor`, `scripts/audio-probe.mjs` and a packaged macOS app for
hardware-dependent checks. Do not claim those checks passed without running
them.
