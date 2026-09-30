# Instructions for `docs/`

- Documentation must describe the current repository, not an aspirational
  architecture. Mark planned, unverified and historical behavior explicitly.
- Keep `command.md`, `README.md`, architecture docs, project status and roadmap
  consistent when commands, paths, configuration or runtime contracts change.
- Use repository-relative paths in prose and working commands that run on both
  macOS/Linux and Windows where possible; show PowerShell variants separately.
- Do not claim that macOS capture exclusion is guaranteed. Document TCC,
  packaged-app and headphone requirements.
- Do not claim that RAG was evaluated or hardware was verified unless a local
  command/probe actually produced the result. Include the date and scope of
  recorded measurements.
- Keep historical review documents useful; if a fact is obsolete, either update
  it or label it as historical instead of silently mixing old and current paths.
