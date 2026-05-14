import mongoose, { Schema, Document } from 'mongoose';

export interface IApprovalRequest extends Document {
  apiKeyId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  amountUsdc: string;
  agentNote?: string;
  status: string; // 'pending', 'approved', 'rejected'
  requestedAt: Date;
  expiresAt: Date;
  decidedAt?: Date;
  decisionNote?: string;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>({
  apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  amountUsdc: { type: String, required: true },
  agentNote: { type: String },
  status: { type: String, required: true, default: 'pending', index: true },
  requestedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  decidedAt: { type: Date },
  decisionNote: { type: String }
});

export const ApprovalRequest = (mongoose.models.ApprovalRequest as mongoose.Model<IApprovalRequest>) || mongoose.model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);
