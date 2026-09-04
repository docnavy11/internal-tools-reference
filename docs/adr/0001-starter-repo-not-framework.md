# 0001 Starter repository, not a framework or generator

Accepted, 2026-09-04

## Context

The template could be a repo you clone, a library you depend on, or a CLI that
scaffolds code. Its users are one builder now, Claude Code, and later a startup team
that inherits a tool built from it.

## Decision

A repository that is cloned and then diverges. Reusable parts live in
`src/*/platform/` so they can be extracted into a package later if several tools
prove they want the same upgrades, but no extraction happens up front.

## Consequences

- No upgrade path from the template into existing tools. Fixes are ported by hand.
- Zero magic. Everything a builder sees is code they can edit.
- The recipes in `docs/recipes/` replace what a generator would do, and are the
  main way the template stays easy to extend.
