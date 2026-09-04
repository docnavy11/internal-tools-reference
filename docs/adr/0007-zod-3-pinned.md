# 0007 Zod is pinned to major version 3

Accepted, 2026-09-04

## Context

Zod 4 changed error formatting, error customisation, several string validators
(`z.email()` instead of `z.string().email()`), and the import path story
(`zod/v4`). The core of `z.object`, `parse`, `safeParse` and `z.infer` is the same,
but the template leans on error shapes for form field errors and API error
details, exactly where the changes are. The builder knows Zod 3 in depth and Zod 4
only at the surface (`0002`).

## Decision

Pin `zod@3.x`. Zod 3 remains published and maintained.

## Consequences

- Shared schemas, form resolvers and API error mapping are written against the
  Zod 3 error shape (`ZodError.issues`, `flatten()`).
- Upgrading to Zod 4 later is mechanical and touches three places: the API error
  mapper, the form error mapper, and the string validators. Recorded here so the
  team knows the upgrade is deliberate work, not a routine bump.
