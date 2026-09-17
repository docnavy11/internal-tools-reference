# Contributing

This is a starter repository, not a framework (`docs/adr/0001-starter-repo-not-framework.md`).
You are meant to clone it and change it beyond recognition. That shapes what is worth
contributing back here:

- **Welcome:** bugs in the golden example, a block that does not survive being renamed,
  wrong or missing documentation, a security issue, a dependency that has moved on.
- **Probably not:** a new feature block. The point of the template is that it stays small
  enough to read. If your tool needs something extra, add it in your clone — and if the
  seam it needed was in the wrong place, that seam is the bug worth reporting.

## Before you open a pull request

`CLAUDE.md` is the rule book for changing this repository, human or agent. Read it first;
it is short. `docs/ARCHITECTURE.md` explains the layout, and `docs/adr/` explains why the
choices are what they are — if you want to change one of those choices, argue with the ADR.

Run the full check. It needs Postgres:

```bash
docker compose up -d postgres
npm run check      # typecheck, lint, prettier, unit and API tests
npm run test:e2e   # Playwright against the built app
```

CI runs the same thing on `postgres:16`. A pull request that does not pass both will not
be merged.

## What a good change looks like

- A change to a platform block comes with a test in `tests/server/`, and a change to a
  page comes with one in `tests/e2e/`. The suites exist to be extended.
- Anything under `src/server/platform/auth`, `webhooks`, `storage` or `http` needs
  `docs/SECURITY.md` read first — it lists the invariants that look shortenable and are
  not, and a pull request that simplifies one of them away will be refused.
- Keep `docs/ACCEPTANCE.md` honest: it records, per block, what has an automated test,
  what was checked by hand once, and what has never been verified. If you verify something
  that was in the third column, move it and say how. If you add something unverified, say
  so there rather than in a commit message nobody will find.

## Reporting a security issue

Do not open a public issue. See `SECURITY.md`.
