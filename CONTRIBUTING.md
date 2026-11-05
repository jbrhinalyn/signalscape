# Contributing to SignalScape

Thanks for helping build a privacy-conscious local-first desktop experience.

## Start here

1. Read [architecture](docs/architecture.md),
   [privacy baseline](docs/privacy.md), and
   [IPC security contract](docs/ipc-security.md).
2. Install Node.js from `.nvmrc` and use `npm ci`.
3. Create a focused branch from current `main` (for example,
   `feat/issue-123-feature-name`).
4. Write tests and update docs with behavior changes.

## Before opening a pull request

```bash
npm run lint
npm run format:check
npm run check:secrets
npm run typecheck
npm test
npm run build
# Or run all gates:
npm run quality
```

`npm run format` applies safe whitespace normalization; it does not
reformat code layout. The M1 lint checks TypeScript AST safety rules,
JavaScript syntax and JSON validity; TypeScript and Angular builds provide
the richer compiler diagnostics. No extra dependency installation is needed.

The Linux GitHub Actions workflow runs all quality gates on pull requests
and on `main`, followed by a sandboxed Electron smoke test and packaging.
A PR is reviewable only after checks pass; do not merge failing changes.

## PR checklist

- Describe the linked issue, user-visible behavior and test evidence.
- Keep Electron sandboxing and the typed IPC allowlist intact.
- Add negative tests for new IPC, permissions and untrusted inputs.
- Confirm that camera access is opt-in and off by default when implemented.
- Do not commit `.env` files, keys, sample camera footage, health readings,
  credentials or other personal data.
- Update relevant docs and note any added network traffic or storage.

Ask for review before merging to `main`. Avoid bypassing CI checks.
