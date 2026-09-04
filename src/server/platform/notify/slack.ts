import { env } from '../../env';
import { logger } from '../http/logger';
import { NonRetryableError } from '../jobs/define';

export interface SlackMessage {
  channel?: string; // defaults to SLACK_DEFAULT_CHANNEL
  text: string; // always present: notifications and fallbacks use it
  blocks?: unknown[];
}

export interface SlackDriver {
  post(message: SlackMessage): Promise<void>;
}

const consoleDriver: SlackDriver = {
  async post(message) {
    logger.info(
      { channel: message.channel ?? env.SLACK_DEFAULT_CHANNEL ?? '(default)', text: message.text },
      'slack (console driver)',
    );
  },
};

// Plain fetch to chat.postMessage with a bot token; no SDK.
const nonRetryable = new Set([
  'channel_not_found',
  'not_in_channel',
  'invalid_auth',
  'account_inactive',
  'token_revoked',
  'is_archived',
  'msg_too_long',
]);

export function botDriver(fetchImpl: typeof fetch = (...args) => fetch(...args)): SlackDriver {
  return {
    async post(message) {
      const res = await fetchImpl('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          channel: message.channel ?? env.SLACK_DEFAULT_CHANNEL,
          text: message.text,
          blocks: message.blocks,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) {
        const error = body.error ?? `http ${res.status}`;
        if (nonRetryable.has(error)) throw new NonRetryableError(`slack: ${error}`);
        throw new Error(`slack: ${error}`);
      }
    },
  };
}

let driver: SlackDriver | null = null;
function current(): SlackDriver {
  driver ??= env.SLACK_DRIVER === 'bot' ? botDriver() : consoleDriver;
  return driver;
}

export async function deliverSlack(message: SlackMessage): Promise<void> {
  await current().post(message);
}

export function setSlackDriver(next: SlackDriver | null): void {
  driver = next;
}
