# 08 Notifications

Email and Slack, sent from jobs, behind adapters with console drivers for local work.

## Email (`platform/notify/email.ts`)

```ts
await notify.email({ to, subject, text, html?, replyTo? });
```

- Enqueues `notify.email`; the job calls the driver. Callers never wait on SMTP.
- Drivers: `smtp` (nodemailer, from `SMTP_URL` such as
  `smtp://user:pass@host:587`) and `console` (prints to the log). Selected by
  `EMAIL_DRIVER`. `EMAIL_FROM` is required for `smtp`.
- Templates are plain functions in `platform/notify/templates/` returning
  `{ subject, text, html }`. `html` is built with a tiny layout helper, no template
  engine. Text is always present.
- `APP_URL` is used to build absolute links.

## Slack (`platform/notify/slack.ts`)

```ts
await notify.slack({ channel, text, blocks? });
```

- Enqueues `notify.slack`; the job posts to `chat.postMessage` with
  `SLACK_BOT_TOKEN` using `fetch`. No SDK.
- Drivers: `bot` and `console`, selected by `SLACK_DRIVER`. `SLACK_DEFAULT_CHANNEL`
  is used when `channel` is omitted.
- Errors from Slack (`ok: false`) throw so the job retries; `channel_not_found` and
  `not_in_channel` are marked non-retryable.

## In-app

Toasts for immediate feedback are in the UI shell. Persistent in-app notifications
(a bell with unread items) are out of scope for the template; a future ADR can add a
`notifications` table if a tool needs it.

## Done when

- Magic link email goes through the pipeline and appears in the console driver.
- Golden example posts to Slack on customer creation, visible in the console driver.
- Tests: email job calls driver with rendered template, Slack `ok: false` retries,
  non-retryable errors go dead immediately.
