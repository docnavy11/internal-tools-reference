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

function selectDriver(): EmailDriver {
  switch (env.EMAIL_DRIVER) {
    case 'console':
      return consoleDriver;
    case 'smtp':
      // Phase 5 adds the nodemailer driver and moves sending into a job.
      throw new Error('EMAIL_DRIVER=smtp is not implemented yet (phase 5). Use console.');
  }
}

let driver: EmailDriver | null = null;

export async function sendEmail(message: EmailMessage): Promise<void> {
  driver ??= selectDriver();
  await driver.send(message);
}

// Tests swap the driver to capture messages.
export function setEmailDriver(next: EmailDriver | null): void {
  driver = next;
}
