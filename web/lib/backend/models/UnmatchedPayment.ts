import mongoose, { Schema, Document } from 'mongoose';

export interface IUnmatchedPayment extends Document {
  stellarTxid: string;
  senderAddress?: string;
  paymentAsset?: string;
  amountUsdc?: string;
  amountXlm?: string;
  claimedOrderId?: string;
  reason: string;
  refundStellarTxid?: string;
  createdAt: Date;
}

const UnmatchedPaymentSchema = new Schema<IUnmatchedPayment>({
  stellarTxid: { type: String, required: true },
  senderAddress: { type: String },
  paymentAsset: { type: String },
  amountUsdc: { type: String },
  amountXlm: { type: String },
  claimedOrderId: { type: String },
  reason: { type: String, required: true },
  refundStellarTxid: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const UnmatchedPayment = mongoose.models.UnmatchedPayment || mongoose.model<IUnmatchedPayment>('UnmatchedPayment', UnmatchedPaymentSchema);
