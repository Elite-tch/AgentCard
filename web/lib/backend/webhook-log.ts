import { bizEvent } from './logger';

export function recordWebhookDelivery(logData: any) {
  bizEvent('webhook.delivery', logData);
}
