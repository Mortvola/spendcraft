import { DateTime } from 'luxon';
import { WebhookLogInterface, WebhookLogProps } from './Types';

class WebhookLog implements WebhookLogInterface {
  id: number;

  type: string;

  createdAt: DateTime;

  request: {
    webhook_type: string;
    webhook_code: string;
  };

  constructor(props: WebhookLogProps) {
    this.id = props.id;
    this.type = props.type;
    this.createdAt = DateTime.fromISO(props.createdAt);
    this.request = props.request;
  }
}

export const isWebhookLog = (r: unknown): r is WebhookLog => (
  (r as WebhookLog).type === 'Webhook'
)

export default WebhookLog;
