import mongoose, { Schema, Document } from 'mongoose';

export interface IPolicyDecision extends Document {
  apiKeyId: mongoose.Types.ObjectId | string;
  orderId?: string;
  decision: string;
  rule: string;
  reason: string;
  amountUsdc?: string;
  createdAt: Date;
}

const PolicyDecisionSchema = new Schema<IPolicyDecision>({
  apiKeyId: { type: Schema.Types.Mixed, required: true, index: true },
  orderId: { type: String, index: true },
  decision: { type: String, required: true },
  rule: { type: String, required: true },
  reason: { type: String, required: true },
  amountUsdc: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export const PolicyDecision = (mongoose.models.PolicyDecision as mongoose.Model<IPolicyDecision>) || mongoose.model<IPolicyDecision>('PolicyDecision', PolicyDecisionSchema);
