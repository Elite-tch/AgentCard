import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder extends Document {
  status: string;
  amountUsdc: string;
  stellarTxid?: string;
  ctxOrderId?: string;
  claimUrl?: string;
  challenge?: string;
  rewardUrl?: string;
  cardNumber?: string;
  cardCvv?: string;
  cardExpiry?: string;
  cardBrand?: string;
  error?: string;
  failureCount: number;
  apiKeyId?: mongoose.Types.ObjectId;
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  paymentAsset: string;
  paymentXlmAmount?: string;
  senderAddress?: string;
  refundStellarTxid?: string;
  excessUsdc?: string;
  fulfillmentStartedAt?: Date;
  vccJobId?: string;
  vccPaymentJson?: string;
  metadata?: string;
  xlmSentAt?: Date;
  vccNotifiedAt?: Date;
  fulfillmentAttempt: number;
  requestId?: string;
  callbackNonce?: string;
  expectedXlmAmount?: string;
  callbackSecret?: string;
  ctxStellarTxid?: string;
  source?: string;
}

const OrderSchema = new Schema<IOrder>({
  status: { type: String, required: true, default: 'pending_payment', index: true },
  amountUsdc: { type: String, required: true },
  stellarTxid: { type: String, index: true },
  ctxOrderId: { type: String },
  claimUrl: { type: String },
  challenge: { type: String },
  rewardUrl: { type: String },
  cardNumber: { type: String },
  cardCvv: { type: String },
  cardExpiry: { type: String },
  cardBrand: { type: String },
  error: { type: String },
  failureCount: { type: Number, required: true, default: 0 },
  apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', index: true },
  webhookUrl: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now, index: true },
  paymentAsset: { type: String, default: 'usdc' },
  paymentXlmAmount: { type: String },
  senderAddress: { type: String },
  refundStellarTxid: { type: String },
  excessUsdc: { type: String },
  fulfillmentStartedAt: { type: Date },
  vccJobId: { type: String, index: true },
  vccPaymentJson: { type: String },
  metadata: { type: String },
  xlmSentAt: { type: Date },
  vccNotifiedAt: { type: Date },
  fulfillmentAttempt: { type: Number, required: true, default: 0 },
  requestId: { type: String },
  callbackNonce: { type: String },
  expectedXlmAmount: { type: String },
  callbackSecret: { type: String },
  ctxStellarTxid: { type: String },
  source: { type: String, default: 'v1_orders' },
});

// Compound indexes
OrderSchema.index({ apiKeyId: 1, status: 1 });
OrderSchema.index({ apiKeyId: 1, createdAt: 1 });

export const Order = (mongoose.models.Order as mongoose.Model<IOrder>) || mongoose.model<IOrder>('Order', OrderSchema);
