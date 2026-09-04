# Internal tools reference

A template for building internal tools at startups. Clone it, rename the golden
example entities, and most of what an internal tool needs is already there: SSO
login, roles and permissions, tables and forms with validation, audit history,
background jobs and schedules, file uploads, email and Slack, settings and feature
flags, structured logging, and a UI shell.

Status: design phase. No application code yet.

- Start with `docs/ARCHITECTURE.md`.
- `docs/BUILD_PLAN.md` says what gets built in which order.
- `docs/blocks/` is the spec per building block.
- `docs/recipes/` is how you add things once the code exists.
- `docs/adr/` is why things are the way they are.
- `CLAUDE.md` is the rule book for changing the repo.

Stack in one line: TypeScript, React with Vite, Hono, Postgres with Drizzle,
shadcn/ui, one Docker image that runs anywhere.
