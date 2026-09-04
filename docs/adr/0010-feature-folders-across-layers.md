# 0010 One feature is one folder in each of shared, server and client

Accepted, 2026-09-04

## Context

Code can be organised by technical layer (all routes together, all tables
together) or by feature. The template will mostly be extended by adding features,
often by an agent that benefits from a fixed, predictable shape.

## Decision

`src/shared/features/<name>/`, `src/server/features/<name>/` and
`src/client/features/<name>/` with fixed file names (`schema.ts`; `table.ts`,
`service.ts`, `routes.ts`, `jobs.ts`, `index.ts`; `list.tsx`, `detail.tsx`,
`form.tsx`, `nav.ts`). Cross-cutting code lives in `platform/` and is not touched
when adding a feature. Each layer has one registry file that imports features.

The client and server are not co-located in one folder because the Vite bundle
must never pull in server code, and a hard directory boundary is the simplest
guarantee.

## Consequences

- Adding a feature is a checklist (`recipes/add-entity.md`) with no judgement
  calls about placement.
- Deleting the golden examples is deleting three folders and three import lines.
- Some files are small. That is fine.
