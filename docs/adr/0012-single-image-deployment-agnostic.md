# 0012 One Docker image with a mode switch, no platform-specific code

Accepted, 2026-09-04

## Context

Each startup will run this somewhere different: a Hetzner box, Fly, Railway,
Render, maybe a company Kubernetes cluster. Platform-specific features (Vercel
cron, platform queues, edge functions) would fork the codebase per target.

## Decision

A single image. `APP_MODE=web|worker|all` selects what the process does.
Configuration is env vars only. Cron lives in the worker, not in the platform.
Static files are served by the app, not by a CDN configuration. Health endpoints
are plain HTTP.

## Consequences

- The same image is tested in CI and run everywhere.
- The template gives up platform conveniences. For internal tool traffic they are
  not needed.
- Horizontal scale is possible (several `web`, several `worker`) but not the
  default and not tested beyond the advisory lock on the scheduler.
