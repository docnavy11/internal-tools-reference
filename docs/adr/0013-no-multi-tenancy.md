# 0013 No multi-tenancy

Accepted, 2026-09-04

## Context

The template serves startups that each run their own internal tools. A tenant
column on every table, tenant-scoped queries and tenant-aware auth would touch
every layer for a need nobody has yet.

## Decision

One deployment per company. No tenant concept in the schema, the auth model or
the UI.

## Consequences

- Simpler queries, simpler permissions, simpler tests.
- Running the same tool for several companies means several deployments, which
  the single-image design (`0012`) makes cheap.
- If a tool ever must become multi-tenant, that is a new design, not a flag.
