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

## As built (phase 5)

- `platform/notify/index.ts` exports `notify.email(message, { tx? })` and
  `notify.slack(message, { tx? })`, both enqueue jobs (`notify.email`, `notify.slack`,
  5 attempts, 30 s timeout). `email.ts` and `slack.ts` hold the drivers and
  `deliverEmail`/`deliverSlack` used by the jobs, plus `setEmailDriver`/`setSlackDriver`
  for tests. Slack errors in a known permanent set (`channel_not_found`,
  `not_in_channel`, `invalid_auth`, …) throw `NonRetryableError`.
- nodemailer is pinned to 6.x (`adr/0002`): the two calls used, `createTransport(url)`
  and `sendMail`, are unchanged across majors, and 6 is the version the builder knows.
  The SMTP driver has not been exercised against a real mail server yet; the console
  driver is what tests and development use.
- Templates are still inline strings (magic link); a `templates/` module arrives when a
  second email exists.
- Magic link and the customer follow-up job go through `notify`, with `{ tx }` so the
  message is queued only if the surrounding write commits.

## Done when

- Magic link email goes through the pipeline and appears in the console driver.
- Golden example posts to Slack on customer creation, visible in the console driver.
- Tests: email job calls driver with rendered template, Slack `ok: false` retries,
  non-retryable errors go dead immediately.
