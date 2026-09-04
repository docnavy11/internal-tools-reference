import nodemailer from 'nodemailer';
import { env } from '../../env';
import { logger } from '../http/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDriver {
  send(message: EmailMessage): Promise<void>;
}

// Development driver: prints the message so links can be copied from the terminal.
const consoleDriver: EmailDriver = {
  async send(message) {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      'email (console driver)',
    );
  },
};

// Any provider with SMTP (Postmark, SES, Resend, Google Workspace, Mailpit locally).
// nodemailer is pinned to 6.x: createTransport(url).sendMail(...) is all we use.
function smtpDriver(): EmailDriver {
  const transport = nodemailer.createTransport(env.SMTP_URL!);
  return {
    async send(message) {
      await transport.sendMail({ from: env.EMAIL_FROM!, ...message });
    },
  };
}

let driver: EmailDriver | null = null;

function current(): EmailDriver {
  driver ??= env.EMAIL_DRIVER === 'smtp' ? smtpDriver() : consoleDriver;
  return driver;
}

// Direct send; used by the notify.email job. Application code calls notify.email() instead.
export async function deliverEmail(message: EmailMessage): Promise<void> {
  await current().send(message);
}

// Tests swap the driver to capture messages.
export function setEmailDriver(next: EmailDriver | null): void {
  driver = next;
}
