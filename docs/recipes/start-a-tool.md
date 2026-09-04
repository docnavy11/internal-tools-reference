# Recipe: start a real tool from this template

1. Clone and rename. `git clone <this repo> my-tool && cd my-tool`, set `APP_NAME` in
   `.env` and `docker-compose.yml`, change the `<title>` in `src/client/index.html` and
   the name in `src/client/platform/shell/app-sidebar.tsx`. Replace this README's first
   paragraph with what your tool is for.

2. Decide what to keep of the golden examples. `customers` and `notes` exist to be copied;
   most tools delete them after the first real entity works. To delete:
   - remove `src/shared/features/customers`, `src/server/features/customers`,
     `src/client/features/customers`, and the same three for `notes`;
   - remove their lines from `src/server/features/index.ts`, `src/server/platform/db/schema.ts`,
     `src/client/router.tsx`, `src/client/platform/shell/nav.ts`, `src/shared/permissions.ts`
     (permission strings and `entityPermissions` entries), `src/server/platform/db/seed.ts`;
   - remove `tests/server/customers.test.ts`, `notes.test.ts`, the customers parts of
     `jobs.test.ts` and `settings.test.ts`, and `tests/e2e/customers.spec.ts`,
     `notes.spec.ts`, the customers parts of `jobs.spec.ts`, `settings.spec.ts`,
     `palette.spec.ts`;
   - generate a migration that drops the tables (`npm run db:generate`), review it, apply.
   `npm run check` and `npm run test:e2e` tell you what you missed. The example vendor
   integration (`src/server/integrations/example-vendor`) goes the same way.

3. Add your first entity with `add-entity.md`. Do this before deleting the examples so
   you can compare side by side.

4. Sign-in. Create a Google Workspace or Microsoft Entra OAuth client with redirect URI
   `<APP_URL>/api/auth/oidc/google/callback` (or `/microsoft/callback`), set the
   `AUTH_*` variables, set `AUTH_ALLOWED_DOMAINS` to your company domain, and turn
   `AUTH_DEV_LOGIN` off outside development. The first person to sign in becomes admin.
   Verify a real sign-in before inviting anyone: the OIDC client has only been tested
   against a fake provider so far (see `blocks/01-auth.md`).

5. Notifications. `EMAIL_DRIVER=smtp` with `SMTP_URL` and `EMAIL_FROM`; `SLACK_DRIVER=bot`
   with a bot token that has `chat:write` and the channel id. Send one of each from a
   staging deployment before relying on them.

6. Storage. Single server: keep `STORAGE_DRIVER=disk` and mount `FILES_DIR` on a volume
   that is backed up. Anything else: `STORAGE_DRIVER=s3` with a bucket.

7. Deploy. One image (`Dockerfile`), env vars from `docs/CONFIG.md`, `APP_MODE=all` on a
   single server or `web` plus `worker` as two services, `MIGRATE_ON_START=true` on the
   web service. Back up Postgres nightly. Point `SENTRY_DSN` at a project and
   `npm install @sentry/node` if you want error tracking.

8. Hand over. Keep `CLAUDE.md` and `docs/` current as you change things; they are what
   the next person, or the next agent, reads first.
