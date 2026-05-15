import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookQueue extends Document {
  url: string;
  payload: string;
  secret?: string;
  attempts: number;
  nextAttempt: Date;
  lastError?: string;
  delivered: boolean;
  createdAt: Date;
}

const WebhookQueueSchema = new Schema<IWebhookQueue>({
  url: { type: String, required: true },
  payload: { type: String, required: true },
  secret: { type: String },
  attempts: { type: Number, required: true, default: 0 },
  nextAttempt: { type: Date, required: true },
  lastError: { type: String },
  delivered: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, default: Date.now },
});

WebhookQueueSchema.index({ delivered: 1, nextAttempt: 1 });

export const WebhookQueue = (mongoose.models.WebhookQueue as mongoose.Model<IWebhookQueue>) || mongoose.model<IWebhookQueue>('WebhookQueue', WebhookQueueSchema);
