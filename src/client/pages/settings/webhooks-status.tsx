import { Badge } from '@/client/platform/ui/badge';
import type { WebhookEvent } from '@/shared/webhooks';

type WebhookStatus = WebhookEvent['status'];

// One badge for a webhook status, used by the list and the sheet so a status always
// looks the same wherever it appears.

const variants: Record<WebhookStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  processed: 'default',
  failed: 'destructive',
};

export function WebhookStatusBadge({ status }: { status: WebhookStatus }) {
  return (
    <Badge data-testid="webhook-status" variant={variants[status]}>
      {status}
    </Badge>
  );
}
