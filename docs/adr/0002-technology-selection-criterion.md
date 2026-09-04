# 0002 Technology is chosen for depth of familiarity and API stability

Accepted, 2026-09-04

## Context

The code will be written largely by Claude Code. A library whose current major
version differs from the version the model knows well produces subtly wrong code:
deprecated call shapes, config in the wrong place, imports that moved. That cost
shows up as debugging time and as a template that teaches the wrong idioms.

## Decision

Each dependency must pass two tests: it is common enough that a startup team will
recognise it, and its current major version is one the builder knows in depth. When
a popular library fails the second test, prefer in order:

1. a small amount of plain code that implements the need directly;
2. an older major of the same library that is still maintained, pinned;
3. a different, stable library.

Record the reasoning in an ADR when the choice is not the obvious popular one.

## Consequences

- Some choices look conservative: Zod 3 (`0007`), no auth library (`0005`), a
  hand-written job queue (`0006`).
- Versions are pinned exactly in `package.json`. Upgrades are deliberate and
  reviewed against the ADR that chose the version.
- The template carries a bit more of its own code and fewer dependencies. That code
  is short, tested, and fully owned.
