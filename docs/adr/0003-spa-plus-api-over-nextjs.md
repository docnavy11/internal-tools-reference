# 0003 React SPA plus a Node API, not Next.js

Accepted, 2026-09-04

## Context

Next.js is the most common React choice in startups. Internal tools do not need
server rendering, SEO, or edge deployment. They do need a long-running worker
process and a deployment story that works on a single VPS as well as on platforms.

## Decision

Vite-built React single page app served as static files by a Hono server that also
exposes the API under `/api`. The same server binary runs the job worker. React
Router in library mode for client routing.

## Consequences

- One mental model: a browser app calling a JSON API. Debuggable with curl.
- One build artifact and one image regardless of platform.
- No server components, server actions, or per-route runtime decisions.
- The first paint is a blank page until the bundle loads. Acceptable for an
  internal tool used by logged-in staff.
- If the takeover team strongly prefers Next.js, the `shared` and `server/features`
  layers port cleanly; only routing and the shell would change.
